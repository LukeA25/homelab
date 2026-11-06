"""Parser for scripture citations as they appear in lectionary data.

Real citations are messier than "Book chapter:verse". These all occur in the
Roman Catholic lectionary and are all supported:

    Matthew 16:24-28                      simple range
    Nahum 2:1, 3; 3:1-3, 6-7              discontinuous, chapter change midway
    Deuteronomy 32:35cd-36ab, 39abcd, 41  partial-verse letter suffixes
    1 Kings 19:9a, 11-13a                 numbered book, partial verses
    Psalm 98:1, 2-3, 3-4, 5-6.            repeated verses, trailing period
    Philemon 9-10, 12-17                  single-chapter book, no chapter given
    Psalm 90:3-4, 14 and 17               "and" as a separator
    Luke 12:32-48 or 12:35-40             alternative reading

Parsing never raises on bad input; it returns a result with `ok = False` so a
malformed upstream citation degrades to "show the reference, skip the text"
rather than taking down the readings screen.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

from .books import normalize_book_name

# Books where a bare number means a verse, not a chapter.
SINGLE_CHAPTER_BOOKS = frozenset({"Obadiah", "Philemon", "2 John", "3 John", "Jude"})

_DASHES = {"\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-", "\u2014": "-", "\u2212": "-"}

_SEGMENT_RE = re.compile(
    r"""^\s*
    (?:(?P<sc>\d+)\s*[:.]\s*)?      # optional chapter
    (?P<sv>\d+)(?P<sp>[a-z]*)       # start verse + optional part letters
    (?:\s*-\s*
        (?:(?P<ec>\d+)\s*[:.]\s*)?  # optional chapter on the range end
        (?P<ev>\d+)(?P<ep>[a-z]*)
    )?
    \s*$""",
    re.VERBOSE | re.IGNORECASE,
)

_CHAPTER_ONLY_RE = re.compile(r"^\s*(\d+)\s*(?:-\s*(\d+))?\s*$")


@dataclass(frozen=True)
class VerseRange:
    """An inclusive span of verses. `start_verse is None` means a whole chapter."""

    book: str
    start_chapter: int
    start_verse: Optional[int]
    end_chapter: int
    end_verse: Optional[int]
    start_part: str = ""
    end_part: str = ""

    @property
    def is_whole_chapter(self) -> bool:
        return self.start_verse is None

    def label(self) -> str:
        if self.is_whole_chapter:
            if self.start_chapter == self.end_chapter:
                return f"{self.book} {self.start_chapter}"
            return f"{self.book} {self.start_chapter}-{self.end_chapter}"
        start = f"{self.start_chapter}:{self.start_verse}{self.start_part}"
        if self.start_chapter == self.end_chapter and self.start_verse == self.end_verse:
            return f"{self.book} {start}"
        if self.start_chapter == self.end_chapter:
            return f"{self.book} {start}-{self.end_verse}{self.end_part}"
        return f"{self.book} {start}-{self.end_chapter}:{self.end_verse}{self.end_part}"


@dataclass
class ParsedReference:
    """One alternative within a citation (a citation may offer "A or B")."""

    raw: str
    book: Optional[str] = None
    ranges: list[VerseRange] = field(default_factory=list)
    ok: bool = False
    error: Optional[str] = None

    def label(self) -> str:
        return self.raw.strip().rstrip(".")


def _clean(raw: str) -> str:
    text = raw.strip()
    for bad, good in _DASHES.items():
        text = text.replace(bad, good)
    text = text.replace("\u00a0", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip().rstrip(".").strip()


def _split_book(text: str) -> tuple[Optional[str], str]:
    """Greedily consume the longest leading run of words that names a book."""
    tokens = text.split(" ")
    best: tuple[Optional[str], str] = (None, text)
    for count in range(min(5, len(tokens)), 0, -1):
        candidate = " ".join(tokens[:count])
        # Trim a trailing chapter number that got swept into the candidate.
        trimmed = candidate.rstrip("0123456789:- ").strip()
        for attempt in (candidate, trimmed):
            if not attempt:
                continue
            canonical = normalize_book_name(attempt)
            if canonical:
                remainder = text[len(" ".join(tokens[:count])) :].strip()
                if attempt == trimmed and trimmed != candidate:
                    remainder = (candidate[len(trimmed) :] + " " + remainder).strip()
                return canonical, remainder
    return best


def _parse_segments(book: str, body: str) -> tuple[list[VerseRange], Optional[str]]:
    has_colon = ":" in body
    single_chapter = book in SINGLE_CHAPTER_BOOKS

    # Segments are separated by ';' or ',' ("and" is normalized to ',' first).
    body = re.sub(r"\s+and\s+", ", ", body, flags=re.IGNORECASE)
    segments = [s.strip() for s in re.split(r"[;,]", body) if s.strip()]
    if not segments:
        return [], "no verse segments"

    ranges: list[VerseRange] = []
    current_chapter: Optional[int] = 1 if (single_chapter or not has_colon) else None

    for segment in segments:
        # Whole-chapter citations, e.g. "Genesis 3" or "Genesis 3-4".
        if not has_colon and not single_chapter:
            match = _CHAPTER_ONLY_RE.match(segment)
            if not match:
                return ranges, f"could not parse chapter segment {segment!r}"
            start = int(match.group(1))
            end = int(match.group(2)) if match.group(2) else start
            ranges.append(VerseRange(book, start, None, end, None))
            continue

        match = _SEGMENT_RE.match(segment)
        if not match:
            return ranges, f"could not parse segment {segment!r}"

        if match.group("sc"):
            current_chapter = int(match.group("sc"))
        if current_chapter is None:
            return ranges, f"no chapter established before segment {segment!r}"

        start_chapter = current_chapter
        start_verse = int(match.group("sv"))
        start_part = (match.group("sp") or "").lower()

        if match.group("ev"):
            end_chapter = int(match.group("ec")) if match.group("ec") else start_chapter
            end_verse = int(match.group("ev"))
            end_part = (match.group("ep") or "").lower()
            # A range that crosses a chapter boundary leaves us in the new chapter.
            current_chapter = end_chapter
        else:
            end_chapter = start_chapter
            end_verse = start_verse
            end_part = start_part

        ranges.append(
            VerseRange(
                book=book,
                start_chapter=start_chapter,
                start_verse=start_verse,
                end_chapter=end_chapter,
                end_verse=end_verse,
                start_part=start_part,
                end_part=end_part,
            )
        )

    return ranges, None


def parse_one(raw: str, fallback_book: Optional[str] = None) -> ParsedReference:
    """Parse a single citation with no "or" alternatives."""
    result = ParsedReference(raw=raw)
    text = _clean(raw)
    if not text:
        result.error = "empty reference"
        return result

    book, body = _split_book(text)
    if book is None:
        if fallback_book is None:
            result.error = f"unrecognized book in {raw!r}"
            return result
        book, body = fallback_book, text

    result.book = book
    if not body:
        result.error = "no chapter or verse given"
        return result

    ranges, error = _parse_segments(book, body)
    result.ranges = ranges
    if error and not ranges:
        result.error = error
        return result

    result.error = error
    result.ok = bool(ranges)
    return result


def parse(raw: str) -> list[ParsedReference]:
    """Parse a citation into one entry per alternative reading.

    "Luke 12:32-48 or 12:35-40" yields two references; the second inherits the
    book name from the first.
    """
    if not raw or not raw.strip():
        return [ParsedReference(raw=raw or "", error="empty reference")]

    alternatives = re.split(r"\s+or\s+", _clean(raw), flags=re.IGNORECASE)
    results: list[ParsedReference] = []
    fallback: Optional[str] = None
    for alternative in alternatives:
        parsed = parse_one(alternative, fallback_book=fallback)
        if parsed.book:
            fallback = parsed.book
        results.append(parsed)
    return results


def parse_first(raw: str) -> ParsedReference:
    """Convenience for callers that only care about the primary reading."""
    return parse(raw)[0]
