"""Finance app summary client. Reads cached SQLite data via the finance API —
never triggers Plaid calls.

Dashboard focuses on Day to Day + Charity (and their subcategories) plus overall.
"""

from __future__ import annotations

import os
import time
from datetime import date, datetime
from typing import Any, Optional

import httpx

FINANCE_BASE_URL = os.getenv("FINANCE_BASE_URL", "http://100.101.135.109:8000").rstrip("/")

# Category names to surface on the dashboard (case-insensitive match).
FOCUS_CATEGORIES = ("Day to Day", "Charity")

_CACHE: dict[str, Any] = {"ts": 0.0, "data": None, "key": ""}
_CACHE_TTL = 60.0


def _month_key(d: Optional[date] = None) -> str:
    d = d or date.today()
    return f"{d.year:04d}-{d.month:02d}"


def _month_label(ym: str) -> str:
    names = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]
    year, month = ym.split("-")
    return f"{names[int(month) - 1]} {year}"


def _pct(spent: float, budgeted: float) -> float:
    if budgeted > 0:
        return round(spent / budgeted, 4)
    return 1.0 if spent > 0 else 0.0


async def _fetch_json(path: str) -> Any:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{FINANCE_BASE_URL}{path}")
        resp.raise_for_status()
        return resp.json()


def _category_month(
    cat: dict[str, Any], idx: int
) -> tuple[float, float, list[dict[str, Any]]]:
    spent = 0.0
    budgeted = 0.0
    subs: list[dict[str, Any]] = []
    for sub in cat.get("subcategories") or []:
        actuals = sub.get("actual") or []
        projected = sub.get("projected") or []
        a = float(actuals[idx] or 0) if 0 <= idx < len(actuals) else 0.0
        p = float(projected[idx] or 0) if 0 <= idx < len(projected) else 0.0
        spent += a
        budgeted += p
        subs.append(
            {
                "name": sub.get("name") or "Other",
                "spent": round(a, 2),
                "budgeted": round(p, 2),
                "remaining": round(p - a, 2),
                "pct_used": _pct(a, p),
            }
        )
    return spent, budgeted, subs


def _summarize(
    monthly: dict[str, Any], snapshot: dict[str, Any], month_key: Optional[str] = None
) -> dict[str, Any]:
    months: list[str] = monthly.get("months") or []
    month_labels: list[str] = monthly.get("month_labels") or [
        _month_label(m) for m in months
    ]
    target = month_key or _month_key()

    try:
        idx = months.index(target)
    except ValueError:
        idx = len(months) - 1 if months else -1
        target = months[idx] if idx >= 0 else target

    overall_spent = 0.0
    overall_budgeted = 0.0
    focus: list[dict[str, Any]] = []
    focus_lookup = {name.lower(): name for name in FOCUS_CATEGORIES}
    found: dict[str, dict[str, Any]] = {}

    for cat in monthly.get("expense") or []:
        cat_name = cat.get("name") or "Other"
        spent, budgeted, subs = _category_month(cat, idx)
        overall_spent += spent
        overall_budgeted += budgeted

        key = cat_name.lower()
        if key in focus_lookup:
            found[key] = {
                "name": focus_lookup[key],
                "spent": round(spent, 2),
                "budgeted": round(budgeted, 2),
                "remaining": round(budgeted - spent, 2),
                "pct_used": _pct(spent, budgeted),
                "subcategories": subs,
            }

    # Preserve declared order even if a category is missing this month.
    for name in FOCUS_CATEGORIES:
        focus.append(
            found.get(
                name.lower(),
                {
                    "name": name,
                    "spent": 0.0,
                    "budgeted": 0.0,
                    "remaining": 0.0,
                    "pct_used": 0.0,
                    "subcategories": [],
                },
            )
        )

    cash_total = 0.0
    for acct in snapshot.get("accounts") or []:
        if (acct.get("type") or "").lower() == "investment":
            continue
        bal = acct.get("current_balance")
        if bal is None:
            continue
        cash_total += float(bal)

    remaining = overall_budgeted - overall_spent

    return {
        "connected": bool(snapshot.get("connected")),
        "month": target if idx >= 0 and months else None,
        "month_label": (
            month_labels[idx]
            if idx >= 0 and idx < len(month_labels)
            else (_month_label(target) if months else None)
        ),
        "spent": round(overall_spent, 2),
        "budgeted": round(overall_budgeted, 2),
        "remaining": round(remaining, 2),
        "pct_used": _pct(overall_spent, overall_budgeted),
        "focus": focus,
        "cash_total": round(cash_total, 2),
        "updated_at": datetime.now().astimezone().isoformat(),
        "href": "http://finance.home.arpa",
    }


async def get_summary(force: bool = False, month: Optional[str] = None) -> dict[str, Any]:
    cache_key = month or ""
    now = time.monotonic()
    if (
        not force
        and _CACHE.get("key") == cache_key
        and _CACHE["data"] is not None
        and (now - _CACHE["ts"]) < _CACHE_TTL
    ):
        return _CACHE["data"]

    try:
        monthly = await _fetch_json("/api/budget?view=monthly")
        snapshot = await _fetch_json("/api/data")
        summary = _summarize(monthly, snapshot, month_key=month)
    except Exception as exc:
        summary = {
            "connected": False,
            "month": month,
            "month_label": _month_label(month) if month and "-" in month else None,
            "spent": 0.0,
            "budgeted": 0.0,
            "remaining": 0.0,
            "pct_used": 0.0,
            "focus": [],
            "cash_total": 0.0,
            "updated_at": datetime.now().astimezone().isoformat(),
            "href": "http://finance.home.arpa",
            "error": str(exc),
        }

    _CACHE["ts"] = now
    _CACHE["key"] = cache_key
    _CACHE["data"] = summary
    return summary
