"""Nova gateway: device auth, authorized tools, approvals, audit, and the voice turn API."""

from __future__ import annotations

import base64
import json
import logging
import uuid
from pathlib import Path
from typing import Any, Literal

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import approvals, audit, context_files, devices, dispatch, ha, last_turn, live, memory, pipeline, registry, reqctx, sessions, worker_client
from .monitoring import router as monitoring_router
from .notifications import router as notification_router
from .planning import router as planning_router
from .auth import issue_ws_ticket, require, require_ws
from .config import DEFAULT_LEGACY_TOKEN, settings
from .devices import Device
from .tools import CallContext

log = logging.getLogger("nova")
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

app = FastAPI(title="Nova gateway")
app.include_router(monitoring_router)
app.include_router(notification_router)
app.include_router(planning_router)


class TextTurn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    session_id: str | None = None


class Decision(BaseModel):
    decision: Literal["yes", "no"]


class LiveOffer(BaseModel):
    sdp: str = Field(min_length=10, max_length=20000)


@app.on_event("startup")
def _startup() -> None:
    registry.load()
    context_files.ensure_seeded()
    closed = sessions.recover_open_live()
    if closed:
        log.warning("Closed %d live session(s) left open by a previous gateway process", closed)
    cfg = settings()
    token = cfg["legacy_token"]
    if token == DEFAULT_LEGACY_TOKEN and not cfg["allow_default_legacy_token"]:
        log.warning("ASSISTANT_DEVICE_TOKEN is the public default and was not imported; enroll devices instead")
    elif token and devices.import_legacy(token, ["*"]):
        log.warning("Imported ASSISTANT_DEVICE_TOKEN as device %s; revoke it after enrolling devices", devices.LEGACY_ID)


@app.on_event("shutdown")
async def _shutdown() -> None:
    await live.shutdown()


@app.middleware("http")
async def _correlate(request: Request, call_next):
    rid = (request.headers.get("x-request-id") or "").strip()[:64] or str(uuid.uuid4())
    reqctx.request_id.set(rid)
    reqctx.device_id.set(None)
    reqctx.session_id.set(None)
    response = await call_next(request)
    response.headers["X-Request-Id"] = rid
    if not request.url.path.startswith(("/api/", "/ws/")):
        response.headers["Cache-Control"] = "no-cache"
    return response


def _session(
    x_session_id: str | None = Header(default=None, alias="X-Session-Id"),
) -> str | None:
    sid = (x_session_id or "").strip()[:128] or None
    reqctx.session_id.set(sid)
    return sid


def _ctx(device: Device, session_id: str | None) -> CallContext:
    return CallContext(device=device, session_id=session_id, request_id=reqctx.request_id.get())


@app.get("/api/health")
async def health():
    cfg = settings()
    openai_key = cfg["openai_api_key"]
    warnings = []
    legacy = devices.legacy_active()
    if legacy:
        warnings.append("Legacy shared token is active; enroll per-device credentials and revoke legacy-shared.")
    if legacy and cfg["legacy_token"] == DEFAULT_LEGACY_TOKEN:
        warnings.append("The legacy token is the public default value.")
    return {
        "ok": True,
        "openai_configured": bool(openai_key) and not openai_key.startswith("sk-replace"),
        "ha_configured": bool(cfg["ha_token"]) and "replace" not in cfg["ha_token"].lower(),
        "cursor_configured": bool(cfg["worker_token"]),
        "legacy_token_active": legacy,
        "warnings": warnings,
    }


@app.get("/api/devices/me")
async def device_me(device: Device = Depends(require())):
    return {"id": device.id, "name": device.name, "scopes": list(device.scopes), "legacy": device.legacy}


@app.post("/api/ws-ticket")
async def ws_ticket(device: Device = Depends(require("nova.voice"))):
    return {"ticket": issue_ws_ticket(device), "expires_in": 60}


async def _direct_action(kind: str, fn, *args: Any) -> Any:
    try:
        result = await fn(*args)
    except ValueError as exc:
        audit.operation(kind, args=list(args), ok=False, error=str(exc))
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        audit.operation(kind, args=list(args), ok=False, error=str(exc))
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    audit.operation(kind, args=list(args), ok=True)
    return result


@app.get("/api/rooms")
async def rooms(_: Device = Depends(require("home.lights"))):
    try:
        return {"rooms": await ha.get_rooms()}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/rooms/{room_id}")
async def set_room(room_id: str, body: dict[str, Any], _: Device = Depends(require("home.lights"))):
    return await _direct_action("http_set_room", ha.set_room, room_id, body)


@app.post("/api/scenes/{scene}")
async def scene(scene: str, _: Device = Depends(require("home.scenes"))):
    return await _direct_action("http_apply_scene", ha.apply_scene, scene)


@app.post("/api/turn")
async def turn(
    audio: UploadFile = File(...),
    session_id: str | None = Form(default=None),
    device: Device = Depends(require("nova.voice")),
    header_session: str | None = Depends(_session),
):
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio")
    if len(data) > 8_000_000:
        raise HTTPException(status_code=400, detail="Audio too large")
    sid = (session_id or header_session or "").strip()[:128] or None
    reqctx.session_id.set(sid)
    try:
        result = await pipeline.run_turn(
            data, device=device, request_id=reqctx.request_id.get(), filename=audio.filename or "audio.webm", session_id=sid
        )
    except Exception as exc:
        audit.operation("turn_failed", error=str(exc))
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    last_turn.set_result(result)
    return result


@app.post("/api/turn/text")
async def turn_text(
    body: TextTurn,
    device: Device = Depends(require("nova.voice")),
    header_session: str | None = Depends(_session),
):
    sid = (body.session_id or header_session or "").strip()[:128] or None
    reqctx.session_id.set(sid)
    try:
        result = await pipeline.run_text_turn(body.text, device=device, request_id=reqctx.request_id.get(), session_id=sid)
    except Exception as exc:
        audit.operation("turn_failed", error=str(exc))
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    last_turn.set_result(result)
    return result


@app.post("/api/live/start")
async def live_start(body: LiveOffer, device: Device = Depends(require("nova.voice"))):
    try:
        return await live.start(device, body.sdp)
    except live.LiveError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc


@app.post("/api/live/{conversation_id}/end")
async def live_end(conversation_id: str, device: Device = Depends(require("nova.voice"))):
    return {"ok": await live.end(conversation_id, device)}


@app.get("/api/live/{conversation_id}")
async def live_status(conversation_id: str, device: Device = Depends(require("nova.voice"))):
    info = live.status(conversation_id)
    if info is None or info["device_id"] != device.id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return info


@app.get("/api/usage")
async def usage(_: Device = Depends(require("nova.voice"))):
    return {"budget": sessions.budget()}


@app.get("/api/last-turn")
async def get_last_turn():
    """Kiosk display — transcript/reply from the Pi wake client. No mic.

    Unauthenticated because the dashboard kiosk fetches it without a credential;
    close this when the kiosk client sends its device credential.
    """
    return last_turn.snapshot()


@app.get("/api/last-turn/audio")
async def get_last_turn_audio():
    snap = last_turn.snapshot(include_audio=True)
    b64 = snap.get("audio_base64")
    if not b64:
        raise HTTPException(status_code=404, detail="No audio")
    return Response(
        content=base64.b64decode(b64),
        media_type=snap.get("audio_mime") or "audio/mpeg",
        headers={"Cache-Control": "no-store"},
    )


@app.post("/api/session/clear")
async def clear_session(_: Device = Depends(require()), header_session: str | None = Depends(_session)):
    memory.clear(header_session)
    return {"ok": True, "session_id": header_session}


# --- Approvals (UI tap path; voice approvals are settled in pipeline) ---


def _approval_public(a: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": a["id"],
        "capability": a["capability"],
        "read_back": a["read_back"],
        "status": a["status"],
        "created_at": a["created_at"],
        "expires_at": a["expires_at"],
    }


@app.get("/api/approvals")
async def list_approvals(device: Device = Depends(require())):
    items = [
        a for a in approvals.recent(limit=30)
        if a["status"] == "pending" and (cap := registry.get(a["capability"])) and device.allows(cap.scope)
    ]
    return {"approvals": [_approval_public(a) for a in items]}


async def _decide(approval_id: str, decision: str, device: Device, session_id: str | None) -> dict[str, Any]:
    row = approvals.get(approval_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Approval not found")
    cap = registry.get(row["capability"])
    if cap is None or not device.allows(cap.scope):
        audit.operation("auth_denied", approval_id=approval_id, scope=cap.scope if cap else None)
        raise HTTPException(status_code=403, detail="This device is not permitted to decide that")
    outcome = await dispatch.resolve_and_run(approval_id, decision, "ui", _ctx(device, session_id))
    if outcome.get("status") == "not_pending":
        current = approvals.get(approval_id) or {}
        raise HTTPException(status_code=400, detail=f"Request is {current.get('status', 'unknown')}, not pending")
    return outcome


@app.post("/api/approvals/{approval_id}")
async def decide_approval(
    approval_id: str, body: Decision, device: Device = Depends(require()), session_id: str | None = Depends(_session)
):
    return await _decide(approval_id, body.decision, device, session_id)


# --- Cursor proposals: compatibility view used by the browser UI and kiosk ---

_JOB_STATUS = {"queued": "running", "running": "running", "done": "done", "error": "error", "timeout": "running"}


async def _proposals() -> list[dict[str, Any]]:
    rows = approvals.recent("propose_cursor_edit", limit=20)
    jobs: dict[str, dict[str, Any]] = {}
    worker_error = None
    if any(r["status"] in ("approved", "executed", "failed") for r in rows):
        try:
            jobs = {j["id"]: j for j in await worker_client.list_jobs(limit=40)}
        except Exception as exc:
            worker_error = str(exc)
    out = []
    for r in reversed(rows):
        item = {
            "id": r["id"], "prompt": r["args"].get("prompt"), "created_at": r["created_at"],
            "status": "pending", "result": None, "error": None, "progress": [],
        }
        if r["status"] in ("denied", "expired"):
            item["status"] = "cancelled"
        elif r["status"] == "failed":
            item["status"] = "error"
            item["error"] = json.dumps(r["result"]) if r["result"] is not None else "Dispatch failed"
        elif r["status"] in ("approved", "executed"):
            job = jobs.get(r["id"])
            if job:
                item.update(
                    status=_JOB_STATUS.get(job["status"], job["status"]), result=job.get("result"),
                    error=job.get("error"), progress=job.get("progress") or [],
                )
            else:
                item["status"] = "running"
                item["progress"] = [f"Worker status unavailable: {worker_error}"] if worker_error else []
        out.append(item)
    return out


@app.get("/api/cursor/proposals")
async def cursor_proposals(_: Device = Depends(require("worker.status"))):
    return {"proposals": await _proposals()}


@app.post("/api/cursor/proposals/{proposal_id}/confirm")
async def cursor_confirm(proposal_id: str, device: Device = Depends(require("worker.change")), session_id: str | None = Depends(_session)):
    outcome = await _decide(proposal_id, "yes", device, session_id)
    if not outcome.get("ok"):
        raise HTTPException(status_code=502, detail=outcome.get("error") or "Could not start the coding agent")
    return {"id": proposal_id, "status": "running", "progress": ["Starting Cursor…"]}


@app.post("/api/cursor/proposals/{proposal_id}/cancel")
async def cursor_cancel(proposal_id: str, device: Device = Depends(require("worker.change")), session_id: str | None = Depends(_session)):
    await _decide(proposal_id, "no", device, session_id)
    return {"id": proposal_id, "status": "cancelled"}


@app.websocket("/ws/voice")
async def voice_ws(websocket: WebSocket):
    await websocket.accept()
    device = await require_ws(websocket, "nova.voice")
    if device is None:
        return

    session_id = (websocket.query_params.get("session_id") or "").strip()[:128] or None
    audio_chunks: list[bytes] = []
    size = 0
    filename = "audio.webm"
    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
            if message.get("text") is not None:
                try:
                    payload = json.loads(message["text"])
                except json.JSONDecodeError:
                    await websocket.send_json({"type": "error", "detail": "Invalid JSON"})
                    continue
                kind = payload.get("type")
                if kind == "start":
                    audio_chunks, size = [], 0
                    filename = payload.get("filename") or "audio.webm"
                    if payload.get("session_id"):
                        session_id = str(payload["session_id"]).strip()[:128] or session_id
                    await websocket.send_json({"type": "status", "phase": "listening"})
                elif kind == "end":
                    data = b"".join(audio_chunks)
                    audio_chunks, size = [], 0
                    if not data:
                        await websocket.send_json({"type": "error", "detail": "No audio received"})
                        continue
                    rid = str(uuid.uuid4())
                    reqctx.request_id.set(rid)
                    reqctx.session_id.set(session_id)

                    async def on_status(event: dict[str, Any]) -> None:
                        await websocket.send_json(event)

                    try:
                        result = await pipeline.run_turn(
                            data, device=device, request_id=rid, filename=filename,
                            on_status=on_status, session_id=session_id,
                        )
                    except Exception as exc:
                        audit.operation("turn_failed", error=str(exc))
                        await websocket.send_json({"type": "error", "detail": str(exc)})
                        continue
                    last_turn.set_result(result)
                    await websocket.send_json({"type": "result", **result})
                elif kind == "ping":
                    await websocket.send_json({"type": "pong"})
                else:
                    await websocket.send_json({"type": "error", "detail": f"Unknown type {kind}"})
            elif message.get("bytes") is not None:
                chunk = message["bytes"]
                if size + len(chunk) > 8_000_000:
                    await websocket.send_json({"type": "error", "detail": "Audio too large"})
                    audio_chunks, size = [], 0
                    continue
                audio_chunks.append(chunk)
                size += len(chunk)
    except WebSocketDisconnect:
        return


if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR), name="assets")


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    candidate = (STATIC_DIR / full_path).resolve()
    if full_path and candidate.is_file() and STATIC_DIR.resolve() in candidate.parents:
        return FileResponse(candidate)
    return FileResponse(STATIC_DIR / "index.html")
