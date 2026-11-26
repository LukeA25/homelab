"""ops-runner: the only service holding the Docker socket.

The coding agent (worker token) may inspect any stack and run up/rebuild/restart
on routine stacks. Protected stacks get a pending request instead; only the Nova
gateway (gateway token), after the user approves, can execute it. Manual-only
stacks (this service and the worker) are never operated from here.
"""

from __future__ import annotations

import hmac
import json
import os
import subprocess
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

REPO = Path(os.getenv("REPO_PATH", "/home/landerson/homelab"))
COMPOSE_DIR = REPO / "compose"
DATA = Path(os.getenv("OPS_DATA", "/data"))
REQUEST_TTL = int(os.getenv("OPS_REQUEST_TTL_SECONDS", str(24 * 3600)))
OP_TIMEOUT = int(os.getenv("OPS_TIMEOUT_SECONDS", "900"))


def _csv(name: str, default: str) -> set[str]:
    return {s.strip() for s in os.getenv(name, default).split(",") if s.strip()}


# Stacks the agent may operate without asking. Everything else is protected by default.
ROUTINE = _csv(
    "ROUTINE_STACKS",
    "finance-app,guitar-app,theology-app,homework-app,learning-app,jellyfin,uptime-kuma,nova-engine",
)
ROUTINE.discard("notify")  # Older host overrides may still list this now-protected stack.
MANUAL_ONLY = _csv("MANUAL_ONLY_STACKS", "ops-runner,agent-worker")
COMMANDS = {
    "up": ["docker", "compose", "up", "-d", "--remove-orphans"],
    "rebuild": ["docker", "compose", "up", "-d", "--build", "--remove-orphans"],
    "restart": ["docker", "compose", "restart"],
}

app = FastAPI(title="ops-runner")
_lock = threading.Lock()
_stack_locks: dict[str, threading.Lock] = {}
_requests_path = DATA / "requests.json"


def _token_role(authorization: str | None) -> str | None:
    supplied = authorization[7:].strip() if authorization and authorization.lower().startswith("bearer ") else ""
    if not supplied:
        return None
    for role, env in (("gateway", "OPS_GATEWAY_TOKEN"), ("worker", "OPS_WORKER_TOKEN")):
        expected = os.getenv(env, "")
        if expected and hmac.compare_digest(supplied, expected):
            return role
    return None


def any_role(authorization: str | None = Header(default=None)) -> str:
    role = _token_role(authorization)
    if role is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return role


def gateway_only(authorization: str | None = Header(default=None)) -> str:
    role = _token_role(authorization)
    if role != "gateway":
        _audit("denied", reason="gateway token required", role=role)
        raise HTTPException(status_code=403, detail="Only the Nova gateway can execute approved requests")
    return role


def _audit(kind: str, **fields: Any) -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    record = {"ts": datetime.now(timezone.utc).isoformat(), "kind": kind, **fields}
    with _lock, open(DATA / "ops.jsonl", "a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, default=str) + "\n")


def stacks() -> dict[str, str]:
    out = {}
    for d in sorted(COMPOSE_DIR.iterdir()) if COMPOSE_DIR.is_dir() else []:
        if (d / "docker-compose.yaml").is_file() or (d / "docker-compose.yml").is_file():
            name = d.name
            out[name] = "manual" if name in MANUAL_ONLY else "routine" if name in ROUTINE else "protected"
    return out


def _stack_class(name: str) -> str:
    cls = stacks().get(name)
    if cls is None:
        raise HTTPException(status_code=404, detail=f"Unknown stack {name}")
    return cls


def _compose(stack: str, args: list[str], timeout: int) -> dict[str, Any]:
    started = time.monotonic()
    proc = subprocess.run(
        args, cwd=COMPOSE_DIR / stack, capture_output=True, text=True, timeout=timeout
    )
    return {
        "exit_code": proc.returncode,
        "ok": proc.returncode == 0,
        "output": (proc.stdout + proc.stderr)[-4000:],
        "duration_ms": int((time.monotonic() - started) * 1000),
    }


def _operate(stack: str, operation: str, **context: Any) -> dict[str, Any]:
    lock = _stack_locks.setdefault(stack, threading.Lock())
    if not lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail=f"An operation on {stack} is already running")
    try:
        _audit("op_started", stack=stack, operation=operation, **context)
        try:
            result = _compose(stack, COMMANDS[operation], OP_TIMEOUT)
        except subprocess.TimeoutExpired:
            result = {"ok": False, "exit_code": None, "output": "timed out; outcome unknown"}
        _audit("op_finished", stack=stack, operation=operation, ok=result["ok"], exit_code=result["exit_code"], **context)
        return result
    finally:
        lock.release()


# --- requests for protected stacks ---


def _load_requests() -> dict[str, dict[str, Any]]:
    try:
        return json.loads(_requests_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_requests(reqs: dict[str, dict[str, Any]]) -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    tmp = _requests_path.with_suffix(".tmp")
    tmp.write_text(json.dumps(reqs, indent=2), encoding="utf-8")
    tmp.replace(_requests_path)


def _expire(reqs: dict[str, dict[str, Any]]) -> None:
    now = time.time()
    for r in reqs.values():
        if r["status"] == "pending" and r["expires_at"] < now:
            r["status"] = "expired"


class OpIn(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class ExecuteIn(BaseModel):
    approval_id: str = Field(min_length=1, max_length=64)


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True}


@app.get("/stacks")
def list_stacks(role: str = Depends(any_role)) -> dict[str, Any]:
    return {"stacks": [{"name": n, "class": c} for n, c in stacks().items()]}


@app.get("/stacks/{stack}/ps")
def ps(stack: str, role: str = Depends(any_role)) -> dict[str, Any]:
    _stack_class(stack)
    return _compose(stack, ["docker", "compose", "ps", "--all", "--format", "json"], 30)


@app.get("/stacks/{stack}/logs")
def logs(stack: str, tail: int = 200, role: str = Depends(any_role)) -> dict[str, Any]:
    _stack_class(stack)
    tail = max(1, min(tail, 1000))
    return _compose(stack, ["docker", "compose", "logs", "--no-color", "--tail", str(tail)], 30)


@app.post("/stacks/{stack}/{operation}")
def operate(stack: str, operation: Literal["up", "rebuild", "restart"], body: OpIn, role: str = Depends(any_role)):
    cls = _stack_class(stack)
    if cls == "manual":
        _audit("denied", stack=stack, operation=operation, role=role, reason="manual-only stack")
        raise HTTPException(status_code=403, detail=f"{stack} is manual-only; apply it from the host, not through ops-runner")
    if cls == "routine":
        return {"status": "done", **_operate(stack, operation, role=role, reason=body.reason)}

    with _lock:
        reqs = _load_requests()
        _expire(reqs)
        for r in reqs.values():
            if r["status"] == "pending" and r["stack"] == stack and r["operation"] == operation:
                return {"status": "approval_required", "request_id": r["id"], "detail": "Already pending"}
        req = {
            "id": uuid.uuid4().hex[:12], "stack": stack, "operation": operation, "reason": body.reason,
            "requested_by": role, "status": "pending", "created_at": time.time(),
            "expires_at": time.time() + REQUEST_TTL, "approval_id": None, "result": None,
        }
        reqs[req["id"]] = req
        _save_requests(reqs)
    _audit("request_created", request_id=req["id"], stack=stack, operation=operation, role=role, reason=body.reason)
    return {
        "status": "approval_required",
        "request_id": req["id"],
        "detail": f"{stack} is protected. The user must approve request {req['id']} through Nova.",
    }


@app.get("/requests")
def list_requests(status: str | None = None, role: str = Depends(any_role)) -> dict[str, Any]:
    with _lock:
        reqs = _load_requests()
        _expire(reqs)
    items = [r for r in reqs.values() if status is None or r["status"] == status]
    return {"requests": sorted(items, key=lambda r: r["created_at"], reverse=True)[:50]}


@app.get("/requests/{request_id}")
def get_request(request_id: str, role: str = Depends(any_role)) -> dict[str, Any]:
    with _lock:
        reqs = _load_requests()
        _expire(reqs)
    if request_id not in reqs:
        raise HTTPException(status_code=404, detail="Request not found")
    return reqs[request_id]


@app.on_event("startup")
def recover_interrupted_requests() -> None:
    with _lock:
        reqs = _load_requests()
        running = [r for r in reqs.values() if r["status"] == "running"]
        for req in running:
            req["status"] = "unknown"
        if running:
            _save_requests(reqs)
    for req in running:
        _audit("op_interrupted", request_id=req["id"], stack=req["stack"])


def _execute_in_background(req: dict[str, Any]) -> None:
    try:
        result = _operate(req["stack"], req["operation"], request_id=req["id"], approval_id=req["approval_id"])
    except HTTPException as exc:
        result = {"ok": False, "output": exc.detail}
    except Exception:
        result = {"ok": False, "exit_code": None, "output": "Operation outcome unknown; inspect stack state"}
    status = "done" if result["ok"] else "failed"
    if "exit_code" in result and result["exit_code"] is None:
        status = "unknown"
    with _lock:
        reqs = _load_requests()
        reqs[req["id"]]["status"] = status
        reqs[req["id"]]["result"] = result
        _save_requests(reqs)


@app.post("/requests/{request_id}/execute", status_code=202)
def execute(request_id: str, body: ExecuteIn, role: str = Depends(gateway_only)) -> dict[str, Any]:
    with _lock:
        reqs = _load_requests()
        _expire(reqs)
        req = reqs.get(request_id)
        if req is None:
            raise HTTPException(status_code=404, detail="Request not found")
        if req["status"] != "pending":
            raise HTTPException(status_code=409, detail=f"Request is {req['status']}")
        req["status"] = "running"
        req["approval_id"] = body.approval_id
        _save_requests(reqs)
    _audit("request_approved", request_id=request_id, approval_id=body.approval_id, stack=req["stack"], operation=req["operation"])
    # Runs in the background: the operation may restart the gateway that asked for it.
    threading.Thread(target=_execute_in_background, args=(dict(req),), daemon=True).start()
    return {"status": "started", "request_id": request_id, "stack": req["stack"], "operation": req["operation"]}
