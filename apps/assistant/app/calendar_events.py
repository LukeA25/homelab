"""Read-only iCloud calendar input for Nova's planner."""

import asyncio
from datetime import date, datetime, time, timedelta, timezone
import json
import logging
import os
from zoneinfo import ZoneInfo

from . import store
from .config import settings

PATH = "calendar/upcoming.json"
ICLOUD_URL = "https://caldav.icloud.com/"
REFRESH_SECONDS = 30 * 60
WINDOW_DAYS = 7
log = logging.getLogger("nova.calendar")


def event_time(value, zone):
    if isinstance(value, datetime):
        return value.replace(tzinfo=value.tzinfo or zone).astimezone(zone)
    return datetime.combine(value, time.min, zone)


def fetch(username: str, password: str, now: datetime, *, first: date | None = None,
          last: date | None = None, title: str = "") -> dict:
    from caldav import DAVClient

    zone = now.tzinfo
    start = datetime.combine(first or now.date(), time.min, zone)
    end = datetime.combine(last or now.date() + timedelta(days=WINDOW_DAYS), time.min, zone)
    events = []
    with DAVClient(url=ICLOUD_URL, username=username, password=password, timeout=12) as client:
        calendars = client.principal().calendars()
        filters = {"summary": title} if title else {}
        for calendar in calendars:
            results = calendar.search(start=start, end=end, event=True, expand=True, **filters)
            for result in results:
                item = result.get_icalendar_component()
                if str(item.get("STATUS", "")).upper() == "CANCELLED":
                    continue
                summary = str(item.get("SUMMARY") or "Untitled event")
                if title and title.casefold() not in summary.casefold():
                    continue
                begins = item.start
                finishes = item.end
                all_day = not isinstance(begins, datetime)
                begins_at, ends_at = event_time(begins, zone), event_time(finishes, zone)
                if begins_at >= end or (ends_at <= start and begins_at < start):
                    continue
                events.append({
                    "calendar": str(calendar.name or "Calendar")[:200],
                    "title": summary[:300],
                    "start": begins_at.isoformat(),
                    "end": ends_at.isoformat(),
                    "all_day": all_day,
                })
    return {"updated_at": now.isoformat(), "start": start.isoformat(), "end": end.isoformat(),
            "calendar_count": len(calendars), "events": sorted(events, key=lambda item: datetime.fromisoformat(item["start"]).timestamp())}


def snapshot() -> dict | None:
    target = store.path(PATH)
    try:
        return json.loads(target.read_text())
    except FileNotFoundError:
        return None


async def refresh_loop(stop: asyncio.Event) -> None:
    username = os.getenv("ICLOUD_CALDAV_USERNAME")
    password = os.getenv("ICLOUD_CALDAV_APP_PASSWORD")
    if not username or not password:
        return
    zone = ZoneInfo(settings()["display_tz"])
    # CalDAV diagnostics may contain account URLs or raw appointment data.
    logging.getLogger("caldav").setLevel(logging.CRITICAL + 1)
    while not stop.is_set():
        try:
            data = await asyncio.to_thread(fetch, username, password, datetime.now(zone))
            store.atomic_write(store.path(PATH), json.dumps(data))
            log.info("Refreshed events from %d iCloud calendars", data["calendar_count"])
        except Exception as exc:
            log.warning("iCloud refresh failed (%s); keeping last successful snapshot", type(exc).__name__)
        try:
            await asyncio.wait_for(stop.wait(), REFRESH_SECONDS)
        except TimeoutError:
            pass


async def read_day(args, ctx):
    current = snapshot()
    if current is None:
        return {"status": "unavailable"}
    day = date.fromisoformat(args["date"])
    start = datetime.fromisoformat(current["start"])
    end = datetime.fromisoformat(current["end"])
    if not start.date() <= day < end.date():
        return {"status": "outside_cached_range", "first_day": start.date().isoformat(),
                "last_day": (end.date() - timedelta(days=1)).isoformat()}
    zone = ZoneInfo(settings()["display_tz"])
    day_start = datetime.combine(day, time.min, zone)
    day_end = datetime.combine(day + timedelta(days=1), time.min, zone)
    matches = []
    for event in current["events"]:
        begins, finishes = datetime.fromisoformat(event["start"]), datetime.fromisoformat(event["end"])
        if begins < day_end and (finishes > day_start or begins == finishes == day_start):
            matches.append(event)
    updated = datetime.fromisoformat(current["updated_at"])
    return {"status": "stale" if (datetime.now(timezone.utc) - updated).total_seconds() >= 3600 else "ok",
            "updated_at": current["updated_at"], "calendar_count": current["calendar_count"],
            "events": matches[:100], "truncated": len(matches) > 100}
