"""Turn a scripture citation into the verses stored in the local Bible.

This is the seam the Mass-readings feature will plug into: the lectionary
supplies references, never text, and the text is always read from the imported
NABRE.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from sqlmodel import Session, and_, or_, select

from ..models import BibleBook, BibleVerse, Block, Work
from .reference import ParsedReference, VerseRange, parse


@dataclass
class ResolvedVerse:
    locus_id: str
    chapter: int
    verse: int
    label: str
    text: str


@dataclass
class ResolvedPassage:
    reference: str
    book: Optional[str] = None
    work_id: Optional[str] = None
    ok: bool = False
    error: Optional[str] = None
    verses: list[ResolvedVerse] = field(default_factory=list)


def default_bible_id(session: Session) -> Optional[str]:
    work = session.exec(select(Work).where(Work.kind == "bible").order_by(Work.id)).first()
    return work.id if work else None


def _book_numbers(session: Session, work_id: str) -> dict[str, int]:
    rows = session.exec(select(BibleBook.name, BibleBook.number).where(BibleBook.work_id == work_id)).all()
    return {name: number for name, number in rows}


def _range_filter(book_number: int, span: VerseRange):
    """SQL predicate for an inclusive span that may cross a chapter boundary."""
    if span.is_whole_chapter:
        return and_(
            BibleVerse.book_number == book_number,
            BibleVerse.chapter >= span.start_chapter,
            BibleVerse.chapter <= span.end_chapter,
        )
    lower = or_(
        BibleVerse.chapter > span.start_chapter,
        and_(BibleVerse.chapter == span.start_chapter, BibleVerse.verse >= span.start_verse),
    )
    upper = or_(
        BibleVerse.chapter < span.end_chapter,
        and_(BibleVerse.chapter == span.end_chapter, BibleVerse.verse <= span.end_verse),
    )
    return and_(BibleVerse.book_number == book_number, lower, upper)


def resolve_parsed(
    session: Session, parsed: ParsedReference, work_id: str
) -> ResolvedPassage:
    passage = ResolvedPassage(reference=parsed.label(), book=parsed.book, work_id=work_id)

    if not parsed.ok or not parsed.book:
        passage.error = parsed.error or "could not parse reference"
        return passage

    numbers = _book_numbers(session, work_id)
    book_number = numbers.get(parsed.book)
    if book_number is None:
        passage.error = f"{parsed.book} is not present in {work_id}"
        return passage

    seen: set[tuple[int, int]] = set()
    for span in parsed.ranges:
        rows = session.exec(
            select(BibleVerse, Block)
            .join(Block, Block.pk == BibleVerse.block_pk)
            .where(BibleVerse.work_id == work_id)
            .where(_range_filter(book_number, span))
            .order_by(BibleVerse.chapter, BibleVerse.verse)
        ).all()
        for verse_row, block in rows:
            key = (verse_row.chapter, verse_row.verse)
            if key in seen:
                continue  # citations like "Ps 98:2-3, 3-4" repeat a verse
            seen.add(key)
            passage.verses.append(
                ResolvedVerse(
                    locus_id=block.locus_id,
                    chapter=verse_row.chapter,
                    verse=verse_row.verse,
                    label=block.label,
                    text=block.text,
                )
            )

    passage.verses.sort(key=lambda v: (v.chapter, v.verse))
    passage.ok = bool(passage.verses)
    if not passage.ok:
        passage.error = passage.error or "reference parsed but matched no verses"
    return passage


def resolve(session: Session, reference: str, work_id: Optional[str] = None) -> list[ResolvedPassage]:
    """Resolve a citation, returning one passage per alternative reading."""
    target = work_id or default_bible_id(session)
    if target is None:
        return [ResolvedPassage(reference=reference, error="no Bible has been imported")]
    return [resolve_parsed(session, parsed, target) for parsed in parse(reference)]
