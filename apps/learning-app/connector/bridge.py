"""Limit connector calls to the Learning Grove API on the same host."""
import json
from threading import Lock
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

BASE_URL = "http://127.0.0.1:8009"
session_lock = Lock()


class GroveError(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


opener = build_opener(ProxyHandler({}), NoRedirect())


def api(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    request = Request(BASE_URL + path, data, {"Content-Type": "application/json"}, method=method)
    try:
        with opener.open(request, timeout=20) as response:
            return json.load(response)
    except HTTPError as error:
        try:
            detail = json.load(error).get("detail", error.reason)
        except (ValueError, AttributeError):
            detail = error.reason
        raise GroveError(f"Learning Grove HTTP {error.code}: {detail}") from None
    except (URLError, TimeoutError):
        raise GroveError("Cannot reach Learning Grove on port 8009. Check that the app is running.") from None


def choose_concept(concepts):
    if not concepts:
        raise GroveError("This learning path has no concepts.")
    understood = {c["id"] for c in concepts if c["state"] == "understood"}
    unfinished = [c for c in concepts if c["state"] != "understood"]
    return (
        next((c for c in concepts if c["state"] == "needs-review"), None)
        or next((c for c in unfinished if understood.issuperset(c["requires"])), None)
        or (unfinished or concepts)[0]
    )


def prerequisites(tree, concept):
    return [c for c in tree["concepts"] if c["id"] in concept["requires"]]


def get_next_session(tree_id=None):
    with session_lock:
        workspace = api("GET", "/api/workspace")
        tree = next((t for t in workspace["trees"] if t["status"] == "active"
                     and (tree_id is None or t["id"] == tree_id)), None)
        if tree is None:
            raise GroveError("No matching active path. Check the path ID and activate it in Learning Grove.")
        concept = choose_concept(tree["concepts"])
        pending = next((s for s in workspace["sessions"] if
                        (s["tree_id"], s["concept_id"], s["status"]) ==
                        (tree["id"], concept["id"], "pending")), None)
        if pending is None:
            pending = api("POST", f"/api/trees/{quote(tree['id'], safe='')}/sessions",
                          {"concept_id": concept["id"]})
        return {
            "path": {key: tree[key] for key in ("id", "title", "goal", "depth", "excludes", "outcomes")},
            "concept": concept,
            "prerequisites": prerequisites(tree, concept),
            "session_id": pending["id"],
            "prompt": pending["prompt"],
        }


def get_concept(tree_id, concept_id):
    workspace = api("GET", "/api/workspace")
    tree = next((t for t in workspace["trees"] if t["id"] == tree_id), None)
    if tree is None:
        raise GroveError("Learning path not found.")
    concept = next((c for c in tree["concepts"] if c["id"] == concept_id), None)
    if concept is None:
        raise GroveError("Concept not found in this learning path.")
    history = []
    for session in workspace["sessions"]:
        if session["tree_id"] != tree_id or session["status"] != "accepted":
            continue
        recap = session.get("recap") or {}
        topics = [topic for topic in recap.get("topics", []) if topic["concept_id"] == concept_id]
        if topics or session["concept_id"] == concept_id:
            history.append({"session_id": session["id"], "created_at": session["created_at"],
                            "topics": topics, "questions": recap.get("questions", [])})
    return {"tree_id": tree_id, "concept": concept, "prerequisites": prerequisites(tree, concept),
            "accepted_sessions": history}
