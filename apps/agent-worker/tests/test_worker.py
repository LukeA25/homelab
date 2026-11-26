import importlib
import threading

import pytest
from fastapi.testclient import TestClient

AUTH = {"Authorization": "Bearer worker-secret"}


@pytest.fixture
def worker(tmp_path, monkeypatch):
    monkeypatch.setenv("WORKER_DATA", str(tmp_path))
    monkeypatch.setenv("WORKER_TOKEN", "worker-secret")
    from app import jobs, main

    jobs = importlib.reload(jobs)
    main = importlib.reload(main)
    gate = threading.Event()
    calls = []

    def fake_agent(job_id, prompt, kind):
        calls.append((prompt, kind))
        if prompt == "slow":
            gate.wait(5)
        return f"answer to {prompt}"

    monkeypatch.setattr(jobs, "_agent", fake_agent)
    with TestClient(main.app) as client:
        yield jobs, client, gate, calls
    gate.set()


def test_requires_token(worker):
    _, client, _, _ = worker
    assert client.post("/jobs", json={"prompt": "x"}).status_code == 401


def test_query_returns_answer(worker):
    _, client, _, calls = worker
    r = client.post("/query", json={"prompt": "what runs on 8006?", "timeout_s": 5}, headers=AUTH).json()
    assert r["status"] == "done" and r["result"] == "answer to what runs on 8006?"
    assert calls == [("what runs on 8006?", "query")]


def test_query_timeout_keeps_job(worker):
    _, client, gate, _ = worker
    r = client.post("/query", json={"prompt": "slow", "timeout_s": 1}, headers=AUTH).json()
    assert r["status"] == "timeout"
    gate.set()


def test_resubmitting_same_job_id_does_not_rerun(worker):
    jobs, client, _, calls = worker
    first = client.post("/jobs", json={"id": "abc", "prompt": "edit", "kind": "change"}, headers=AUTH).json()
    jobs.wait("abc", 5)
    second = client.post("/jobs", json={"id": "abc", "prompt": "edit", "kind": "change"}, headers=AUTH).json()
    assert first["id"] == second["id"] == "abc"
    assert calls == [("edit", "change")]


def test_restart_marks_interrupted_jobs_as_errors(worker):
    jobs, _, _, _ = worker
    with jobs._lock:
        jobs._jobs["x"] = {"id": "x", "kind": "change", "prompt": "p", "status": "running", "created_at": 0,
                           "finished_at": None, "result": None, "error": None, "progress": []}
        jobs._save_locked()
    jobs.load()
    assert jobs.get("x")["status"] == "error" and "unknown" in jobs.get("x")["error"]


def test_change_returns_protected_operation_continuation(worker, monkeypatch):
    jobs, client, _, _ = worker
    monkeypatch.setattr(jobs, "_agent", lambda *_: "Waiting for approval.\nOPS_REQUEST_ID=012345abcdef")
    client.post("/jobs", json={"id": "pending", "prompt": "deploy", "kind": "change"}, headers=AUTH)
    job = jobs.wait("pending", 5)
    assert job["status"] == "approval_required"
    assert job["request_id"] == "012345abcdef"
