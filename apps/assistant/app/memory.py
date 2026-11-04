"""Short-lived multi-turn chat memory keyed by session id."""

from __future__ import annotations

import threading
import time
from typing import Any

_LOCK = threading.Lock()
_SESSIONS: dict[str, dict[str, Any]] = {}

_MAX_MESSAGES = 24  # user+assistant pairs ≈ 12 turns
_TTL_SECONDS = 60 * 5


def _prune_locked(now: float) -> None:
    dead = [
        sid
        for sid, sess in _SESSIONS.items()
        if now - sess.get("updated_at", 0) > _TTL_SECONDS
    ]
    for sid in dead:
        del _SESSIONS[sid]


def get_history(session_id: str | None) -> list[dict[str, Any]]:
    if not session_id:
        return []
    now = time.time()
    with _LOCK:
        _prune_locked(now)
        sess = _SESSIONS.get(session_id)
        if not sess:
            return []
        return list(sess["messages"])


def append_turn(session_id: str | None, user_text: str, assistant_text: str) -> None:
    if not session_id:
        return
    user_text = (user_text or "").strip()
    assistant_text = (assistant_text or "").strip()
    if not user_text and not assistant_text:
        return
    now = time.time()
    with _LOCK:
        _prune_locked(now)
        sess = _SESSIONS.setdefault(session_id, {"messages": [], "updated_at": now})
        if user_text:
            sess["messages"].append({"role": "user", "content": user_text})
        if assistant_text:
            sess["messages"].append({"role": "assistant", "content": assistant_text})
        if len(sess["messages"]) > _MAX_MESSAGES:
            sess["messages"] = sess["messages"][-_MAX_MESSAGES:]
        sess["updated_at"] = now


def clear(session_id: str | None) -> None:
    if not session_id:
        return
    with _LOCK:
        _SESSIONS.pop(session_id, None)
