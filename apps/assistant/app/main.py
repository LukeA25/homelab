"""Homelab voice assistant API + browser PTT prototype."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import cursor_agent, ha, last_turn, memory, pipeline
from .auth import require_http_auth, require_ws_auth
from .config import settings

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

app = FastAPI(title="Homelab Assistant")


class TextTurn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    session_id: str | None = None


class CursorConfirm(BaseModel):
    confirm: bool = True


def _session_header(
    x_session_id: str | None = Header(default=None, alias="X-Session-Id"),
) -> str | None:
    if x_session_id and x_session_id.strip():
        return x_session_id.strip()[:128]
    return None


@app.get("/api/health")
async def health():
    cfg = settings()
    openai_key = cfg["openai_api_key"]
    ha_token = cfg["ha_token"]
    openai_ok = bool(openai_key) and not openai_key.startswith("sk-replace")
    ha_ok = bool(ha_token) and "replace" not in ha_token.lower()
    return {
        "ok": True,
        "openai_configured": openai_ok,
        "ha_configured": ha_ok,
        "cursor_configured": bool(cfg["cursor_api_key"]),
    }


@app.get("/api/rooms")
async def rooms(_: None = Depends(require_http_auth)):
    try:
        return {"rooms": await ha.get_rooms()}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/rooms/{room_id}")
async def set_room(room_id: str, body: dict[str, Any], _: None = Depends(require_http_auth)):
    try:
        return await ha.set_room(room_id, body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/scenes/{scene}")
async def scene(scene: str, _: None = Depends(require_http_auth)):
    try:
        return await ha.apply_scene(scene)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/turn")
async def turn(
    audio: UploadFile = File(...),
    session_id: str | None = Form(default=None),
    _: None = Depends(require_http_auth),
    header_session: str | None = Depends(_session_header),
):
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio")
    if len(data) > 8_000_000:
        raise HTTPException(status_code=400, detail="Audio too large")
    sid = (session_id or header_session or "").strip() or None
    try:
        result = await pipeline.run_turn(
            data,
            filename=audio.filename or "audio.webm",
            session_id=sid,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    last_turn.set_result(result)
    return result


@app.post("/api/turn/text")
async def turn_text(
    body: TextTurn,
    _: None = Depends(require_http_auth),
    header_session: str | None = Depends(_session_header),
):
    sid = (body.session_id or header_session or "").strip() or None
    try:
        result = await pipeline.run_text_turn(body.text, session_id=sid)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    last_turn.set_result(result)
    return result


@app.get("/api/last-turn")
async def get_last_turn():
    """Kiosk display — transcript/reply from the Pi wake client. No mic."""
    return last_turn.snapshot()


@app.get("/api/last-turn/audio")
async def get_last_turn_audio():
    snap = last_turn.snapshot(include_audio=True)
    b64 = snap.get("audio_base64")
    if not b64:
        raise HTTPException(status_code=404, detail="No audio")
    import base64

    return Response(
        content=base64.b64decode(b64),
        media_type=snap.get("audio_mime") or "audio/mpeg",
        headers={"Cache-Control": "no-store"},
    )


@app.post("/api/session/clear")
async def clear_session(
    _: None = Depends(require_http_auth),
    header_session: str | None = Depends(_session_header),
):
    memory.clear(header_session)
    return {"ok": True, "session_id": header_session}


@app.get("/api/cursor/proposals")
async def cursor_proposals(_: None = Depends(require_http_auth)):
    return {"proposals": cursor_agent.list_pending()}


@app.post("/api/cursor/proposals/{proposal_id}/confirm")
async def cursor_confirm(proposal_id: str, _: None = Depends(require_http_auth)):
    try:
        return cursor_agent.confirm(proposal_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Proposal not found") from None
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/cursor/proposals/{proposal_id}/cancel")
async def cursor_cancel(proposal_id: str, _: None = Depends(require_http_auth)):
    try:
        return cursor_agent.cancel(proposal_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Proposal not found") from None
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.websocket("/ws/voice")
async def voice_ws(websocket: WebSocket):
    await websocket.accept()
    if not await require_ws_auth(websocket):
        return

    session_id = (websocket.query_params.get("session_id") or "").strip() or None
    audio_chunks: list[bytes] = []
    filename = "audio.webm"
    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
            if "text" in message and message["text"] is not None:
                try:
                    payload = json.loads(message["text"])
                except json.JSONDecodeError:
                    await websocket.send_json({"type": "error", "detail": "Invalid JSON"})
                    continue
                kind = payload.get("type")
                if kind == "start":
                    audio_chunks = []
                    filename = payload.get("filename") or "audio.webm"
                    if payload.get("session_id"):
                        session_id = str(payload["session_id"]).strip() or session_id
                    await websocket.send_json({"type": "status", "phase": "listening"})
                elif kind == "end":
                    data = b"".join(audio_chunks)
                    audio_chunks = []
                    if not data:
                        await websocket.send_json({"type": "error", "detail": "No audio received"})
                        continue

                    async def on_status(event: dict[str, Any]) -> None:
                        await websocket.send_json(event)

                    try:
                        result = await pipeline.run_turn(
                            data,
                            filename=filename,
                            on_status=on_status,
                            session_id=session_id,
                        )
                    except Exception as exc:
                        await websocket.send_json({"type": "error", "detail": str(exc)})
                        continue
                    last_turn.set_result(result)
                    await websocket.send_json({"type": "result", **result})
                elif kind == "ping":
                    await websocket.send_json({"type": "pong"})
                else:
                    await websocket.send_json({"type": "error", "detail": f"Unknown type {kind}"})
            elif "bytes" in message and message["bytes"] is not None:
                chunk = message["bytes"]
                if len(b"".join(audio_chunks)) + len(chunk) > 8_000_000:
                    await websocket.send_json({"type": "error", "detail": "Audio too large"})
                    audio_chunks = []
                    continue
                audio_chunks.append(chunk)
    except WebSocketDisconnect:
        return


if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR), name="assets")


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    candidate = STATIC_DIR / full_path
    if full_path and candidate.is_file():
        return FileResponse(candidate)
    return FileResponse(STATIC_DIR / "index.html")
