"""Lectionary service: provider + disk cache + normalized API shape."""

from __future__ import annotations

import json
from datetime import date as date_cls
from pathlib import Path
from typing import Any, Optional

from ..config import LECTIONARY_CACHE_DIR, LECTIONARY_PROVIDER
from .base import NormalizedDay
from .cpbjr import CpbjrProvider


def _provider():
    if LECTIONARY_PROVIDER == "cpbjr":
        return CpbjrProvider()
    return CpbjrProvider()


def _cache_path(day: str) -> Path:
    return LECTIONARY_CACHE_DIR / f"{day}.json"


def _day_to_dict(day: NormalizedDay) -> dict[str, Any]:
    return {
        "date": day.date,
        "celebration": day.celebration,
        "season": day.season,
        "source": day.source,
        "error": day.error,
        "readings": [
            {"type": r.type, "reference": r.reference, "label": r.label}
            for r in day.readings
        ],
    }


def _day_from_dict(data: dict[str, Any]) -> NormalizedDay:
    from .base import NormalizedReading

    return NormalizedDay(
        date=str(data.get("date") or ""),
        celebration=str(data.get("celebration") or ""),
        season=str(data.get("season") or ""),
        source=str(data.get("source") or ""),
        error=data.get("error"),
        readings=[
            NormalizedReading(
                type=str(r.get("type") or ""),
                reference=str(r.get("reference") or ""),
                label=str(r.get("label") or ""),
            )
            for r in (data.get("readings") or [])
            if isinstance(r, dict)
        ],
    )


def get_readings(day: Optional[str] = None, *, refresh: bool = False) -> NormalizedDay:
    target = day or date_cls.today().isoformat()
    LECTIONARY_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = _cache_path(target)

    if not refresh and path.exists():
        try:
            cached = _day_from_dict(json.loads(path.read_text(encoding="utf-8")))
            if cached.readings and not cached.error:
                return cached
        except (OSError, json.JSONDecodeError, TypeError):
            pass

    result = _provider().fetch(target)
    if result.readings and not result.error:
        try:
            path.write_text(json.dumps(_day_to_dict(result), indent=2), encoding="utf-8")
        except OSError:
            pass
    return result


def day_as_api_dict(day: NormalizedDay) -> dict[str, Any]:
    return _day_to_dict(day)
