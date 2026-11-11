"""Turn a Bible in a Year citation into chapters in the imported NABRE.

The podcast reads the RSV-2CE. This app opens the NABRE already in the library.
Chapter numbers match for almost every book. Esther's Greek additions are the
exception: the reading plan numbers them 11–16, and the NABRE files them as
chapters 41–46 (additions A–F).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from ..bible.books import BOOKS, book_meta, normalize_book_name
from ..bible.reference import SINGLE_CHAPTER_BOOKS, parse_one

# Highest chapter present in the imported NABRE for each book.
NABRE_CHAPTERS: dict[str, int] = {
    "Genesis": 50,
    "Exodus": 40,
    "Leviticus": 27,
    "Numbers": 36,
    "Deuteronomy": 34,
    "Joshua": 24,
    "Judges": 21,
    "Ruth": 4,
    "1 Samuel": 31,
    "2 Samuel": 24,
    "1 Kings": 22,
    "2 Kings": 25,
    "1 Chronicles": 29,
    "2 Chronicles": 36,
    "Ezra": 10,
    "Nehemiah": 13,
    "Tobit": 14,
    "Judith": 16,
    "Esther": 10,
    "1 Maccabees": 16,
    "2 Maccabees": 15,
    "Job": 42,
    "Psalms": 150,
    "Proverbs": 31,
    "Ecclesiastes": 12,
    "Song of Songs": 8,
    "Wisdom": 19,
    "Sirach": 52,
    "Isaiah": 66,
    "Jeremiah": 52,
    "Lamentations": 5,
    "Baruch": 6,
    "Ezekiel": 48,
    "Daniel": 14,
    "Hosea": 14,
    "Joel": 4,
    "Amos": 9,
    "Obadiah": 1,
    "Jonah": 4,
    "Micah": 7,
    "Nahum": 3,
    "Habakkuk": 3,
    "Zephaniah": 3,
    "Haggai": 2,
    "Zechariah": 14,
    "Malachi": 3,
    "Matthew": 28,
    "Mark": 16,
    "Luke": 24,
    "John": 21,
    "Acts": 28,
    "Romans": 16,
    "1 Corinthians": 16,
    "2 Corinthians": 13,
    "Galatians": 6,
    "Ephesians": 6,
    "Philippians": 4,
    "Colossians": 4,
    "1 Thessalonians": 5,
    "2 Thessalonians": 3,
    "1 Timothy": 6,
    "2 Timothy": 4,
    "Titus": 3,
    "Philemon": 1,
    "Hebrews": 13,
    "James": 5,
    "1 Peter": 5,
    "2 Peter": 3,
    "1 John": 5,
    "2 John": 1,
    "3 John": 1,
    "Jude": 1,
    "Revelation": 22,
}

# plan chapter -> (NABRE chapter, short note)
ESTHER_ADDITIONS: dict[int, tuple[int, str]] = {
    11: (41, "NABRE prints this as Esther A"),
    12: (41, "NABRE prints this as Esther A"),
    13: (42, "NABRE prints this as Esther B"),
    14: (43, "NABRE prints this as Esther C"),
    15: (44, "NABRE prints this as Esther D"),
    16: (45, "NABRE prints this as Esther E"),
}

# verseEnd sent to the reader when a passage runs through the end of a chapter.
THROUGH_END = 200

_CLEAN_RE = re.compile(r"\s+")


def _names() -> list[str]:
    found: set[str] = set()
    for canonical, (_testament, _order, _abbrev, aliases) in BOOKS.items():
        found.add(canonical)
        for alias in aliases:
            if len(alias) >= 4 or alias[:1].isdigit():
                found.add(alias)
    return sorted(found, key=len, reverse=True)


_NAME_RE = re.compile(
    r"(?<![\w])(?:" + "|".join(re.escape(name) for name in _names()) + r")(?![\w])",
    re.IGNORECASE,
)


def split_citations(text: str) -> list[str]:
    """Split a day's reading line into one citation per book."""
    cleaned = _CLEAN_RE.sub(" ", text.replace("\u00a0", " ")).strip()
    matches = list(_NAME_RE.finditer(cleaned))
    citations: list[str] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(cleaned)
        body = cleaned[match.end() : end]
        body = _CLEAN_RE.sub(" ", body).strip()
        body = re.sub(r"^(?:and|or|,|;|:|\.)+\s*", "", body, flags=re.IGNORECASE)
        body = re.sub(r"\s*(?:and|or|,|;)+$", "", body, flags=re.IGNORECASE).strip(" .")
        piece = match.group(0) if not body else f"{match.group(0)} {body}"
        piece = piece.strip().rstrip(",;.")
        piece = re.sub(r"\s*:\s*", ":", piece)
        piece = re.sub(r"\s+and\s+", ", ", piece, flags=re.IGNORECASE)
        if piece:
            citations.append(piece)
    return citations


@dataclass(frozen=True)
class ReadingLink:
    label: str
    book: str
    chapter: int
    section_id: str | None
    verse_start: int | None = None
    verse_end: int | None = None
    note: str | None = None

    def as_dict(self) -> dict:
        return {
            "label": self.label,
            "book": self.book,
            "chapter": self.chapter,
            "sectionId": self.section_id,
            "verseStart": self.verse_start,
            "verseEnd": self.verse_end,
            "note": self.note,
        }


def nabre_chapter_ok(book: str, chapter: int) -> bool:
    if book == "Esther" and chapter in {41, 42, 43, 44, 45, 46}:
        return True
    limit = NABRE_CHAPTERS.get(book)
    return limit is not None and 1 <= chapter <= limit


def _remap_esther(book: str, chapter: int) -> tuple[int, str | None]:
    if book == "Esther" and chapter in ESTHER_ADDITIONS:
        mapped, note = ESTHER_ADDITIONS[chapter]
        return mapped, note
    return chapter, None


def _spans_for(book: str, body: str) -> list[tuple[int, int | None, int | None]]:
    """(plan chapter, verse start, verse end). A missing verse start means the whole chapter."""
    body = body.strip()
    if book in SINGLE_CHAPTER_BOOKS and body in {"", "1"}:
        return [(1, None, None)]

    cross_verse = re.fullmatch(r"(\d+)\s*-\s*(\d+)\s*:\s*(\d+)", body)
    if cross_verse:
        start, end, verse = (int(cross_verse.group(i)) for i in range(1, 4))
        spans = [(chapter, None, None) for chapter in range(start, end)]
        spans.append((end, 1, verse))
        return spans

    full_cross = re.fullmatch(r"(\d+)\s*:\s*(\d+)\s*-\s*(\d+)\s*:\s*(\d+)", body)
    if full_cross:
        start_ch, start_v, end_ch, end_v = (int(full_cross.group(i)) for i in range(1, 5))
        if start_ch == end_ch:
            return [(start_ch, start_v, end_v)]
        spans = [(start_ch, start_v, THROUGH_END)]
        spans.extend((chapter, None, None) for chapter in range(start_ch + 1, end_ch))
        spans.append((end_ch, 1, end_v))
        return spans

    open_end = re.fullmatch(r"(\d+)\s*:\s*(\d+)\s*-\s*(\d+)", body)
    if open_end:
        start_ch, start_v, end_num = (int(open_end.group(i)) for i in range(1, 4))
        # "6:23-35" and "119:121-176" are verses in one chapter. "22:39-24"
        # is a verse through a later chapter: the end number is smaller than
        # the start verse, so it cannot be an ending verse.
        if end_num >= start_v:
            return [(start_ch, start_v, end_num)]
        spans = [(start_ch, start_v, THROUGH_END)]
        spans.extend((chapter, None, None) for chapter in range(start_ch + 1, end_num + 1))
        return spans

    parsed = parse_one(f"{book} {body}".strip() if body else book)
    if not parsed.ok:
        if book in SINGLE_CHAPTER_BOOKS:
            return [(1, None, None)]
        return []

    spans: list[tuple[int, int | None, int | None]] = []
    for span in parsed.ranges:
        if span.is_whole_chapter:
            spans.extend(
                (chapter, None, None) for chapter in range(span.start_chapter, span.end_chapter + 1)
            )
        elif span.start_chapter == span.end_chapter:
            spans.append((span.start_chapter, span.start_verse, span.end_verse))
        else:
            spans.append((span.start_chapter, span.start_verse, THROUGH_END))
            spans.extend(
                (chapter, None, None)
                for chapter in range(span.start_chapter + 1, span.end_chapter)
            )
            spans.append((span.end_chapter, 1, span.end_verse))
    return spans


def _label(book: str, plan_chapters: list[int], verse_start: int | None, verse_end: int | None) -> str:
    if len(plan_chapters) == 1:
        chapter_text = str(plan_chapters[0])
    elif plan_chapters == list(range(plan_chapters[0], plan_chapters[-1] + 1)):
        chapter_text = f"{plan_chapters[0]}-{plan_chapters[-1]}"
    else:
        chapter_text = ", ".join(str(chapter) for chapter in plan_chapters)

    if verse_start is None:
        return f"{book} {chapter_text}"
    if verse_end is None or verse_end == verse_start:
        return f"{book} {plan_chapters[0]}:{verse_start}"
    if verse_end >= THROUGH_END:
        return f"{book} {plan_chapters[0]}:{verse_start}-end"
    return f"{book} {plan_chapters[0]}:{verse_start}-{verse_end}"


def links_for_citation(raw: str, work_id: str = "bible-nabre") -> list[ReadingLink]:
    """Expand one citation into one link per chapter the reader should open."""
    citations = split_citations(raw)
    if len(citations) != 1:
        links: list[ReadingLink] = []
        for citation in citations:
            links.extend(links_for_citation(citation, work_id))
        return links

    match = _NAME_RE.search(citations[0])
    if not match:
        return []
    canonical = normalize_book_name(match.group(0))
    if canonical is None:
        return []
    body = citations[0][match.end() :].strip(" ,;.")
    meta = book_meta(canonical)
    if meta is None:
        return []
    abbrev = meta[2].replace(" ", "")

    grouped: list[dict] = []
    for plan_chapter, verse_start, verse_end in _spans_for(canonical, body):
        chapter, note = _remap_esther(canonical, plan_chapter)
        # Some Bibles split Malachi 3:19-24 off as chapter 4. The NABRE keeps
        # those verses at the end of chapter 3.
        if canonical == "Malachi" and plan_chapter == 4:
            chapter = 3
            verse_start, verse_end = 19, 24
            note = "NABRE includes this as Malachi 3:19-24"
        current = grouped[-1] if grouped else None
        if (
            current
            and current["chapter"] == chapter
            and current["verse_start"] == verse_start
            and current["verse_end"] == verse_end
            and current["note"] == note
        ):
            current["plan_chapters"].append(plan_chapter)
            continue
        grouped.append(
            {
                "plan_chapters": [plan_chapter],
                "chapter": chapter,
                "verse_start": verse_start,
                "verse_end": verse_end,
                "note": note,
            }
        )

    links: list[ReadingLink] = []
    for item in grouped:
        ok = nabre_chapter_ok(canonical, item["chapter"])
        links.append(
            ReadingLink(
                label=_label(canonical, item["plan_chapters"], item["verse_start"], item["verse_end"]),
                book=canonical,
                chapter=item["chapter"],
                section_id=f"{work_id}/{abbrev}/{item['chapter']}" if ok else None,
                verse_start=item["verse_start"],
                verse_end=item["verse_end"],
                note=item["note"],
            )
        )
    return links


def citation_is_reference(raw: str) -> bool:
    """True when `raw` is one scripture citation and nothing else."""
    citations = split_citations(raw)
    if len(citations) != 1:
        return False
    match = _NAME_RE.search(citations[0])
    if match is None:
        return False
    rest = citations[0][match.end() :]
    if re.fullmatch(r"[\d\s:,\-–—]*", rest) is None:
        return False
    links = links_for_citation(citations[0])
    return bool(links) and all(link.section_id for link in links)


def links_for_day(references: list[str], work_id: str = "bible-nabre") -> list[ReadingLink]:
    links: list[ReadingLink] = []
    for reference in references:
        found = links_for_citation(reference, work_id)
        if found:
            links.extend(found)
            continue
        for citation in split_citations(reference):
            links.extend(links_for_citation(citation, work_id))
    return links
