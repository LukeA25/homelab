import pytest
from fastapi.testclient import TestClient

from app import context_files, devices, ha, main


@pytest.fixture
def client(monkeypatch):
    async def rooms():
        return [{"id": "bedroom", "on": True}]

    monkeypatch.setattr(ha, "get_rooms", rooms)
    with TestClient(main.app) as c:
        yield c


def test_unauthenticated_requests_are_rejected(client):
    assert client.get("/api/rooms").status_code == 401
    assert client.post("/api/turn/text", json={"text": "hi"}).status_code == 401
    assert client.get("/api/rooms", headers={"X-Assistant-Token": "dev-token-change-me"}).status_code == 401


def test_query_string_token_is_not_accepted(client):
    _, token = devices.enroll("phone", ["*"])
    assert client.get(f"/api/rooms?token={token}").status_code == 401


def test_scoped_device_gets_403_outside_scope(client):
    _, ipad = devices.enroll("ipad", ["nova.voice", "theology.*"])
    _, phone = devices.enroll("phone", ["*"])
    assert client.get("/api/rooms", headers={"X-Assistant-Token": ipad}).status_code == 403
    assert client.post("/api/scenes/sleep", headers={"Authorization": f"Bearer {ipad}"}).status_code == 403
    r = client.get("/api/rooms", headers={"X-Assistant-Token": phone})
    assert r.status_code == 200 and r.json()["rooms"][0]["id"] == "bedroom"


def test_revoked_device_rejected(client):
    _, token = devices.enroll("phone", ["*"])
    devices.revoke("phone")
    assert client.get("/api/devices/me", headers={"X-Assistant-Token": token}).status_code == 401


def test_ws_ticket_is_single_use(client):
    _, token = devices.enroll("phone", ["*"])
    ticket = client.post("/api/ws-ticket", headers={"X-Assistant-Token": token}).json()["ticket"]
    with client.websocket_connect(f"/ws/voice?ticket={ticket}") as ws:
        ws.send_json({"type": "ping"})
        assert ws.receive_json() == {"type": "pong"}
    with pytest.raises(Exception):
        with client.websocket_connect(f"/ws/voice?ticket={ticket}") as ws:
            ws.send_json({"type": "ping"})
            ws.receive_json()


def test_startup_seeds_context(client):
    assert "Nova persona" in context_files.read("persona")
    assert "4500K" in context_files.read("profile")


def test_health_warns_about_legacy_token(monkeypatch, tmp_path):
    monkeypatch.setenv("ASSISTANT_DEVICE_TOKEN", "some-old-shared-token")
    from app.config import settings

    settings.cache_clear()
    with TestClient(main.app) as c:
        body = c.get("/api/health").json()
        assert body["legacy_token_active"] and body["warnings"]
        assert c.get("/api/devices/me", headers={"X-Assistant-Token": "some-old-shared-token"}).json()["id"] == "legacy-shared"


def test_ui_cannot_confirm_without_worker_change_scope(client):
    from app import approvals

    _, phone = devices.enroll("phone", ["*"])
    _, viewer = devices.enroll("viewer", ["nova.voice", "worker.status"])
    row = approvals.create(
        capability="propose_cursor_edit", args={"prompt": "x"}, read_back="x",
        device_id="phone", session_id=None, request_id=None, ttl_seconds=60,
    )
    r = client.post(f"/api/cursor/proposals/{row['id']}/confirm", headers={"X-Assistant-Token": viewer})
    assert r.status_code == 403
    listed = client.get("/api/cursor/proposals", headers={"X-Assistant-Token": viewer}).json()["proposals"]
    assert listed[-1]["status"] == "pending"
