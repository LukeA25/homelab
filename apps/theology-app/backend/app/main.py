"""Study Desk theology API.

FastAPI + SQLModel/SQLite, mirroring the finance-app / guitar-app pattern.
Serves the imported library: works, their section trees, blocks of text, the
Bible with reference resolution, and full-text search.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import ensure_library_tree
from .db import init_db
from .routers import ask, bible, catalog, notes, prayers, search, works

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


@app.on_event("startup")
def on_startup() -> None:
    ensure_library_tree()
    init_db()


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "study-desk"}
