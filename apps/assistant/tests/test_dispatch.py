import asyncio

import pytest

from app import approvals, audit, dispatch, tools
from app.devices import Device
from app.tools import CallContext

PHONE = Device("phone", "Phone", ("*",))
IPAD = Device("ipad", "iPad", ("nova.voice", "theology.*"))


def run(coro):
    return asyncio.run(coro)


@pytest.fixture
def calls(monkeypatch):
    seen = []

    def fake(name):
        async def handler(args, ctx):
            seen.append((name, args, ctx.approval_id))
            return {"done": name}

        return handler

    for name in list(tools.HANDLERS):
        monkeypatch.setitem(tools.HANDLERS, name, fake(name))
    return seen


def ctx(device, session="s1", text=None):
    return CallContext(device=device, session_id=session, request_id="r1", user_text=text)


def test_out_of_scope_call_is_denied_and_audited(calls):
    out = run(dispatch.call("get_finance_summary", {}, ctx(IPAD)))
    assert out["ok"] is False and "not permitted" in out["error"]
    assert calls == []
    assert audit.read_recent()[-1]["decision"] == "out_of_scope"


def test_unknown_tool_denied(calls):
    out = run(dispatch.call("transfer_money", {"amount": 5}, ctx(PHONE)))
    assert out["ok"] is False and calls == []


def test_automatic_call_runs_and_is_audited(calls):
    out = run(dispatch.call("set_room_lights", {"room_id": "bedroom", "on": False}, ctx(PHONE)))
    assert out == {"ok": True, "result": {"done": "set_room_lights"}}
    rec = audit.read_recent()[-1]
    assert rec["kind"] == "tool_call" and rec["ok"] is True
    assert rec["tool"] == "set_room_lights" and rec["args"] == {"room_id": "bedroom", "on": False}


def test_approval_capability_does_not_run_until_approved(calls):
    out = run(dispatch.call("propose_cursor_edit", {"prompt": "fix the TV clock"}, ctx(PHONE)))
    assert out["status"] == "approval_required"
    assert "fix the TV clock" in out["read_back"]
    assert calls == []

    result = run(dispatch.resolve_and_run(out["approval_id"], "yes", "voice", ctx(PHONE, text="yes")))
    assert result["status"] == "executed"
    assert calls == [("propose_cursor_edit", {"prompt": "fix the TV clock"}, out["approval_id"])]

    # Single use.
    again = run(dispatch.resolve_and_run(out["approval_id"], "yes", "voice", ctx(PHONE, text="yes")))
    assert again["status"] == "not_pending"
    assert len(calls) == 1


def test_declined_approval_never_runs(calls):
    out = run(dispatch.call("propose_cursor_edit", {"prompt": "x"}, ctx(PHONE)))
    result = run(dispatch.resolve_and_run(out["approval_id"], "no", "voice", ctx(PHONE, text="no")))
    assert result["status"] == "denied" and calls == []


def test_expired_approval_cannot_be_used(calls, monkeypatch):
    monkeypatch.setenv("APPROVAL_TTL_SECONDS", "-1")
    from app.config import settings

    settings.cache_clear()
    out = run(dispatch.call("propose_cursor_edit", {"prompt": "x"}, ctx(PHONE)))
    result = run(dispatch.resolve_and_run(out["approval_id"], "yes", "voice", ctx(PHONE)))
    assert result["status"] == "not_pending" and calls == []


def test_invalid_args_rejected_before_approval(calls):
    out = run(dispatch.call("propose_cursor_edit", {"prompt": "x", "auto_approve": True}, ctx(PHONE)))
    assert out["ok"] is False and approvals.recent() == []


def test_audit_redacts_secrets():
    audit.operation("test", args={"api_key": "sk-123", "nested": {"Authorization": "Bearer x"}, "ok": "fine"})
    rec = audit.read_recent()[-1]
    assert rec["args"]["api_key"] == "[redacted]"
    assert rec["args"]["nested"]["Authorization"] == "[redacted]"
    assert rec["args"]["ok"] == "fine"
