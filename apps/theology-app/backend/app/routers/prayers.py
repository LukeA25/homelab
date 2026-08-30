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
from ..schemas import PrayerOut, ReadingRefOut, ReadingsOut

router = APIRouter(tags=["prayers"])


def _reading_nav(
    session: Session, reference: str
) -> tuple[Optional[str], Optional[str], Optional[int], Optional[int], list[int]]:
    """Return (sectionId, focusLocusId, verseStart, verseEnd, verses) for a lectionary reference."""
    work_id = default_bible_id(session)
    if not work_id:
        return None, None, None, None, []
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
        first = passage.verses[0]
        last = passage.verses[-1]
        section_id = f"{work_id}/{abbrev_key}/{first.chapter}"
        # Only verses in the first chapter of this passage (reader opens one section).
        verse_nums = sorted(
            {
                v.verse
                for v in passage.verses
                if v.chapter == first.chapter and isinstance(v.verse, int)
            }
        )
        return section_id, first.locus_id, first.verse, last.verse if last.chapter == first.chapter else (verse_nums[-1] if verse_nums else first.verse), verse_nums
    return None, None, None, None, []


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
        section_id, focus, v_start, v_end, verses = _reading_nav(session, r.reference)
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
