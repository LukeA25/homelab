import asyncio

import pytest

from app import approvals, dispatch, pipeline, tools
from app.devices import Device
from app.tools import CallContext

PHONE = Device("phone", "Phone", ("*",))
OTHER = Device("other", "Other", ("*",))


@pytest.mark.parametrize(
    "text,expected",
    [
        ("yes", "yes"),
        ("Yes, send it.", "yes"),
        ("go ahead", "yes"),
        ("okay do it", "yes"),
        ("no", "no"),
        ("yes but wait", "no"),
        ("don't do that", "no"),
        ("not yet", "no"),
        ("what's the weather", "other"),
        ("yes and also turn off every light in the house and lock up for the night", "other"),
        ("", "other"),
    ],
)
def test_classify(text, expected):
    assert approvals.classify(text) == expected


@pytest.fixture
def ran(monkeypatch):
    seen = []

    async def handler(args, ctx):
        seen.append(ctx.approval_id)
        return {"job": "started"}

    monkeypatch.setitem(tools.HANDLERS, "propose_cursor_edit", handler)
    return seen


def _request(device=PHONE, session="s1"):
    ctx = CallContext(device=device, session_id=session, request_id="r1")
    return asyncio.run(dispatch.call("propose_cursor_edit", {"prompt": "rename a variable"}, ctx))


def settle(text, device=PHONE, session="s1"):
    return asyncio.run(pipeline.settle_pending_approval(text, device, session, "r2"))


def test_spoken_yes_from_same_conversation_runs_it(ran):
    out = _request()
    note = settle("yes please do")
    assert ran == [out["approval_id"]]
    assert "approved" in note


def test_yes_from_another_device_or_session_does_not_approve(ran):
    _request()
    assert settle("yes", device=OTHER) is None
    assert settle("yes", session="s2") is None
    assert ran == []


def test_unrelated_reply_cancels_the_request(ran):
    out = _request()
    note = settle("actually what time is it")
    assert ran == [] and "cancelled" in note
    assert approvals.get(out["approval_id"])["status"] == "expired"
    assert settle("yes") is None and ran == []


def test_newer_request_supersedes_older(ran):
    first = _request()
    second = _request()
    assert approvals.get(first["approval_id"])["status"] == "expired"
    settle("yes")
    assert ran == [second["approval_id"]]
