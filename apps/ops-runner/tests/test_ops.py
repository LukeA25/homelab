import importlib
import time

import pytest
from fastapi.testclient import TestClient

WORKER = {"Authorization": "Bearer worker-secret"}
GATEWAY = {"Authorization": "Bearer gateway-secret"}


@pytest.fixture
def ops(tmp_path, monkeypatch):
    for name in ("caddy", "assistant", "guitar-app", "ops-runner", "agent-worker"):
        (tmp_path / "repo" / "compose" / name).mkdir(parents=True)
        (tmp_path / "repo" / "compose" / name / "docker-compose.yaml").write_text("services: {}\n")
    monkeypatch.setenv("REPO_PATH", str(tmp_path / "repo"))
    monkeypatch.setenv("OPS_DATA", str(tmp_path / "data"))
    monkeypatch.setenv("OPS_WORKER_TOKEN", "worker-secret")
    monkeypatch.setenv("OPS_GATEWAY_TOKEN", "gateway-secret")
    monkeypatch.setenv("ROUTINE_STACKS", "guitar-app")
    from app import main

    main = importlib.reload(main)
    ran = []

    def fake_compose(stack, args, timeout):
        ran.append((stack, args))
        return {"ok": True, "exit_code": 0, "output": "", "duration_ms": 1}

    monkeypatch.setattr(main, "_compose", fake_compose)
    return main, TestClient(main.app), ran


def test_requires_token(ops):
    _, client, _ = ops
    assert client.get("/stacks").status_code == 401
    assert client.get("/stacks", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_stack_classes(ops):
    _, client, _ = ops
    classes = {s["name"]: s["class"] for s in client.get("/stacks", headers=WORKER).json()["stacks"]}
    assert classes == {
        "agent-worker": "manual", "assistant": "protected", "caddy": "protected",
        "guitar-app": "routine", "ops-runner": "manual",
    }


def test_routine_stack_runs_immediately(ops):
    _, client, ran = ops
    r = client.post("/stacks/guitar-app/rebuild", json={"reason": "new build"}, headers=WORKER)
    assert r.json()["status"] == "done"
    assert ran == [("guitar-app", ["docker", "compose", "up", "-d", "--build", "--remove-orphans"])]


def test_protected_stack_creates_request_and_worker_cannot_execute(ops):
    _, client, ran = ops
    r = client.post("/stacks/caddy/restart", json={"reason": "reload config"}, headers=WORKER)
    body = r.json()
    assert body["status"] == "approval_required" and ran == []

    # Duplicate asks reuse the pending request.
    again = client.post("/stacks/caddy/restart", json={"reason": "again"}, headers=WORKER).json()
    assert again["request_id"] == body["request_id"]

    denied = client.post(f"/requests/{body['request_id']}/execute", json={"approval_id": "a1"}, headers=WORKER)
    assert denied.status_code == 403 and ran == []


def test_gateway_executes_approved_request_once(ops):
    _, client, ran = ops
    rid = client.post("/stacks/assistant/rebuild", json={"reason": "deploy"}, headers=WORKER).json()["request_id"]
    r = client.post(f"/requests/{rid}/execute", json={"approval_id": "a1"}, headers=GATEWAY)
    assert r.status_code == 202
    for _ in range(50):
        if client.get(f"/requests/{rid}", headers=GATEWAY).json()["status"] == "done":
            break
        time.sleep(0.02)
    assert ran == [("assistant", ["docker", "compose", "up", "-d", "--build", "--remove-orphans"])]
    assert client.post(f"/requests/{rid}/execute", json={"approval_id": "a1"}, headers=GATEWAY).status_code == 409


def test_manual_only_stacks_refused_for_everyone(ops):
    _, client, ran = ops
    for headers in (WORKER, GATEWAY):
        assert client.post("/stacks/agent-worker/rebuild", json={"reason": "x"}, headers=headers).status_code == 403
        assert client.post("/stacks/ops-runner/restart", json={"reason": "x"}, headers=headers).status_code == 403
    assert ran == []


def test_unknown_stack_and_path_tricks(ops):
    _, client, ran = ops
    assert client.post("/stacks/nope/up", json={"reason": "x"}, headers=WORKER).status_code == 404
    assert client.get("/stacks/..%2F..%2Fetc/ps", headers=WORKER).status_code == 404
    assert client.post("/stacks/guitar-app/down", json={"reason": "x"}, headers=WORKER).status_code == 422
    assert ran == []


def test_expired_request_cannot_execute(ops, monkeypatch):
    main, client, ran = ops
    monkeypatch.setattr(main, "REQUEST_TTL", -1)
    rid = client.post("/stacks/caddy/up", json={"reason": "x"}, headers=WORKER).json()["request_id"]
    assert client.post(f"/requests/{rid}/execute", json={"approval_id": "a"}, headers=GATEWAY).status_code == 409
    assert ran == []


def test_interrupted_request_is_unknown_and_cannot_replay(ops):
    main, client, ran = ops
    rid = client.post("/stacks/caddy/up", json={"reason": "deploy"}, headers=WORKER).json()["request_id"]
    requests = main._load_requests()
    requests[rid]["status"] = "running"
    main._save_requests(requests)
    main.recover_interrupted_requests()
    assert client.get(f"/requests/{rid}", headers=WORKER).json()["status"] == "unknown"
    assert client.post(f"/requests/{rid}/execute", json={"approval_id": "a"}, headers=GATEWAY).status_code == 409
    assert ran == []
