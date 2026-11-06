"""Bible endpoints: books, chapters, and reference resolution."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..bible.resolver import default_bible_id, resolve
from ..db import session_dependency
from ..models import BibleBook, BibleVerse, Block
from ..schemas import BibleBookOut, ChapterOut, ParagraphOut, PassageOut, ResolveOut, ResolvedVerseOut

router = APIRouter(prefix="/bible", tags=["bible"])


def _require_bible(session: Session, work_id: Optional[str]) -> str:
    target = work_id or default_bible_id(session)
    if target is None:
        raise HTTPException(404, "no Bible has been imported")
    return target


@router.get("/books", response_model=list[BibleBookOut])
def list_books(
    session: Session = Depends(session_dependency),
    work_id: Optional[str] = Query(None, alias="workId"),
) -> list[BibleBookOut]:
    target = _require_bible(session, work_id)
    books = session.exec(
        select(BibleBook).where(BibleBook.work_id == target).order_by(BibleBook.number)
    ).all()
    return [
        BibleBookOut(
            number=book.number,
            name=book.name,
            displayName=book.display_name,
            testament=book.testament,
            canonOrder=book.canon_order,
            chapterCount=book.chapter_count,
        )
        for book in books
    ]


@router.get("/chapters/{book}/{chapter}", response_model=ChapterOut)
def get_chapter(
    book: str,
    chapter: int,
    session: Session = Depends(session_dependency),
    work_id: Optional[str] = Query(None, alias="workId"),
) -> ChapterOut:
    from ..bible.books import normalize_book_name

    target = _require_bible(session, work_id)
    canonical = normalize_book_name(book)
    if canonical is None:
        raise HTTPException(400, f"unrecognized book name {book!r}")

    record = session.exec(
        select(BibleBook).where(BibleBook.work_id == target, BibleBook.name == canonical)
    ).first()
    if record is None:
        raise HTTPException(404, f"{canonical} is not present in {target}")

    rows = session.exec(
        select(BibleVerse, Block)
        .join(Block, Block.pk == BibleVerse.block_pk)
        .where(BibleVerse.work_id == target)
        .where(BibleVerse.book_number == record.number)
        .where(BibleVerse.chapter == chapter)
        .order_by(BibleVerse.verse)
    ).all()
    if not rows:
        raise HTTPException(404, f"{canonical} {chapter} not found in {target}")

    section_id = rows[0][1].section_id
    # Include headings, which have no verse row of their own.
    blocks = session.exec(
        select(Block).where(Block.section_id == section_id).order_by(Block.order_index)
    ).all()
    verse_by_pk = {verse.block_pk: verse.verse for verse, _block in rows}

    return ChapterOut(
        workId=target,
        book=canonical,
        bookNumber=record.number,
        chapter=chapter,
        sectionId=section_id,
        paragraphs=[
            ParagraphOut(
                id=block.id,
                locusId=block.locus_id,
                label=block.label,
                kind=block.kind,
                text=block.text,
                verse=verse_by_pk.get(block.pk),
            )
            for block in blocks
        ],
    )


@router.get("/resolve", response_model=ResolveOut)
def resolve_reference(
    ref: str = Query(..., description='e.g. "Matthew 16:24-28"'),
    session: Session = Depends(session_dependency),
    work_id: Optional[str] = Query(None, alias="workId"),
) -> ResolveOut:
    target = _require_bible(session, work_id)
    passages = resolve(session, ref, target)
    return ResolveOut(
        query=ref,
        passages=[
            PassageOut(
                reference=passage.reference,
                book=passage.book,
                workId=passage.work_id,
                ok=passage.ok,
                error=passage.error,
                verses=[
                    ResolvedVerseOut(
                        locusId=verse.locus_id,
                        chapter=verse.chapter,
                        verse=verse.verse,
                        label=verse.label,
                        text=verse.text,
                    )
                    for verse in passage.verses
                ],
            )
            for passage in passages
        ],
    )
