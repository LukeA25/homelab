"""Homework tracker API + SPA.

CRUD over the shared homework SQLite database that the Apple Shortcuts
quick-add (add.py) and image ingest (ingest.py) scripts also write to.
"""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, FastAPI, HTTPException, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, model_validator

from .db import course_colors, init_db, normalize_due, parse_due, session
from .recurrence import first_due_on_weekday, next_weekly_due, parse_date_only

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
    recurring: bool = False
    weekday: Optional[int] = Field(default=None, ge=0, le=6)
    repeatUntil: Optional[str] = None

    @model_validator(mode="after")
    def validate_recurring(self) -> "AssignmentCreate":
        if self.recurring and not self.repeatUntil:
            raise ValueError("repeatUntil is required when recurring is enabled.")
        return self


class AssignmentUpdate(BaseModel):
    courseCode: Optional[str] = None
    title: Optional[str] = Field(default=None, min_length=1)
    due: Optional[str] = Field(default=None, min_length=1)
    notes: Optional[str] = None
    done: Optional[bool] = None
    recurring: Optional[bool] = None
    weekday: Optional[int] = Field(default=None, ge=0, le=6)
    repeatUntil: Optional[str] = None


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
        "recurrenceId": row["recurrence_id"],
        "recurring": bool(row["recurring"]),
        "weekday": row["weekday"],
        "repeatUntil": row["repeat_until"],
        **labels,
    }


_SELECT = """
    SELECT a.id, a.title, a.course_code, a.due, a.due_raw, a.source, a.created_at,
           a.done, a.completed_at, a.notes, a.recurrence_id, a.recurring, a.weekday,
           a.repeat_until, c.name AS course_name
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


def _insert_assignment(
    conn: sqlite3.Connection,
    *,
    code: str,
    title: str,
    due_raw: str,
    source: str,
    now: datetime,
    done: bool,
    notes: Optional[str],
    recurrence_id: Optional[str],
    recurring: bool = False,
    weekday: Optional[int] = None,
    repeat_until: Optional[str] = None,
) -> int:
    cur = conn.execute(
        """
        INSERT INTO assignments
            (course_code, title, due, due_raw, source, created_at, done, completed_at,
             notes, recurrence_id, recurring, weekday, repeat_until)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            code,
            title.strip(),
            normalize_due(due_raw),
            due_raw,
            source,
            now.isoformat(),
            int(done),
            now.isoformat() if done else None,
            (notes or "").strip() or None,
            recurrence_id,
            int(recurring),
            weekday,
            repeat_until,
        ),
    )
    return int(cur.lastrowid)


def _maybe_spawn_next(conn: sqlite3.Connection, row: sqlite3.Row, now: datetime) -> None:
    """After marking done, create next week's assignment if the series is still active."""
    if not row["recurring"] or not row["recurrence_id"] or not row["repeat_until"]:
        return

    due_dt = parse_due(row["due"])
    if due_dt is None:
        return

    try:
        repeat_until = parse_date_only(row["repeat_until"])
    except ValueError:
        return

    next_due = next_weekly_due(due_dt, repeat_until)
    if next_due is None:
        return

    open_row = conn.execute(
        "SELECT id FROM assignments WHERE recurrence_id = ? AND done = 0",
        (row["recurrence_id"],),
    ).fetchone()
    if open_row is not None:
        return

    weekday = row["weekday"]
    if weekday is None:
        weekday = next_due.weekday()

    due_raw = next_due.isoformat(timespec="minutes")
    try:
        _insert_assignment(
            conn,
            code=row["course_code"],
            title=row["title"],
            due_raw=due_raw,
            source="recurring",
            now=now,
            done=False,
            notes=row["notes"],
            recurrence_id=row["recurrence_id"],
            recurring=True,
            weekday=weekday,
            repeat_until=row["repeat_until"],
        )
    except sqlite3.IntegrityError:
        pass


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
        notes = (body.notes or "").strip() or None

        recurrence_id: Optional[str] = None
        recurring = False
        weekday: Optional[int] = None
        repeat_until: Optional[str] = None
        due_raw = body.due
        source = body.source

        if body.recurring:
            anchor = parse_due(normalize_due(body.due))
            if anchor is None:
                raise HTTPException(status_code=400, detail="Could not parse the first due date.")

            weekday = body.weekday if body.weekday is not None else anchor.weekday()
            try:
                repeat_until_date = parse_date_only(body.repeatUntil or "")
                first_due = first_due_on_weekday(anchor, weekday)
                if first_due.date() > repeat_until_date:
                    raise ValueError("End date is before the first due date.")
                repeat_until = repeat_until_date.isoformat()
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc

            recurrence_id = str(uuid.uuid4())
            recurring = True
            due_raw = first_due.isoformat(timespec="minutes")
            source = "recurring"

        try:
            assignment_id = _insert_assignment(
                conn,
                code=code,
                title=body.title,
                due_raw=due_raw,
                source=source,
                now=now,
                done=body.done,
                notes=notes,
                recurrence_id=recurrence_id,
                recurring=recurring,
                weekday=weekday,
                repeat_until=repeat_until,
            )
        except sqlite3.IntegrityError as exc:
            raise HTTPException(
                status_code=409,
                detail="That assignment already exists for this course and due date.",
            ) from exc

        return _fetch_one(conn, assignment_id)


@api.patch("/assignments/{assignment_id}")
def update_assignment(assignment_id: int, body: AssignmentUpdate) -> dict[str, Any]:
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        with session() as conn:
            return _fetch_one(conn, assignment_id)

    now = datetime.now()
    with session() as conn:
        existing = conn.execute(f"{_SELECT} WHERE a.id = ?", (assignment_id,)).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="Assignment not found")

        was_done = bool(existing["done"])
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

        enabling = bool(fields.get("recurring"))
        disabling = "recurring" in fields and fields["recurring"] is False

        if "recurring" in fields and fields["recurring"] is not None:
            sets.append("recurring = ?")
            values.append(int(fields["recurring"]))

        if enabling and not existing["recurrence_id"]:
            sets.append("recurrence_id = ?")
            values.append(str(uuid.uuid4()))

        if "weekday" in fields and fields["weekday"] is not None:
            sets.append("weekday = ?")
            values.append(fields["weekday"])
        elif enabling and existing["weekday"] is None:
            due_for_weekday = parse_due(
                normalize_due(fields["due"]) if fields.get("due") else existing["due"]
            )
            sets.append("weekday = ?")
            values.append(due_for_weekday.weekday() if due_for_weekday else 0)

        if "repeatUntil" in fields and fields["repeatUntil"] is not None:
            try:
                repeat_until = parse_date_only(fields["repeatUntil"]).isoformat()
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            sets.append("repeat_until = ?")
            values.append(repeat_until)
        elif enabling and not existing["repeat_until"]:
            raise HTTPException(
                status_code=400, detail="End date is required when recurring is enabled."
            )

        if "done" in fields and fields["done"] is not None:
            sets.append("done = ?")
            values.append(int(fields["done"]))
            sets.append("completed_at = ?")
            values.append(now.isoformat() if fields["done"] else None)

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

        if disabling and existing["recurrence_id"]:
            conn.execute(
                "UPDATE assignments SET recurring = 0 WHERE recurrence_id = ?",
                (existing["recurrence_id"],),
            )

        updated = conn.execute(f"{_SELECT} WHERE a.id = ?", (assignment_id,)).fetchone()
        if (
            updated is not None
            and "done" in fields
            and fields["done"]
            and not was_done
        ):
            _maybe_spawn_next(conn, updated, now)

        return _fetch_one(conn, assignment_id)


@api.delete("/assignments/{assignment_id}/series", status_code=204)
def delete_series(assignment_id: int) -> Response:
    with session() as conn:
        row = conn.execute(
            "SELECT recurrence_id FROM assignments WHERE id = ?", (assignment_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Assignment not found")
        recurrence_id = row["recurrence_id"]
        if not recurrence_id:
            raise HTTPException(status_code=400, detail="This assignment is not part of a series.")
        conn.execute("DELETE FROM assignments WHERE recurrence_id = ?", (recurrence_id,))
    return Response(status_code=204)


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
