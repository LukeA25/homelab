import time

from app import config, sessions


def test_classic_turns_group_into_one_session_until_idle(monkeypatch):
    a = sessions.classic_session("phone", "tab1")
    sessions.add_turn(a, "user", "turn on the lights")
    assert sessions.classic_session("phone", "tab1") == a
    assert sessions.classic_session("phone", "tab2") != a

    monkeypatch.setattr(sessions, "CLASSIC_IDLE_S", 0)
    b = sessions.classic_session("phone", "tab1")
    assert b != a
    old = sessions.get(a)
    assert old["end_reason"] == "idle" and old["memory_status"] == "pending"


def test_session_without_user_speech_skips_memory_pass():
    s = sessions.create("live", "phone")
    sessions.add_turn(s, "assistant", "Hi there")
    sessions.end(s, "idle")
    assert sessions.get(s)["memory_status"] == "skipped"
    assert sessions.end(s, "again") is False


def test_usage_is_cumulative_and_priced():
    s = sessions.create("live", "phone")
    sessions.set_usage(s, 120, 60, 60)
    sessions.set_usage(s, 180, 120, 60)  # latest totals replace, never add
    sessions.add_backend_tokens(s, 1_000_000, 0, 0)
    row = sessions.get(s)
    # 2 min active at $0.05 + 1 min standby at $0.02 + 1M input tokens at $0.10
    assert row["cost_usd"] == 0.22


def test_budget_warns_then_blocks(monkeypatch):
    monkeypatch.setenv("VOICE_BUDGET_WARN_USD", "1")
    monkeypatch.setenv("VOICE_BUDGET_LIMIT_USD", "2")
    config.settings.cache_clear()
    s = sessions.create("live", "phone")
    sessions.set_usage(s, 1500, 30 * 60 - 600, 0)  # 20 min active = $1.00
    b = sessions.budget()
    assert b["warning"] and not b["blocked"]
    sessions.set_usage(s, 2400, 40 * 60, 0)
    assert sessions.budget()["blocked"]


def test_previous_month_does_not_count():
    s = sessions.create("live", "phone")
    sessions.set_usage(s, 6000, 6000, 0)
    with sessions._conn() as conn:
        conn.execute("UPDATE sessions SET started_at = ? WHERE id = ?", (sessions.month_start() - 3600, s))
    assert sessions.month_cost() == 0


def test_search_finds_turns_and_summaries():
    s = sessions.create("classic", "phone")
    sessions.add_turn(s, "user", "I want to practice guitar scales every evening")
    sessions.end(s, "idle")
    sessions.finish_memory(s, "Planned evening guitar practice.")
    kinds = {h["kind"] for h in sessions.search("guitar")}
    assert {"turn:user", "summary"} <= kinds
    assert sessions.search("!!") == []


def test_memory_queue_claims_once_and_backs_off():
    s = sessions.create("classic", "phone")
    sessions.add_turn(s, "user", "hello")
    sessions.end(s, "idle")
    job = sessions.claim_memory_job()
    assert job["id"] == s
    assert sessions.claim_memory_job() is None
    assert sessions.fail_memory(s, "boom") == "pending"
    assert sessions.claim_memory_job() is None  # backing off
    assert sessions.claim_memory_job(now=time.time() + 10_000)["id"] == s
    for _ in range(sessions.MEMORY_MAX_ATTEMPTS):
        sessions.fail_memory(s, "boom")
        sessions.claim_memory_job(now=time.time() + 10_000_000)
    assert sessions.get(s)["memory_status"] in ("failed", "running")


def test_stale_running_and_open_live_sessions_recover():
    s = sessions.create("live", "phone")
    sessions.add_turn(s, "user", "hi")
    assert sessions.recover_open_live() == 1
    assert sessions.get(s)["end_reason"] == "gateway_restart"
    sessions.claim_memory_job()
    assert sessions.requeue_stale_running() == 1
    assert sessions.get(s)["memory_status"] == "pending"
