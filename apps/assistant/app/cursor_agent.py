"""Gated Cursor agent proposals — never run unattended."""

from __future__ import annotations

import json
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from .config import settings

_LOCK = threading.Lock()
_STORE = Path(
    os.getenv(
        "ASSISTANT_CURSOR_PROPOSALS_PATH",
        "/home/landerson/homelab/apps/assistant/data/cursor_proposals.json",
    )
)
_PROPOSALS: dict[str, dict[str, Any]] = {}


def _public(p: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": p["id"],
        "prompt": p["prompt"],
        "status": p["status"],
        "created_at": p["created_at"],
        "result": p.get("result"),
        "error": p.get("error"),
        "progress": list(p.get("progress") or []),
    }


def _load_locked() -> None:
    global _PROPOSALS
    try:
        raw = json.loads(_STORE.read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            _PROPOSALS = {k: v for k, v in raw.items() if isinstance(v, dict) and v.get("id")}
            changed = False
            for p in _PROPOSALS.values():
                if p.get("status") == "running":
                    p["status"] = "error"
                    p["error"] = "Assistant restarted before Cursor finished."
                    p.setdefault("progress", [])
                    changed = True
            if changed:
                _save_locked()
    except FileNotFoundError:
        _PROPOSALS = {}
    except (OSError, json.JSONDecodeError):
        _PROPOSALS = {}


def _save_locked() -> None:
    _STORE.parent.mkdir(parents=True, exist_ok=True)
    _STORE.write_text(json.dumps(_PROPOSALS, indent=2), encoding="utf-8")


with _LOCK:
    _load_locked()


def propose(prompt: str) -> dict[str, Any]:
    prompt = (prompt or "").strip()
    if not prompt:
        raise ValueError("Empty prompt")
    item = {
        "id": str(uuid.uuid4()),
        "prompt": prompt,
        "status": "pending",
        "created_at": time.time(),
        "result": None,
        "error": None,
        "progress": [],
    }
    with _LOCK:
        _PROPOSALS[item["id"]] = item
        _save_locked()
    return {
        "id": item["id"],
        "prompt": item["prompt"],
        "status": item["status"],
        "message": "Waiting for on-screen confirm before running Cursor agent.",
    }


def list_pending() -> list[dict[str, Any]]:
    with _LOCK:
        items = [
            p
            for p in _PROPOSALS.values()
            if p["status"] in ("pending", "running", "done", "error", "cancelled")
        ]
        return [_public(p) for p in items][-20:]


def get_proposal(proposal_id: str) -> dict[str, Any] | None:
    with _LOCK:
        p = _PROPOSALS.get(proposal_id)
        return dict(p) if p else None


def cancel(proposal_id: str) -> dict[str, Any]:
    with _LOCK:
        p = _PROPOSALS.get(proposal_id)
        if not p:
            raise KeyError(proposal_id)
        if p["status"] == "running":
            raise RuntimeError("Cannot cancel a running agent")
        if p["status"] in ("done", "error", "cancelled"):
            return dict(p)
        p["status"] = "cancelled"
        _save_locked()
        return dict(p)


def confirm(proposal_id: str) -> dict[str, Any]:
    with _LOCK:
        p = _PROPOSALS.get(proposal_id)
        if not p:
            raise KeyError(proposal_id)
        if p["status"] != "pending":
            raise RuntimeError(f"Proposal is {p['status']}, not pending")
        p["status"] = "running"
        p["progress"] = ["Starting Cursor…"]
        p["result"] = None
        p["error"] = None
        _save_locked()

    threading.Thread(target=_run_agent, args=(proposal_id,), daemon=True).start()
    return {"id": proposal_id, "status": "running", "progress": ["Starting Cursor…"]}


def _note(proposal_id: str, line: str) -> None:
    line = (line or "").strip()
    if not line:
        return
    with _LOCK:
        p = _PROPOSALS.get(proposal_id)
        if not p:
            return
        logs = list(p.get("progress") or [])
        if logs and logs[-1] == line:
            return
        logs.append(line)
        p["progress"] = logs[-40:]
        _save_locked()


def _set_partial(proposal_id: str, text: str) -> None:
    with _LOCK:
        p = _PROPOSALS.get(proposal_id)
        if not p:
            return
        p["result"] = text
        _save_locked()


def _message_text(message: Any) -> str:
    parts: list[str] = []
    payload = getattr(message, "message", None) or message
    content = getattr(payload, "content", None) or []
    for block in content:
        if getattr(block, "type", None) == "text":
            parts.append(getattr(block, "text", "") or "")
        elif isinstance(block, dict) and block.get("type") == "text":
            parts.append(str(block.get("text") or ""))
    return "".join(parts)


def _progress_for_message(message: Any) -> str | None:
    kind = getattr(message, "type", None) or ""
    if kind in ("tool_call", "tool_use", "function_call"):
        name = (
            getattr(message, "name", None)
            or getattr(message, "tool", None)
            or getattr(getattr(message, "function", None), "name", None)
        )
        return f"Using {name}…" if name else "Calling a tool…"
    if kind in ("thinking", "reasoning"):
        return "Thinking…"
    if kind in ("status", "system"):
        label = getattr(message, "status", None) or getattr(message, "text", None)
        return str(label) if label else None
    return None


def _run_agent(proposal_id: str) -> None:
    cfg = settings()
    with _LOCK:
        prompt = _PROPOSALS[proposal_id]["prompt"]

    try:
        if not cfg["cursor_api_key"]:
            raise RuntimeError(
                "CURSOR_API_KEY is not set. Proposal recorded but agent was not started."
            )

        try:
            from cursor_sdk import Agent, LocalAgentOptions
        except ImportError as exc:
            raise RuntimeError(
                "cursor-sdk is not installed in this container. "
                "Install it and set CURSOR_API_KEY to enable edits."
            ) from exc

        _note(proposal_id, "Opening agent…")
        with Agent.create(
            model="composer-2.5",
            api_key=cfg["cursor_api_key"],
            local=LocalAgentOptions(cwd=cfg["cursor_repo"]),
        ) as agent:
            run = agent.send(
                "You are editing the homelab repo. Make a focused change only.\n\n"
                f"User request:\n{prompt}\n\n"
                "Do not push. Prefer a small local edit. Summarize what you changed.\n"
                "Docker CLI and Compose are available against the host daemon "
                "(socket-mounted). Stacks live under compose/<service>/ — e.g. "
                "`cd compose/homework-app && docker compose up -d --build`. "
                "Only rebuild/restart what the change needs; do not touch unrelated stacks."
            )
            _note(proposal_id, "Working in the repo…")
            chunks: list[str] = []
            stream = run.stream if hasattr(run, "stream") else run.messages
            try:
                for message in stream():
                    step = _progress_for_message(message)
                    if step:
                        _note(proposal_id, step)
                    if getattr(message, "type", None) == "assistant":
                        piece = _message_text(message)
                        if piece:
                            chunks.append(piece)
                            _set_partial(proposal_id, "".join(chunks).strip())
            except Exception:
                _note(proposal_id, "Still working…")
            result_obj = run.wait()
            result_text = "".join(chunks).strip()
            if not result_text:
                result_text = (
                    getattr(result_obj, "result", None)
                    or getattr(result_obj, "status", None)
                    or "Agent finished."
                )
                result_text = str(result_text)

        with _LOCK:
            # Don't overwrite a manual cancel that won the race.
            if _PROPOSALS[proposal_id]["status"] == "cancelled":
                _PROPOSALS[proposal_id]["result"] = result_text
            else:
                _PROPOSALS[proposal_id]["status"] = "done"
                _PROPOSALS[proposal_id]["result"] = result_text
                logs = list(_PROPOSALS[proposal_id].get("progress") or [])
                logs.append("Finished.")
                _PROPOSALS[proposal_id]["progress"] = logs[-40:]
            _save_locked()
    except Exception as exc:
        with _LOCK:
            _PROPOSALS[proposal_id]["status"] = "error"
            _PROPOSALS[proposal_id]["error"] = str(exc)
            logs = list(_PROPOSALS[proposal_id].get("progress") or [])
            logs.append("Failed.")
            _PROPOSALS[proposal_id]["progress"] = logs[-40:]
            _save_locked()
