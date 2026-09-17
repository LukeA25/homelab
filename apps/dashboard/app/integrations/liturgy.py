"""Catholic liturgical calendar for the TV header.

Uses the US-oriented catholic-readings-api feed (General Roman Calendar
with saints, memorials, feasts, and solemnities). Dates follow DISPLAY_TZ.
"""

from __future__ import annotations

import os
import time
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import httpx

DISPLAY_TZ = os.getenv("DISPLAY_TZ", "America/Chicago")
_BASE = "https://cpbjr.github.io/catholic-readings-api/liturgical-calendar"

_CACHE: dict[str, Any] = {"ts": 0.0, "date": "", "data": None}
_CACHE_TTL = 3600.0

_RANK_LABELS = {
    "SOLEMNITY": "Solemnity",
    "FEAST": "Feast",
    "MEMORIAL": "Memorial",
    "OPT_MEMORIAL": "Optional Memorial",
    "SUNDAY": "Sunday",
    "WEEKDAY": "Weekday",
    "FERIA": "Weekday",
}


def _today() -> datetime:
    try:
        tz = ZoneInfo(DISPLAY_TZ)
    except Exception:
        tz = ZoneInfo("UTC")
    return datetime.now(tz)


def _empty(day: str, error: str | None = None) -> dict[str, Any]:
    return {
        "connected": False,
        "date": day,
        "season": None,
        "name": None,
        "rank": None,
        "rank_label": None,
        "quote": None,
        "error": error,
    }


async def get_today() -> dict[str, Any]:
    now = _today()
    day = now.strftime("%Y-%m-%d")
    ts = time.monotonic()
    if (
        _CACHE["data"] is not None
        and _CACHE["date"] == day
        and (ts - _CACHE["ts"]) < _CACHE_TTL
    ):
        return _CACHE["data"]

    url = f"{_BASE}/{now.year}/{now.strftime('%m-%d')}.json"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            raw = resp.json()
    except Exception as exc:
        if _CACHE["data"] is not None and _CACHE["date"] == day:
            return _CACHE["data"]
        return _empty(day, str(exc))

    celeb = raw.get("celebration") or {}
    rank = (celeb.get("type") or "").strip().upper() or None
    quote = (celeb.get("quote") or "").strip() or None
    name = (celeb.get("name") or "").strip() or None
    season = (raw.get("season") or "").strip() or None
    rank_label = None
    if rank:
        rank_label = _RANK_LABELS.get(rank, rank.replace("_", " ").title())

    summary = {
        "connected": True,
        "date": raw.get("date") or day,
        "season": season,
        "name": name,
        "rank": rank,
        "rank_label": rank_label,
        "quote": quote,
    }
    _CACHE["ts"] = ts
    _CACHE["date"] = day
    _CACHE["data"] = summary
    return summary
