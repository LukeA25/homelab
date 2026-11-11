"""Study Desk theology API.

FastAPI + SQLModel/SQLite, mirroring the finance-app / guitar-app pattern.
Serves the imported library: works, their section trees, blocks of text, the
Bible with reference resolution, and full-text search.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import ensure_library_tree
from .db import init_db
from .bible_in_a_year.feed import start_feed_refresh
from .routers import ask, bible, bible_in_a_year, catalog, notes, prayers, search, works

app = FastAPI(title="Study Desk", version="0.1.0")

# The iPad and web clients are served from other origins on the homelab LAN.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(works.router, prefix="/api")
app.include_router(bible.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(ask.router, prefix="/api")
app.include_router(prayers.router, prefix="/api")
app.include_router(catalog.router, prefix="/api")
app.include_router(notes.router, prefix="/api")
app.include_router(bible_in_a_year.router, prefix="/api")


@app.on_event("startup")
def on_startup() -> None:
    ensure_library_tree()
    init_db()
    start_feed_refresh()


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "study-desk"}


# Docker copies the Vite build to /app/frontend_dist (this file is /app/app/main.py).
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend_dist"


def _mount_spa() -> None:
    if not FRONTEND_DIST.is_dir():
        return
    assets = FRONTEND_DIST / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):  # noqa: ARG001
        """Serve the web UI for every non-API route."""
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")


_mount_spa()
