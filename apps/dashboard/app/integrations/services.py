"""Service catalog + concurrent health checks with a short in-memory cache."""

from __future__ import annotations

import asyncio
import ssl
import time
from pathlib import Path
from typing import Any, Optional

import httpx
import yaml

SERVICES_PATH = Path(__file__).resolve().parent.parent / "services.yaml"

_CACHE: dict[str, Any] = {"ts": 0.0, "data": None}
_CACHE_TTL = 30.0
_HEALTH_TIMEOUT = 2.0


def load_catalog() -> list[dict[str, Any]]:
    raw = yaml.safe_load(SERVICES_PATH.read_text()) or []
    groups: list[dict[str, Any]] = []
    for block in raw:
        services = []
        for svc in block.get("services") or []:
            services.append(
                {
                    "name": svc["name"],
                    "href": svc["href"],
                    "icon": svc.get("icon") or "box",
                    "description": svc.get("description") or "",
                    "health": svc.get("health"),
                }
            )
        groups.append({"group": block.get("group") or "Other", "services": services})
    return groups


async def _check_one(client: httpx.AsyncClient, url: Optional[str]) -> str:
    if not url:
        return "unknown"
    try:
        resp = await client.get(url, follow_redirects=True)
        # Anything that answers counts as up (auth walls included).
        if resp.status_code < 500:
            return "up"
        return "down"
    except Exception:
        return "down"


async def get_services(force: bool = False) -> list[dict[str, Any]]:
    now = time.monotonic()
    if not force and _CACHE["data"] is not None and (now - _CACHE["ts"]) < _CACHE_TTL:
        return _CACHE["data"]

    catalog = load_catalog()
    checks: list[tuple[int, int, Optional[str]]] = []
    for gi, group in enumerate(catalog):
        for si, svc in enumerate(group["services"]):
            checks.append((gi, si, svc.get("health")))

    # Allow self-signed certs (Portainer).
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    async with httpx.AsyncClient(timeout=_HEALTH_TIMEOUT, verify=ssl_ctx) as client:
        results = await asyncio.gather(
            *[_check_one(client, url) for _, _, url in checks],
            return_exceptions=False,
        )

    for (gi, si, _), status in zip(checks, results):
        catalog[gi]["services"][si]["status"] = status

    _CACHE["ts"] = now
    _CACHE["data"] = catalog
    return catalog
