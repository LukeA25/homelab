from app import audit, context_files, store


def test_rewrite_keeps_previous_version_and_audits():
    context_files.ensure_seeded()
    before = context_files.read("persona")
    out = context_files.rewrite("persona", "# Nova persona\n\nBe brief and warm.", reason="be warmer", evidence="be warmer from now on")
    assert out["ok"] and out["changed"]
    assert context_files.read("persona") == "# Nova persona\n\nBe brief and warm."

    versions = list(store.path("history", "context-versions", "persona", "x").parent.glob("*.md"))
    assert len(versions) == 1 and versions[0].read_text().strip() == before

    rec = audit.read_recent(audit.STATE_CHANGES)[-1]
    assert rec["store"] == "persona" and rec["explicit_instruction"] is True
    assert rec["evidence"] == "be warmer from now on" and "+Be brief and warm." in rec["diff"]


def test_rewrite_rejects_empty_and_oversized():
    assert not context_files.rewrite("persona", "  ", reason="r", evidence=None)["ok"]
    assert not context_files.rewrite("persona", "x" * 5000, reason="r", evidence=None)["ok"]


def test_unchanged_rewrite_is_a_no_op():
    context_files.rewrite("profile", "# Profile\n- likes tea", reason="r", evidence=None)
    assert context_files.rewrite("profile", "# Profile\n- likes tea", reason="r", evidence=None)["changed"] is False
