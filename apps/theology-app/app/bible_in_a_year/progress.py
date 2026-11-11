"""Listening progress for the single homelab user.

The first time this runs, days 1–247 are marked finished and the current day
is 248, which is where this library's listener left off.
"""

from __future__ import annotations

from sqlmodel import Session, select

from ..models import BiyDay, BiyState
from .plan import TOTAL_DAYS

STATE_ID = "local"
SEEDED_CURRENT_DAY = 248
SEEDED_COMPLETE_THROUGH = 247


def ensure_progress(session: Session) -> BiyState:
    state = session.get(BiyState, STATE_ID)
    if state is not None:
        return state
    state = BiyState(id=STATE_ID, current_day=SEEDED_CURRENT_DAY)
    session.add(state)
    for day in range(1, SEEDED_COMPLETE_THROUGH + 1):
        session.add(BiyDay(day=day, completed=True, position_seconds=0))
    session.commit()
    session.refresh(state)
    return state


def progress_payload(session: Session) -> dict:
    state = ensure_progress(session)
    rows = session.exec(select(BiyDay)).all()
    completed = sorted(row.day for row in rows if row.completed)
    positions = {
        str(row.day): round(row.position_seconds, 1)
        for row in rows
        if row.position_seconds and row.position_seconds > 0.5
    }
    return {
        "currentDay": state.current_day,
        "completedDays": completed,
        "positions": positions,
    }


def _day_row(session: Session, day: int) -> BiyDay:
    row = session.get(BiyDay, day)
    if row is None:
        row = BiyDay(day=day, completed=False, position_seconds=0)
        session.add(row)
    return row


def update_progress(
    session: Session,
    *,
    current_day: int | None = None,
    day: int | None = None,
    completed: bool | None = None,
    position_seconds: float | None = None,
) -> dict:
    state = ensure_progress(session)
    if current_day is not None:
        state.current_day = min(TOTAL_DAYS, max(1, int(current_day)))
    if day is not None:
        number = min(TOTAL_DAYS, max(1, int(day)))
        row = _day_row(session, number)
        if completed is not None:
            row.completed = bool(completed)
            if row.completed and number == state.current_day and number < TOTAL_DAYS:
                state.current_day = number + 1
        if position_seconds is not None:
            row.position_seconds = max(0.0, float(position_seconds))
    session.add(state)
    session.commit()
    return progress_payload(session)
