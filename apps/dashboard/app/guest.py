"""Public guest screen (Tailscale Funnel) — a read-only mirror, never the real app.

Runs on its own port so the funnel can only reach these routes. Top-level page
loads always get the guest page; only the guest page's iframe is proxied, and
only to the app currently cast to the guest target. Anything but GET/HEAD is
refused, and nothing is proxied while no session is on the guest screen. The
one write is the screen's own display report, which never reaches an app.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from urllib.parse import parse_qs

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from starlette.background import BackgroundTask

from . import cast
from .cast_routes import sse_response

_HOST = os.getenv("CAST_UPSTREAM_HOST", "http://100.101.135.109")
UPSTREAMS = {
    "home": os.getenv("CAST_UPSTREAM_HOME", f"{_HOST}:8004"),
    "finance": os.getenv("CAST_UPSTREAM_FINANCE", f"{_HOST}:8000"),
    "guitar": os.getenv("CAST_UPSTREAM_GUITAR", f"{_HOST}:8001"),
    "theology": os.getenv("CAST_UPSTREAM_THEOLOGY", f"{_HOST}:8002"),
    "homework": os.getenv("CAST_UPSTREAM_HOMEWORK", f"{_HOST}:8005"),
}

DIST = Path(__file__).resolve().parent.parent / "frontend_dist"
GUEST_PAGE = DIST / "__guest" / "index.html"
CAST_JS = DIST / "__cast" / "cast.js"
VIEWER_JS = DIST / "__cast" / "viewer.js"

_REQUEST_HEADERS = (
    "accept",
    "accept-language",
    "range",
    "if-none-match",
    "if-modified-since",
    "user-agent",
)
_RESPONSE_HEADERS = (
    "content-type",
    "content-length",
    "content-encoding",
    "cache-control",
    "etag",
    "last-modified",
    "accept-ranges",
    "content-range",
)

app = FastAPI(title="Homelab guest screen", docs_url=None, redoc_url=None, openapi_url=None)
_client = httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=5.0), follow_redirects=False)


def _guest_view() -> dict | None:
    return cast.public(cast.sessions().get("guest"))


def _guest_payload() -> dict:
    return {"session": _guest_view()}


def _guest_shape(event: str, data: dict):
    if event == "state":
        return None, _guest_payload()
    if event == "command" and data.get("target") == "guest":
        return "command", {"cmd": data["cmd"]}
    return None


def _is_top_level_page(request: Request) -> bool:
    if "view" in parse_qs(request.url.query).get("__cast", []):
        return False
    dest = request.headers.get("sec-fetch-dest")
    if dest:
        return dest == "document"
    return "text/html" in request.headers.get("accept", "")


@app.get("/__guest/state")
async def guest_state():
    return _guest_payload()


@app.get("/__guest/events")
async def guest_events():
    return sse_response(_guest_shape)


_last_report = 0.0


@app.post("/__guest/report")
async def guest_report(request: Request):
    """What the guest screen shows, for the phone remote. Display state only:
    the phone never acts on it without looking the item up in the app itself."""
    global _last_report
    now = time.monotonic()
    if now - _last_report < 0.05:
        return JSONResponse({"detail": "Too many reports"}, status_code=429)
    _last_report = now
    body = await request.body()
    if len(body) > cast.MAX_REPORT_BYTES + 64:
        return JSONResponse({"detail": "Report too large"}, status_code=413)
    try:
        report = cast.set_report("guest", json.loads(body).get("report"))
    except (ValueError, AttributeError):
        return JSONResponse({"detail": "Bad report"}, status_code=400)
    await cast.publish_report("guest", report)
    return {"ok": True}


@app.get("/__guest/night.jpg")
async def guest_background():
    return FileResponse(DIST / "__guest" / "night.jpg", media_type="image/jpeg")


@app.get("/__cast/cast.js")
async def cast_js():
    return FileResponse(CAST_JS, media_type="text/javascript", headers={"Cache-Control": "no-cache"})


@app.get("/__cast/viewer.js")
async def viewer_js():
    return FileResponse(VIEWER_JS, media_type="text/javascript", headers={"Cache-Control": "no-cache"})


@app.api_route("/{full_path:path}", methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def gateway(full_path: str, request: Request):
    if request.method not in ("GET", "HEAD"):
        return JSONResponse({"detail": "This screen is read-only."}, status_code=405)

    if _is_top_level_page(request):
        return FileResponse(GUEST_PAGE, media_type="text/html", headers={"Cache-Control": "no-cache"})

    session = _guest_view()
    path = "/" + full_path
    if not session or path.startswith(("/__cast/", "/__guest/")):
        return Response(status_code=404)

    url = UPSTREAMS[session["app"]] + path
    if request.url.query:
        url += "?" + request.url.query
    headers = {k: v for k, v in request.headers.items() if k.lower() in _REQUEST_HEADERS}
    upstream = await _client.send(
        _client.build_request(request.method, url, headers=headers),
        stream=True,
    )

    out_headers = {k: v for k, v in upstream.headers.items() if k.lower() in _RESPONSE_HEADERS}
    location = upstream.headers.get("location")
    if location:
        base = UPSTREAMS[session["app"]]
        out_headers["location"] = location[len(base):] if location.startswith(base) else location
    out_headers["X-Robots-Tag"] = "noindex"

    return StreamingResponse(
        upstream.aiter_raw(),
        status_code=upstream.status_code,
        headers=out_headers,
        background=BackgroundTask(upstream.aclose),
    )
