"""Append-only personal history: observations that back the user model.

Each record says what kind of evidence it is (a user statement, an observed
outcome, a tentative inference, or a pattern supported by several of those),
where it came from and when. The memory pass may rewrite the user-model
summary, but never edits or removes these records.
"""

from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from . import sessions, store

PATH = "history/observations.jsonl"
KINDS = ("statement", "outcome", "inference", "pattern")


def add(text: str, *, kind: str, source: dict[str, Any], topics: list[str] | None = None) -> dict[str, Any]:
    text = " ".join((text or "").split())
    if not text:
        raise ValueError("observation text is empty")
    if kind not in KINDS:
        raise ValueError(f"kind must be one of {', '.join(KINDS)}")
    now = time.time()
    record = {
        "id": f"obs_{uuid.uuid4().hex[:12]}",
        "ts": datetime.fromtimestamp(now, timezone.utc).isoformat(),
        "kind": kind,
        "text": text[:1000],
        "topics": [str(t)[:40] for t in (topics or [])][:8],
        "source": source,
    }
    target = store.path(PATH)
    with store.file_lock(target):
        with open(target, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    sessions.index(f"{record['text']} {' '.join(record['topics'])}", f"observation:{kind}", record["id"], now)
    return record


def recent(limit: int = 40) -> list[dict[str, Any]]:
    target = store.path(PATH)
    if not target.exists():
        return []
    lines = target.read_text(encoding="utf-8").splitlines()[-limit:]
    return [json.loads(line) for line in lines if line.strip()]
