"""Parser for the Ascension Edition Catechism of the Catholic Church EPUB.

Every one of the 2865 canonical paragraphs carries `id="p{N}"`, so the locus is
exact: paragraph 2085 becomes `CCC.2085`. Three things make naive extraction
produce garbage, and all three are handled here:

  * The file has been through Kobo's processor, so every text run is wrapped in
    `<span class="koboSpan" id="kobo.N.M">`.
  * `<p class="ACAT-Margin-Numbers">` blocks sit *between* body paragraphs and
    contain nothing but links to other paragraph numbers. They are the printed
    edition's marginal cross-references, and inlining them splices stray digits
    like "367" into the text. They become CrossRef rows instead.
  * The paragraph number is repeated as the first token of the body text
    ("2085 The one and true God..."), so it is stripped from the stored text.

There are no h1-h6 tags anywhere; headings are paragraphs with classes such as
`I--II--III--heading` and `P1-subhead`.
"""

from __future__ import annotations

import re
from typing import Optional

from .base import (
    ParsedBlock,
    ParsedCrossRef,
    ParsedFootnote,
    ParsedSection,
    ParsedWork,
)
from .epub import EpubFile, NavPoint
from .htmltext import body_of, element_text, has_class, normalize, parse_xhtml

PARAGRAPH_ID_RE = re.compile(r"^p(\d+)$")
CCC_TARGET_RE = re.compile(r"#p(\d+)$")

HEADING_CLASS_HINTS = ("heading", "subhead", "-head", "head-", "title", "chapt-head")
QUOTE_CLASSES = ("ACAT-block-quote",)
MARGIN_CLASS = "ACAT-Margin-Numbers"
FOOTNOTE_BODY_CLASSES = ("notes-first", "notes-second")

# Front/back matter that would flood search with index and glossary entries.
SKIP_FILES = (
    "cover",
    "backcover",
    "toc.xhtml",
    "inline-toc",
    "titlepage",
    "copyright",
    "bm_index",
    "bm_glossary",
)


class CccParser:
    name = "ccc"
    # v2: assign blocks to NCX fragment targets (e.g. fm_prologue.xhtml#s1)
    # rather than dumping every paragraph of a file into the first nav point.
    version = 2

    def detect(self, epub: EpubFile) -> bool:
        title = (epub.metadata.get("title") or "").lower()
        if "catechism" in title:
            return True
        for href in epub.spine[:20]:
            try:
                if re.search(rb'id="p\d{3,4}"', epub.read(href)):
                    return True
            except KeyError:
                continue
        return False

    @staticmethod
    def _skip_file(href: str) -> bool:
        lowered = href.lower()
        return any(token in lowered for token in SKIP_FILES)

    @staticmethod
    def _unwrap_kobo(body) -> None:
        """Remove Kobo's per-run spans, keeping their text in place."""
        from lxml.etree import strip_tags

        for span in body.iter("span"):
            if has_class(span, "koboSpan"):
                span.attrib.pop("class", None)
                span.attrib.pop("id", None)
                span.tag = "kobospan"
        strip_tags(body, "kobospan")

    @staticmethod
    def _collect_footnote_bodies(body) -> dict[str, str]:
        """Map footnote id ("fn-3") to its text.

        Notes are a table at the end of each file, with the id on the row:
        `<tr id="fn-1"><td class="notes-first">1</td>
         <td class="notes-second">Lk 15:11-32.</td></tr>`
        """
        notes: dict[str, str] = {}
        for row in body.iter("tr"):
            note_id = row.get("id") or ""
            if not note_id.startswith("fn-"):
                continue
            cells = [cell for cell in row.iter("td") if has_class(cell, "notes-second")]
            text = " ".join(element_text(cell) for cell in cells).strip()
            if text:
                notes[note_id] = text
        return notes

    @staticmethod
    def _strip_footnote_markers(body) -> None:
        """Remove inline footnote markers, tagging the paragraph that owned each.

        The owning paragraph is recorded in a `data-footnotes` attribute rather
        than a dict keyed on `id(element)`: lxml creates element proxies on
        demand, so their Python ids are not stable across a traversal.
        """
        from .htmltext import drop_keeping_tail

        for anchor in list(body.iter("a")):
            if not has_class(anchor, "_idFootnoteLink"):
                continue
            href = (anchor.get("href") or "").lstrip("#")
            paragraph = anchor.getparent()
            while paragraph is not None and paragraph.tag != "p":
                paragraph = paragraph.getparent()
            if paragraph is not None and href:
                existing = paragraph.get("data-footnotes", "")
                paragraph.set("data-footnotes", f"{existing} {href}".strip())
            drop_keeping_tail(anchor)

        for span in list(body.iter("span")):
            if has_class(span, "sup-fn"):
                drop_keeping_tail(span)

    @staticmethod
    def _is_heading(element) -> bool:
        classes = (element.get("class") or "").lower()
        if not classes:
            return False
        if MARGIN_CLASS.lower() in classes:
            return False
        return any(hint in classes for hint in HEADING_CLASS_HINTS)

    def _sections(
        self, epub: EpubFile, work_id: str
    ) -> tuple[list[ParsedSection], dict[str, str], dict[tuple[str, str], str]]:
        """Build the section tree from the NCX.

        Returns:
          sections: tree nodes
          file_default: first nav point for each file (fallback for text before
            the first fragment heading)
          by_anchor: (file, fragment_id) → section for in-file TOC targets
        """
        sections: list[ParsedSection] = []
        file_default: dict[str, str] = {}
        by_anchor: dict[tuple[str, str], str] = {}
        counter = [0]

        def visit(point: NavPoint, parent_id: Optional[str], level: int) -> None:
            if not point.title:
                return
            counter[0] += 1
            section_id = f"{work_id}/s{counter[0]}"
            sections.append(
                ParsedSection(
                    id=section_id,
                    title=point.title,
                    parent_id=parent_id,
                    level=level,
                    order_index=counter[0],
                )
            )
            if point.href:
                # EpubFile.nav_points() already splits src into href + fragment.
                file_default.setdefault(point.href, section_id)
                if point.fragment:
                    by_anchor[(point.href, point.fragment)] = section_id
            for child in point.children:
                visit(child, section_id, level + 1)

        for point in epub.nav_points():
            visit(point, None, 0)
        return sections, file_default, by_anchor

    def parse(self, epub: EpubFile, work_id: str) -> ParsedWork:
        metadata = epub.metadata
        sections, file_default, by_anchor = self._sections(epub, work_id)

        blocks: list[ParsedBlock] = []
        index = 0
        current_section: Optional[str] = None
        pending_crossrefs: list[ParsedCrossRef] = []

        for href in epub.spine:
            if self._skip_file(href):
                continue
            try:
                raw = epub.read(href)
            except KeyError:
                continue
            root = parse_xhtml(raw)
            if root is None:
                continue
            body = body_of(root)

            self._unwrap_kobo(body)
            footnote_bodies = self._collect_footnote_bodies(body)
            self._strip_footnote_markers(body)

            current_section = file_default.get(href, current_section)
            file_stem = href.rsplit("/", 1)[-1].rsplit(".", 1)[0]
            local_index = 0
            current_number: Optional[int] = None
            sub_index = 0

            for element in body.iter("p"):
                # Switch section when we hit an NCX fragment target (id="s3").
                element_id = element.get("id") or ""
                if element_id and (href, element_id) in by_anchor:
                    current_section = by_anchor[(href, element_id)]

                classes = element.get("class") or ""

                if MARGIN_CLASS in classes:
                    for anchor in element.findall(".//a"):
                        match = CCC_TARGET_RE.search(anchor.get("href") or "")
                        if match:
                            pending_crossrefs.append(
                                ParsedCrossRef(target_locus=f"CCC.{int(match.group(1))}", kind="marginal")
                            )
                    continue

                # Footnote table cells are already harvested into footnote_bodies;
                # skip them so they do not become body paragraphs.
                if any(cls in classes for cls in FOOTNOTE_BODY_CLASSES):
                    continue

                text = element_text(element)
                if not text:
                    continue

                notes = [
                    ParsedFootnote(marker=note_id.replace("fn-", ""), text=footnote_bodies[note_id])
                    for note_id in (element.get("data-footnotes") or "").split()
                    if note_id in footnote_bodies
                ]

                match = PARAGRAPH_ID_RE.match(element.get("id") or "")
                if match:
                    number = int(match.group(1))
                    # The number is repeated as the first token of the body.
                    text = re.sub(rf"^{number}\s*", "", text).strip()
                    blocks.append(
                        ParsedBlock(
                            locus_id=f"CCC.{number}",
                            text=text,
                            label=str(number),
                            kind="paragraph",
                            section_id=current_section,
                            order_index=index,
                            crossrefs=pending_crossrefs,
                            footnotes=notes,
                        )
                    )
                    pending_crossrefs = []
                    current_number = number
                    sub_index = 0
                    index += 1
                    continue

                if self._is_heading(element):
                    kind = "heading"
                elif any(cls in classes for cls in QUOTE_CLASSES):
                    kind = "quote"
                else:
                    kind = "paragraph"

                # A numbered paragraph continues across several <p> elements
                # (body text, then indented quotations). Those continuations
                # get a sub-locus so that resolving CCC.1803 returns all of it.
                if kind == "heading":
                    current_number = None
                    local_index += 1
                    locus = f"{work_id}/{file_stem}/{local_index}"
                elif current_number is not None:
                    sub_index += 1
                    locus = f"CCC.{current_number}.{sub_index}"
                else:
                    local_index += 1
                    locus = f"{work_id}/{file_stem}/{local_index}"

                blocks.append(
                    ParsedBlock(
                        locus_id=locus,
                        text=text,
                        label="",
                        kind=kind,
                        section_id=current_section,
                        order_index=index,
                        footnotes=notes,
                    )
                )
                index += 1

        return ParsedWork(
            title=metadata.get("title", "Catechism of the Catholic Church"),
            short_title="CCC",
            author="Catholic Church",
            kind="catechism",
            description="Catechism of the Catholic Church, Ascension Edition.",
            rights=metadata.get("rights", "All rights reserved"),
            edition="Ascension Edition",
            sections=sections,
            blocks=blocks,
        )
