"""Run the private dashboard and the public guest gateway in one process.

Sharing a process keeps cast sessions and their live updates in memory for both
servers. The guest gateway listens on its own port, published to localhost only,
so Tailscale Funnel exposes nothing but the guest routes.
"""

from __future__ import annotations

import asyncio
import os

import uvicorn


async def main() -> None:
    servers = [
        uvicorn.Server(
            uvicorn.Config("app.main:app", host="0.0.0.0", port=8000, proxy_headers=False)
        ),
        uvicorn.Server(
            uvicorn.Config(
                "app.guest:app",
                host="0.0.0.0",
                port=int(os.getenv("GUEST_PORT", "8010")),
                proxy_headers=False,
            )
        ),
    ]
    await asyncio.gather(*(server.serve() for server in servers))


if __name__ == "__main__":
    asyncio.run(main())
