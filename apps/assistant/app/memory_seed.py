"""Import reviewed user statements from a local conversations.json export."""

import argparse
import hashlib
import json
from pathlib import Path

from . import observations, store


def apply(export, review):
    messages = {}
    for chat in export:
        for node in chat.get("mapping", {}).values():
            msg = node.get("message") or {}
            if msg.get("author", {}).get("role") == "user":
                messages[(chat.get("id") or chat.get("conversation_id"), msg["id"])] = msg
    accepted = []
    for row in review:
        key = (row["conversation_id"], row["message_id"])
        message = messages.get(key)
        if not message:
            raise ValueError("Review references a missing user message")
        text = row["excerpt"]
        parts = message.get("content", {}).get("parts", [])
        if not isinstance(text, str) or not text.strip() or len(text) > 1000 or not any(
            isinstance(part, str) and text in part for part in parts
        ):
            raise ValueError("Reviewed excerpt must match the source user message (1–1000 characters)")
        digest = hashlib.sha256(json.dumps([*key, text]).encode()).hexdigest()
        accepted.append((digest, key, text))
    added = 0
    with store.file_lock(store.path("history", "seed-import")):
        path = store.path(observations.PATH)
        seen = set()
        if path.exists():
            with path.open() as stream:
                for line in stream:
                    seen.add(json.loads(line)["source"].get("import_id"))
        for digest, key, text in accepted:
            if digest in seen:
                continue
            observations.add(text, kind="statement", source={"type": "reviewed_export", "import_id": digest,
                             "conversation_id": key[0], "message_id": key[1]})
            seen.add(digest)
            added += 1
    return added


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", type=Path)
    parser.add_argument("review", type=Path, help="JSON array of explicitly selected source excerpts")
    args = parser.parse_args()
    print(f"Imported {apply(json.loads(args.export.read_text()), json.loads(args.review.read_text()))} reviewed statements")
