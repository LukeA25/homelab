"""Blank notification pipe.

A phone subscribes on one app's address. A send for that app reaches only
those phones. Other apps are untouched until they subscribe and send too.

    POST /api/send
    Authorization: Bearer $NOTIFY_TOKEN
    {"app": "internships", "title": "Needs your answer", "body": "Acme", "url": "/", "tag": "posting-12"}

`app` is the hostname label (`internships.home.arpa` -> `internships`).
`url` is a path on that app, opened when the notification is tapped.
`delivered` is 0 when nobody has opted in yet. That is a normal result.
"""

from __future__ import annotations

import hmac
import os
import re
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from . import db, push

app = FastAPI(title="Notify")
_STATIC = os.path.join(os.path.dirname(__file__), "static")
_APP_NAME = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?")
_TOKEN = os.getenv("NOTIFY_TOKEN", "")


@app.on_event("startup")
def _startup() -> None:
    db.init_db()
    push.public_key()


class SubscriptionIn(BaseModel):
    endpoint: str = Field(min_length=8, max_length=2048)
    keys: dict[str, str]


class EndpointIn(BaseModel):
    endpoint: str = Field(min_length=8, max_length=2048)


class SendIn(BaseModel):
    app: str
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(default="", max_length=400)
    url: str = Field(default="/", max_length=2048)
    tag: str = Field(default="", max_length=64)


def _host(request: Request) -> str:
    raw = request.headers.get("host") or request.headers.get("x-forwarded-host") or ""
    return raw.split(",")[0].strip().lower().split(":")[0]


def app_label(host: str) -> str:
    if host.endswith(".home.arpa"):
        label = host[: -len(".home.arpa")]
    else:
        raise HTTPException(status_code=404, detail="Unknown host")
    if "." in label or not _APP_NAME.fullmatch(label):
        raise HTTPException(status_code=404, detail="Unknown host")
    return label


def _check_app(name: str) -> str:
    name = name.strip().lower()
    if not _APP_NAME.fullmatch(name):
        raise HTTPException(status_code=400, detail="Unknown app")
    return name


def _clean_url(url: str, app_name: str) -> str:
    url = url.strip() or "/"
    if url.startswith("/") and not url.startswith("//") and "\\" not in url and "\n" not in url:
        return url
    parsed = urlparse(url)
    if parsed.scheme == "https" and (parsed.hostname or "").lower() == f"{app_name}.home.arpa":
        return url
    raise HTTPException(status_code=400, detail="url must be a path on this app")


def _require_token(request: Request) -> None:
    if not _TOKEN:
        raise HTTPException(status_code=503, detail="NOTIFY_TOKEN is not set")
    header = request.headers.get("authorization", "")
    supplied = header.removeprefix("Bearer ").strip() if header.startswith("Bearer ") else ""
    if not hmac.compare_digest(supplied, _TOKEN):
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": "notify",
        "send": "POST /api/send",
        "auth": "Authorization: Bearer $NOTIFY_TOKEN",
        "body": '{"app","title","body","url","tag"}',
    }


@app.get("/api/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/api/send")
def send(body: SendIn, request: Request) -> dict[str, int]:
    _require_token(request)
    name = _check_app(body.app)
    url = _clean_url(body.url, name)
    return push.send(name, body.title.strip(), body.body.strip(), url, body.tag.strip())


@app.get("/__notify/vapid")
def vapid() -> dict[str, str]:
    return {"publicKey": push.public_key()}


@app.post("/__notify/subscribe")
def subscribe(body: SubscriptionIn, request: Request) -> dict[str, bool]:
    name = app_label(_host(request))
    p256dh = body.keys.get("p256dh", "")
    auth = body.keys.get("auth", "")
    if not p256dh or not auth or not body.endpoint.startswith("https://"):
        raise HTTPException(status_code=400, detail="Invalid subscription")
    db.upsert(name, body.endpoint, p256dh, auth)
    return {"ok": True}


@app.delete("/__notify/subscribe")
def unsubscribe(body: EndpointIn) -> dict[str, bool]:
    db.delete(body.endpoint)
    return {"ok": True}


@app.get("/__notify/client.js")
def client_js() -> FileResponse:
    return FileResponse(
        os.path.join(_STATIC, "client.js"),
        media_type="text/javascript",
        headers={"Cache-Control": "no-cache"},
    )


@app.get("/__notify/sw.js")
def service_worker() -> FileResponse:
    return FileResponse(
        os.path.join(_STATIC, "sw.js"),
        media_type="text/javascript",
        headers={"Cache-Control": "no-cache", "Service-Worker-Allowed": "/__notify/"},
    )


@app.get("/manifest.webmanifest")
def manifest(request: Request) -> JSONResponse:
    label = app_label(_host(request))
    name = label[:1].upper() + label[1:]
    return JSONResponse(
        {
            "name": name,
            "short_name": name,
            "display": "standalone",
            "start_url": "/",
            "scope": "/",
            "id": "/",
        },
        media_type="application/manifest+json",
    )
