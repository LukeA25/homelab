"""Filesystem and runtime configuration.

Both the SQLite database and the library of source files live on the mounted
/data volume (see compose/theology-app/docker-compose.yaml) so they survive
container rebuilds. Override with env vars for local development.
"""

from __future__ import annotations

import os
from pathlib import Path

DATA_DIR = Path(os.getenv("DATA_DIR", "/data"))
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", DATA_DIR / "theology.db"))
LIBRARY_DIR = Path(os.getenv("LIBRARY_DIR", DATA_DIR / "library"))
INBOX_DIR = LIBRARY_DIR / "_inbox"
CACHE_DIR = Path(os.getenv("CACHE_DIR", DATA_DIR / "cache"))
LECTIONARY_CACHE_DIR = CACHE_DIR / "lectionary"

ASK_PROVIDER = os.getenv("ASK_PROVIDER", "openai").strip().lower()
ASK_MODEL = os.getenv("ASK_MODEL", "gpt-4o-mini").strip()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
ASK_TIMEOUT_SECONDS = float(os.getenv("ASK_TIMEOUT_SECONDS", "90"))
ASK_MAX_TOKENS = int(os.getenv("ASK_MAX_TOKENS", "3200"))
ASK_MAX_ROUNDS = int(os.getenv("ASK_MAX_ROUNDS", "3"))

LECTIONARY_PROVIDER = os.getenv("LECTIONARY_PROVIDER", "cpbjr").strip().lower()
CPBJR_BASE_URL = os.getenv(
    "CPBJR_BASE_URL",
    "https://cpbjr.github.io/catholic-readings-api",
).rstrip("/")

# Mirrors the on-disk taxonomy. A work's category decides which folder its
# source file is filed under.
CATEGORIES = (
    "bible",
    "catechism",
    "church-fathers",
    "saints",
    "theology",
    "spirituality",
    "apologetics",
    "reference",
)


def category_dir(category: str) -> Path:
    if category not in CATEGORIES:
        raise ValueError(f"unknown category {category!r}; expected one of {', '.join(CATEGORIES)}")
    return LIBRARY_DIR / category


def ensure_library_tree() -> None:
    INBOX_DIR.mkdir(parents=True, exist_ok=True)
    LECTIONARY_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    for category in CATEGORIES:
        (LIBRARY_DIR / category).mkdir(parents=True, exist_ok=True)
