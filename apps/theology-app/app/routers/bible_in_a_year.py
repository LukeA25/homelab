"""Bible in a Year: the reading plan, streamed episode audio, and progress."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session

from ..bible.resolver import default_bible_id
from ..bible_in_a_year.feed import audio_overrides
from ..bible_in_a_year.plan import TOTAL_DAYS, day_payload, load_plan
from ..bible_in_a_year.progress import progress_payload, update_progress
from ..db import session_dependency
from ..schemas import BiyPlanOut, BiyProgressOut, BiyProgressUpdate

router = APIRouter(prefix="/bible-in-a-year", tags=["bible-in-a-year"])


def _days(session: Session) -> list[dict]:
    work_id = default_bible_id(session) or "bible-nabre"
    overrides = audio_overrides()
    rows = []
    for day in load_plan():
        extra = overrides.get(int(day["day"]))
        rows.append(
            day_payload(
                day,
                work_id,
                audio_url=extra["audioUrl"] if extra else None,
                title=extra["title"] if extra else None,
            )
        )
    return rows


@router.get("", response_model=BiyPlanOut)
def get_plan(session: Session = Depends(session_dependency)) -> BiyPlanOut:
    progress = progress_payload(session)
    return BiyPlanOut(totalDays=TOTAL_DAYS, days=_days(session), **progress)


@router.patch("", response_model=BiyProgressOut)
def patch_progress(
    body: BiyProgressUpdate,
    session: Session = Depends(session_dependency),
) -> BiyProgressOut:
    updated = update_progress(
        session,
        current_day=body.currentDay,
        day=body.day,
        completed=body.completed,
        position_seconds=body.positionSeconds,
    )
    return BiyProgressOut(**updated)
