"""Append-only operations log and Nova state-change audit (JSONL).

Nova has no capability that edits or deletes these files.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

from . import reqctx, store

OPERATIONS = "logs/operations.jsonl"
STATE_CHANGES = "logs/state-changes.jsonl"

_SENSITIVE = re.compile(r"(token|secret|password|passwd|api[_-]?key|authorization|credential|cookie)", re.I)
_MAX_STR = 300
_MAX_ITEMS = 20


def sanitize(value: Any, depth: int = 0) -> Any:
    if depth > 4:
        return "…"
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for k, v in list(value.items())[:_MAX_ITEMS]:
            out[str(k)] = "[redacted]" if _SENSITIVE.search(str(k)) else sanitize(v, depth + 1)
        return out
    if isinstance(value, (list, tuple)):
        items = [sanitize(v, depth + 1) for v in list(value)[:_MAX_ITEMS]]
        if len(value) > _MAX_ITEMS:
            items.append(f"… {len(value) - _MAX_ITEMS} more")
        return items
    if isinstance(value, str):
        return value if len(value) <= _MAX_STR else value[:_MAX_STR] + "…"
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return sanitize(str(value), depth + 1)


def _append(rel: str, record: dict[str, Any]) -> None:
    target = store.path(rel)
    line = json.dumps(record, default=str, ensure_ascii=False) + "\n"
    with store.file_lock(target):
        with open(target, "a", encoding="utf-8") as fh:
            fh.write(line)


def _base(kind: str) -> dict[str, Any]:
    return {
        "ts": datetime.now(timezone.utc).astimezone().isoformat(),
        "kind": kind,
        "request_id": reqctx.request_id.get(),
        "device_id": reqctx.device_id.get(),
        "session_id": reqctx.session_id.get(),
    }


def operation(kind: str, **fields: Any) -> None:
    """Gateway action, auth decision, approval or worker call."""
    record = _base(kind)
    record.update({k: sanitize(v) for k, v in fields.items()})
    _append(OPERATIONS, record)


def state_change(
    *,
    store_name: str,
    reason: str,
    explicit: bool,
    evidence: str | None = None,
    **fields: Any,
) -> None:
    """A change Nova made to persona, profile, user model, automations or config."""
    record = _base("state_change")
    record.update(
        {
            "store": store_name,
            "reason": sanitize(reason),
            "explicit_instruction": explicit,
            "evidence": sanitize(evidence),
        }
    )
    record.update(fields)
    _append(STATE_CHANGES, record)


def read_recent(rel: str = OPERATIONS, limit: int = 50) -> list[dict[str, Any]]:
    target = store.path(rel)
    if not target.exists():
        return []
    lines = target.read_text(encoding="utf-8").splitlines()[-limit:]
    return [json.loads(line) for line in lines if line.strip()]
