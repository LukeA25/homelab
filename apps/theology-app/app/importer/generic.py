"""Fallback parser for ordinary EPUBs (Project Gutenberg and similar).

Sections come from the NCX table of contents where one exists, otherwise from
the spine. Internet Archive page-scan EPUBs (page_0.html, …) get special
handling: pages are merged and split on chapter-like headings when possible,
otherwise into page-range chunks.

Blocks are paragraphs and headings in reading order. There is no canonical
locus scheme for an arbitrary book, so loci are synthesised from the work id
and a running index; they stay stable as long as the file and the parser
version do not change.
"""

from __future__ import annotations

import re
from typing import Optional

from .base import ParsedBlock, ParsedSection, ParsedWork
from .epub import EpubFile, NavPoint
from .htmltext import body_of, element_text, parse_xhtml

BLOCK_TAGS = ("p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "li")
HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}

SKIP_FILES = (
    "cover",
    "titlepage",
    "copyright",
    "toc",
    "nav",
    "colophon",
    "notice",
)
MIN_TEXT_LENGTH = 2

PAGE_HREF_RE = re.compile(r"(^|/)page[_-]?\d+\.(x?html?)$", re.I)
TRIVIAL_NAV_TITLES = {
    "notice",
    "cover",
    "title",
    "title page",
    "copyright",
    "contents",
    "table of contents",
    "toc",
}

# OCR-tolerant chapter / part / book markers near the start of a block.
HEADING_LINE_RE = re.compile(
    r"""^\s*(?:
        (?:THE\s+)?PROLOGUE\b|
        ARGUMENT\b|
        BOOK\s+(?:THE\s+)?(?:FIRST|SECOND|THIRD|FOURTH|FIFTH|[IVXLCDM0-9]+)\b|
        CHAPTER\s+[IVXLCDM0-9]+\b|
        CHAP(?:TER)?\.?\s*[IVXLCDM0-9]+\b|
        PART\s+\S+
    )""",
    re.IGNORECASE | re.VERBOSE,
)

IA_BOILERPLATE_RE = re.compile(
    r"Internet Archive|Digitized by Google|produced in EPUB format",
    re.IGNORECASE,
)

PAGES_PER_CHUNK = 18


class GenericEpubParser:
    name = "generic"
    version = 2

    def detect(self, epub: EpubFile) -> bool:
        return True  # last resort; the registry tries it only if nothing matched

    @staticmethod
    def _skip_file(href: str) -> bool:
        lowered = href.rsplit("/", 1)[-1].lower()
        return any(token in lowered for token in SKIP_FILES)

    @staticmethod
    def _is_page_href(href: str) -> bool:
        return bool(PAGE_HREF_RE.search(href))

    def _is_page_scan(self, epub: EpubFile) -> bool:
        spine = [h for h in epub.spine if not self._skip_file(h)]
        if len(spine) < 15:
            return False
        pageish = sum(1 for h in spine if self._is_page_href(h))
        if pageish / max(len(spine), 1) >= 0.55:
            return True
        # Nav is only Notice/Cover while spine is long → treat as page scan.
        nav = epub.nav_points()
        if len(spine) >= 40 and self._nav_is_trivial(nav):
            return True
        return False

    @staticmethod
    def _nav_is_trivial(nav: list[NavPoint]) -> bool:
        titles: list[str] = []

        def walk(points: list[NavPoint]) -> None:
            for p in points:
                if p.title:
                    titles.append(p.title.strip().lower())
                walk(p.children)

        walk(nav)
        if not titles:
            return True
        if len(titles) > 3:
            return False
        return all(t in TRIVIAL_NAV_TITLES or t.startswith("page") for t in titles)

    def _sections(self, epub: EpubFile, work_id: str) -> tuple[list[ParsedSection], dict[str, str]]:
        sections: list[ParsedSection] = []
        by_file: dict[str, str] = {}
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
                by_file.setdefault(point.href, section_id)
            for child in point.children:
                visit(child, section_id, level + 1)

        for point in epub.nav_points():
            visit(point, None, 0)

        if not sections or self._nav_is_trivial(epub.nav_points()):
            sections = []
            by_file = {}
            counter[0] = 0
            for position, href in enumerate(epub.spine):
                if self._skip_file(href):
                    continue
                counter[0] += 1
                section_id = f"{work_id}/s{counter[0]}"
                sections.append(
                    ParsedSection(
                        id=section_id,
                        title=href.rsplit("/", 1)[-1].rsplit(".", 1)[0],
                        parent_id=None,
                        level=0,
                        order_index=position,
                    )
                )
                by_file[href] = section_id

        return sections, by_file

    @staticmethod
    def _heading_title(text: str) -> Optional[str]:
        cleaned = " ".join(text.split())
        if not cleaned or len(cleaned) > 100:
            # Long OCR paragraphs often start with a running header ("Prologue …");
            # only short blocks are trusted as real section breaks.
            return None
        if IA_BOILERPLATE_RE.search(cleaned):
            return None
        if not HEADING_LINE_RE.match(cleaned):
            return None
        return cleaned[:90]

    def _extract_file_blocks(
        self, epub: EpubFile, href: str, work_id: str, index_start: int
    ) -> tuple[list[ParsedBlock], int]:
        blocks: list[ParsedBlock] = []
        index = index_start
        try:
            raw = epub.read(href)
        except KeyError:
            return blocks, index
        root = parse_xhtml(raw)
        if root is None:
            return blocks, index
        body = body_of(root)
        for element in body.iter(*BLOCK_TAGS):
            parent = element.getparent()
            if parent is not None and parent.tag in ("blockquote", "li"):
                continue
            text = element_text(element)
            if len(text) < MIN_TEXT_LENGTH:
                continue
            if IA_BOILERPLATE_RE.search(text) and len(text) < 400:
                continue
            index += 1
            kind = "heading" if element.tag in HEADING_TAGS else "paragraph"
            # Promote OCR chapter lines to headings even when they are <p>.
            if kind == "paragraph" and self._heading_title(text):
                kind = "heading"
            blocks.append(
                ParsedBlock(
                    locus_id=f"{work_id}.{index}",
                    text=text,
                    label="",
                    kind=kind,
                    section_id=None,
                    order_index=index,
                )
            )
        return blocks, index

    def _parse_page_scan(self, epub: EpubFile, work_id: str) -> ParsedWork:
        """Merge page-scan spine files and split into chapter-like sections."""
        page_files = [h for h in epub.spine if not self._skip_file(h)]
        raw_blocks: list[ParsedBlock] = []
        index = 0
        page_of_block: list[int] = []

        for page_idx, href in enumerate(page_files):
            file_blocks, index = self._extract_file_blocks(epub, href, work_id, index)
            for block in file_blocks:
                raw_blocks.append(block)
                page_of_block.append(page_idx)

        # Find break points: heading-like blocks after the first bit of front matter.
        breaks: list[tuple[int, str]] = [(0, "Front matter")]
        for i, block in enumerate(raw_blocks):
            if i < 3:
                continue
            title = self._heading_title(block.text)
            if not title:
                continue
            # Avoid duplicate consecutive breaks with the same title.
            if breaks and breaks[-1][1].lower() == title.lower():
                continue
            # Skip if too close to previous break (OCR repeating headers).
            if breaks and i - breaks[-1][0] < 2:
                continue
            breaks.append((i, title))

        # Need a meaningful number of chapter breaks; otherwise chunk by pages.
        body_breaks = [b for b in breaks if b[0] > 0]
        use_heading_breaks = len(body_breaks) >= 4

        sections: list[ParsedSection] = []
        if use_heading_breaks:
            for sec_i, (start, title) in enumerate(breaks):
                end = breaks[sec_i + 1][0] if sec_i + 1 < len(breaks) else len(raw_blocks)
                if start >= end:
                    continue
                section_id = f"{work_id}/s{len(sections) + 1}"
                sections.append(
                    ParsedSection(
                        id=section_id,
                        title=title,
                        parent_id=None,
                        level=0,
                        order_index=len(sections) + 1,
                    )
                )
                for bi in range(start, end):
                    raw_blocks[bi].section_id = section_id
        else:
            # Chunk by page ranges for navigability.
            page_count = max(page_of_block) + 1 if page_of_block else 1
            chunk_starts = list(range(0, page_count, PAGES_PER_CHUNK))
            for ci, page_start in enumerate(chunk_starts):
                page_end = min(page_start + PAGES_PER_CHUNK - 1, page_count - 1)
                section_id = f"{work_id}/s{ci + 1}"
                if page_start == page_end:
                    title = f"Page {page_start + 1}"
                else:
                    title = f"Pages {page_start + 1}–{page_end + 1}"
                sections.append(
                    ParsedSection(
                        id=section_id,
                        title=title,
                        parent_id=None,
                        level=0,
                        order_index=ci + 1,
                    )
                )
                for bi, page_idx in enumerate(page_of_block):
                    if page_start <= page_idx <= page_end:
                        raw_blocks[bi].section_id = section_id

        # Drop empty front-matter-only section if everything else is empty of text.
        if not sections:
            sections.append(
                ParsedSection(
                    id=f"{work_id}/s1",
                    title="Text",
                    parent_id=None,
                    level=0,
                    order_index=1,
                )
            )
            for block in raw_blocks:
                block.section_id = sections[0].id

        metadata = epub.metadata
        return ParsedWork(
            title=metadata.get("title", "Untitled"),
            author=metadata.get("creator", ""),
            kind="book",
            description=metadata.get("description", "")[:500],
            rights=metadata.get("rights", "Unknown"),
            sections=sections,
            blocks=raw_blocks,
        )

    def parse(self, epub: EpubFile, work_id: str) -> ParsedWork:
        if self._is_page_scan(epub):
            return self._parse_page_scan(epub, work_id)

        metadata = epub.metadata
        sections, section_by_file = self._sections(epub, work_id)

        blocks: list[ParsedBlock] = []
        index = 0
        current_section: Optional[str] = None

        for href in epub.spine:
            if self._skip_file(href):
                continue
            file_blocks, index = self._extract_file_blocks(epub, href, work_id, index)
            mapped = section_by_file.get(href, current_section)
            if mapped:
                current_section = mapped
            for block in file_blocks:
                block.section_id = current_section
                blocks.append(block)

        return ParsedWork(
            title=metadata.get("title", "Untitled"),
            author=metadata.get("creator", ""),
            kind="book",
            description=metadata.get("description", "")[:500],
            rights=metadata.get("rights", "Unknown"),
            sections=sections,
            blocks=blocks,
        )
