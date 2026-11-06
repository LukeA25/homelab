"""Wishlist / curated catalog of Catholic works."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from ..catalog import catalog_with_library, import_catalog_entry, load_works_catalog
from ..db import session_dependency
from ..schemas import CatalogImportOut, CatalogWorkOut

router = APIRouter(tags=["catalog"])


def _downloadable(entry: dict) -> bool:
    return bool(entry.get("gutenbergId") or entry.get("archiveId") or entry.get("epubUrl"))


@router.get("/catalog", response_model=list[CatalogWorkOut])
def list_catalog(session: Session = Depends(session_dependency)) -> list[CatalogWorkOut]:
    rows = catalog_with_library(session)
    return [
        CatalogWorkOut(
            id=str(r["id"]),
            title=str(r["title"]),
            author=str(r.get("author") or ""),
            category=str(r.get("category") or "reference"),
            topics=list(r.get("topics") or []),
            summary=str(r.get("summary") or ""),
            sourceUrl=r.get("sourceUrl"),
            rights=str(r.get("rights") or ""),
            rightsHint=str(r.get("rightsHint") or ""),
            inLibrary=bool(r.get("inLibrary")),
            workId=r.get("workId"),
            downloadable=_downloadable(r) and not bool(r.get("inLibrary")),
        )
        for r in rows
    ]


@router.post("/catalog/{catalog_id}/import", response_model=CatalogImportOut)
def import_catalog_work(catalog_id: str) -> CatalogImportOut:
    entries = {str(e["id"]): e for e in load_works_catalog()}
    entry = entries.get(catalog_id)
    if not entry:
        raise HTTPException(404, f"catalog entry {catalog_id!r} not found")
    if not _downloadable(entry):
        raise HTTPException(400, "no downloadable source for this catalog entry")
    try:
        result = import_catalog_entry(entry, force=True)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"import failed: {exc}") from exc
    return CatalogImportOut(
        ok=True,
        workId=result.work_id,
        title=result.title,
        message=f"Imported “{result.title}”.",
    )
