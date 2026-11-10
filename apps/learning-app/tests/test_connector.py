import unittest
from unittest.mock import patch

from app.seed import seed
from connector import bridge


class LearningConnector(unittest.TestCase):
    def test_next_session_selects_and_reuses_pending_session(self):
        workspace = seed()
        workspace["sessions"] = [
            {"id": "pending", "tree_id": "ml", "concept_id": "models",
             "status": "pending", "prompt": "Teach me about models."}
        ]
        with patch.object(bridge, "api", return_value=workspace) as api:
            result = bridge.get_next_session()
        api.assert_called_once_with("GET", "/api/workspace")
        self.assertEqual(result["session_id"], "pending")
        self.assertEqual(result["concept"]["id"], "models")

    def test_next_session_creates_for_review_first(self):
        workspace = seed()
        concept = workspace["trees"][0]["concepts"][-1]
        concept["state"] = "needs-review"
        with patch.object(bridge, "api", side_effect=[
            workspace, {"id": "new", "prompt": "Review this concept."}
        ]) as api:
            result = bridge.get_next_session("ml")
        api.assert_called_with("POST", "/api/trees/ml/sessions", {"concept_id": concept["id"]})
        self.assertEqual(result["session_id"], "new")
        self.assertEqual(result["concept"]["id"], concept["id"])

    def test_requires_understood_prerequisite_before_advancing(self):
        concepts = [
            {"id": "advanced", "state": "unexplored", "requires": ["intro"]},
            {"id": "intro", "state": "introduced", "requires": []},
        ]
        self.assertEqual(bridge.choose_concept(concepts)["id"], "intro")
        concepts[1]["state"] = "understood"
        self.assertEqual(bridge.choose_concept(concepts)["id"], "advanced")

    def test_history_includes_secondary_topics_without_returning_other_notes(self):
        workspace = seed()
        workspace["sessions"] = [
            {"id": "saved", "tree_id": "ml", "concept_id": "gradient", "status": "accepted",
             "created_at": "2026-11-06", "recap": {
                 "topics": [{"concept_id": "models", "summary": "Model notes"},
                            {"concept_id": "gradient", "summary": "Gradient notes"}],
             }},
        ]
        with patch.object(bridge, "api", return_value=workspace):
            result = bridge.get_concept("ml", "models")
        self.assertEqual(result["accepted_sessions"][0]["topics"],
                         [{"concept_id": "models", "summary": "Model notes"}])
