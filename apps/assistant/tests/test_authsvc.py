import os
import sqlite3
import stat
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi.testclient import TestClient

from app import authsvc, devices


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("AUTH_SECRET", "x" * 40)
    authsvc.settings.cache_clear()
    authsvc._used_codes.clear()
    authsvc._failures.clear()
    yield TestClient(authsvc.app, base_url="https://auth.home.arpa", follow_redirects=False)
    authsvc.settings.cache_clear()


HTML = {"accept": "text/html"}


def app_headers(host, **extra):
    return {"x-forwarded-host": host, "x-forwarded-method": "GET", "x-forwarded-uri": "/budget?m=11", **extra}


# The client's cookie jar is cleared after each step so every check sends only the cookie it names.
def sign_in(client, token, rd):
    res = client.post("/login", data={"token": token, "rd": rd})
    client.cookies.clear()
    return res, res.cookies.get(authsvc.SSO_COOKIE)


def follow_callback(client, location):
    parts = urlsplit(location)
    res = client.get(f"/__auth/callback?{parts.query}", headers={"x-forwarded-host": parts.hostname})
    client.cookies.clear()
    return res, res.cookies.get(authsvc.APP_COOKIE)


def test_browser_without_session_is_sent_to_sign_in(client):
    res = client.get("/verify?app=finance", headers=app_headers("finance.home.arpa", **HTML))
    assert res.status_code == 302
    loc = urlsplit(res.headers["location"])
    assert loc.netloc == "auth.home.arpa" and loc.path == "/login"
    assert parse_qs(loc.query)["rd"] == ["https://finance.home.arpa/budget?m=11"]


def test_api_call_without_credential_gets_401(client):
    res = client.get("/verify?app=finance", headers=app_headers("finance.home.arpa"))
    assert res.status_code == 401


def test_bearer_credential_is_checked_against_app_scope(client):
    _, both = devices.enroll("phone", ["app.finance", "app.theology"])
    _, ipad = devices.enroll("ipad", ["app.theology"])

    ok = client.get("/verify?app=finance", headers=app_headers("finance.home.arpa", authorization=f"Bearer {both}"))
    assert ok.status_code == 200 and ok.headers["x-nova-device"] == "phone"

    denied = client.get("/verify?app=finance", headers=app_headers("finance.home.arpa", authorization=f"Bearer {ipad}"))
    assert denied.status_code == 403


def test_single_sign_in_then_session_per_host(client):
    _, token = devices.enroll("laptop", ["*"])

    res, sso = sign_in(client, token, "https://finance.home.arpa/budget?m=11")
    assert res.status_code == 302 and sso
    res, session = follow_callback(client, res.headers["location"])
    assert res.status_code == 302 and res.headers["location"] == "/budget?m=11" and session

    ok = client.get("/verify?app=finance", headers=app_headers("finance.home.arpa"), cookies={authsvc.APP_COOKIE: session})
    assert ok.status_code == 200 and ok.headers["x-nova-device"] == "laptop"

    # The finance session is bound to its host and can't be replayed on another app.
    other = client.get("/verify?app=theology", headers=app_headers("theology.home.arpa"), cookies={authsvc.APP_COOKIE: session})
    assert other.status_code == 401

    # A second app needs no credential: the sign-in session hands off straight away.
    res = client.get("/login?rd=https://theology.home.arpa/", cookies={authsvc.SSO_COOKIE: sso})
    assert res.status_code == 302 and urlsplit(res.headers["location"]).hostname == "theology.home.arpa"


def test_codes_are_single_use_and_host_bound(client):
    _, token = devices.enroll("laptop", ["*"])
    res, _ = sign_in(client, token, "https://finance.home.arpa/")
    location = res.headers["location"]
    query = urlsplit(location).query

    wrong_host = client.get(f"/__auth/callback?{query}", headers={"x-forwarded-host": "theology.home.arpa"})
    assert wrong_host.status_code == 400

    first, session = follow_callback(client, location)
    assert first.status_code == 302 and session
    replay, _ = follow_callback(client, location)
    assert replay.status_code == 400


def test_revoking_a_device_ends_its_sessions(client):
    _, token = devices.enroll("ipad", ["*"])
    res, sso = sign_in(client, token, "https://finance.home.arpa/")
    _, session = follow_callback(client, res.headers["location"])

    devices.revoke("ipad")
    res = client.get("/verify?app=finance", headers=app_headers("finance.home.arpa"), cookies={authsvc.APP_COOKIE: session})
    assert res.status_code == 401
    res = client.get("/login?rd=https://finance.home.arpa/", cookies={authsvc.SSO_COOKIE: sso})
    assert res.status_code == 200 and "Sign in this device" in res.text


@pytest.mark.parametrize("rd", [
    "https://evil.example/",
    "http://finance.home.arpa/",
    "https://user@finance.home.arpa/",
    "https://finance.home.arpa:8443/",
    "https://auth.home.arpa/login",
    "//finance.home.arpa/",
])
def test_sign_in_never_redirects_off_the_home_domain(client, rd):
    _, token = devices.enroll("laptop", ["*"])
    res, sso = sign_in(client, token, rd)
    assert res.status_code == 200 and sso
    assert "location" not in res.headers


def test_callback_never_redirects_off_host(client):
    _, token = devices.enroll("laptop", ["*"])
    res, _ = sign_in(client, token, "https://finance.home.arpa/")
    query = parse_qs(urlsplit(res.headers["location"]).query)
    res = client.get("/__auth/callback", params={"code": query["code"][0], "next": "//evil.example/"},
                     headers={"x-forwarded-host": "finance.home.arpa"})
    assert res.headers["location"] == "/"


def test_bad_credentials_are_throttled(client):
    for _ in range(authsvc._FAIL_LIMIT):
        assert sign_in(client, "nova_x_wrong", "")[0].status_code == 401
    _, token = devices.enroll("laptop", ["*"])
    assert sign_in(client, token, "")[0].status_code == 429


def test_tampered_session_is_rejected(client):
    _, token = devices.enroll("laptop", ["*"])
    res, _ = sign_in(client, token, "https://finance.home.arpa/")
    _, session = follow_callback(client, res.headers["location"])
    payload, mac = session.split(".")
    forged = authsvc._b64(authsvc._unb64(payload).replace(b"laptop", b"admin1")) + "." + mac
    res = client.get("/verify?app=finance", headers=app_headers("finance.home.arpa"), cookies={authsvc.APP_COOKIE: forged})
    assert res.status_code == 401


def test_requires_a_real_secret(monkeypatch):
    monkeypatch.setenv("AUTH_SECRET", "short")
    authsvc.settings.cache_clear()
    with pytest.raises(RuntimeError):
        authsvc.settings()
    authsvc.settings.cache_clear()


def test_reads_registry_through_a_read_only_mount(nova_env, monkeypatch):
    _, token = devices.enroll("phone", ["*"])
    auth_dir = nova_env / "auth"
    db = auth_dir / "devices.db"
    assert not (auth_dir / "devices.db-wal").exists()

    os.chmod(db, stat.S_IRUSR)
    os.chmod(auth_dir, stat.S_IRUSR | stat.S_IXUSR)
    monkeypatch.setenv("NOVA_DEVICES_READONLY", "1")
    try:
        assert devices.verify(token).id == "phone"
        assert devices.get_active("phone").id == "phone"
    finally:
        os.chmod(auth_dir, stat.S_IRWXU)
        os.chmod(db, stat.S_IRUSR | stat.S_IWUSR)


def test_existing_registry_moves_to_auth_dir(nova_env):
    old = nova_env / "devices.db"
    conn = sqlite3.connect(old)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(
        "CREATE TABLE devices (id TEXT PRIMARY KEY, name TEXT NOT NULL, scopes TEXT NOT NULL,"
        " secret_hash TEXT NOT NULL, legacy INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, revoked_at TEXT)"
    )
    conn.commit()
    conn.close()

    devices.enroll("phone", ["*"])
    assert not old.exists() and (nova_env / "auth" / "devices.db").exists()
    assert [d["id"] for d in devices.list_devices()] == ["phone"]
