"""Catalog helpers: curated wishlist + static prayers shipped with the API."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import httpx
from sqlmodel import Session, select

from ..config import category_dir
from ..importer.service import IngestResult, ingest
from ..models import Work

_CATALOG_DIR = Path(__file__).resolve().parent


@lru_cache(maxsize=1)
def load_works_catalog() -> list[dict[str, Any]]:
    path = _CATALOG_DIR / "works.json"
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_prayers() -> list[dict[str, Any]]:
    path = _CATALOG_DIR / "prayers.json"
    return json.loads(path.read_text(encoding="utf-8"))


def catalog_with_library(session: Session) -> list[dict[str, Any]]:
    works = session.exec(select(Work)).all()
    by_id = {w.id: w for w in works}
    by_title = {(w.title.lower().strip(), (w.author or "").lower().strip()): w for w in works}

    out: list[dict[str, Any]] = []
    for entry in load_works_catalog():
        row = dict(entry)
        hit = by_id.get(entry["id"])
        if hit is None:
            key = (entry["title"].lower().strip(), entry.get("author", "").lower().strip())
            hit = by_title.get(key)
        row["inLibrary"] = hit is not None
        row["workId"] = hit.id if hit else None
        out.append(row)
    return out


def _pick_archive_epub(files: list[dict[str, Any]]) -> str | None:
    names = [
        str(f.get("name") or "")
        for f in files
        if str(f.get("name") or "").endswith(".epub")
        and "lcp" not in str(f.get("name") or "").lower()
        and "encrypted" not in str(f.get("name") or "").lower()
    ]
    if not names:
        return None
    # Prefer shorter / primary named epub
    names.sort(key=lambda n: (n.count("_"), len(n)))
    return names[0]


def download_catalog_epub(entry: dict[str, Any], *, force: bool = False) -> Path:
    """Download an EPUB for a catalog entry to the category library folder."""
    category = entry.get("category") or "reference"
    dest_dir = category_dir(category)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{entry['id']}.epub"
    if dest.exists() and not force and dest.stat().st_size > 1000:
        return dest

    with httpx.Client(timeout=180.0, follow_redirects=True) as client:
        epub_url = entry.get("epubUrl")
        if not epub_url and entry.get("archiveId"):
            aid = entry["archiveId"]
            meta = client.get(f"https://archive.org/metadata/{aid}").json()
            name = _pick_archive_epub(list(meta.get("files") or []))
            if not name:
                raise RuntimeError(f"no EPUB found on Internet Archive for {aid}")
            epub_url = f"https://archive.org/download/{aid}/{name}"
        if not epub_url and entry.get("gutenbergId"):
            gid = entry["gutenbergId"]
            epub_url = f"https://www.gutenberg.org/ebooks/{gid}.epub.images"
            res = client.get(epub_url)
            if res.status_code >= 400:
                epub_url = f"https://www.gutenberg.org/ebooks/{gid}.epub.noimages"
                res = client.get(epub_url)
            res.raise_for_status()
            dest.write_bytes(res.content)
            return dest
        if not epub_url:
            raise RuntimeError(f"no downloadable source for {entry.get('id')}")
        res = client.get(epub_url)
        res.raise_for_status()
        dest.write_bytes(res.content)
        return dest


def import_catalog_entry(entry: dict[str, Any], *, force: bool = False) -> IngestResult:
    dest = download_catalog_epub(entry, force=force)
    return ingest(
        dest,
        category=entry.get("category") or "reference",
        source=entry.get("rightsHint") or "Public Domain",
        source_url=entry.get("sourceUrl"),
        rights=entry.get("rights") or "Public Domain",
        work_id=entry["id"],
        title_override=entry.get("title"),
        author_override=entry.get("author"),
    )
