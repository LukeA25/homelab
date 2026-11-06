"""Full-text search across the library, backed by SQLite FTS5."""

from __future__ import annotations

import re
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, text

from ..db import session_dependency
from ..schemas import SearchHitOut, SearchOut

router = APIRouter(tags=["search"])

# FTS5 treats these as operators; a user typing them means them literally.
_FTS_SPECIALS = re.compile(r'["*():^-]')
_MARK_RE = re.compile(r"</?mark>", re.IGNORECASE)


def to_match_query(raw: str) -> str:
    """Quote each term so user input cannot be read as FTS5 syntax."""
    terms = [_FTS_SPECIALS.sub(" ", term).strip() for term in raw.split()]
    return " ".join(f'"{term}"' for term in terms if term)


def strip_marks(snippet: str) -> str:
    return _MARK_RE.sub("", snippet or "")


def run_search(
    session: Session,
    q: str,
    *,
    work_id: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 30,
    offset: int = 0,
    include_text: bool = False,
) -> SearchOut:
    """Shared FTS query used by /api/search and /api/ask."""
    match_query = to_match_query(q)
    if not match_query:
        return SearchOut(query=q, total=0, hits=[])

    filters = ""
    params: dict = {"q": match_query, "limit": limit, "offset": offset}
    if work_id:
        filters += " AND b.work_id = :work_id"
        params["work_id"] = work_id
    if category:
        filters += " AND w.category = :category"
        params["category"] = category

    count_sql = text(
        f"""
        SELECT COUNT(*)
        FROM blocks_fts f
        JOIN block b ON b.pk = f.block_pk
        JOIN work  w ON w.id = b.work_id
        WHERE blocks_fts MATCH :q {filters}
        """
    )
    total = session.execute(count_sql, params).scalar_one()

    text_col = ", b.text AS body" if include_text else ""
    rows_sql = text(
        f"""
        SELECT b.work_id, w.title, b.locus_id, b.label, b.kind,
               snippet(blocks_fts, 0, '<mark>', '</mark>', '...', 24) AS snippet
               {text_col}
        FROM blocks_fts f
        JOIN block b ON b.pk = f.block_pk
        JOIN work  w ON w.id = b.work_id
        WHERE blocks_fts MATCH :q {filters}
        ORDER BY bm25(blocks_fts)
        LIMIT :limit OFFSET :offset
        """
    )
    rows = session.execute(rows_sql, params).all()

    hits: list[SearchHitOut] = []
    for row in rows:
        snippet = row[5]
        if include_text and len(row) > 6 and row[6]:
            # Prefer full block text for RAG context; keep FTS snippet for UI.
            body = str(row[6]).strip()
            if body:
                snippet = body if len(body) < 1200 else body[:1197] + "..."
        hits.append(
            SearchHitOut(
                workId=row[0],
                workTitle=row[1],
                locusId=row[2],
                label=row[3],
                kind=row[4],
                snippet=snippet,
            )
        )

    return SearchOut(query=q, total=total, hits=hits)


@router.get("/search", response_model=SearchOut)
def search(
    q: str = Query(..., min_length=2),
    session: Session = Depends(session_dependency),
    work_id: Optional[str] = Query(None, alias="workId"),
    category: Optional[str] = None,
    limit: int = Query(30, le=200),
    offset: int = 0,
) -> SearchOut:
    return run_search(
        session,
        q,
        work_id=work_id,
        category=category,
        limit=limit,
        offset=offset,
    )
