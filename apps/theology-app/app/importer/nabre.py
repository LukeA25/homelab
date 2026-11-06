"""Parser for the St. Benedict Press NABRE EPUB.

The file marks every verse with an empty anchor whose id encodes the address:

    <a id="v48016024"/><sup>24</sup>Then Jesus said to his disciples...
       book 48 ---^^   ^^^ chapter 016   ^^^ verse 024

That makes verse boundaries exact. The hazards are what sits *between* the
verses: `<a href="#fn...">` study-note markers that render as bare numbers,
`<a href="#en...">` cross-reference markers that render as bare letters, and
`<sup>` verse numbers. All three are pulled out before the text is assembled,
because a generic extractor would splice "299" and "q" straight into scripture.

Book numbering is the translation's own (Genesis 1 through Revelation 74, with
28 belonging to Sirach and 35 unused), so books are discovered from the file
rather than assumed.
"""

from __future__ import annotations

import re
from collections import defaultdict
from typing import Iterator, Optional

from ..bible.books import book_meta, normalize_book_name
from .base import (
    ParsedBibleBook,
    ParsedBlock,
    ParsedCrossRef,
    ParsedFootnote,
    ParsedSection,
    ParsedWork,
)
from .epub import EpubFile, NavPoint
from .htmltext import (
    body_of,
    drop_keeping_tail,
    element_text,
    has_class,
    iter_events,
    normalize,
    parse_xhtml,
)

VERSE_ID_RE = re.compile(r"^v(\d{2})(\d{3})(\d{3})$")
BOOK_TOC_ID_RE = re.compile(r"^bk0*(\d+)toc$")
NOTE_ID_RE = re.compile(r"^(?:fn|en)(\d{2})(\d{3})(\d{3})")
INLINE_NOTE_HREF_RE = re.compile(r"^#(?:fn|en)")

# Section titles. `chsect` carries both real titles ("Tobit's Prayer for Death")
# and bare Roman-numeral stanza dividers in the Psalms; both are treated as
# headings so neither ends up inside a verse.
HEADING_CLASSES = ("bksect", "bksubsect", "chsect", "chsubsect", "cs")

# Study notes and cross-references, including their continuation paragraphs.
NOTE_CLASSES = ("fn", "en", "fncon", "fnp", "fnpo")

# Chapter-number lines ("CHAPTER 1"), which duplicate the section title.
DROP_CLASSES = ("cn",)


class NabreParser:
    name = "nabre"
    version = 1

    def detect(self, epub: EpubFile) -> bool:
        title = (epub.metadata.get("title") or "").lower()
        if "new american bible" in title or "nabre" in title:
            return True
        for href in epub.spine[:40]:
            try:
                if VERSE_ID_RE.pattern and re.search(rb'id="v\d{9}"', epub.read(href)):
                    return True
            except KeyError:
                continue
        return False

    # -- book names -------------------------------------------------------

    def _book_names(self, epub: EpubFile) -> dict[int, str]:
        """Map book number to printed name from the NCX.

        The reliable signal is the navPoint id `bk{NNN}toc`, which exists for
        all 73 books. The `#bk` *fragments* are not usable: Sirach's book node
        points at `bk028toc` while `bk28` is one of its chapters. As a backstop
        for any book missing that id, a navPoint whose children are all chapters
        of one book supplies the name -- though that rule alone misses the
        single-chapter letters (Philemon, 2-3 John, Jude), which have no
        chapter children at all.
        """
        names: dict[int, str] = {}

        def visit(point: NavPoint) -> None:
            match = BOOK_TOC_ID_RE.match(point.nav_id or "")
            if match and point.title:
                names.setdefault(int(match.group(1)), point.title.strip())
            for child in point.children:
                visit(child)

        def visit_by_children(point: NavPoint) -> None:
            numbers = {
                int(match.group(1))
                for child in point.children
                if (match := VERSE_ID_RE.match(child.fragment))
            }
            if len(numbers) == 1 and point.title:
                names.setdefault(numbers.pop(), point.title.strip())
            for child in point.children:
                visit_by_children(child)

        points = epub.nav_points()
        for point in points:
            visit(point)
        for point in points:
            visit_by_children(point)
        return names

    # -- per-document extraction -----------------------------------------

    def _harvest_notes(
        self, body
    ) -> tuple[dict[tuple[int, int, int], list[ParsedFootnote]], dict[tuple[int, int, int], list[ParsedCrossRef]]]:
        """Pull study notes (p.fn) and cross-references (p.en) out of the tree.

        These sit at the end of each chapter div and must never reach the body
        text. The `p.en` entries are genuine scripture cross-references keyed by
        verse, so they become CrossRef rows.
        """
        footnotes: dict[tuple[int, int, int], list[ParsedFootnote]] = defaultdict(list)
        crossrefs: dict[tuple[int, int, int], list[ParsedCrossRef]] = defaultdict(list)

        for element in list(body.iter("p")):
            if not has_class(element, *NOTE_CLASSES):
                continue
            note_id = element.get("id") or ""
            match = NOTE_ID_RE.match(note_id)
            key = (
                (int(match.group(1)), int(match.group(2)), int(match.group(3)))
                if match
                else None
            )

            if has_class(element, "en") and key:
                # "q. [16:24] Lk 14:27." -> targets are the linked citations.
                for anchor in element.findall(".//a"):
                    href = anchor.get("href") or ""
                    label = normalize("".join(anchor.itertext()))
                    if not label or href.startswith("#ren") or href.startswith("#rfn"):
                        continue
                    if has_class(anchor, "xbr") and not href.startswith("#v"):
                        crossrefs[key].append(ParsedCrossRef(target_locus=label, kind="scripture"))
            elif key:
                marker = ""
                first = element.find("./a")
                if first is not None:
                    marker = normalize("".join(first.itertext()))
                text = element_text(element)
                if marker and text.startswith(marker):
                    text = text[len(marker) :].strip()
                if text:
                    footnotes[key].append(ParsedFootnote(marker=marker, text=text))

            drop_keeping_tail(element)

        return footnotes, crossrefs

    def _prepare(self, body) -> None:
        """Strip everything that would corrupt verse text."""
        # Inline study-note and cross-reference markers ("299", "q").
        for anchor in list(body.iter("a")):
            href = anchor.get("href") or ""
            if INLINE_NOTE_HREF_RE.match(href):
                drop_keeping_tail(anchor)

        for element in list(body.iter("p")):
            if has_class(element, *DROP_CLASSES):
                drop_keeping_tail(element)

        # Superscript verse numbers immediately after a verse anchor.
        for anchor in list(body.iter("a")):
            if not VERSE_ID_RE.match(anchor.get("id") or ""):
                continue
            sibling = anchor.getnext()
            if sibling is not None and sibling.tag == "sup":
                drop_keeping_tail(sibling)

        # A <strong> opening a paragraph is a pericope heading, not emphasis.
        for element in body.iter("p"):
            children = list(element)
            if not children or children[0].tag != "strong":
                continue
            if (element.text or "").strip():
                continue
            children[0].set("data-heading", "1")

    @staticmethod
    def _is_heading_start(node) -> bool:
        return node.get("data-heading") == "1" or (
            node.tag == "p" and has_class(node, *HEADING_CLASSES)
        )

    def _blocks_for_document(self, body) -> list[tuple[tuple[int, int, int], str, str]]:
        """Return ((book, chapter, verse), kind, text) entries in document order.

        A heading is emitted against the verse it introduces, which is only
        known once that verse's anchor is reached, so headings are buffered
        until then.
        """
        out: list[tuple[tuple[int, int, int], str, str]] = []
        current: Optional[tuple[int, int, int]] = None
        verse_buffer: list[str] = []
        heading_buffer: list[str] = []
        pending_headings: list[str] = []
        heading_node = None

        def flush_verse() -> None:
            nonlocal verse_buffer
            if current is not None:
                text = normalize("".join(verse_buffer))
                if text:
                    out.append((current, "verse", text))
            verse_buffer = []

        for event, node in iter_events(body):
            if event == "text":
                if heading_node is not None:
                    heading_buffer.append(node)
                elif current is not None:
                    verse_buffer.append(node)
                continue

            if event == "start":
                if heading_node is None and self._is_heading_start(node):
                    # A heading interrupts a verse without ending it. In the
                    # Psalms a stanza divider sits between fragments of the same
                    # verse, so the buffer must survive: flushing here would
                    # discard everything after the divider.
                    heading_node = node
                    heading_buffer = []
                    continue

                match = VERSE_ID_RE.match(node.get("id") or "")
                if match:
                    book, chapter, verse = (int(g) for g in match.groups())
                    if verse == 0:
                        continue  # chapter marker on the wrapping div
                    flush_verse()
                    for heading in pending_headings:
                        out.append(((book, chapter, verse), "heading", heading))
                    pending_headings = []
                    current = (book, chapter, verse)
                    verse_buffer = []
                continue

            if event == "end" and node is heading_node:
                heading_node = None
                heading = normalize("".join(heading_buffer))
                if heading:
                    pending_headings.append(heading)
                heading_buffer = []

        flush_verse()
        return out

    # -- entry point ------------------------------------------------------

    def parse(self, epub: EpubFile, work_id: str) -> ParsedWork:
        metadata = epub.metadata
        book_names = self._book_names(epub)

        verses: dict[tuple[int, int, int], str] = {}
        headings: dict[tuple[int, int, int], list[str]] = defaultdict(list)
        footnotes: dict[tuple[int, int, int], list[ParsedFootnote]] = defaultdict(list)
        crossrefs: dict[tuple[int, int, int], list[ParsedCrossRef]] = defaultdict(list)
        order: list[tuple[int, int, int]] = []

        for href in epub.spine:
            try:
                raw = epub.read(href)
            except KeyError:
                continue
            root = parse_xhtml(raw)
            if root is None:
                continue
            body = body_of(root)

            doc_footnotes, doc_crossrefs = self._harvest_notes(body)
            for key, items in doc_footnotes.items():
                footnotes[key].extend(items)
            for key, items in doc_crossrefs.items():
                crossrefs[key].extend(items)

            self._prepare(body)

            for key, kind, text in self._blocks_for_document(body):
                if kind == "heading":
                    headings[key].append(text)
                elif key not in verses:
                    verses[key] = text
                    order.append(key)

        return self._assemble(work_id, metadata, book_names, order, verses, headings, footnotes, crossrefs)

    def _assemble(
        self,
        work_id: str,
        metadata: dict[str, str],
        book_names: dict[int, str],
        order: list[tuple[int, int, int]],
        verses: dict[tuple[int, int, int], str],
        headings: dict[tuple[int, int, int], list[str]],
        footnotes: dict[tuple[int, int, int], list[ParsedFootnote]],
        crossrefs: dict[tuple[int, int, int], list[ParsedCrossRef]],
    ) -> ParsedWork:
        chapters_by_book: dict[int, set[int]] = defaultdict(set)
        for book, chapter, _verse in order:
            chapters_by_book[book].add(chapter)

        books: list[ParsedBibleBook] = []
        abbrev_by_book: dict[int, str] = {}
        canonical_by_book: dict[int, str] = {}

        for number in sorted(chapters_by_book):
            display = book_names.get(number, f"Book {number}")
            canonical = normalize_book_name(display) or display
            meta = book_meta(canonical)
            testament, canon_order, abbrev = meta if meta else ("OT", number, canonical[:3])
            abbrev_by_book[number] = abbrev.replace(" ", "")
            canonical_by_book[number] = canonical
            books.append(
                ParsedBibleBook(
                    number=number,
                    name=canonical,
                    display_name=display,
                    testament=testament,
                    canon_order=canon_order,
                    chapter_count=len(chapters_by_book[number]),
                )
            )

        sections: list[ParsedSection] = []
        seen_sections: set[str] = set()
        blocks: list[ParsedBlock] = []
        index = 0

        for book_index, book in enumerate(sorted(chapters_by_book)):
            book_section_id = f"{work_id}/{abbrev_by_book[book]}"
            if book_section_id not in seen_sections:
                sections.append(
                    ParsedSection(
                        id=book_section_id,
                        title=book_names.get(book, canonical_by_book[book]),
                        parent_id=None,
                        level=0,
                        order_index=book_index,
                    )
                )
                seen_sections.add(book_section_id)

            for chapter_index, chapter in enumerate(sorted(chapters_by_book[book])):
                chapter_section_id = f"{book_section_id}/{chapter}"
                sections.append(
                    ParsedSection(
                        id=chapter_section_id,
                        title=f"{canonical_by_book[book]} {chapter}",
                        parent_id=book_section_id,
                        level=1,
                        order_index=chapter_index,
                    )
                )

                keys = sorted(
                    (k for k in verses if k[0] == book and k[1] == chapter),
                    key=lambda k: k[2],
                )
                for key in keys:
                    _b, _c, verse = key
                    prefix = f"{abbrev_by_book[book]}.{chapter}"
                    # A verse can be preceded by more than one heading (a book
                    # section title followed by a pericope title), so the loci
                    # are numbered to stay unique.
                    for heading_number, heading in enumerate(headings.get(key, []), start=1):
                        blocks.append(
                            ParsedBlock(
                                locus_id=f"{prefix}.{verse}#h{heading_number}",
                                text=heading,
                                label="",
                                kind="heading",
                                section_id=chapter_section_id,
                                order_index=index,
                            )
                        )
                        index += 1
                    blocks.append(
                        ParsedBlock(
                            locus_id=f"{prefix}.{verse}",
                            text=verses[key],
                            label=str(verse),
                            kind="verse",
                            section_id=chapter_section_id,
                            order_index=index,
                            book_number=book,
                            chapter=chapter,
                            verse=verse,
                            footnotes=footnotes.get(key, []),
                            crossrefs=crossrefs.get(key, []),
                        )
                    )
                    index += 1

        return ParsedWork(
            title=metadata.get("title", "New American Bible: Revised Edition"),
            short_title="NABRE",
            author=metadata.get("creator", "") or "USCCB / Catholic Biblical Association",
            kind="bible",
            translation="NABRE",
            edition=metadata.get("publisher", ""),
            rights=metadata.get("rights", "All rights reserved"),
            description="New American Bible, Revised Edition.",
            sections=sections,
            blocks=blocks,
            books=books,
        )
