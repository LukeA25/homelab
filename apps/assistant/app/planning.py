"""Read learning goals and collect named geofence transitions from a phone."""

from contextlib import closing
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
import httpx
from pydantic import AwareDatetime, BaseModel, Field

from . import store
from .auth import require

router = APIRouter()


async def learning_goals(args, ctx):
    async with httpx.AsyncClient(timeout=8) as client:
        response = await client.get("http://learning-app:8000/api/workspace")
        response.raise_for_status()
        trees = response.json()["trees"]
    return {"goals": [{"source": "learning", "id": tree["id"], "title": tree["title"],
                       "goal": tree["goal"], "status": tree["status"]}
                      for tree in trees if tree.get("goal")]}


class Transition(BaseModel):
    place: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{0,39}$")
    transition: Literal["arrive", "leave"]
    observed_at: AwareDatetime


def location_db():
    db = store.connect("events.db")
    db.execute("""CREATE TABLE IF NOT EXISTS place_reports (
        id INTEGER PRIMARY KEY, device TEXT NOT NULL, place TEXT NOT NULL,
        transition TEXT NOT NULL, observed REAL NOT NULL, changed INTEGER NOT NULL,
        UNIQUE(device,place,observed))""")
    return db


@router.post("/api/events/location")
def location(body: Transition, device=Depends(require("events.location"))):
    now = time.time()
    observed = body.observed_at.timestamp()
    if not now - 3600 <= observed <= now + 5:
        raise HTTPException(422, "Location report is stale or in the future")
    with closing(location_db()) as db:
        db.execute("BEGIN IMMEDIATE")
        previous = db.execute("""SELECT * FROM place_reports WHERE device=? AND place=?
            ORDER BY observed DESC LIMIT 1""", (device.id, body.place)).fetchone()
        if previous and observed <= previous["observed"]:
            return {"status": "ignored"}
        changed = not previous or previous["transition"] != body.transition
        db.execute("INSERT INTO place_reports(device,place,transition,observed,changed) VALUES(?,?,?,?,?)",
                   (device.id, body.place, body.transition, observed, changed))
        db.commit()
    return {"status": "recorded" if changed else "refreshed"}


async def recent_places(args, ctx):
    with closing(location_db()) as db:
        rows = db.execute("""SELECT place,transition,observed FROM place_reports
            WHERE changed=1 ORDER BY observed DESC LIMIT 12""")
        return {"recent_transitions": [dict(row) for row in rows]}
