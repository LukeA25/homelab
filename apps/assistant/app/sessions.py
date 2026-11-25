"""Durable conversations: sessions, transcript turns, usage, cost and the memory-pass queue.

Live voice sessions and classic (record-then-reply or typed) turns both land
here. A full-text index over turns, observations and session summaries backs
Nova's retrieval tools. The gateway writes sessions; nova-engine claims
finished sessions for the post-session memory pass.
"""

from __future__ import annotations

import sqlite3
import time
import uuid
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from . import store
from .config import settings

DB = "conversations.db"
CLASSIC_IDLE_S = 600
MEMORY_MAX_ATTEMPTS = 5


def _conn() -> sqlite3.Connection:
    conn = store.connect(DB)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            mode TEXT NOT NULL,
            device_id TEXT NOT NULL,
            client_session TEXT,
            live_session_id TEXT,
            started_at REAL NOT NULL,
            last_activity REAL NOT NULL,
            ended_at REAL,
            end_reason TEXT,
            seconds INTEGER NOT NULL DEFAULT 0,
            active_seconds INTEGER NOT NULL DEFAULT 0,
            paused_seconds INTEGER NOT NULL DEFAULT 0,
            backend_input INTEGER NOT NULL DEFAULT 0,
            backend_cached INTEGER NOT NULL DEFAULT 0,
            backend_output INTEGER NOT NULL DEFAULT 0,
            cost_usd REAL NOT NULL DEFAULT 0,
            summary TEXT,
            memory_status TEXT NOT NULL DEFAULT 'open',
            memory_attempts INTEGER NOT NULL DEFAULT 0,
            memory_next_at REAL,
            memory_error TEXT
        );
        CREATE INDEX IF NOT EXISTS sessions_started ON sessions(started_at);
        CREATE TABLE IF NOT EXISTS turns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            ts REAL NOT NULL,
            role TEXT NOT NULL,
            text TEXT NOT NULL,
            tool TEXT,
            ok INTEGER
        );
        CREATE INDEX IF NOT EXISTS turns_session ON turns(session_id, id);
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
            text, kind UNINDEXED, ref UNINDEXED, ts UNINDEXED, tokenize = 'porter unicode61'
        );
        """
    )
    return conn


def _row(r: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(r) if r else None


def index(text: str, kind: str, ref: str, ts: float) -> None:
    if text.strip():
        with _conn() as conn:
            conn.execute("INSERT INTO memory_fts (text, kind, ref, ts) VALUES (?, ?, ?, ?)", (text, kind, ref, ts))


# --- lifecycle -------------------------------------------------------------------

def create(mode: str, device_id: str, *, client_session: str | None = None, live_session_id: str | None = None) -> str:
    sid = f"conv_{uuid.uuid4().hex[:16]}"
    now = time.time()
    with _conn() as conn:
        conn.execute(
            "INSERT INTO sessions (id, mode, device_id, client_session, live_session_id, started_at, last_activity)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (sid, mode, device_id, client_session, live_session_id, now, now),
        )
    return sid


def get(session_id: str) -> dict[str, Any] | None:
    with _conn() as conn:
        return _row(conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone())


def set_live_id(session_id: str, live_session_id: str) -> None:
    with _conn() as conn:
        conn.execute("UPDATE sessions SET live_session_id = ? WHERE id = ?", (live_session_id, session_id))


def add_turn(session_id: str, role: str, text: str, *, tool: str | None = None, ok: bool | None = None) -> None:
    text = (text or "").strip()
    if not text:
        return
    now = time.time()
    with _conn() as conn:
        conn.execute(
            "INSERT INTO turns (session_id, ts, role, text, tool, ok) VALUES (?, ?, ?, ?, ?, ?)",
            (session_id, now, role, text[:8000], tool, None if ok is None else int(ok)),
        )
        conn.execute("UPDATE sessions SET last_activity = ? WHERE id = ?", (now, session_id))
    if role in ("user", "assistant"):
        index(text, f"turn:{role}", session_id, now)


def turns(session_id: str) -> list[dict[str, Any]]:
    with _conn() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM turns WHERE session_id = ? ORDER BY id", (session_id,))]


def estimate_cost(row: dict[str, Any]) -> float:
    cfg = settings()
    uncached = max(0, row["backend_input"] - row["backend_cached"])
    return round(
        row["active_seconds"] / 60 * cfg["live_active_per_min"]
        + row["paused_seconds"] / 60 * cfg["live_paused_per_min"]
        + uncached / 1e6 * cfg["backend_in_per_m"]
        + row["backend_cached"] / 1e6 * cfg["backend_cached_per_m"]
        + row["backend_output"] / 1e6 * cfg["backend_out_per_m"],
        5,
    )


def _recost(conn: sqlite3.Connection, session_id: str) -> None:
    row = _row(conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone())
    if row:
        conn.execute("UPDATE sessions SET cost_usd = ? WHERE id = ?", (estimate_cost(row), session_id))


def set_usage(session_id: str, seconds: int, active: int | None, paused: int | None) -> None:
    """Live usage is cumulative per session: store the latest values, never sum them."""
    active = seconds if active is None else active
    paused = 0 if paused is None else paused
    with _conn() as conn:
        conn.execute(
            "UPDATE sessions SET seconds = ?, active_seconds = ?, paused_seconds = ? WHERE id = ?",
            (int(seconds), int(active), int(paused), session_id),
        )
        _recost(conn, session_id)


def add_backend_tokens(session_id: str, input_tokens: int, cached: int, output_tokens: int) -> None:
    with _conn() as conn:
        conn.execute(
            "UPDATE sessions SET backend_input = backend_input + ?, backend_cached = backend_cached + ?,"
            " backend_output = backend_output + ? WHERE id = ?",
            (int(input_tokens), int(cached), int(output_tokens), session_id),
        )
        _recost(conn, session_id)


def end(session_id: str, reason: str) -> bool:
    """Close a session once. Sessions with something the user said are queued for the memory pass."""
    now = time.time()
    with _conn() as conn:
        spoke = conn.execute(
            "SELECT 1 FROM turns WHERE session_id = ? AND role = 'user' LIMIT 1", (session_id,)
        ).fetchone()
        cur = conn.execute(
            "UPDATE sessions SET ended_at = ?, end_reason = ?, memory_status = ?, memory_next_at = ?"
            " WHERE id = ? AND ended_at IS NULL",
            (now, reason, "pending" if spoke else "skipped", now, session_id),
        )
        _recost(conn, session_id)
        return cur.rowcount > 0


def classic_session(device_id: str, client_session: str | None) -> str:
    """Group record-then-reply and typed turns into conversations split by inactivity."""
    now = time.time()
    key = client_session or "default"
    with _conn() as conn:
        row = conn.execute(
            "SELECT id, last_activity FROM sessions WHERE mode = 'classic' AND device_id = ? AND client_session = ?"
            " AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1",
            (device_id, key),
        ).fetchone()
    if row and now - row["last_activity"] < CLASSIC_IDLE_S:
        return row["id"]
    if row:
        end(row["id"], "idle")
    return create("classic", device_id, client_session=key)


def close_idle_classic(idle_s: int = CLASSIC_IDLE_S) -> int:
    cutoff = time.time() - idle_s
    with _conn() as conn:
        ids = [r["id"] for r in conn.execute(
            "SELECT id FROM sessions WHERE mode = 'classic' AND ended_at IS NULL AND last_activity < ?", (cutoff,)
        )]
    return sum(end(i, "idle") for i in ids)


def recover_open_live() -> int:
    """Live sessions cannot outlive the gateway process that held their sideband."""
    with _conn() as conn:
        ids = [r["id"] for r in conn.execute("SELECT id FROM sessions WHERE mode = 'live' AND ended_at IS NULL")]
    return sum(end(i, "gateway_restart") for i in ids)


# --- budget ----------------------------------------------------------------------

def month_start(now: float | None = None) -> float:
    tz = ZoneInfo(settings()["display_tz"])
    local = datetime.fromtimestamp(now or time.time(), tz)
    return local.replace(day=1, hour=0, minute=0, second=0, microsecond=0).timestamp()


def month_cost(now: float | None = None) -> float:
    with _conn() as conn:
        total = conn.execute(
            "SELECT COALESCE(SUM(cost_usd), 0) FROM sessions WHERE started_at >= ?", (month_start(now),)
        ).fetchone()[0]
    return round(float(total), 4)


def budget(now: float | None = None) -> dict[str, Any]:
    cfg = settings()
    spent = month_cost(now)
    return {
        "month_usd": spent,
        "warn_usd": cfg["budget_warn_usd"],
        "limit_usd": cfg["budget_limit_usd"],
        "warning": spent >= cfg["budget_warn_usd"],
        "blocked": spent >= cfg["budget_limit_usd"],
    }


# --- retrieval -------------------------------------------------------------------

def recent(limit: int = 5, *, ended_only: bool = True) -> list[dict[str, Any]]:
    sql = "SELECT id, mode, device_id, started_at, ended_at, summary FROM sessions"
    sql += " WHERE ended_at IS NOT NULL AND memory_status != 'skipped'" if ended_only else ""
    sql += " ORDER BY started_at DESC LIMIT ?"
    with _conn() as conn:
        return [dict(r) for r in conn.execute(sql, (limit,))]


def _fts_query(text: str) -> str:
    words = [w for w in "".join(c if c.isalnum() else " " for c in text.lower()).split() if len(w) > 1]
    return " OR ".join(f'"{w}"' for w in words[:12])


def search(query: str, limit: int = 8) -> list[dict[str, Any]]:
    q = _fts_query(query)
    if not q:
        return []
    with _conn() as conn:
        rows = conn.execute(
            "SELECT kind, ref, ts, snippet(memory_fts, 0, '[', ']', '…', 24) AS snippet"
            " FROM memory_fts WHERE memory_fts MATCH ? ORDER BY bm25(memory_fts) LIMIT ?",
            (q, limit),
        ).fetchall()
    return [dict(r) for r in rows]


# --- memory-pass queue (nova-engine) ---------------------------------------------

def claim_memory_job(now: float | None = None) -> dict[str, Any] | None:
    now = now or time.time()
    with _conn() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT * FROM sessions WHERE memory_status = 'pending' AND memory_next_at <= ?"
            " ORDER BY ended_at LIMIT 1",
            (now,),
        ).fetchone()
        if row:
            conn.execute(
                "UPDATE sessions SET memory_status = 'running', memory_attempts = memory_attempts + 1 WHERE id = ?",
                (row["id"],),
            )
        conn.execute("COMMIT")
    return _row(row)


def finish_memory(session_id: str, summary: str) -> None:
    with _conn() as conn:
        conn.execute(
            "UPDATE sessions SET memory_status = 'done', summary = ?, memory_error = NULL WHERE id = ?",
            (summary, session_id),
        )
        row = conn.execute("SELECT ended_at FROM sessions WHERE id = ?", (session_id,)).fetchone()
    if summary:
        index(summary, "summary", session_id, row["ended_at"] if row else time.time())


def fail_memory(session_id: str, error: str) -> str:
    """Retry with backoff; after the last attempt the session stays queryable but unprocessed."""
    with _conn() as conn:
        row = conn.execute("SELECT memory_attempts FROM sessions WHERE id = ?", (session_id,)).fetchone()
        attempts = row["memory_attempts"] if row else MEMORY_MAX_ATTEMPTS
        status = "failed" if attempts >= MEMORY_MAX_ATTEMPTS else "pending"
        conn.execute(
            "UPDATE sessions SET memory_status = ?, memory_error = ?, memory_next_at = ? WHERE id = ?",
            (status, error[:500], time.time() + 60 * 2 ** attempts, session_id),
        )
    return status


def requeue_stale_running() -> int:
    """A memory pass interrupted by an engine restart goes back to the queue."""
    with _conn() as conn:
        return conn.execute(
            "UPDATE sessions SET memory_status = 'pending', memory_next_at = ? WHERE memory_status = 'running'",
            (time.time(),),
        ).rowcount
