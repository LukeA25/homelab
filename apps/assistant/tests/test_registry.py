import re

import pytest

from app import registry
from app.devices import Device
from app.tools import HANDLERS


def test_every_capability_has_a_handler_and_vice_versa():
    caps = set(registry.load())
    assert caps == set(HANDLERS), f"drift: {caps ^ set(HANDLERS)}"


def test_finance_capabilities_are_read_only():
    for cap in registry.load().values():
        if cap.app == "finance" or cap.scope.startswith("finance."):
            assert cap.effect == "read", cap.name


def test_no_money_movement_capability_exists():
    pattern = re.compile(r"transfer|payment|\bpay\b|send money|withdraw|move money", re.I)
    for cap in registry.load().values():
        assert not pattern.search(f"{cap.name} {cap.description}"), cap.name


def test_change_requests_and_protected_ops_need_approval():
    caps = registry.load()
    assert caps["propose_cursor_edit"].policy == "approval"
    assert caps["approve_ops_request"].policy == "approval"


def test_tools_filtered_by_device_scope():
    ipad = Device("ipad", "iPad", ("nova.voice", "theology.*"))
    names = {c.name for c in registry.for_device(ipad)}
    assert not names & {"get_finance_summary", "set_room_lights", "apply_scene", "propose_cursor_edit"}

    phone = Device("phone", "Phone", ("*",))
    assert {c.name for c in registry.for_device(phone)} == set(registry.load())


def test_argument_validation():
    cap = registry.get("set_room_lights")
    registry.validate_args(cap, {"room_id": "bedroom", "on": True, "brightness_pct": 50})
    with pytest.raises(registry.ArgumentError):
        registry.validate_args(cap, {"room_id": "garage", "on": True})
    with pytest.raises(registry.ArgumentError):
        registry.validate_args(cap, {"room_id": "bedroom", "on": True, "brightness_pct": 0})
    with pytest.raises(registry.ArgumentError):
        registry.validate_args(cap, {"room_id": "bedroom", "on": "yes"})
    with pytest.raises(registry.ArgumentError):
        registry.validate_args(cap, {"room_id": "bedroom", "on": True, "extra": 1})


def test_summary_marks_approval_capabilities():
    text = registry.summary(registry.for_device(Device("p", "p", ("*",))))
    assert "propose_cursor_edit" in text and "needs the user's yes" in text
