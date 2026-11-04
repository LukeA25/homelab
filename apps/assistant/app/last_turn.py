"""In-memory last assistant turn so the kiosk can show/play it without a mic."""

from __future__ import annotations

import threading
import time
import uuid
from typing import Any

_lock = threading.Lock()
_state: dict[str, Any] = {
    "id": None,
    "transcript": "",
    "reply": "",
    "audio_base64": None,
    "audio_mime": "audio/mpeg",
    "updated_at": 0.0,
    "actions": [],
    "cursor_proposal": None,
}


def set_result(result: dict[str, Any]) -> dict[str, Any]:
    with _lock:
        _state.update(
            {
                "id": result.get("id") or str(uuid.uuid4()),
                "transcript": result.get("transcript") or "",
                "reply": result.get("reply") or "",
                "audio_base64": result.get("audio_base64"),
                "audio_mime": result.get("audio_mime") or "audio/mpeg",
                "updated_at": time.time(),
                "actions": result.get("actions") or [],
                "cursor_proposal": result.get("cursor_proposal"),
            }
        )
    return snapshot()


def snapshot(*, include_audio: bool = False) -> dict[str, Any]:
    with _lock:
        data = {
            "id": _state["id"],
            "transcript": _state["transcript"],
            "reply": _state["reply"],
            "updated_at": _state["updated_at"],
            "actions": _state["actions"],
            "cursor_proposal": _state.get("cursor_proposal"),
            "has_audio": bool(_state.get("audio_base64")),
            "audio_mime": _state.get("audio_mime") or "audio/mpeg",
        }
        if include_audio:
            data["audio_base64"] = _state.get("audio_base64")
        return data
