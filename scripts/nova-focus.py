#!/usr/bin/env python3
"""Report iPhone Do Not Disturb to Nova from the homelab SSH host."""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

URL = "http://127.0.0.1:8006/api/dnd"
TOKEN_FILE = Path.home() / ".config/nova/focus-token"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("on", "off", "status"))
    args = parser.parse_args()

    try:
        token = TOKEN_FILE.read_text().strip()
    except OSError:
        parser.exit(1, "Store the scoped Nova credential in ~/.config/nova/focus-token.\n")
    if not token or any(character.isspace() for character in token):
        parser.exit(1, "The Focus credential file must contain a single token.\n")

    data = None
    if args.action != "status":
        data = json.dumps({
            "enabled": args.action == "on",
            "observed_at": datetime.now(timezone.utc).isoformat(),
        }).encode()
    request = Request(
        URL,
        data=data,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="GET" if data is None else "PUT",
    )
    try:
        with urlopen(request, timeout=8) as response:
            state = json.load(response)["state"]
    except HTTPError as error:
        parser.exit(1, f"Nova returned HTTP {error.code}. Check the Focus credential and gateway.\n")
    except (URLError, TimeoutError, ValueError, KeyError):
        parser.exit(1, "Could not read Nova's Focus response. Check the gateway on the SSH host.\n")

    if state not in ("on", "off", "unknown"):
        parser.exit(1, "Nova returned an unexpected Focus state.\n")
    print(f"Nova DND: {state}")


if __name__ == "__main__":
    main()
