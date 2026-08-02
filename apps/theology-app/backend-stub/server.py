#!/usr/bin/env python3
"""Stdlib-only stub for theology.home.arpa → :8002 (no venv required)."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path in ("/health", "/"):
            self._json(200, {"ok": True, "service": "theology-stub"})
            return
        if self.path.startswith("/api/works"):
            self._json(200, {"works": [], "note": "stub — wire real ingest later"})
            return
        self._json(404, {"error": "not found"})

    def log_message(self, fmt: str, *args) -> None:
        print(f"[theology-stub] {self.address_string()} - {fmt % args}")


def main() -> None:
    host, port = "0.0.0.0", 8002
    httpd = ThreadingHTTPServer((host, port), Handler)
    print(f"theology stub listening on http://{host}:{port}")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
