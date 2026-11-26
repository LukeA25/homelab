from fastapi.testclient import TestClient

from app import devices, monitoring
from app.main import app


def test_kuma_scope_and_debounce(monkeypatch):
    client = TestClient(app)
    _, token = devices.enroll("kuma", ["events.kuma"])
    headers = {"Authorization": f"Bearer {token}"}
    now = 1800000000
    monkeypatch.setattr(monitoring.time, "time", lambda: now)

    def post(status, stamp, auth=headers):
        return client.post("/api/events/kuma", headers=auth,
                           json={"heartbeat": {"status": status, "monitorID": 1, "time": stamp}})

    assert post(0, now, {}).status_code == 401
    _, viewer = devices.enroll("viewer", ["worker.status"])
    assert post(0, now, {"Authorization": f"Bearer {viewer}"}).status_code == 403
    assert post(0, now).json()["status"] == "accepted"
    assert post(0, now).json()["status"] == "ignored"
    now += 30
    assert post(1, now).json()["status"] == "accepted"
    assert post(0, now - 1).json()["status"] == "ignored"
    now += 59
    monitoring.settle()
    assert not monitoring.diagnostics()["recent_events"]
    now += 1
    monitoring.settle()
    monitoring.settle()
    assert [e["state"] for e in monitoring.diagnostics()["recent_events"]] == ["up"]
