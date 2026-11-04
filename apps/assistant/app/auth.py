from __future__ import annotations

from fastapi import Header, HTTPException, Query, WebSocket

from .config import settings


def verify_token(token: str | None) -> None:
    expected = settings()["device_token"]
    if not expected:
        raise HTTPException(status_code=500, detail="ASSISTANT_DEVICE_TOKEN is not configured")
    if not token or token != expected:
        raise HTTPException(status_code=401, detail="Invalid device token")


def token_from_headers(
    x_assistant_token: str | None = Header(default=None, alias="X-Assistant-Token"),
    authorization: str | None = Header(default=None),
) -> str:
    if x_assistant_token:
        return x_assistant_token
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    raise HTTPException(status_code=401, detail="Missing device token")


def require_http_auth(
    x_assistant_token: str | None = Header(default=None, alias="X-Assistant-Token"),
    authorization: str | None = Header(default=None),
    token: str | None = Query(default=None),
) -> None:
    candidate = token
    if not candidate and x_assistant_token:
        candidate = x_assistant_token
    if not candidate and authorization and authorization.lower().startswith("bearer "):
        candidate = authorization[7:].strip()
    verify_token(candidate)


async def require_ws_auth(websocket: WebSocket) -> bool:
    token = websocket.query_params.get("token")
    expected = settings()["device_token"]
    if not expected or token != expected:
        await websocket.close(code=4401, reason="Unauthorized")
        return False
    return True
