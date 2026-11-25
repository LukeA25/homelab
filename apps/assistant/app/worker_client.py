"""Client for the agent-worker container (Cursor coding agent)."""

from __future__ import annotations

from typing import Any

import httpx

from .config import settings


def _headers() -> dict[str, str]:
    token = settings()["worker_token"]
    if not token:
        raise RuntimeError("WORKER_TOKEN is not configured")
    return {"Authorization": f"Bearer {token}"}


async def _request(method: str, path: str, *, timeout: float = 10.0, **kwargs: Any) -> Any:
    url = f"{settings()['worker_url']}{path}"
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.request(method, url, headers=_headers(), **kwargs)
    if resp.status_code >= 400:
        try:
            detail = resp.json().get("detail", resp.text)
        except ValueError:
            detail = resp.text
        raise RuntimeError(f"worker {resp.status_code}: {detail}")
    return resp.json()


async def health() -> dict[str, Any]:
    return await _request("GET", "/health", timeout=5.0)


async def ask(question: str) -> dict[str, Any]:
    wait = settings()["worker_query_timeout"]
    return await _request(
        "POST", "/query", json={"prompt": question, "timeout_s": wait}, timeout=wait + 10
    )


async def submit_change(job_id: str, prompt: str) -> dict[str, Any]:
    return await _request("POST", "/jobs", json={"id": job_id, "prompt": prompt, "kind": "change"})


async def get_job(job_id: str) -> dict[str, Any] | None:
    try:
        return await _request("GET", f"/jobs/{job_id}")
    except RuntimeError as exc:
        if "404" in str(exc):
            return None
        raise


async def list_jobs(limit: int = 10) -> list[dict[str, Any]]:
    data = await _request("GET", "/jobs", params={"limit": limit})
    return data.get("jobs") or []
