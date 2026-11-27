"""Durable Nova notification outbox and phone-reported Focus state."""

from contextlib import closing
import os
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import AwareDatetime, BaseModel, StrictBool

from . import audit, store
from .auth import require

router = APIRouter()
FRESH_SECONDS = 24 * 3600


class FocusReport(BaseModel):
    enabled: StrictBool
    observed_at: AwareDatetime


def schema(db):
    db.execute("""CREATE TABLE IF NOT EXISTS focus (
        id INTEGER PRIMARY KEY, enabled INTEGER NOT NULL, observed REAL NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS notifications (
        event TEXT PRIMARY KEY, day TEXT NOT NULL, created REAL NOT NULL, expires REAL NOT NULL,
        status TEXT NOT NULL, attempted REAL, accepted INTEGER, failed INTEGER)""")


def record_homework(db, job, count, now):
    schema(db)
    db.execute("UPDATE notifications SET status=? WHERE day=? AND status='queued'",
               ("superseded" if count else "cancelled", job["local_day"]))
    if count:
        db.execute("""INSERT INTO notifications(event,day,created,expires,status)
            VALUES(?,?,?,?,'queued')""", (job["id"], job["local_day"], now, job["expires"]))


def focus(db, now):
    row = db.execute("SELECT * FROM focus WHERE id=1").fetchone()
    if not row or now - row["observed"] >= FRESH_SECONDS:
        return "unknown"
    return "on" if row["enabled"] else "off"


@router.put("/api/dnd")
def report(body: FocusReport, device=Depends(require("notifications.dnd"))):
    observed = body.observed_at.timestamp()
    now = time.time()
    if observed > now + 5:
        raise HTTPException(422, "Observation is in the future")
    with closing(store.connect("events.db")) as db:
        schema(db)
        db.execute("""INSERT INTO focus VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET
            enabled=excluded.enabled, observed=excluded.observed WHERE excluded.observed>focus.observed
            OR (excluded.observed=focus.observed AND excluded.enabled=1)""", (body.enabled, observed))
        state = focus(db, now)
    audit.operation("focus_report", state=state)
    return {"state": state}


@router.get("/api/dnd")
def inspect_focus(device=Depends(require("notifications.dnd"))):
    with closing(store.connect("events.db")) as db:
        schema(db)
        return {"state": focus(db, time.time())}


@router.get("/api/notifications")
def history(device=Depends(require("notifications.read"))):
    with closing(store.connect("events.db")) as db:
        schema(db)
        return [dict(row) for row in db.execute("SELECT * FROM notifications ORDER BY created DESC LIMIT 50")]


async def release(check_homework, zone):
    token = os.getenv("NOTIFY_TOKEN")
    destination = os.getenv("NOVA_HOMEWORK_PUSH_APP", "homework").strip()
    if destination not in ("homework", "nova"):
        raise ValueError("NOVA_HOMEWORK_PUSH_APP must be homework or nova")
    target = "/homework/" if destination == "nova" else "/"
    now = time.time()
    with closing(store.connect("events.db")) as db:
        schema(db)
        db.execute("UPDATE notifications SET status='expired' WHERE status='queued' AND expires<=?", (now,))
        if not token or focus(db, now) != "off":
            return
        row = db.execute("SELECT * FROM notifications WHERE status='queued' ORDER BY created LIMIT 1").fetchone()
    if row is None:
        return
    remaining = await check_homework(row["day"], zone)
    with closing(store.connect("events.db")) as db:
        db.execute("BEGIN IMMEDIATE")
        now = time.time()
        if focus(db, now) != "off" or row["expires"] <= now:
            return
        # Mark the attempt before handing off. A crash or timeout has an unknown outcome.
        claimed = db.execute("""UPDATE notifications SET status=?, attempted=?
            WHERE event=? AND status='queued'""", ("unknown" if remaining else "cancelled", now, row["event"]))
        db.commit()
        if not remaining or not claimed.rowcount:
            return
        async with httpx.AsyncClient(timeout=12) as client:
            result = await client.post("http://notify:8000/api/send",
                headers={"Authorization": f"Bearer {token}"},
                json={"app": destination, "title": "Homework due tonight", "body": "Open Homework to see what’s due.",
                      "url": target, "tag": "homework-" + row["day"], "ttl": 0})
            result.raise_for_status()
            counts = result.json()
        accepted, failed = counts["delivered"], counts["failed"]
        status = "submitted" if accepted else "failed" if failed else "no_subscribers"
        db.execute("UPDATE notifications SET status=?,accepted=?,failed=? WHERE event=?",
                   (status, accepted, failed, row["event"]))
