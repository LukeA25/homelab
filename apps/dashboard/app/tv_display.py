"""Shared TV display state for the bedroom monitor.

In-memory so the nightstand and TV kiosk stay in sync: blank overlay plus
which app is on screen. Persists only for the life of the dashboard process.
"""

from __future__ import annotations

import threading
import time
from typing import Any

_LOCK = threading.Lock()
_BLANKED = False
_APP = "dashboard"
_UPDATED_AT = 0.0

APPS = ("dashboard", "guitar", "finance", "homework", "theology")


def get_state() -> dict[str, Any]:
    with _LOCK:
        return {"blanked": _BLANKED, "app": _APP, "updated_at": _UPDATED_AT}


def set_state(*, blanked: bool | None = None, app: str | None = None) -> dict[str, Any]:
    global _BLANKED, _APP, _UPDATED_AT
    with _LOCK:
        if blanked is not None:
            _BLANKED = bool(blanked)
        if app is not None:
            name = app.strip().lower()
            if name not in APPS:
                raise ValueError(f"Unknown TV app: {app}")
            _APP = name
            if _APP != "dashboard":
                _BLANKED = False
        _UPDATED_AT = time.time()
        return {"blanked": _BLANKED, "app": _APP, "updated_at": _UPDATED_AT}


def set_blanked(blanked: bool) -> dict[str, Any]:
    return set_state(blanked=blanked)
