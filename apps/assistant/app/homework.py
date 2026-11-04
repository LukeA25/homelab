from __future__ import annotations

from typing import Any

import httpx

from .config import settings


async def list_assignments(limit: int = 8) -> dict[str, Any]:
    cfg = settings()
    async with httpx.AsyncClient(timeout=8.0) as client:
        resp = await client.get(f"{cfg['homework_base_url']}/api/assignments")
        resp.raise_for_status()
        data = resp.json()
    items = data.get("assignments") or []
    open_items = [a for a in items if not a.get("done")][:limit]
    return {
        "open_count": data.get("openCount", len(open_items)),
        "due_today": data.get("dueTodayCount", 0),
        "overdue": data.get("overdueCount", 0),
        "assignments": [
            {
                "title": a.get("title"),
                "course": a.get("courseName") or a.get("courseCode"),
                "due": a.get("due"),
                "day_label": a.get("dayLabel"),
            }
            for a in open_items
        ],
    }


async def create_assignment(
    title: str,
    course_code: str,
    due: str,
    notes: str | None = None,
) -> dict[str, Any]:
    cfg = settings()
    body = {
        "title": title,
        "courseCode": course_code,
        "due": due,
        "source": "voice",
        "notes": notes or "",
    }
    async with httpx.AsyncClient(timeout=8.0) as client:
        resp = await client.post(
            f"{cfg['homework_base_url']}/api/assignments",
            json=body,
        )
        if resp.status_code >= 400:
            detail = resp.text
            try:
                detail = resp.json().get("detail", detail)
            except Exception:
                pass
            raise RuntimeError(str(detail))
        return resp.json()
