"""Single-use approvals for protected actions.

An approval is bound to one capability, its exact arguments, the originating
device and session, and a short expiry. Only the gateway resolves it: from the
user's own next utterance (transcribed by the gateway or typed on the device)
or from a tap in the client UI. The model has no tool that resolves approvals.
"""

from __future__ import annotations

import json
import re
import time
import uuid
from typing import Any

from . import store

DB = "nova.db"

_YES = re.compile(
    r"^(yes|yeah|yep|yup|sure|ok|okay|confirm|confirmed|approve|approved|affirmative|"
    r"do it|go ahead|send it|run it|please do)\b"
)
_NO = re.compile(r"\b(no|nope|don't|dont|do not|cancel|stop|wait|hold on|never mind|nevermind|not)\b")
_MAX_YES_WORDS = 8


def _conn():
    conn = store.connect(DB)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS approvals (
            id TEXT PRIMARY KEY,
            capability TEXT NOT NULL,
            args_json TEXT NOT NULL,
            read_back TEXT NOT NULL,
            device_id TEXT NOT NULL,
            session_id TEXT,
            request_id TEXT,
            status TEXT NOT NULL,
            created_at REAL NOT NULL,
            expires_at REAL NOT NULL,
            resolved_at REAL,
            resolved_via TEXT,
            result_json TEXT
        )
        """
    )
    return conn


def _row(r) -> dict[str, Any]:
    d = dict(r)
    d["args"] = json.loads(d.pop("args_json"))
    raw = d.pop("result_json")
    d["result"] = json.loads(raw) if raw else None
    return d


def classify(text: str) -> str:
    """'yes', 'no' or 'other'. Anything hedged or long is not a yes."""
    norm = re.sub(r"[^\w\s']", " ", (text or "").lower()).strip()
    norm = re.sub(r"\s+", " ", norm)
    if not norm:
        return "other"
    if _NO.search(norm):
        return "no"
    if _YES.match(norm) and len(norm.split()) <= _MAX_YES_WORDS:
        return "yes"
    return "other"


def create(
    *,
    capability: str,
    args: dict[str, Any],
    read_back: str,
    device_id: str,
    session_id: str | None,
    request_id: str | None,
    ttl_seconds: int,
) -> dict[str, Any]:
    now = time.time()
    approval_id = str(uuid.uuid4())
    with _conn() as conn:
        # A new request supersedes any older pending one for the same conversation.
        conn.execute(
            "UPDATE approvals SET status = 'expired', resolved_at = ?, resolved_via = 'superseded' "
            "WHERE status = 'pending' AND device_id = ? AND session_id IS ?",
            (now, device_id, session_id),
        )
        conn.execute(
            "INSERT INTO approvals (id, capability, args_json, read_back, device_id, session_id, request_id, "
            "status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
            (approval_id, capability, json.dumps(args), read_back, device_id, session_id, request_id, now, now + ttl_seconds),
        )
    return get(approval_id)  # type: ignore[return-value]


def get(approval_id: str) -> dict[str, Any] | None:
    with _conn() as conn:
        r = conn.execute("SELECT * FROM approvals WHERE id = ?", (approval_id,)).fetchone()
    return _row(r) if r else None


def expire_stale() -> None:
    now = time.time()
    with _conn() as conn:
        conn.execute(
            "UPDATE approvals SET status = 'expired', resolved_at = ?, resolved_via = 'timeout' "
            "WHERE status = 'pending' AND expires_at < ?",
            (now, now),
        )


def pending_for(device_id: str, session_id: str | None) -> dict[str, Any] | None:
    expire_stale()
    with _conn() as conn:
        r = conn.execute(
            "SELECT * FROM approvals WHERE status = 'pending' AND device_id = ? AND session_id IS ? "
            "ORDER BY created_at DESC LIMIT 1",
            (device_id, session_id),
        ).fetchone()
    return _row(r) if r else None


def resolve(approval_id: str, decision: str, via: str) -> dict[str, Any] | None:
    """Atomically move a pending approval to approved/denied/expired. None if it was not pending."""
    status = {"yes": "approved", "no": "denied", "other": "expired"}[decision]
    expire_stale()
    with _conn() as conn:
        cur = conn.execute(
            "UPDATE approvals SET status = ?, resolved_at = ?, resolved_via = ? WHERE id = ? AND status = 'pending'",
            (status, time.time(), via, approval_id),
        )
        if cur.rowcount == 0:
            return None
    return get(approval_id)


def record_result(approval_id: str, ok: bool, result: Any) -> None:
    with _conn() as conn:
        conn.execute(
            "UPDATE approvals SET status = ?, result_json = ? WHERE id = ?",
            ("executed" if ok else "failed", json.dumps(result, default=str), approval_id),
        )


def recent(capability: str | None = None, limit: int = 20) -> list[dict[str, Any]]:
    expire_stale()
    with _conn() as conn:
        if capability:
            rows = conn.execute(
                "SELECT * FROM approvals WHERE capability = ? ORDER BY created_at DESC LIMIT ?", (capability, limit)
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM approvals ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    return [_row(r) for r in rows]
