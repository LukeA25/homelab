import asyncio
import json

import pytest
from fastapi.testclient import TestClient

from app import approvals, audit, config, devices, live, main, nova_config, sessions, worker_client
from app.devices import Device

PHONE = Device("phone", "Phone", ("*",))
OFFER = "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n"


class FakeSideband:
    def __init__(self):
        self.inbox: asyncio.Queue = asyncio.Queue()
        self.sent: list[dict] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def __aiter__(self):
        return self

    async def __anext__(self):
        item = await self.inbox.get()
        if item is None:
            raise StopAsyncIteration
        return json.dumps(item)

    async def send(self, raw):
        msg = json.loads(raw)
        self.sent.append(msg)
        if msg["type"] == "session.close":
            await self.inbox.put({"type": "session.closed"})

    def push(self, *events):
        for e in events:
            self.inbox.put_nowait(e)

    def sent_types(self):
        return [m["type"] for m in self.sent]


@pytest.fixture
def fake(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    config.settings.cache_clear()
    monkeypatch.setattr(live, "TURN_GAP_S", 0.05)
    monkeypatch.setattr(live, "TICK_S", 0.01)
    ws = FakeSideband()
    created = {}

    async def create_remote(payload):
        created["payload"] = payload
        return {"session": {"id": "live_123"}, "transport": {"sdp": "v=0 answer"}}

    monkeypatch.setattr(live, "_create_remote", create_remote)
    monkeypatch.setattr(live, "_connect", lambda live_id: ws)
    ws.created = created
    return ws


async def _settle(cond, timeout=2.0):
    for _ in range(int(timeout / 0.01)):
        if cond():
            return
        await asyncio.sleep(0.01)
    raise AssertionError("condition not reached")


def test_start_sends_bootstrap_and_scoped_tools(fake):
    async def run():
        out = await live.start(PHONE, OFFER)
        payload = fake.created["payload"]["session"]
        assert payload["model"] == "gpt-live-1"
        assert payload["audio"]["output"]["voice"] == nova_config.load()["voice"]
        backend = payload["delegation"]["responses"]
        assert backend["model"] == "gpt-6-luna" and backend["parallel_tool_calls"] is False
        assert "approval_required" in backend["instructions"]
        assert {t["name"] for t in backend["tools"]} >= {"search_memory", "get_rooms"}
        assert out["sdp"] == "v=0 answer" and out["conversation_id"].startswith("conv_")
        await live.end(out["conversation_id"], PHONE)
        return out["conversation_id"]

    conv = asyncio.run(run())
    assert sessions.get(conv)["end_reason"] == "user_ended"


def test_scoped_device_gets_only_its_tools(fake):
    ipad = Device("ipad", "iPad", ("nova.voice", "nova.memory"))

    async def run():
        out = await live.start(ipad, OFFER)
        await live.end(out["conversation_id"], ipad)

    asyncio.run(run())
    names = {t["name"] for t in fake.created["payload"]["session"]["delegation"]["responses"]["tools"]}
    assert "search_memory" in names and "set_room_lights" not in names


def test_transcript_tools_usage_and_close(fake):
    async def run():
        out = await live.start(PHONE, OFFER)
        conv = out["conversation_id"]
        fake.push(
            {"event_id": "e1", "type": "session.input_transcript.delta", "delta": "what can "},
            {"event_id": "e2", "type": "session.input_transcript.delta", "delta": "you change?"},
            {"event_id": "e2", "type": "session.input_transcript.delta", "delta": "you change?"},  # replayed
            {"event_id": "e3", "type": "response.event", "event": {
                "type": "response.output_item.done",
                "item": {"type": "function_call", "call_id": "c1", "name": "get_settings", "arguments": "{}"},
            }},
        )
        await _settle(lambda: "response.create" in fake.sent_types())
        fake.push(
            {"event_id": "e4", "type": "response.event", "event": {
                "type": "response.done", "response": {"usage": {"input_tokens": 2000, "output_tokens": 100,
                                                                 "input_tokens_details": {"cached_tokens": 500}}},
            }},
            {"event_id": "e5", "type": "session.output_transcript.delta", "delta": "I can change your voice."},
            {"event_id": "e6", "type": "session.usage.updated", "context_window": {"usage_ratio": 0.01},
             "usage": {"seconds": 90, "active_seconds": 60, "paused_seconds": 30}},
            {"event_id": "e7", "type": "session.closed"},
        )
        await _settle(lambda: conv not in live._ACTIVE)
        return conv

    conv = asyncio.run(run())
    output = next(m for m in fake.sent if m["type"] == "response.item.create")
    assert output["item"]["call_id"] == "c1"
    assert json.loads(output["item"]["output"])["ok"] is True
    turns = sessions.turns(conv)
    assert [(t["role"], t["text"]) for t in turns if t["role"] != "tool"] == [
        ("user", "what can you change?"), ("assistant", "I can change your voice."),
    ]
    assert any(t["tool"] == "get_settings" and t["ok"] == 1 for t in turns)
    row = sessions.get(conv)
    assert (row["seconds"], row["active_seconds"], row["paused_seconds"]) == (90, 60, 30)
    assert (row["backend_input"], row["backend_cached"], row["backend_output"]) == (2000, 500, 100)
    assert row["end_reason"] == "closed" and row["memory_status"] == "pending"


def test_spoken_yes_settles_approval_once(fake, monkeypatch):
    submitted = []

    async def submit_change(job_id, prompt):
        submitted.append(prompt)
        return {"id": job_id, "status": "queued"}

    monkeypatch.setattr(worker_client, "submit_change", submit_change)

    async def run():
        out = await live.start(PHONE, OFFER)
        conv = out["conversation_id"]
        fake.push({"type": "response.event", "event": {
            "type": "response.output_item.done",
            "item": {"type": "function_call", "call_id": "c1", "name": "propose_cursor_edit",
                     "arguments": json.dumps({"prompt": "add a clock"})},
        }})
        await _settle(lambda: approvals.pending_for(PHONE.id, conv) is not None)
        assert submitted == []
        fake.push({"type": "session.output_transcript.delta", "delta": "Send add a clock to the agent?"},
                  {"type": "session.input_transcript.delta", "delta": "yes"})
        await _settle(lambda: submitted)
        await _settle(lambda: any(m["type"] == "session.commentary.append" for m in fake.sent))
        await live.end(conv, PHONE)

    asyncio.run(run())
    assert submitted == ["add a clock"]
    note = next(m for m in fake.sent if m["type"] == "session.commentary.append")
    assert "approved" in note["content"]


def test_idle_session_is_closed(fake, monkeypatch):
    monkeypatch.setenv("LIVE_IDLE_END_SECONDS", "0")
    config.settings.cache_clear()

    async def run():
        out = await live.start(PHONE, OFFER)
        await _settle(lambda: out["conversation_id"] not in live._ACTIVE)
        return out["conversation_id"]

    conv = asyncio.run(run())
    assert "session.close" in fake.sent_types()
    row = sessions.get(conv)
    assert row["end_reason"] == "idle"
    assert row["seconds"] == row["active_seconds"]  # no usage report: wall clock billed as active


def test_over_budget_refuses_new_sessions(fake, monkeypatch):
    monkeypatch.setenv("VOICE_BUDGET_LIMIT_USD", "0.01")
    config.settings.cache_clear()
    s = sessions.create("live", "phone")
    sessions.set_usage(s, 60, 60, 0)
    with pytest.raises(live.LiveError) as exc:
        asyncio.run(live.start(PHONE, OFFER))
    assert exc.value.status == 402
    assert "payload" not in fake.created


def test_live_endpoints_require_voice_scope(fake):
    _, scoped = devices.enroll("tv", ["theology.*"])
    _, phone = devices.enroll("phone", ["*"])
    with TestClient(main.app) as c:
        assert c.post("/api/live/start", json={"sdp": OFFER}).status_code == 401
        assert c.post("/api/live/start", json={"sdp": OFFER}, headers={"X-Assistant-Token": scoped}).status_code == 403
        assert c.post("/api/live/start", json={"sdp": "nonsense-sdp"}, headers={"X-Assistant-Token": phone}).status_code == 422
        r = c.get("/api/usage", headers={"X-Assistant-Token": phone})
        assert r.status_code == 200 and r.json()["budget"]["limit_usd"] == 40
