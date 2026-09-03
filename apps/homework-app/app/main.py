"""Homework tracker API + SPA.

CRUD over the shared homework SQLite database that the Apple Shortcuts
quick-add (add.py) and image ingest (ingest.py) scripts also write to.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, FastAPI, HTTPException, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .db import course_colors, init_db, normalize_due, parse_due, session

app = FastAPI(title="Homework")
api = APIRouter()


@app.on_event("startup")
def _startup() -> None:
    init_db()


class AssignmentCreate(BaseModel):
    courseCode: str
    title: str = Field(min_length=1)
    due: str = Field(min_length=1)
    notes: Optional[str] = None
    done: bool = False
    source: str = "manual"


class AssignmentUpdate(BaseModel):
    courseCode: Optional[str] = None
    title: Optional[str] = Field(default=None, min_length=1)
    due: Optional[str] = Field(default=None, min_length=1)
    notes: Optional[str] = None
    done: Optional[bool] = None


def _labels(due_dt: Optional[datetime], now: datetime) -> dict[str, Any]:
    """Human-friendly due labels, computed server-side in the container's zone."""
    if due_dt is None:
        return {"dayLabel": "No date", "timeLabel": "", "daysUntil": None, "overdue": False}

    days_until = (due_dt.date() - now.date()).days
    overdue = due_dt < now

    if overdue:
        day_label = "Overdue"
    elif days_until == 0:
        day_label = "Today"
    elif days_until == 1:
        day_label = "Tomorrow"
    elif 2 <= days_until <= 6:
        day_label = due_dt.strftime("%A")
    else:
        day_label = due_dt.strftime("%a %b %-d")

    has_time = not (due_dt.hour == 0 and due_dt.minute == 0)

    return {
        "dayLabel": day_label,
        "timeLabel": due_dt.strftime("%-I:%M %p") if has_time else "",
        "daysUntil": days_until,
        "overdue": overdue,
    }


def _serialize(row: sqlite3.Row, colors: dict[str, str], now: datetime) -> dict[str, Any]:
    due_dt = parse_due(row["due"])
    done = bool(row["done"])
    labels = _labels(due_dt, now)
    if done:
        # A finished assignment is never "overdue" — it just has a date.
        labels["overdue"] = False
        if labels["dayLabel"] == "Overdue":
            labels["dayLabel"] = due_dt.strftime("%a %b %-d") if due_dt else "No date"

    return {
        "id": row["id"],
        "title": row["title"],
        "courseCode": row["course_code"],
        "courseName": row["course_name"],
        "color": colors.get(row["course_code"], "#5B8CFF"),
        "due": row["due"],
        "notes": row["notes"] or "",
        "source": row["source"],
        "done": done,
        "completedAt": row["completed_at"],
        "createdAt": row["created_at"],
        **labels,
    }


_SELECT = """
    SELECT a.id, a.title, a.course_code, a.due, a.due_raw, a.source, a.created_at,
           a.done, a.completed_at, a.notes, c.name AS course_name
    FROM assignments a
    JOIN courses c ON c.code = a.course_code
"""


def _fetch_one(conn: sqlite3.Connection, assignment_id: int) -> dict[str, Any]:
    row = conn.execute(f"{_SELECT} WHERE a.id = ?", (assignment_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return _serialize(row, course_colors(conn), datetime.now())


def _require_course(conn: sqlite3.Connection, code: str) -> str:
    code = (code or "").strip()
    row = conn.execute(
        "SELECT code FROM courses WHERE code = ? COLLATE NOCASE", (code,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=400, detail=f"Unknown course: {code}")
    return row["code"]


@api.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@api.get("/courses")
def list_courses() -> dict[str, list[dict[str, str]]]:
    with session() as conn:
        colors = course_colors(conn)
        rows = conn.execute("SELECT code, name FROM courses ORDER BY name").fetchall()
    return {
        "courses": [
            {"code": r["code"], "name": r["name"], "color": colors.get(r["code"], "#5B8CFF")}
            for r in rows
        ]
    }


@api.get("/assignments")
def list_assignments() -> dict[str, Any]:
    with session() as conn:
        colors = course_colors(conn)
        rows = conn.execute(f"{_SELECT} ORDER BY a.due ASC, a.id ASC").fetchall()
        now = datetime.now()
        items = [_serialize(r, colors, now) for r in rows]

    open_items = [a for a in items if not a["done"]]
    return {
        "assignments": items,
        "overdueCount": sum(1 for a in open_items if a["overdue"]),
        "dueTodayCount": sum(1 for a in open_items if a["daysUntil"] == 0 and not a["overdue"]),
        "openCount": len(open_items),
        "doneCount": len(items) - len(open_items),
    }


@api.post("/assignments", status_code=201)
def create_assignment(body: AssignmentCreate) -> dict[str, Any]:
    now = datetime.now()
    with session() as conn:
        code = _require_course(conn, body.courseCode)
        try:
            cur = conn.execute(
                """
                INSERT INTO assignments
                    (course_code, title, due, due_raw, source, created_at, done, completed_at, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    code,
                    body.title.strip(),
                    normalize_due(body.due),
                    body.due,
                    body.source,
                    now.isoformat(),
                    int(body.done),
                    now.isoformat() if body.done else None,
                    (body.notes or "").strip() or None,
                ),
            )
        except sqlite3.IntegrityError as exc:
            raise HTTPException(
                status_code=409, detail="That assignment already exists for this course and due date."
            ) from exc
        return _fetch_one(conn, int(cur.lastrowid))


@api.patch("/assignments/{assignment_id}")
def update_assignment(assignment_id: int, body: AssignmentUpdate) -> dict[str, Any]:
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        with session() as conn:
            return _fetch_one(conn, assignment_id)

    with session() as conn:
        existing = conn.execute(
            "SELECT id FROM assignments WHERE id = ?", (assignment_id,)
        ).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="Assignment not found")

        sets: list[str] = []
        values: list[Any] = []

        if "courseCode" in fields and fields["courseCode"] is not None:
            sets.append("course_code = ?")
            values.append(_require_course(conn, fields["courseCode"]))
        if "title" in fields and fields["title"] is not None:
            sets.append("title = ?")
            values.append(fields["title"].strip())
        if "due" in fields and fields["due"] is not None:
            sets.append("due = ?")
            values.append(normalize_due(fields["due"]))
            sets.append("due_raw = ?")
            values.append(fields["due"])
        if "notes" in fields:
            sets.append("notes = ?")
            values.append((fields["notes"] or "").strip() or None)
        if "done" in fields and fields["done"] is not None:
            sets.append("done = ?")
            values.append(int(fields["done"]))
            sets.append("completed_at = ?")
            values.append(datetime.now().isoformat() if fields["done"] else None)

        if sets:
            values.append(assignment_id)
            try:
                conn.execute(
                    f"UPDATE assignments SET {', '.join(sets)} WHERE id = ?", values
                )
            except sqlite3.IntegrityError as exc:
                raise HTTPException(
                    status_code=409,
                    detail="Another assignment already has that course, title, and due date.",
                ) from exc

        return _fetch_one(conn, assignment_id)


@api.delete("/assignments/{assignment_id}", status_code=204)
def delete_assignment(assignment_id: int) -> Response:
    with session() as conn:
        cur = conn.execute("DELETE FROM assignments WHERE id = ?", (assignment_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Assignment not found")
    return Response(status_code=204)


@api.post("/assignments/clear-done")
def clear_done() -> dict[str, int]:
    with session() as conn:
        cur = conn.execute("DELETE FROM assignments WHERE done = 1")
    return {"deleted": cur.rowcount}


app.include_router(api, prefix="/api")

# The Vite build is copied here by the Docker image. __file__ is
# /app/app/main.py, so the dist lives at /app/frontend_dist.
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend_dist"


def _mount_spa() -> None:
    if not FRONTEND_DIST.is_dir():
        return
    assets = FRONTEND_DIST / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):  # noqa: ARG001
        """Serve the SPA shell for all non-API routes."""
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")


_mount_spa()
