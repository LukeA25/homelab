"""Per-device authentication and scope checks for HTTP and WebSocket routes."""

from __future__ import annotations

import secrets
import threading
import time
from typing import Awaitable, Callable

from fastapi import Header, HTTPException, Request, WebSocket

from . import audit, devices, reqctx
from .config import DEFAULT_LEGACY_TOKEN, settings
from .devices import Device

_TICKET_TTL = 60
_tickets: dict[str, tuple[Device, float]] = {}
_tickets_lock = threading.Lock()


def _extract(x_assistant_token: str | None, authorization: str | None) -> str | None:
    if x_assistant_token:
        return x_assistant_token.strip()
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


def authenticate(token: str | None) -> Device | None:
    device = devices.verify(token)
    if device and device.legacy and token == DEFAULT_LEGACY_TOKEN and not settings()["allow_default_legacy_token"]:
        return None
    return device


def require(scope: str | None = None) -> Callable[..., Awaitable[Device]]:
    async def dependency(
        request: Request,
        x_assistant_token: str | None = Header(default=None, alias="X-Assistant-Token"),
        authorization: str | None = Header(default=None),
    ) -> Device:
        token = _extract(x_assistant_token, authorization)
        device = authenticate(token)
        if device is None:
            audit.operation(
                "auth_failed", path=request.url.path, method=request.method,
                reason="missing_credential" if not token else "invalid_credential",
            )
            raise HTTPException(status_code=401, detail="Unknown or revoked device credential")
        reqctx.device_id.set(device.id)
        if scope and not device.allows(scope):
            audit.operation("auth_denied", path=request.url.path, method=request.method, scope=scope)
            raise HTTPException(status_code=403, detail="This device is not permitted to do that")
        return device

    return dependency


def issue_ws_ticket(device: Device) -> str:
    ticket = secrets.token_urlsafe(24)
    now = time.time()
    with _tickets_lock:
        for key in [k for k, (_, exp) in _tickets.items() if exp < now]:
            del _tickets[key]
        _tickets[ticket] = (device, now + _TICKET_TTL)
    return ticket


async def require_ws(websocket: WebSocket, scope: str) -> Device | None:
    """WebSockets authenticate with a single-use ticket from POST /api/ws-ticket, never the credential."""
    ticket = websocket.query_params.get("ticket") or ""
    with _tickets_lock:
        entry = _tickets.pop(ticket, None)
    device = entry[0] if entry and entry[1] >= time.time() else None
    if device is None or not device.allows(scope):
        audit.operation("auth_failed", path=websocket.url.path, method="WS", reason="invalid_ticket")
        await websocket.close(code=4401, reason="Unauthorized")
        return None
    reqctx.device_id.set(device.id)
    return device
