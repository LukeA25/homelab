"""cpbjr/catholic-readings-api provider (static GitHub Pages JSON)."""

from __future__ import annotations

import json
from typing import Any

import httpx

from ..config import CPBJR_BASE_URL
from .base import NormalizedDay, NormalizedReading

_TYPE_MAP = {
    "firstReading": ("first_reading", "First Reading"),
    "secondReading": ("second_reading", "Second Reading"),
    "psalm": ("responsorial", "Responsorial Psalm"),
    "gospel": ("gospel", "Gospel"),
    "alleluia": ("alleluia", "Alleluia"),
    "sequence": ("sequence", "Sequence"),
}


class CpbjrProvider:
    name = "cpbjr"

    def __init__(self, base_url: str = CPBJR_BASE_URL, timeout: float = 20.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def fetch(self, date: str) -> NormalizedDay:
        year, month, day = date.split("-")
        md = f"{month}-{day}"
        readings_url = f"{self.base_url}/readings/{year}/{md}.json"
        calendar_url = f"{self.base_url}/liturgical-calendar/{year}/{md}.json"

        try:
            with httpx.Client(timeout=self.timeout) as client:
                readings_res = client.get(readings_url)
                calendar_res = client.get(calendar_url)
        except httpx.HTTPError as exc:
            return NormalizedDay(date=date, error=f"lectionary fetch failed: {exc}", source=self.name)

        if readings_res.status_code == 404:
            return NormalizedDay(date=date, error="no readings published for this date", source=self.name)
        if readings_res.status_code >= 400:
            return NormalizedDay(
                date=date,
                error=f"lectionary HTTP {readings_res.status_code}",
                source=self.name,
            )

        data = readings_res.json()
        celebration = ""
        season = str(data.get("season") or "")
        if calendar_res.status_code < 400:
            try:
                cal = calendar_res.json()
                season = str(cal.get("season") or season)
                celeb = cal.get("celebration") or {}
                if isinstance(celeb, dict):
                    celebration = str(celeb.get("name") or "")
                elif isinstance(celeb, str):
                    celebration = celeb
            except json.JSONDecodeError:
                pass

        raw_readings = data.get("readings") or {}
        readings: list[NormalizedReading] = []
        if isinstance(raw_readings, dict):
            for key, (rtype, label) in _TYPE_MAP.items():
                ref = raw_readings.get(key)
                if ref and str(ref).strip():
                    readings.append(
                        NormalizedReading(type=rtype, reference=str(ref).strip(), label=label)
                    )
            # Catch any extra keys not in the map.
            for key, ref in raw_readings.items():
                if key in _TYPE_MAP or not ref:
                    continue
                readings.append(
                    NormalizedReading(
                        type=str(key),
                        reference=str(ref).strip(),
                        label=str(key),
                    )
                )

        if not celebration and season:
            celebration = season

        return NormalizedDay(
            date=date,
            celebration=celebration,
            season=season,
            readings=readings,
            source=self.name,
        )
