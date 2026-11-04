"""Persistent persona / behavior notes the assistant can update itself."""

from __future__ import annotations

import os
import threading
from datetime import datetime, timezone
from pathlib import Path

_LOCK = threading.Lock()

# Host path is bind-mounted into the container via /home/landerson/homelab.
_DEFAULT_PATH = Path(
    os.getenv(
        "ASSISTANT_PERSONA_PATH",
        "/home/landerson/homelab/apps/assistant/data/persona.md",
    )
)
_MAX_CHARS = 12_000

_FALLBACK = """# Homelab assistant persona

Keep replies short and conversational.
Prefer statements over questions unless you truly need a choice from the user.
Never ask a follow-up question when you did not hear or understand the user.
"""


def persona_path() -> Path:
    return _DEFAULT_PATH


def read_persona() -> str:
    path = persona_path()
    with _LOCK:
        try:
            text = path.read_text(encoding="utf-8").strip()
            return text or _FALLBACK.strip()
        except FileNotFoundError:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(_FALLBACK, encoding="utf-8")
            return _FALLBACK.strip()
        except OSError:
            return _FALLBACK.strip()


def update_persona(*, instruction: str, mode: str = "append") -> dict:
    instruction = (instruction or "").strip()
    if not instruction:
        return {"ok": False, "error": "instruction is empty"}

    mode = (mode or "append").strip().lower()
    if mode not in ("append", "replace"):
        return {"ok": False, "error": "mode must be append or replace"}

    path = persona_path()
    stamp = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M")

    with _LOCK:
        path.parent.mkdir(parents=True, exist_ok=True)
        if mode == "replace":
            body = f"# Homelab assistant persona\n\nUpdated {stamp}\n\n{instruction.strip()}\n"
        else:
            try:
                existing = path.read_text(encoding="utf-8").rstrip()
            except FileNotFoundError:
                existing = _FALLBACK.strip()
            except OSError as exc:
                return {"ok": False, "error": str(exc)}
            addition = f"\n\n## Preference ({stamp})\n{instruction.strip()}\n"
            body = (existing + addition).strip() + "\n"

        if len(body) > _MAX_CHARS:
            # Keep the header + the newest tail so recent preferences win.
            body = body[-_MAX_CHARS:]
            cut = body.find("\n")
            if cut > 0:
                body = "# Homelab assistant persona\n" + body[cut + 1 :]

        try:
            path.write_text(body, encoding="utf-8")
        except OSError as exc:
            return {"ok": False, "error": str(exc)}

    return {
        "ok": True,
        "mode": mode,
        "path": str(path),
        "chars": len(body),
        "preview": body[-400:],
    }
