"""Push subscriptions, one row per device per app."""

from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(os.getenv("NOTIFY_DB", "/data/notify.db"))


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS subscriptions (
                endpoint TEXT PRIMARY KEY,
                app TEXT NOT NULL,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )


def upsert(app: str, endpoint: str, p256dh: str, auth: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO subscriptions (endpoint, app, p256dh, auth, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(endpoint) DO UPDATE SET
                app = excluded.app,
                p256dh = excluded.p256dh,
                auth = excluded.auth
            """,
            (endpoint, app, p256dh, auth, now),
        )


def delete(endpoint: str) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM subscriptions WHERE endpoint = ?", (endpoint,))


def for_app(app: str) -> list[sqlite3.Row]:
    with connect() as conn:
        return list(conn.execute("SELECT * FROM subscriptions WHERE app = ?", (app,)))
