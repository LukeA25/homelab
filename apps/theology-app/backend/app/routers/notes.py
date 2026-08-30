"""User notes, highlights, and bookmarks."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import session_dependency
from ..models import Bookmark, Highlight, Note
from ..schemas import (
    BookmarkIn,
    BookmarkOut,
    HighlightIn,
    HighlightOut,
    NoteIn,
    NoteOut,
    NoteUpdate,
)

router = APIRouter(tags=["notes"])


def _iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _note_out(n: Note) -> NoteOut:
    return NoteOut(
        id=n.id,
        title=n.title,
        section=n.section,
        body=n.body,
        createdAt=_iso(n.created_at),
        updatedAt=_iso(n.updated_at),
    )


@router.get("/notes", response_model=list[NoteOut])
def list_notes(session: Session = Depends(session_dependency)) -> list[NoteOut]:
    rows = session.exec(select(Note).order_by(Note.updated_at.desc())).all()
    return [_note_out(n) for n in rows]


@router.post("/notes", response_model=NoteOut)
def create_note(body: NoteIn, session: Session = Depends(session_dependency)) -> NoteOut:
    now = datetime.now(timezone.utc)
    note = Note(
        id=f"n-{uuid4().hex[:12]}",
        title=(body.title or "Untitled").strip() or "Untitled",
        section=body.section if body.section in ("personal", "apologetics") else "personal",
        body=body.body or "",
        created_at=now,
        updated_at=now,
    )
    session.add(note)
    session.commit()
    session.refresh(note)
    return _note_out(note)


@router.get("/notes/{note_id}", response_model=NoteOut)
def get_note(note_id: str, session: Session = Depends(session_dependency)) -> NoteOut:
    note = session.get(Note, note_id)
    if not note:
        raise HTTPException(404, "note not found")
    return _note_out(note)


@router.patch("/notes/{note_id}", response_model=NoteOut)
def update_note(
    note_id: str,
    body: NoteUpdate,
    session: Session = Depends(session_dependency),
) -> NoteOut:
    note = session.get(Note, note_id)
    if not note:
        raise HTTPException(404, "note not found")
    if body.title is not None:
        note.title = body.title.strip() or note.title
    if body.section is not None and body.section in ("personal", "apologetics"):
        note.section = body.section
    if body.body is not None:
        note.body = body.body
    note.updated_at = datetime.now(timezone.utc)
    session.add(note)
    session.commit()
    session.refresh(note)
    return _note_out(note)


@router.delete("/notes/{note_id}")
def delete_note(note_id: str, session: Session = Depends(session_dependency)) -> dict:
    note = session.get(Note, note_id)
    if not note:
        raise HTTPException(404, "note not found")
    session.delete(note)
    session.commit()
    return {"ok": True}


@router.get("/highlights", response_model=list[HighlightOut])
def list_highlights(session: Session = Depends(session_dependency)) -> list[HighlightOut]:
    rows = session.exec(select(Highlight).order_by(Highlight.created_at.desc())).all()
    return [
        HighlightOut(
            id=h.id,
            workId=h.work_id,
            paragraphId=h.paragraph_id,
            locusId=h.locus_id,
            color=h.color,
            createdAt=_iso(h.created_at),
        )
        for h in rows
    ]


@router.post("/highlights", response_model=HighlightOut)
def create_highlight(
    body: HighlightIn,
    session: Session = Depends(session_dependency),
) -> HighlightOut:
    existing = session.exec(
        select(Highlight).where(
            Highlight.work_id == body.workId,
            Highlight.paragraph_id == body.paragraphId,
        )
    ).first()
    if existing:
        return HighlightOut(
            id=existing.id,
            workId=existing.work_id,
            paragraphId=existing.paragraph_id,
            locusId=existing.locus_id,
            color=existing.color,
            createdAt=_iso(existing.created_at),
        )
    h = Highlight(
        id=f"h-{uuid4().hex[:12]}",
        work_id=body.workId,
        paragraph_id=body.paragraphId,
        locus_id=body.locusId,
        color=body.color or "amber",
    )
    session.add(h)
    session.commit()
    session.refresh(h)
    return HighlightOut(
        id=h.id,
        workId=h.work_id,
        paragraphId=h.paragraph_id,
        locusId=h.locus_id,
        color=h.color,
        createdAt=_iso(h.created_at),
    )


@router.delete("/highlights/{highlight_id}")
def delete_highlight(highlight_id: str, session: Session = Depends(session_dependency)) -> dict:
    h = session.get(Highlight, highlight_id)
    if not h:
        # Also allow delete by paragraph id convenience? stick to id
        raise HTTPException(404, "highlight not found")
    session.delete(h)
    session.commit()
    return {"ok": True}


@router.get("/bookmarks", response_model=list[BookmarkOut])
def list_bookmarks(session: Session = Depends(session_dependency)) -> list[BookmarkOut]:
    rows = session.exec(select(Bookmark).order_by(Bookmark.created_at.desc())).all()
    return [
        BookmarkOut(
            id=b.id,
            workId=b.work_id,
            scope=b.scope or b.work_id,
            sectionId=b.section_id or "",
            paragraphId=b.paragraph_id,
            locusId=b.locus_id,
            label=b.label,
            note=b.note,
            createdAt=_iso(b.created_at),
        )
        for b in rows
    ]


@router.post("/bookmarks", response_model=BookmarkOut)
def create_bookmark(body: BookmarkIn, session: Session = Depends(session_dependency)) -> BookmarkOut:
    """Upsert one movable bookmark per scope (work, or Bible book)."""
    if body.workId.startswith("bible-") and body.sectionId:
        parts = body.sectionId.split("/")
        scope = "/".join(parts[:2]) if len(parts) >= 2 else body.workId
    else:
        scope = (body.scope or "").strip() or body.workId

    existing = session.exec(select(Bookmark).where(Bookmark.scope == scope)).all()
    for old in existing:
        session.delete(old)
    if existing:
        session.commit()

    b = Bookmark(
        id=f"b-{uuid4().hex[:12]}",
        work_id=body.workId,
        scope=scope,
        section_id=body.sectionId or "",
        paragraph_id=body.paragraphId,
        locus_id=body.locusId,
        label=body.label or body.locusId,
        note=body.note or "",
    )
    session.add(b)
    session.commit()
    session.refresh(b)
    return BookmarkOut(
        id=b.id,
        workId=b.work_id,
        scope=b.scope,
        sectionId=b.section_id,
        paragraphId=b.paragraph_id,
        locusId=b.locus_id,
        label=b.label,
        note=b.note,
        createdAt=_iso(b.created_at),
    )


@router.delete("/bookmarks/{bookmark_id}")
def delete_bookmark(bookmark_id: str, session: Session = Depends(session_dependency)) -> dict:
    b = session.get(Bookmark, bookmark_id)
    if not b:
        raise HTTPException(404, "bookmark not found")
    session.delete(b)
    session.commit()
    return {"ok": True}
