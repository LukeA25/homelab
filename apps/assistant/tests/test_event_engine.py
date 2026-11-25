from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app import event_engine as events


def test_claim_recovery_and_cancellation():
    now = datetime(2026, 11, 25, 18, 15, tzinfo=ZoneInfo("America/Chicago"))
    first = events.claim(now, "08:00")
    assert first["attempt"] == 1
    assert events.claim(now, "08:00") is None
    later = now + timedelta(minutes=2)
    recovered = events.claim(later, "08:00")
    assert recovered["id"] == first["id"]
    events.finish(first, 0, later)
    events.finish(recovered, None, later)
    assert events.claim(later, "08:00") is None
    retry = events.claim(later + timedelta(minutes=1), "08:00")
    assert retry["attempt"] == 3
    events.finish(retry, 0, later + timedelta(minutes=1))
    assert events.claim(now.replace(hour=20), "08:00") is None


def test_late_planning_only_runs_current_slot():
    now = datetime(2026, 11, 25, 22, 15, tzinfo=ZoneInfo("America/Chicago"))
    assert events.claim(now, "22:30") is None
    current = events.claim(now.replace(minute=30), "22:30")
    assert current["id"].endswith("2200")
    events.finish(current, 2, now.replace(minute=31))
    assert events.claim(now.replace(hour=23), "22:30")["id"].endswith("2300")
