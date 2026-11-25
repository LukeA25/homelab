"""Client for ops-runner: the only component allowed to run approved operations on protected stacks."""

from __future__ import annotations

from typing import Any

import httpx

from .config import settings


def _headers() -> dict[str, str]:
    token = settings()["ops_gateway_token"]
    if not token:
        raise RuntimeError("OPS_GATEWAY_TOKEN is not configured")
    return {"Authorization": f"Bearer {token}"}


async def _request(method: str, path: str, **kwargs: Any) -> Any:
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.request(method, f"{settings()['ops_url']}{path}", headers=_headers(), **kwargs)
    if resp.status_code >= 400:
        try:
            detail = resp.json().get("detail", resp.text)
        except ValueError:
            detail = resp.text
        raise RuntimeError(f"ops-runner {resp.status_code}: {detail}")
    return resp.json()


async def pending_requests() -> list[dict[str, Any]]:
    data = await _request("GET", "/requests", params={"status": "pending"})
    return data.get("requests") or []


async def get_request(request_id: str) -> dict[str, Any]:
    return await _request("GET", f"/requests/{request_id}")


async def execute(request_id: str, approval_id: str) -> dict[str, Any]:
    return await _request("POST", f"/requests/{request_id}/execute", json={"approval_id": approval_id})
