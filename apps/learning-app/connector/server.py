"""Stdio MCP server for Learning Grove.

The tunnel client launches this process. It calls the app at
http://127.0.0.1:8009 and does not open a socket or touch SQLite.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

from mcp.server.fastmcp import FastMCP

API = os.environ.get("LEARNING_GROVE_API", "http://127.0.0.1:8009").rstrip("/")
mcp = FastMCP("Learning Grove")


def _call(method: str, path: str, body: dict | None = None):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(
        API + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read().decode()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        try:
            detail = json.loads(raw).get("detail", raw)
        except json.JSONDecodeError:
            detail = raw or error.reason
        raise RuntimeError(f"{error.code}: {detail}") from error


def _workspace() -> dict:
    return _call("GET", "/api/workspace")


def _active_tree(data: dict, tree_id: str | None) -> dict:
    trees = data.get("trees") or []
    if tree_id:
        found = next((tree for tree in trees if tree["id"] == tree_id), None)
        if not found:
            raise RuntimeError(f"Learning path not found: {tree_id}")
        return found
    active = next((tree for tree in trees if tree.get("status") == "active"), None)
    if not active:
        raise RuntimeError("No active learning path")
    return active


def _concept(tree: dict, concept_id: str) -> dict:
    found = next((concept for concept in tree["concepts"] if concept["id"] == concept_id), None)
    if not found:
        raise RuntimeError(f"Unknown concept: {concept_id}")
    return found


def _prerequisites_understood(tree: dict, concept: dict) -> bool:
    by_id = {item["id"]: item for item in tree["concepts"]}
    return all(by_id.get(required, {}).get("state") == "understood" for required in concept.get("requires") or [])


def _next_concept(tree: dict) -> dict:
    concepts = tree["concepts"]
    return (
        next((concept for concept in concepts if concept.get("state") == "needs-review"), None)
        or next(
            (
                concept
                for concept in concepts
                if concept.get("state") != "understood" and _prerequisites_understood(tree, concept)
            ),
            None,
        )
        or next((concept for concept in concepts if concept.get("state") != "understood"), None)
        or concepts[0]
    )


def _pending_session(data: dict, tree_id: str, concept_id: str) -> dict | None:
    return next(
        (
            session
            for session in data.get("sessions") or []
            if session.get("tree_id") == tree_id
            and session.get("concept_id") == concept_id
            and session.get("status") == "pending"
        ),
        None,
    )


def _session_view(tree: dict, concept: dict, session: dict) -> dict:
    prerequisites = [_concept(tree, required) for required in concept.get("requires") or []]
    return {
        "tree_id": tree["id"],
        "title": tree["title"],
        "goal": tree["goal"],
        "depth": tree["depth"],
        "excludes": tree["excludes"],
        "outcomes": tree["outcomes"],
        "concept": concept,
        "prerequisites": prerequisites,
        "session_id": session["id"],
        "session_status": session["status"],
        "prompt": session["prompt"],
    }


def _recap(schema_version: str, session_id: str, tree_id: str, topics: list[dict], questions: list[str] | None) -> dict:
    return {
        "schema_version": schema_version,
        "session_id": session_id,
        "tree_id": tree_id,
        "topics": topics,
        "questions": questions or [],
    }


@mcp.tool()
def get_next_session(tree_id: str | None = None) -> dict:
    """Load the next 10–15 minute lesson, reusing a pending session for that concept."""
    data = _workspace()
    tree = _active_tree(data, tree_id)
    concept = _next_concept(tree)
    session = _pending_session(data, tree["id"], concept["id"])
    if session is None:
        session = _call("POST", f"/api/trees/{tree['id']}/sessions", {"concept_id": concept["id"]})
    return _session_view(tree, concept, session)


@mcp.tool()
def get_concept(tree_id: str, concept_id: str) -> dict:
    """Read one concept, its prerequisites, and accepted session history."""
    data = _workspace()
    tree = _active_tree(data, tree_id)
    concept = _concept(tree, concept_id)
    history = [
        session
        for session in data.get("sessions") or []
        if session.get("tree_id") == tree_id
        and session.get("concept_id") == concept_id
        and session.get("status") == "accepted"
    ]
    return {
        "tree_id": tree["id"],
        "title": tree["title"],
        "concept": concept,
        "prerequisites": [_concept(tree, required) for required in concept.get("requires") or []],
        "accepted_sessions": history,
    }


@mcp.tool()
def submit_session_recap(
    schema_version: str,
    session_id: str,
    tree_id: str,
    topics: list[dict],
    questions: list[str] | None = None,
) -> dict:
    """Validate a recap. This previews the proposed notes and changes nothing."""
    return {
        "saved": False,
        "preview": _call("POST", "/api/import/preview", _recap(schema_version, session_id, tree_id, topics, questions)),
    }


@mcp.tool()
def accept_session_recap(
    schema_version: str,
    session_id: str,
    tree_id: str,
    topics: list[dict],
    questions: list[str] | None = None,
) -> dict:
    """Save a recap after the learner explicitly approves it."""
    return _call("POST", "/api/import/accept", _recap(schema_version, session_id, tree_id, topics, questions))


@mcp.tool()
def capture_interest(text: str) -> dict:
    """Add a short interest to the idea inbox. This does not create a learning path."""
    return _call("POST", "/api/ideas", {"text": text})


def main() -> None:
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
