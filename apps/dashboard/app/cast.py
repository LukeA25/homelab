"""Phone-to-screen cast sessions for the TV, the nightstand kiosk, and the guest page.

The phone is the controller: receivers show the app page the phone is on, take
remote commands (scroll, select, app controls) from it, and report back what
they show. Receivers never write to an app; the phone does. A session stays up
until it is explicitly taken off. The controller is the
client IP Caddy sees, so the phone keeps control as it moves between app
hostnames (each has its own localStorage). Sessions persist to a JSON file so a
dashboard restart does not clear what is on screen.
"""

from __future__ import annotations

import asyncio
import json
import os
import threading
import time
from pathlib import Path
from typing import Any, Optional

TARGETS = ("tv", "kiosk", "guest")
APPS = ("home", "finance", "guitar", "theology", "homework")

_DATA_DIR = Path(os.getenv("DASHBOARD_DATA_DIR", "/data"))
_STATE_FILE = _DATA_DIR / "cast.json"

_LOCK = threading.Lock()
_SESSIONS: dict[str, Optional[dict[str, Any]]] = {t: None for t in TARGETS}
# Latest receiver report per target (what the screen shows, highlighted item,
# app state like the lyrics page). In memory only; receivers re-report.
_REPORTS: dict[str, Optional[dict[str, Any]]] = {t: None for t in TARGETS}
_SUBSCRIBERS: set[asyncio.Queue] = set()
_extra_snapshot: dict[str, Any] = {}

MAX_COMMAND_BYTES = 1024
MAX_REPORT_BYTES = 4096


def _load() -> None:
    try:
        raw = json.loads(_STATE_FILE.read_text())
    except (OSError, ValueError):
        return
    for target in TARGETS:
        session = raw.get(target) if isinstance(raw, dict) else None
        if isinstance(session, dict) and session.get("app") in APPS:
            _SESSIONS[target] = session


def _save() -> None:
    try:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        tmp = _STATE_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(_SESSIONS))
        tmp.replace(_STATE_FILE)
    except OSError:
        pass


_load()


def clean_path(path: str) -> str:
    path = (path or "/").strip()
    if not path.startswith("/") or path.startswith("//") or len(path) > 2048:
        raise ValueError("path must be a same-origin absolute path")
    if any(c in path for c in "\r\n\\"):
        raise ValueError("invalid path")
    return path


def _check(target: str, app: Optional[str] = None) -> None:
    if target not in TARGETS:
        raise ValueError(f"Unknown target: {target}")
    if app is not None and app not in APPS:
        raise ValueError(f"Unknown app: {app}")


def public(session: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """Session fields that receivers may see (no controller address)."""
    if not session:
        return None
    return {k: session[k] for k in ("target", "app", "path", "sent_at", "updated_at")}


def sessions() -> dict[str, Optional[dict[str, Any]]]:
    with _LOCK:
        return {t: (dict(s) if s else None) for t, s in _SESSIONS.items()}


def snapshot(controller: Optional[str] = None) -> dict[str, Any]:
    current = sessions()
    data: dict[str, Any] = {"targets": {t: public(s) for t, s in current.items()}}
    data.update(_extra_snapshot)
    if controller is not None:
        mine = [t for t, s in current.items() if s and s.get("controller") == controller]
        data["mine"] = mine
        data["reports"] = {t: _REPORTS.get(t) for t in mine}
    return data


def set_extra(key: str, value: Any) -> None:
    """Attach non-session state (TV blank / voice app) to every broadcast."""
    _extra_snapshot[key] = value


def send(target: str, app: str, path: str, controller: str) -> dict[str, Any]:
    _check(target, app)
    path = clean_path(path)
    now = time.time()
    with _LOCK:
        session = {
            "target": target,
            "app": app,
            "path": path,
            "controller": controller,
            "sent_at": now,
            "updated_at": now,
        }
        _SESSIONS[target] = session
        _REPORTS[target] = None
        _save()
    return dict(session)


def follow(app: str, path: str, controller: str) -> list[str]:
    """Move every session this controller owns to its current page."""
    if app not in APPS:
        raise ValueError(f"Unknown app: {app}")
    path = clean_path(path)
    moved: list[str] = []
    with _LOCK:
        for target, session in _SESSIONS.items():
            if not session or session.get("controller") != controller:
                continue
            if session["app"] == app and session["path"] == path:
                moved.append(target)
                continue
            session.update(app=app, path=path, updated_at=time.time())
            moved.append(target)
        if moved:
            _save()
    return moved


def stop(target: str) -> None:
    _check(target)
    with _LOCK:
        _SESSIONS[target] = None
        _REPORTS[target] = None
        _save()


def _sized(value: Any, limit: int, what: str) -> None:
    if not isinstance(value, dict):
        raise ValueError(f"{what} must be an object")
    if len(json.dumps(value)) > limit:
        raise ValueError(f"{what} is too large")


def check_command(target: str, command: Any) -> dict[str, Any]:
    _check(target)
    _sized(command, MAX_COMMAND_BYTES, "command")
    kind = command.get("type")
    if not isinstance(kind, str) or not 0 < len(kind) <= 40:
        raise ValueError("command needs a type")
    if not sessions().get(target):
        raise ValueError("nothing is on that screen")
    return command


def set_report(target: str, report: Any) -> dict[str, Any]:
    _check(target)
    _sized(report, MAX_REPORT_BYTES, "report")
    if not sessions().get(target):
        raise ValueError("nothing is on that screen")
    report = {**report, "at": time.time()}
    _REPORTS[target] = report
    return report


def _broadcast(event: str, data: dict[str, Any]) -> None:
    for queue in list(_SUBSCRIBERS):
        if queue.full():
            queue.get_nowait()
        queue.put_nowait((event, data))


async def publish() -> None:
    _broadcast("state", snapshot())


async def publish_command(target: str, command: dict[str, Any]) -> None:
    _broadcast("command", {"target": target, "cmd": command})


async def publish_report(target: str, report: dict[str, Any]) -> None:
    _broadcast("report", {"target": target, "report": report})


def subscribe() -> asyncio.Queue:
    queue: asyncio.Queue = asyncio.Queue(maxsize=64)
    _SUBSCRIBERS.add(queue)
    return queue


def unsubscribe(queue: asyncio.Queue) -> None:
    _SUBSCRIBERS.discard(queue)
