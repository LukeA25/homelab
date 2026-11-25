"""Persona, profile and user model: context files under the Nova data dir.

Updates are full consolidated rewrites, never appends. Every prior version is
kept under history/context-versions/ and every change is audited. Persona and
profile change only on the user's explicit instruction; the user model is the
working summary the memory pass maintains (its evidence lives in history/).
"""

from __future__ import annotations

import difflib
import hashlib
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import audit, store

SEED_DIR = Path(__file__).resolve().parent.parent / "seed"
FILES = {
    "persona": {"path": "context/persona.md", "max_chars": 4000},
    "profile": {"path": "context/profile.md", "max_chars": 6000},
    "user_model": {"path": "context/user-model.md", "max_chars": 12000},
}


def _target(kind: str) -> Path:
    return store.path(FILES[kind]["path"])


def ensure_seeded() -> None:
    for kind in FILES:
        target = _target(kind)
        seed = SEED_DIR / f"{kind}.md"
        if not target.exists() and seed.exists():
            shutil.copyfile(seed, target)


def read(kind: str) -> str:
    target = _target(kind)
    try:
        return target.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return ""


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def rewrite(kind: str, content: str, *, reason: str, evidence: str | None, explicit: bool = True) -> dict[str, Any]:
    content = (content or "").strip()
    limit = FILES[kind]["max_chars"]
    if not content:
        return {"ok": False, "error": f"{kind} content is empty"}
    if len(content) > limit:
        return {"ok": False, "error": f"{kind} must be under {limit} characters; consolidate it"}

    target = _target(kind)
    with store.file_lock(target):
        old = read(kind)
        if old == content:
            return {"ok": True, "changed": False}
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        version = store.path("history", "context-versions", kind, f"{stamp}.md")
        version.write_text(old + "\n", encoding="utf-8")
        store.atomic_write(target, content + "\n")

    diff = "".join(
        difflib.unified_diff(old.splitlines(True), (content + "\n").splitlines(True), "before", "after")
    )
    audit.state_change(
        store_name=kind,
        reason=reason,
        explicit=explicit,
        evidence=evidence,
        old_sha=_sha(old),
        new_sha=_sha(content),
        previous_version=str(version.relative_to(store.data_dir())),
        diff=diff[:4000],
    )
    return {"ok": True, "changed": True, "chars": len(content)}
