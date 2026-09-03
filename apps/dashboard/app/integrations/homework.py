"""Read-only homework client.

Reads the SQLite database produced by the homework quick-add / ingest scripts
(mounted read-only into the container) and returns upcoming assignments with
friendly, timezone-correct labels computed server-side so the frontend never
has to do date math.
"""

from __future__ import annotations

import os
import sqlite3
from datetime import datetime
from typing import Any, Optional

DB_PATH = os.getenv("HOMEWORK_DB", "/homework/homework.db")
HOMEWORK_HREF = os.getenv("HOMEWORK_BASE_URL", "http://homework.home.arpa")

_COURSE_COLORS = [
    "#5B8CFF",
    "#F0B429",
    "#3DDC97",
    "#F07178",
    "#A78BFA",
    "#38BDF8",
]


def _connect() -> Optional[sqlite3.Connection]:
    if not os.path.exists(DB_PATH):
        return None
    try:
        conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True, timeout=2.0)
        conn.row_factory = sqlite3.Row
        return conn
    except sqlite3.Error:
        return None


def _parse_due(due: str) -> Optional[datetime]:
    if not due:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(due, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(due)
    except ValueError:
        return None


def _labels(due_dt: Optional[datetime], now: datetime) -> dict[str, Any]:
    if due_dt is None:
        return {"day_label": "No date", "time_label": "", "days_until": None, "overdue": False}

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
    time_label = due_dt.strftime("%-I:%M %p").lstrip("0") if has_time else ""

    return {
        "day_label": day_label,
        "time_label": time_label,
        "days_until": days_until,
        "overdue": overdue,
    }


def _has_done_column(conn: sqlite3.Connection) -> bool:
    try:
        cols = conn.execute("PRAGMA table_info(assignments)").fetchall()
    except sqlite3.Error:
        return False
    return any(c["name"] == "done" for c in cols)


def get_assignments(limit: int = 10) -> dict[str, Any]:
    conn = _connect()
    if conn is None:
        return {"connected": False, "assignments": [], "overdue_count": 0, "upcoming_count": 0}

    try:
        where = "WHERE COALESCE(a.done, 0) = 0" if _has_done_column(conn) else ""
        rows = conn.execute(
            f"""
            SELECT a.id, a.title, a.due, a.due_raw, a.source,
                   c.code AS course_code, c.name AS course_name
            FROM assignments a
            JOIN courses c ON c.code = a.course_code
            {where}
            ORDER BY a.due ASC
            """
        ).fetchall()
        codes = [r["code"] for r in conn.execute("SELECT code FROM courses ORDER BY code")]
    except sqlite3.Error:
        conn.close()
        return {"connected": False, "assignments": [], "overdue_count": 0, "upcoming_count": 0}
    finally:
        conn.close()

    color_for = {code: _COURSE_COLORS[i % len(_COURSE_COLORS)] for i, code in enumerate(codes)}

    now = datetime.now()
    items: list[dict[str, Any]] = []
    overdue_count = 0
    for r in rows:
        due_dt = _parse_due(r["due"])
        labels = _labels(due_dt, now)
        if labels["overdue"] and labels["days_until"] is not None and labels["days_until"] < -2:
            continue
        if labels["overdue"]:
            overdue_count += 1
        items.append(
            {
                "id": r["id"],
                "title": r["title"],
                "course_code": r["course_code"],
                "course_name": r["course_name"],
                "color": color_for.get(r["course_code"], _COURSE_COLORS[0]),
                "due": r["due"],
                "source": r["source"],
                **labels,
            }
        )

    upcoming_count = len(items) - overdue_count
    return {
        "connected": True,
        "assignments": items[:limit],
        "overdue_count": overdue_count,
        "upcoming_count": upcoming_count,
        "total": len(items),
        "href": HOMEWORK_HREF,
    }
