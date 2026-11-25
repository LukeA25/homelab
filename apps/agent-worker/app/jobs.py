"""Cursor agent jobs: read-only queries and approved change requests.

Jobs never retry. A job interrupted by a restart is marked as an error
because its effect on the repo is unknown.
"""

from __future__ import annotations

import json
import os
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Any

DATA = Path(os.getenv("WORKER_DATA", "/data"))
STORE = DATA / "jobs.json"
REPO = os.getenv("REPO_PATH", "/home/landerson/homelab")
MODEL = os.getenv("CURSOR_MODEL", "composer-2.5")
MAX_JOBS = 200

_lock = threading.Lock()
_change_lock = threading.Lock()  # one change job edits the repo at a time
_jobs: dict[str, dict[str, Any]] = {}
_done_events: dict[str, threading.Event] = {}

CHANGE_PREAMBLE = """You are the homelab coding agent, editing the repository at {repo}.
Read AGENTS.md first and follow it, including the runtime-protection rules.

User request (approved by the user):
{prompt}

Rules:
- Make a focused change only. Do not push.
- You have no direct Docker access. Use the `homelab-ops` command: `homelab-ops stacks`,
  `homelab-ops ps <stack>`, `homelab-ops logs <stack>`, `homelab-ops up|rebuild|restart <stack> --reason "..."`.
- Protected stacks return approval_required with a request id. Do not work around it. Stop and
  report the request id, what it does and why it is needed; the user approves it through Nova.
- Update CHANGELOG.md and the Nova capability index when AGENTS.md says to.
- Finish with a short summary of what changed, what you verified, and any pending approval requests."""

QUERY_PREAMBLE = """You are answering a question about the homelab repository at {repo} and its running services.
This is read-only: do not create, modify or delete files, and do not run `homelab-ops up`, `rebuild` or
`restart`. You may read files and use `homelab-ops stacks`, `homelab-ops ps <stack>` and `homelab-ops logs <stack>`.

Question:
{prompt}

Answer in a few sentences suitable for being read aloud. Say plainly if you are unsure."""


def _save_locked() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    items = sorted(_jobs.values(), key=lambda j: j["created_at"])[-MAX_JOBS:]
    fd, tmp = tempfile.mkstemp(dir=DATA, prefix=".jobs.")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump({j["id"]: j for j in items}, fh, indent=2)
    os.replace(tmp, STORE)


def load() -> None:
    global _jobs
    with _lock:
        try:
            raw = json.loads(STORE.read_text(encoding="utf-8"))
            _jobs = {k: v for k, v in raw.items() if isinstance(v, dict)}
        except (FileNotFoundError, json.JSONDecodeError):
            _jobs = {}
        changed = False
        for job in _jobs.values():
            if job["status"] in ("queued", "running"):
                job["status"] = "error"
                job["error"] = "Worker restarted before the job finished; repo state is unknown, check before retrying."
                changed = True
        if changed:
            _save_locked()


def _public(job: dict[str, Any]) -> dict[str, Any]:
    return dict(job)


def get(job_id: str) -> dict[str, Any] | None:
    with _lock:
        job = _jobs.get(job_id)
        return _public(job) if job else None


def recent(limit: int) -> list[dict[str, Any]]:
    with _lock:
        items = sorted(_jobs.values(), key=lambda j: j["created_at"], reverse=True)[:limit]
        return [_public(j) for j in items]


def submit(prompt: str, kind: str, job_id: str | None = None) -> dict[str, Any]:
    job_id = job_id or str(uuid.uuid4())
    with _lock:
        if job_id in _jobs:
            # Idempotent: the gateway may resend after a timeout; never start a second run.
            return _public(_jobs[job_id])
        job = {
            "id": job_id, "kind": kind, "prompt": prompt, "status": "queued",
            "created_at": time.time(), "finished_at": None, "result": None, "error": None, "progress": [],
        }
        _jobs[job_id] = job
        _done_events[job_id] = threading.Event()
        _save_locked()
    threading.Thread(target=_run, args=(job_id,), daemon=True).start()
    return _public(job)


def wait(job_id: str, timeout: float) -> dict[str, Any] | None:
    event = _done_events.get(job_id)
    if event:
        event.wait(timeout)
    return get(job_id)


def _update(job_id: str, **fields: Any) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        if "note" in fields:
            line = str(fields.pop("note")).strip()
            logs = job["progress"]
            if line and (not logs or logs[-1] != line):
                logs.append(line)
                job["progress"] = logs[-40:]
        job.update(fields)
        _save_locked()


def _message_text(message: Any) -> str:
    payload = getattr(message, "message", None) or message
    parts = []
    for block in getattr(payload, "content", None) or []:
        if getattr(block, "type", None) == "text":
            parts.append(getattr(block, "text", "") or "")
        elif isinstance(block, dict) and block.get("type") == "text":
            parts.append(str(block.get("text") or ""))
    return "".join(parts)


def _progress(message: Any) -> str | None:
    kind = getattr(message, "type", None) or ""
    if kind in ("tool_call", "tool_use", "function_call"):
        name = getattr(message, "name", None) or getattr(message, "tool", None)
        return f"Using {name}…" if name else "Calling a tool…"
    if kind in ("thinking", "reasoning"):
        return "Thinking…"
    return None


def _run(job_id: str) -> None:
    job = get(job_id)
    assert job is not None
    held = False
    try:
        if job["kind"] == "change":
            _update(job_id, note="Waiting for any other change job…")
            _change_lock.acquire()
            held = True
        _update(job_id, status="running", note="Starting Cursor…")
        _update(job_id, status="done", result=_agent(job_id, job["prompt"], job["kind"]), finished_at=time.time(), note="Finished.")
    except Exception as exc:
        _update(job_id, status="error", error=str(exc), finished_at=time.time(), note="Failed.")
    finally:
        if held:
            _change_lock.release()
        event = _done_events.pop(job_id, None)
        if event:
            event.set()


def _agent(job_id: str, prompt: str, kind: str) -> str:
    api_key = os.getenv("CURSOR_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("CURSOR_API_KEY is not set on the worker.")
    from cursor_sdk import Agent, LocalAgentOptions

    preamble = CHANGE_PREAMBLE if kind == "change" else QUERY_PREAMBLE
    with Agent.create(model=MODEL, api_key=api_key, local=LocalAgentOptions(cwd=REPO)) as agent:
        run = agent.send(preamble.format(repo=REPO, prompt=prompt))
        _update(job_id, note="Working in the repo…")
        chunks: list[str] = []
        stream = run.stream if hasattr(run, "stream") else run.messages
        try:
            for message in stream():
                step = _progress(message)
                if step:
                    _update(job_id, note=step)
                if getattr(message, "type", None) == "assistant":
                    piece = _message_text(message)
                    if piece:
                        chunks.append(piece)
                        _update(job_id, result="".join(chunks).strip())
        except Exception:
            _update(job_id, note="Still working…")
        result_obj = run.wait()
    text = "".join(chunks).strip()
    return text or str(getattr(result_obj, "result", None) or getattr(result_obj, "status", None) or "Agent finished.")
