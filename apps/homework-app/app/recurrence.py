"""Weekly recurrence helpers."""

from __future__ import annotations

from datetime import date, datetime, timedelta


def parse_date_only(raw: str) -> date:
    s = (raw or "").strip()
    if not s:
        raise ValueError("End date is required for recurring assignments.")
    if "T" in s:
        s = s.split("T", 1)[0]
    elif " " in s:
        s = s.split(" ", 1)[0]
    return date.fromisoformat(s)


def align_to_weekday(d: date, weekday: int) -> date:
    """Return the first `d` or later that falls on `weekday` (0=Mon … 6=Sun)."""
    if weekday < 0 or weekday > 6:
        raise ValueError("weekday must be 0 (Monday) through 6 (Sunday).")
    offset = (weekday - d.weekday()) % 7
    return d + timedelta(days=offset)


def first_due_on_weekday(anchor_due: datetime, weekday: int) -> datetime:
    """First occurrence on `weekday`, at 11:59 PM."""
    first_date = align_to_weekday(anchor_due.date(), weekday)
    due_time = anchor_due.replace(hour=23, minute=59, second=0, microsecond=0)
    return datetime.combine(first_date, due_time.time())


def next_weekly_due(current_due: datetime, repeat_until: date) -> datetime | None:
    """Due date one week later, or None if past `repeat_until`."""
    next_dt = current_due + timedelta(days=7)
    next_dt = next_dt.replace(hour=23, minute=59, second=0, microsecond=0)
    if next_dt.date() > repeat_until:
        return None
    return next_dt
