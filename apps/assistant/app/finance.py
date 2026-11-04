"""Read-only finance summary via the dashboard proxy (no Plaid calls)."""

from __future__ import annotations

from typing import Any

import httpx

from .config import settings


async def get_summary() -> dict[str, Any]:
    cfg = settings()
    url = f"{cfg['dashboard_base_url']}/api/finance/summary"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    focus = [
        {
            "name": t.get("name"),
            "spent": t.get("spent"),
            "budgeted": t.get("budgeted"),
            "remaining": t.get("remaining"),
        }
        for t in (data.get("focus") or [])
    ]
    return {
        "connected": bool(data.get("connected")),
        "month_label": data.get("month_label"),
        "spent": data.get("spent"),
        "budgeted": data.get("budgeted"),
        "remaining": data.get("remaining"),
        "pct_used": data.get("pct_used"),
        "cash_total": data.get("cash_total"),
        "focus": focus,
        "error": data.get("error"),
    }
