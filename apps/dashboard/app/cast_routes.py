"""Private cast API, served at /__cast/api on every app hostname via Caddy."""

from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncIterator, Callable, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from . import cast, tv_display

router = APIRouter(prefix="/__cast/api")

_KEEPALIVE_S = 15.0

# (event, data) -> (SSE event name or None for a plain message, payload), or None to skip.
Shape = Callable[[str, dict[str, Any]], Optional[tuple[Optional[str], dict[str, Any]]]]


class SendBody(BaseModel):
    target: str
    app: str
    path: str = "/"


class FollowBody(BaseModel):
    app: str
    path: str = "/"


class StopBody(BaseModel):
    target: str


class CommandBody(BaseModel):
    target: str
    cmd: dict[str, Any]


class ReportBody(BaseModel):
    target: str
    report: dict[str, Any]


def client_id(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _frame(shaped: Optional[tuple[Optional[str], dict[str, Any]]]) -> Optional[bytes]:
    if shaped is None:
        return None
    name, payload = shaped
    head = f"event: {name}\n" if name else ""
    return f"{head}data: {json.dumps(payload)}\n\n".encode()


def sse_response(shape: Shape) -> StreamingResponse:
    async def stream() -> AsyncIterator[bytes]:
        queue = cast.subscribe()
        try:
            first = _frame(shape("state", cast.snapshot()))
            if first:
                yield first
            while True:
                try:
                    event, data = await asyncio.wait_for(queue.get(), timeout=_KEEPALIVE_S)
                except asyncio.TimeoutError:
                    yield b": keepalive\n\n"
                    continue
                chunk = _frame(shape(event, data))
                if chunk:
                    yield chunk
        finally:
            cast.unsubscribe(queue)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _private_shape(event: str, data: dict[str, Any]):
    if event == "state":
        return None, data
    return event, data


def sync_tv_display() -> None:
    cast.set_extra("tv_display", tv_display.get_state())


sync_tv_display()


@router.get("/state")
async def state(request: Request):
    return cast.snapshot(controller=client_id(request))


@router.get("/events")
async def events():
    return sse_response(_private_shape)


@router.post("/send")
async def send(body: SendBody, request: Request):
    try:
        session = cast.send(body.target, body.app, body.path, client_id(request))
        if body.target == "tv":
            tv_display.set_state(blanked=False, app="dashboard")
            sync_tv_display()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await cast.publish()
    return cast.public(session)


@router.post("/follow")
async def follow(body: FollowBody, request: Request):
    try:
        moved = cast.follow(body.app, body.path, client_id(request))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if moved:
        await cast.publish()
    return {"mine": moved}


@router.post("/stop")
async def stop(body: StopBody):
    try:
        cast.stop(body.target)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await cast.publish()
    return cast.snapshot()


@router.post("/command")
async def command(body: CommandBody):
    try:
        cmd = cast.check_command(body.target, body.cmd)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await cast.publish_command(body.target, cmd)
    return {"ok": True}


@router.post("/report")
async def report(body: ReportBody):
    if body.target == "guest":
        raise HTTPException(status_code=400, detail="The guest screen reports through its gateway")
    try:
        saved = cast.set_report(body.target, body.report)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await cast.publish_report(body.target, saved)
    return {"ok": True}
