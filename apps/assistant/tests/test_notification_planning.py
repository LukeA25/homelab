from contextlib import closing
from datetime import datetime, timezone
import time

from fastapi.testclient import TestClient
import pytest

from app import devices, memory_seed, notifications, observations, store
from app.main import app


@pytest.mark.asyncio
async def test_queue_waits_for_fresh_off_and_rechecks(monkeypatch):
    now = time.time()
    with closing(store.connect("events.db")) as db:
        for key in ("a", "b"):
            notifications.record_homework(db, {"id": key, "local_day": "today", "expires": now + 3600}, 1, now)
    calls = []

    async def completed(day, zone):
        calls.append(day)
        return 0

    monkeypatch.setenv("NOTIFY_TOKEN", "test")
    await notifications.release(completed, timezone.utc)
    assert calls == []
    client = TestClient(app)
    _, token = devices.enroll("phone", ["notifications.dnd", "notifications.read", "events.location"])
    auth = {"Authorization": f"Bearer {token}"}
    stamp = datetime.now(timezone.utc).isoformat()
    assert client.put("/api/dnd", json={"enabled": False, "observed_at": stamp}, headers=auth).json()["state"] == "off"
    await notifications.release(completed, timezone.utc)
    assert calls == ["today"]
    assert {r["status"] for r in client.get("/api/notifications", headers=auth).json()} == {"cancelled", "superseded"}
    place = {"place": "gym", "transition": "arrive", "observed_at": stamp}
    assert client.post("/api/events/location", headers=auth, json=place).json()["status"] == "recorded"
    assert client.post("/api/events/location", headers=auth, json=place).json()["status"] == "ignored"


def test_seed_requires_reviewed_user_excerpt_and_deduplicates():
    export = [{"id": "c", "mapping": {"n": {"message": {"author": {"role": "user"}, "id": "m",
               "content": {"parts": ["I play guitar."]}}}}}]
    review = [{"conversation_id": "c", "message_id": "m", "excerpt": "I play guitar."}]
    assert memory_seed.apply(export, review) == 1
    assert memory_seed.apply(export, review) == 0
    assert observations.recent()[0]["source"]["message_id"] == "m"
    with pytest.raises(ValueError):
        memory_seed.apply(export, [{**review[0], "excerpt": "I play violin."}])


@pytest.mark.asyncio
async def test_push_handoff_once(monkeypatch):
    import httpx

    now = time.time()
    with closing(store.connect("events.db")) as db:
        notifications.record_homework(db, {"id": "abc", "local_day": "today", "expires": now + 60}, 1, now)
        db.execute("INSERT INTO focus VALUES (1,0,?)", (now,))
    calls = []

    def handoff(request):
        calls.append(request)
        return httpx.Response(200, json={"delivered": 1, "failed": 0, "removed": 0})

    client_type = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: client_type(transport=httpx.MockTransport(handoff), **kw))
    monkeypatch.setenv("NOTIFY_TOKEN", "test")

    async def incomplete(day, zone):
        return 1

    await notifications.release(incomplete, timezone.utc)
    await notifications.release(incomplete, timezone.utc)
    assert len(calls) == 1 and calls[0].url.path == "/api/send"
    with closing(store.connect("events.db")) as db:
        assert db.execute("SELECT status,accepted FROM notifications").fetchone()[:] == ("submitted", 1)
