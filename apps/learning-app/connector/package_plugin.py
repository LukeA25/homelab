"""Build the private plugin archive without storing the tunnel ID in the repo."""
import argparse
import json
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("tunnel_id")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r"tunnel_[a-z0-9]{32}", args.tunnel_id):
        parser.error("Expected a tunnel ID from OpenAI Platform.")

    plugin = Path(__file__).parent / "plugin" / "learning-grove"
    mcp = {
        "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
        "mcpServers": {
            "learning-grove": {
                "type": "streamable-http",
                "extensions": {"com.openai": {
                    "tunnelId": args.tunnel_id,
                    "auth": {"type": "none"},
                }},
            },
        },
    }
    with ZipFile(args.output, "w", compression=ZIP_DEFLATED) as archive:
        for name in ("plugin.json", "skills/learning-grove-tutor/SKILL.md"):
            archive.write(plugin / name, f"learning-grove/{name}")
        archive.writestr("learning-grove/mcp.json", json.dumps(mcp, indent=2) + "\n")


if __name__ == "__main__":
    main()
