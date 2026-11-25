"""Persistent daily homework checks. All timestamps in SQLite are Unix seconds."""

from contextlib import closing
from datetime import datetime, time, timedelta
import logging
from zoneinfo import ZoneInfo

import httpx

from . import nova_config, store
from .config import settings

SLOTS = (time(18, 15), time(20), time(22), time(23))
LOG = logging.getLogger("nova.events")


def claim(now: datetime, planner_time: str):
    stamp = now.timestamp()
    with closing(store.connect("events.db")) as db:
        db.execute("""CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY, kind TEXT NOT NULL, local_day TEXT NOT NULL,
            due REAL NOT NULL, expires REAL NOT NULL, available REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'scheduled', attempt INTEGER NOT NULL DEFAULT 0,
            outcome TEXT)""")
        db.execute("BEGIN IMMEDIATE")
        if now.time() >= time.fromisoformat(planner_time):
            day = now.date().isoformat()
            times = [datetime.combine(now.date(), slot, now.tzinfo) for slot in SLOTS]
            end = datetime.combine(now.date() + timedelta(days=1), time.min, now.tzinfo)
            for due, expires in zip(times, times[1:] + [end]):
                db.execute("""INSERT INTO events (id, kind, local_day, due, expires, available)
                    VALUES (?, 'homework', ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING""",
                    (f"homework:{day}:{due:%H%M}", day, due.timestamp(),
                     expires.timestamp(), due.timestamp()))
        db.execute("""UPDATE events SET status='expired'
            WHERE status IN ('scheduled','running') AND expires <= ?""", (stamp,))
        job = db.execute("""UPDATE events SET status='running', attempt=attempt+1, available=?
            WHERE id=(SELECT id FROM events WHERE kind='homework'
                AND status IN ('scheduled','running') AND available <= ?
                ORDER BY due LIMIT 1) RETURNING *""", (stamp + 90, stamp)).fetchone()
        db.commit()
        return job


def finish(job, count: int | None, now: datetime):
    with closing(store.connect("events.db")) as db:
        db.execute("BEGIN IMMEDIATE")
        stamp = now.timestamp()
        if stamp >= job["expires"]:
            status, outcome = "expired", None
        elif count is None:
            status, outcome = "scheduled", "homework state unknown"
        else:
            status, outcome = "completed", f"{count} open due tonight"
        updated = db.execute("""UPDATE events SET status=?, outcome=?, available=?
            WHERE id=? AND status='running' AND attempt=?""",
            (status, outcome, stamp + 60, job["id"], job["attempt"]))
        if updated.rowcount and status == "completed" and count == 0:
            db.execute("""UPDATE events SET status='cancelled' WHERE kind='homework'
                AND local_day=? AND due>? AND status='scheduled'""", (job["local_day"], job["due"]))
        db.commit()


async def tick():
    zone = ZoneInfo(settings()["display_tz"])
    job = claim(datetime.now(zone), nova_config.load()["daily_planner_time"])
    if job is None:
        return
    count = None
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(settings()["homework_base_url"] + "/api/assignments")
            response.raise_for_status()
            rows = response.json()["assignments"]
            if not isinstance(rows, list):
                raise ValueError("invalid assignments")
            count = 0
            for item in rows:
                if not isinstance(item["done"], bool):
                    raise ValueError("invalid assignment completion state")
                if item["done"] or not item["due"]:
                    continue
                due = datetime.fromisoformat(item["due"])
                if due.tzinfo:
                    due = due.astimezone(zone)
                if due.date().isoformat() == job["local_day"] and (due.hour, due.minute) == (23, 59):
                    count += 1
    except (httpx.HTTPError, ValueError, TypeError, KeyError) as exc:
        LOG.warning("Homework check %s unavailable (%s)", job["id"], type(exc).__name__)
        count = None
    finish(job, count, datetime.now(zone))
