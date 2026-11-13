"""Prayers index and Mass readings endpoints."""

from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from ..bible.books import book_meta, normalize_book_name
from ..bible.resolver import default_bible_id, resolve
from ..catalog import load_prayers
from ..db import session_dependency
from ..lectionary import get_readings
from ..schemas import PrayerOut, ReadingChapterOut, ReadingRefOut, ReadingsOut

router = APIRouter(tags=["prayers"])


def _reading_nav(
    session: Session, reference: str
) -> tuple[Optional[str], Optional[str], Optional[int], Optional[int], list[int], list[ReadingChapterOut]]:
    """Return the first chapter plus every chapter the reference covers."""
    work_id = default_bible_id(session)
    if not work_id:
        return None, None, None, None, [], []
    passages = resolve(session, reference, work_id)
    for passage in passages:
        if not passage.ok or not passage.book or not passage.verses:
            continue
        meta = book_meta(passage.book)
        if not meta:
            canonical = normalize_book_name(passage.book)
            meta = book_meta(canonical) if canonical else None
        if not meta:
            continue
        _testament, _order, abbrev = meta
        abbrev_key = abbrev.replace(" ", "")
        by_chapter: dict[int, list] = {}
        for verse in passage.verses:
            by_chapter.setdefault(verse.chapter, []).append(verse)
        chapters: list[ReadingChapterOut] = []
        for chapter in sorted(by_chapter):
            verses = by_chapter[chapter]
            nums = sorted({v.verse for v in verses if isinstance(v.verse, int)})
            chapters.append(
                ReadingChapterOut(
                    sectionId=f"{work_id}/{abbrev_key}/{chapter}",
                    verseStart=nums[0] if nums else None,
                    verseEnd=nums[-1] if nums else None,
                    verses=nums,
                    focusLocusId=verses[0].locus_id,
                )
            )
        if not chapters:
            continue
        first = chapters[0]
        return (
            first.sectionId,
            first.focusLocusId,
            first.verseStart,
            first.verseEnd,
            first.verses,
            chapters,
        )
    return None, None, None, None, [], []


@router.get("/prayers", response_model=list[PrayerOut])
def list_prayers() -> list[PrayerOut]:
    rows = sorted(load_prayers(), key=lambda r: int(r.get("sort") or 0))
    return [
        PrayerOut(
            id=str(r["id"]),
            title=str(r["title"]),
            subtitle=str(r.get("subtitle") or ""),
            kind=str(r.get("kind") or "prayer"),
            sort=int(r.get("sort") or 0),
            body=None,
        )
        for r in rows
    ]


@router.get("/prayers/{prayer_id}", response_model=PrayerOut)
def get_prayer(prayer_id: str) -> PrayerOut:
    for r in load_prayers():
        if r.get("id") == prayer_id:
            return PrayerOut(
                id=str(r["id"]),
                title=str(r["title"]),
                subtitle=str(r.get("subtitle") or ""),
                kind=str(r.get("kind") or "prayer"),
                sort=int(r.get("sort") or 0),
                body=str(r.get("body") or "") if r.get("kind") != "readings" else None,
            )
    from fastapi import HTTPException

    raise HTTPException(404, f"prayer {prayer_id!r} not found")


@router.get("/readings", response_model=ReadingsOut)
def readings_for_date(
    session: Session = Depends(session_dependency),
    day: Optional[str] = Query(None, alias="date", description="YYYY-MM-DD"),
    refresh: bool = False,
) -> ReadingsOut:
    target = day or date.today().isoformat()
    normalized = get_readings(target, refresh=refresh)
    items: list[ReadingRefOut] = []
    for r in normalized.readings:
        section_id, focus, v_start, v_end, verses, chapters = _reading_nav(session, r.reference)
        items.append(
            ReadingRefOut(
                type=r.type,
                reference=r.reference,
                label=r.label or r.type,
                sectionId=section_id,
                focusLocusId=focus,
                verseStart=v_start,
                verseEnd=v_end,
                verses=verses,
                chapters=chapters,
            )
        )
    return ReadingsOut(
        date=normalized.date or target,
        celebration=normalized.celebration,
        season=normalized.season,
        source=normalized.source,
        error=normalized.error,
        readings=items,
    )
