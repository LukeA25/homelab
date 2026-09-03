"""SQLite access for the homework database.

Plain sqlite3 rather than SQLModel: this database is also written by the Apple
Shortcuts quick-add and image-ingest scripts (add.py / ingest.py), so the schema
is shared and must stay exactly as those scripts expect. New columns are added
with defensive ALTER TABLE statements.
"""

from __future__ import annotations

import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Iterator, Optional

DB_PATH = Path(os.getenv("HOMEWORK_DB", "/data/homework.db"))

# Display name -> course code (tag). Mirrors the Shortcuts scripts.
COURSES: dict[str, str] = {
    "VR Project": "CS 4249",
    "Software Principles": "CS 4278",
    "Engineering Stats": "MATH 2810",
    "CS Seminar": "CS 4959",
    "Entrepreneurship": "ECE 4611",
    "Embedded Systems": "CS 6376",
}

COURSE_COLORS = [
    "#5B8CFF",
    "#F0B429",
    "#3DDC97",
    "#F07178",
    "#A78BFA",
    "#38BDF8",
]

_DUE_FORMATS = (
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y-%m-%d",
    "%b %d, %Y at %I:%M %p",
    "%B %d, %Y at %I:%M %p",
    "%b %d, %Y",
    "%B %d, %Y",
    "%m/%d/%Y",
    "%m/%d/%y",
)


@contextmanager
def session() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(DB_PATH, timeout=5.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with session() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS courses (
                code TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE
            );

            CREATE TABLE IF NOT EXISTS assignments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                course_code TEXT NOT NULL REFERENCES courses(code),
                title TEXT NOT NULL,
                due TEXT NOT NULL,
                due_raw TEXT,
                source TEXT NOT NULL DEFAULT 'manual',
                created_at TEXT NOT NULL,
                UNIQUE(course_code, title, due)
            );
            """
        )
        _migrate(conn)
        conn.executemany(
            "INSERT OR IGNORE INTO courses (code, name) VALUES (?, ?)",
            [(code, name) for name, code in COURSES.items()],
        )


def _migrate(conn: sqlite3.Connection) -> None:
    """Columns added after the Shortcuts scripts created the original schema."""
    for statement in (
        "ALTER TABLE assignments ADD COLUMN done INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE assignments ADD COLUMN completed_at TEXT",
        "ALTER TABLE assignments ADD COLUMN notes TEXT",
    ):
        try:
            conn.execute(statement)
        except sqlite3.OperationalError:
            pass  # column already exists


def normalize_due(raw: str) -> str:
    """Accept ISO, Apple-style, and US dates; return a naive local ISO string."""
    s = (raw or "").strip()
    if not s:
        return s
    s = s.replace("\u202f", " ").replace("\xa0", " ")
    s = re.sub(r"\s+", " ", s)
    for fmt in _DUE_FORMATS:
        try:
            return datetime.strptime(s, fmt).isoformat(timespec="minutes")
        except ValueError:
            continue
    return s


def parse_due(due: str) -> Optional[datetime]:
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(due, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(due)
    except (TypeError, ValueError):
        return None


def course_colors(conn: sqlite3.Connection) -> dict[str, str]:
    codes = [r["code"] for r in conn.execute("SELECT code FROM courses ORDER BY code")]
    return {code: COURSE_COLORS[i % len(COURSE_COLORS)] for i, code in enumerate(codes)}
