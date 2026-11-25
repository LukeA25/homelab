"""nova-auth: per-device sign-in for app hostnames, answering Caddy forward_auth.

Runs as its own container from the gateway's image, with the device registry
mounted read-only. The gateway enrolls and revokes; this service only verifies,
so restarting the gateway never locks anyone out of the apps.

Flow: an app host asks GET /verify?app=<name>. Without a valid session the
browser is sent to auth.home.arpa/login, signs in once per device with its
credential, and comes back through /__auth/callback on the app host with a
short-lived single-use code that becomes a host-bound session cookie. Every
check re-reads the registry, so revoking a device takes effect immediately.

    uvicorn app.authsvc:app
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import html
import json
import os
import re
import secrets
import sys
import time
from functools import lru_cache
from urllib.parse import parse_qs, quote, urlsplit

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response

from . import devices

SSO_COOKIE = "nova_sso"
APP_COOKIE = "nova_session"
CODE_TTL = 60
_APP = re.compile(r"[a-z][a-z0-9-]{0,30}")
_FAIL_WINDOW = 600
_FAIL_LIMIT = 10


@lru_cache(maxsize=1)
def settings() -> dict:
    secret = os.getenv("AUTH_SECRET", "")
    if len(secret) < 32:
        raise RuntimeError("AUTH_SECRET must be set to at least 32 characters")
    return {
        "secret": secret.encode(),
        "auth_host": os.getenv("AUTH_HOST", "auth.home.arpa"),
        "domain": os.getenv("AUTH_DOMAIN", "home.arpa"),
        "max_age": int(os.getenv("AUTH_SESSION_DAYS", "180")) * 86400,
    }


app = FastAPI(title="nova-auth", docs_url=None, redoc_url=None, openapi_url=None)
_used_codes: dict[str, float] = {}
_failures: dict[str, list[float]] = {}


@app.on_event("startup")
def _startup() -> None:
    settings()


def _log(event: str, **fields) -> None:
    print(json.dumps({"ts": round(time.time(), 3), "event": event, **fields}), file=sys.stdout, flush=True)


# --- signed values -----------------------------------------------------------

def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(kind: str, ttl: int, **claims) -> str:
    payload = json.dumps({"k": kind, "e": int(time.time()) + ttl, **claims}, separators=(",", ":")).encode()
    mac = hmac.new(settings()["secret"], payload, hashlib.sha256).digest()
    return f"{_b64(payload)}.{_b64(mac)}"


def _unsign(value: str | None, kind: str) -> dict | None:
    if not value or value.count(".") != 1:
        return None
    try:
        payload_b64, mac_b64 = value.split(".")
        payload = _unb64(payload_b64)
        expected = hmac.new(settings()["secret"], payload, hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _unb64(mac_b64)):
            return None
        claims = json.loads(payload)
    except (ValueError, json.JSONDecodeError):
        return None
    if claims.get("k") != kind or int(claims.get("e", 0)) < time.time():
        return None
    return claims


# --- request helpers -----------------------------------------------------------

def _host(request: Request) -> str:
    return (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(":")[0].lower()


def _client(request: Request) -> str:
    return (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0].strip()


def _wants_html(request: Request) -> bool:
    method = (request.headers.get("x-forwarded-method") or request.method).upper()
    return method in ("GET", "HEAD") and "text/html" in request.headers.get("accept", "")


def _bearer_device(request: Request) -> devices.Device | None:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer ") and auth[7:].strip().startswith(devices.TOKEN_PREFIX):
        return devices.verify(auth[7:].strip())
    return None


def _session_device(value: str | None, kind: str, host: str) -> devices.Device | None:
    claims = _unsign(value, kind)
    if not claims or claims.get("h") != host:
        return None
    return devices.get_active(str(claims.get("d", "")))


def _safe_return(rd: str | None) -> tuple[str, str] | None:
    """Accept only https URLs on the home domain, so login can't be used as an open redirect."""
    if not rd:
        return None
    try:
        parts = urlsplit(rd)
        port = parts.port
    except ValueError:
        return None
    host = (parts.hostname or "").lower()
    domain = settings()["domain"]
    if parts.scheme != "https" or parts.username or parts.password or port not in (None, 443):
        return None
    if not host.endswith("." + domain) or host == settings()["auth_host"]:
        return None
    path = parts.path or "/"
    if parts.query:
        path += "?" + parts.query
    return host, path


def _safe_path(path: str | None) -> str:
    if not path or not path.startswith("/") or path.startswith("//") or "\\" in path:
        return "/"
    return path


def _cookie(response: Response, name: str, value: str) -> None:
    response.set_cookie(name, value, max_age=settings()["max_age"], path="/", secure=True, httponly=True, samesite="lax")


def _too_many_failures(client: str) -> bool:
    now = time.time()
    recent = [t for t in _failures.get(client, []) if now - t < _FAIL_WINDOW]
    _failures[client] = recent
    return len(recent) >= _FAIL_LIMIT


def _handoff(device: devices.Device, target: tuple[str, str]) -> RedirectResponse:
    host, path = target
    code = _sign("code", CODE_TTL, d=device.id, h=host, n=secrets.token_urlsafe(12))
    return RedirectResponse(f"https://{host}/__auth/callback?code={quote(code)}&next={quote(path, safe='')}", 302)


# --- pages -----------------------------------------------------------------------

_PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in · Homelab</title>
<style>
body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#101622;color:#e8edf5;font:16px/1.5 system-ui,sans-serif}}
main{{width:min(420px,92vw);background:#1b2230;border:1px solid #2a3344;border-radius:18px;padding:28px}}
h1{{font-size:20px;margin:0 0 6px}} p{{color:#9aa6b8;margin:0 0 18px}} .err{{color:#f07178}}
input{{width:100%;box-sizing:border-box;padding:12px;border-radius:12px;border:1px solid #2a3344;background:#101622;color:#e8edf5;font:inherit}}
button{{margin-top:14px;width:100%;padding:12px;border:0;border-radius:12px;background:#5b8cff;color:#fff;font:inherit;font-weight:600}}
a{{color:#5b8cff}}
</style></head><body><main>{body}</main></body></html>"""


def _page(body: str, status: int = 200) -> HTMLResponse:
    return HTMLResponse(_PAGE.format(body=body), status_code=status, headers={"Cache-Control": "no-store"})


def _login_form(rd: str | None, error: str = "", status: int = 200) -> HTMLResponse:
    err = f'<p class="err">{html.escape(error)}</p>' if error else ""
    body = f"""<h1>Sign in this device</h1>
<p>Paste this device's Nova credential. You only need to do this once per device.</p>{err}
<form method="post" action="/login" id="f">
<input type="hidden" name="rd" value="{html.escape(rd or '', quote=True)}">
<input type="password" name="token" id="t" autocomplete="off" placeholder="nova_…" required autofocus>
<button type="submit">Sign in</button></form>
<script>
const t = new URLSearchParams(location.hash.slice(1)).get("token");
if (t) {{ history.replaceState(null, "", location.pathname + location.search); document.getElementById("t").value = t; document.getElementById("f").submit(); }}
</script>"""
    return _page(body, status)


# --- routes ------------------------------------------------------------------------

@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/verify")
def verify(request: Request, app: str = "") -> Response:
    if not _APP.fullmatch(app):
        return JSONResponse({"error": "bad app"}, status_code=400)
    host = _host(request)
    device = _bearer_device(request) or _session_device(request.cookies.get(APP_COOKIE), "app", host)
    if device and device.allows(f"app.{app}"):
        return Response(status_code=200, headers={"X-Nova-Device": device.id})
    if device:
        _log("denied", device=device.id, app=app, host=host)
        if _wants_html(request):
            return _page(f"<h1>Not allowed</h1><p>{html.escape(device.name)} isn't allowed to open {html.escape(app)}.</p>"
                         f'<p><a href="https://{settings()["auth_host"]}/logout">Sign in as a different device</a></p>', 403)
        return JSONResponse({"error": "device not allowed"}, status_code=403)
    if _wants_html(request):
        uri = request.headers.get("x-forwarded-uri") or "/"
        rd = quote(f"https://{host}{_safe_path(uri)}", safe="")
        return RedirectResponse(f"https://{settings()['auth_host']}/login?rd={rd}", 302)
    return JSONResponse({"error": "sign-in required"}, status_code=401)


@app.get("/login")
def login_page(request: Request, rd: str = "") -> Response:
    target = _safe_return(rd)
    device = _session_device(request.cookies.get(SSO_COOKIE), "sso", settings()["auth_host"])
    if device and target:
        return _handoff(device, target)
    if device:
        return _page(f"<h1>Signed in</h1><p>This browser is signed in as {html.escape(device.name)}.</p>"
                     '<p><a href="/logout">Sign out</a></p>')
    return _login_form(rd if target else None)


@app.post("/login")
async def login_submit(request: Request) -> Response:
    client = _client(request)
    form = parse_qs((await request.body()).decode("utf-8", "replace"))
    rd = (form.get("rd") or [""])[0]
    target = _safe_return(rd)
    if _too_many_failures(client):
        _log("login_throttled", client=client)
        return _login_form(rd if target else None, "Too many attempts. Wait a few minutes and try again.", 429)
    device = devices.verify((form.get("token") or [""])[0].strip())
    if device is None:
        _failures.setdefault(client, []).append(time.time())
        _log("login_failed", client=client)
        return _login_form(rd if target else None, "That credential wasn't accepted.", 401)
    _log("login", device=device.id, client=client)
    response = _handoff(device, target) if target else _page(
        f"<h1>Signed in</h1><p>This browser is now signed in as {html.escape(device.name)}.</p>")
    _cookie(response, SSO_COOKIE, _sign("sso", settings()["max_age"], d=device.id, h=settings()["auth_host"]))
    return response


@app.get("/logout")
def logout() -> Response:
    response = _page('<h1>Signed out</h1><p>This browser is no longer signed in.</p><p><a href="/login">Sign in</a></p>')
    response.delete_cookie(SSO_COOKIE, path="/")
    return response


@app.get("/__auth/callback")
def callback(request: Request, code: str = "", next: str = "/") -> Response:
    host = _host(request)
    claims = _unsign(code, "code")
    now = time.time()
    for nonce, exp in list(_used_codes.items()):
        if exp < now:
            del _used_codes[nonce]
    if not claims or claims.get("h") != host or claims.get("n") in _used_codes:
        return _page(f'<h1>Sign-in link expired</h1><p><a href="https://{html.escape(host)}/">Try again</a></p>', 400)
    _used_codes[str(claims["n"])] = float(claims["e"])
    device = devices.get_active(str(claims.get("d", "")))
    if device is None:
        return _page("<h1>Device revoked</h1><p>This device is no longer enrolled.</p>", 403)
    response = RedirectResponse(_safe_path(next), 302)
    _cookie(response, APP_COOKIE, _sign("app", settings()["max_age"], d=device.id, h=host))
    _log("session", device=device.id, host=host)
    return response


@app.get("/__auth/logout")
def app_logout() -> Response:
    response = _page("<h1>Signed out of this app</h1>")
    response.delete_cookie(APP_COOKIE, path="/")
    return response
