"""nova-config.yaml: validated behavior settings Nova may change when the user asks.

Only the keys in SCHEMA exist. Models, budget, credentials, endpoints and
guardrails are deliberately absent: they are trusted configuration in .env and
capabilities.yaml, out of Nova's reach.
"""

from __future__ import annotations

import re
from typing import Any

import yaml

from . import audit, store

PATH = "nova-config.yaml"
_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
VOICES = ("alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar")
DAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "off")

SCHEMA: dict[str, dict[str, Any]] = {
    "daily_planner_time": {"default": "08:00", "kind": "time", "about": "When the daily plan is prepared (HH:MM, 24-hour)."},
    "planning_window_start": {"default": "09:00", "kind": "time", "about": "Preferred time for planning conversations."},
    "weekly_review_day": {"default": "off", "kind": "choice", "choices": DAYS, "about": "Day for an optional weekly review, or off."},
    "weekly_review_time": {"default": "18:00", "kind": "time", "about": "Time of the weekly review."},
    "voice": {"default": "marin", "kind": "choice", "choices": VOICES, "about": "Nova's speaking voice for new live sessions."},
}


def _validate(key: str, value: Any) -> str:
    spec = SCHEMA.get(key)
    if spec is None:
        raise ValueError(f"unknown setting {key}; allowed: {', '.join(SCHEMA)}")
    value = str(value).strip().lower() if spec["kind"] == "choice" else str(value).strip()
    if spec["kind"] == "time" and not _TIME.match(value):
        raise ValueError(f"{key} must be HH:MM in 24-hour time")
    if spec["kind"] == "choice" and value not in spec["choices"]:
        raise ValueError(f"{key} must be one of {', '.join(spec['choices'])}")
    return value


def load() -> dict[str, Any]:
    target = store.path(PATH)
    raw: dict[str, Any] = {}
    if target.exists():
        raw = yaml.safe_load(target.read_text(encoding="utf-8")) or {}
    out = {}
    for key, spec in SCHEMA.items():
        try:
            out[key] = _validate(key, raw[key]) if key in raw else spec["default"]
        except ValueError:
            out[key] = spec["default"]
    return out


def describe() -> list[dict[str, Any]]:
    current = load()
    return [
        {"key": k, "value": current[k], "about": s["about"], **({"choices": list(s["choices"])} if "choices" in s else {})}
        for k, s in SCHEMA.items()
    ]


def update(key: str, value: Any, *, reason: str, evidence: str | None) -> dict[str, Any]:
    value = _validate(key, value)
    target = store.path(PATH)
    with store.file_lock(target):
        current = load()
        old = current[key]
        if old == value:
            return {"ok": True, "changed": False, "key": key, "value": value}
        current[key] = value
        header = "# Nova behavior settings. Changed through the gateway (validated and audited).\n"
        store.atomic_write(target, header + yaml.safe_dump(current, sort_keys=True))
    audit.state_change(store_name="config", reason=reason, explicit=True, evidence=evidence, key=key, old=old, new=value)
    return {"ok": True, "changed": True, "key": key, "old": old, "value": value}
