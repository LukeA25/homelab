"""Load the committed Bible in a Year plan and turn citations into Bible links."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from .references import links_for_citation

_PLAN_PATH = Path(__file__).with_name("plan.json")
TOTAL_DAYS = 365


@lru_cache(maxsize=1)
def load_plan() -> tuple[dict, ...]:
    data = json.loads(_PLAN_PATH.read_text())
    days = tuple(data["days"])
    if len(days) != TOTAL_DAYS:
        raise RuntimeError(f"Bible in a Year plan has {len(days)} days, expected {TOTAL_DAYS}")
    return days


def day_payload(day: dict, work_id: str, audio_url: str | None = None, title: str | None = None) -> dict:
    readings = []
    for reference in day.get("readings") or []:
        readings.append(
            {
                "reference": reference,
                "links": [
                    {
                        "label": link.label,
                        "sectionId": link.section_id,
                        "verseStart": link.verse_start,
                        "verseEnd": link.verse_end,
                        "note": link.note,
                    }
                    for link in links_for_citation(reference, work_id)
                ],
            }
        )
    url = audio_url or day.get("audioUrl") or ""
    if not str(url).startswith("https://"):
        url = None
    return {
        "day": day["day"],
        "period": day.get("period") or "",
        "title": title or day.get("title") or f"Day {day['day']}",
        "year": day.get("year"),
        "audioUrl": url,
        "readings": readings,
    }
