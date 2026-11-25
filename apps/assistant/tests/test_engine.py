import asyncio
import json

import pytest

from app import context_files, engine, nova_config, observations, sessions, store


def _finished_session(text="I want to start running on Saturdays"):
    s = sessions.create("live", "phone")
    sessions.add_turn(s, "user", text)
    sessions.add_turn(s, "assistant", "Saturday runs, got it.")
    sessions.end(s, "idle")
    return s


def test_memory_pass_records_observations_and_rewrites_model(monkeypatch):
    context_files.ensure_seeded()
    persona_before = context_files.read("persona")
    s = _finished_session()
    seen = {}

    async def call_model(text):
        seen["input"] = text
        return {
            "summary": "Talked about starting Saturday runs.",
            "observations": [{"kind": "statement", "text": "Wants to run on Saturdays.", "topics": ["fitness"],
                              "evidence": "user said so"}],
            "user_model": "# User model\n\n## Summary\n\nStarting a Saturday running habit (new).",
        }

    monkeypatch.setattr(engine, "call_model", call_model)
    assert asyncio.run(engine.run_once()) is True
    assert "running on Saturdays" in seen["input"]

    row = sessions.get(s)
    assert row["memory_status"] == "done" and row["summary"].startswith("Talked about")
    obs = observations.recent()
    assert obs[-1]["kind"] == "statement" and obs[-1]["source"]["session"] == s
    assert "Saturday running habit" in context_files.read("user_model")
    assert context_files.read("persona") == persona_before

    changes = [json.loads(l) for l in store.path("logs", "state-changes.jsonl").read_text().splitlines()]
    model_change = [c for c in changes if c["store"] == "user_model"][-1]
    assert model_change["explicit_instruction"] is False
    assert asyncio.run(engine.run_once()) is False


def test_failed_pass_is_retried_and_changes_nothing(monkeypatch):
    s = _finished_session()

    async def broken(text):
        raise RuntimeError("model unavailable")

    monkeypatch.setattr(engine, "call_model", broken)
    asyncio.run(engine.run_once())
    row = sessions.get(s)
    assert row["memory_status"] == "pending" and "unavailable" in row["memory_error"]
    assert observations.recent() == []


def test_oversized_model_rewrite_fails_the_pass(monkeypatch):
    s = _finished_session()

    async def call_model(text):
        return {"summary": "x", "observations": [], "user_model": "# User model\n" + "a" * 20000}

    monkeypatch.setattr(engine, "call_model", call_model)
    asyncio.run(engine.run_once())
    assert sessions.get(s)["memory_status"] == "pending"


def test_settings_are_validated_and_audited():
    assert nova_config.load()["daily_planner_time"] == "08:00"
    out = nova_config.update("daily_planner_time", "07:30", reason="user asked", evidence="plan at 7:30")
    assert out["changed"] and nova_config.load()["daily_planner_time"] == "07:30"
    with pytest.raises(ValueError):
        nova_config.update("daily_planner_time", "7.30pm", reason="x", evidence=None)
    with pytest.raises(ValueError):
        nova_config.update("budget_limit_usd", "1000", reason="x", evidence=None)
    with pytest.raises(ValueError):
        nova_config.update("voice", "robot", reason="x", evidence=None)


def test_observation_kinds_are_enforced():
    with pytest.raises(ValueError):
        observations.add("x", kind="fact", source={})
    with pytest.raises(ValueError):
        observations.add("   ", kind="statement", source={})
