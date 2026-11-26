"""Debounced Kuma transitions. Persist only monitor IDs, states and timestamps."""

from contextlib import closing
from datetime import datetime, timezone
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import audit, store
from .auth import require

router = APIRouter()
STATES = ("down", "up", "pending", "maintenance")
QUIET_SECONDS = 60


class Heartbeat(BaseModel):
    monitorID: int = Field(gt=0, strict=True)
    status: int = Field(ge=0, le=3, strict=True)
    time: datetime


class Webhook(BaseModel):
    heartbeat: Heartbeat | None = None


def connect():
    db = store.connect("events.db")
    db.execute("""CREATE TABLE IF NOT EXISTS monitors (
        id INTEGER PRIMARY KEY, observed TEXT NOT NULL, source_time REAL NOT NULL,
        since REAL NOT NULL, stable TEXT)""")
    db.execute("""CREATE TABLE IF NOT EXISTS monitor_events (
        id INTEGER PRIMARY KEY, monitor_id INTEGER NOT NULL, state TEXT NOT NULL,
        observed_at REAL NOT NULL, confirmed_at REAL NOT NULL)""")
    return db


@router.post("/api/events/kuma")
def ingest(body: Webhook, device=Depends(require("events.kuma"))):
    hb = body.heartbeat
    if hb is None:
        return {"status": "ignored"}
    stamp = hb.time.replace(tzinfo=hb.time.tzinfo or timezone.utc).timestamp()
    now = time.time()
    if stamp > now + 60:
        raise HTTPException(422, "Heartbeat time is in the future")
    state = STATES[hb.status]
    with closing(connect()) as db:
        changed = db.execute("""INSERT INTO monitors(id,observed,source_time,since)
            VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET observed=excluded.observed,
            source_time=excluded.source_time,
            since=CASE WHEN monitors.observed=excluded.observed THEN monitors.since ELSE excluded.since END
            WHERE monitors.source_time < excluded.source_time""", (hb.monitorID, state, stamp, now))
    if changed.rowcount:
        audit.operation("monitor_heartbeat", monitor_id=hb.monitorID, state=state)
    return {"status": "accepted" if changed.rowcount else "ignored"}


def settle():
    now = time.time()
    with closing(connect()) as db:
        db.execute("BEGIN IMMEDIATE")
        rows = db.execute("""SELECT * FROM monitors WHERE observed IS NOT stable
            AND since <= ?""", (now - QUIET_SECONDS,)).fetchall()
        for row in rows:
            db.execute("INSERT INTO monitor_events(monitor_id,state,observed_at,confirmed_at) VALUES(?,?,?,?)",
                       (row["id"], row["observed"], row["source_time"], now))
            db.execute("UPDATE monitors SET stable=observed WHERE id=?", (row["id"],))
        db.commit()


def diagnostics():
    with closing(connect()) as db:
        return {"monitors": [dict(row) for row in db.execute("SELECT * FROM monitors ORDER BY id")],
                "recent_events": [dict(row) for row in db.execute("SELECT * FROM monitor_events ORDER BY id DESC LIMIT 20")]}
