"""End-to-end turns with a scripted model: tools go through dispatch, approvals need the user's own yes."""

import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import audit, devices, ha, main, openai_client, tools


def call(name, args, call_id="c1"):
    return SimpleNamespace(type="function_call", name=name, arguments=json.dumps(args), call_id=call_id)


def reply(text):
    return SimpleNamespace(output=[], output_text=text)


def tool_turn(*calls):
    return SimpleNamespace(output=list(calls), output_text="")


@pytest.fixture
def model(monkeypatch):
    script = []
    seen = {"instructions": [], "tools": []}

    async def respond(*, instructions, input_list, tools):
        seen["instructions"].append(instructions)
        seen["tools"].append({t["name"] for t in tools})
        return script.pop(0)

    async def synthesize(text):
        return b"mp3"

    monkeypatch.setattr(openai_client, "respond", respond)
    monkeypatch.setattr(openai_client, "synthesize", synthesize)
    return script, seen


@pytest.fixture
def client():
    with TestClient(main.app) as c:
        yield c


def turn(client, token, text, session="s1"):
    r = client.post(
        "/api/turn/text", json={"text": text, "session_id": session}, headers={"X-Assistant-Token": token}
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_spoken_approval_flow_dispatches_only_after_yes(client, model, monkeypatch):
    script, seen = model
    submitted = []

    async def handler(args, ctx):
        submitted.append((args["prompt"], ctx.approval_id))
        return {"id": ctx.approval_id, "status": "queued"}

    monkeypatch.setitem(tools.HANDLERS, "propose_cursor_edit", handler)
    _, token = devices.enroll("phone", ["*"])

    script += [tool_turn(call("propose_cursor_edit", {"prompt": "add a clock"})), reply("Send 'add a clock' to Cursor?")]
    first = turn(client, token, "send add a clock to cursor")
    assert first["cursor_proposal"]["status"] == "pending"
    assert submitted == []

    # Model can't approve: even if it calls the tool again, it only creates a new pending approval.
    script += [reply("Done, it's running.")]
    second = turn(client, token, "yes")
    assert submitted == [("add a clock", first["cursor_proposal"]["id"])]
    assert "The user approved" in seen["instructions"][-1]
    assert second["reply"] == "Done, it's running."


def test_out_of_scope_device_sees_and_runs_only_its_tools(client, model, monkeypatch):
    script, seen = model
    called = []

    async def set_room(room_id, payload):
        called.append(room_id)
        return {"ok": True}

    monkeypatch.setattr(ha, "set_room", set_room)
    _, ipad = devices.enroll("ipad", ["nova.voice", "theology.*"])

    # The model tries a tool it was never offered.
    script += [tool_turn(call("set_room_lights", {"room_id": "bedroom", "on": False})), reply("I can't do that here.")]
    turn(client, ipad, "turn off the bedroom lights")
    assert "set_room_lights" not in seen["tools"][0]
    assert called == []
    denied = [r for r in audit.read_recent() if r["kind"] == "tool_denied"]
    assert denied[-1]["device_id"] == "ipad" and denied[-1]["decision"] == "out_of_scope"


def _fake_lights(monkeypatch):
    changed = []

    async def rooms():
        return [{"id": "bedroom", "on": False}]

    async def set_room(room_id, payload):
        changed.append((room_id, payload))
        return {"ok": True}

    monkeypatch.setattr(ha, "get_rooms", rooms)
    monkeypatch.setattr(ha, "set_room", set_room)
    return changed


def test_light_status_question_never_changes_lights(client, model, monkeypatch):
    script, seen = model
    changed = _fake_lights(monkeypatch)
    _, phone = devices.enroll("phone", ["*"])

    script += [tool_turn(call("get_rooms", {})), reply("All the lights are off.")]
    out = turn(client, phone, "Which lights are on right now?")
    assert out["reply"] == "All the lights are off."
    assert changed == [] and script == []


def test_unbacked_light_claim_is_nudged_once(client, model, monkeypatch):
    script, seen = model
    changed = _fake_lights(monkeypatch)
    _, phone = devices.enroll("phone", ["*"])

    script += [
        reply("Done."),
        tool_turn(call("set_room_lights", {"room_id": "bedroom", "on": False})),
        reply("Done."),
    ]
    turn(client, phone, "turn off the bedroom lights")
    assert changed == [("bedroom", {"on": False})]


def test_http_actions_are_audited_with_device(client, monkeypatch):
    async def apply_scene(scene):
        return {"scene": scene}

    monkeypatch.setattr(ha, "apply_scene", apply_scene)
    _, phone = devices.enroll("phone", ["*"])
    r = client.post("/api/scenes/study", headers={"X-Assistant-Token": phone, "X-Request-Id": "req-123"})
    assert r.status_code == 200 and r.headers["X-Request-Id"] == "req-123"
    rec = audit.read_recent()[-1]
    assert rec["kind"] == "http_apply_scene" and rec["device_id"] == "phone" and rec["request_id"] == "req-123"
