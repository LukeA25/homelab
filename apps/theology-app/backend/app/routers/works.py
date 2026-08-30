"""Library endpoints: works, their section trees, and blocks of text."""

from __future__ import annotations

import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, col, func, select

from ..db import session_dependency
from ..models import Block, CrossRef, Footnote, Section, Work
from ..schemas import BlockDetailOut, CrossRefOut, FootnoteOut, ParagraphOut, SectionOut, WorkOut

router = APIRouter(tags=["library"])

# Structural title labels that are not readable content on their own.
_TITLE_LABEL_RE = re.compile(
    r"^(chapter|article|paragraph|part|section|prologue|book)\b[\s\dIVXLC.:—-]*$",
    re.IGNORECASE,
)
_FRONT_MATTER_RE = re.compile(
    r"^(cover(\s+page)?|title\s*page|copyright(\s+page)?|table of contents|"
    r"contents|back\s*cover|inline[- ]?toc)$",
    re.IGNORECASE,
)


def _is_content_block(kind: str, text: str) -> bool:
    """True when a block is real body text, not a heading or title stub."""
    if kind not in ("paragraph", "quote"):
        return False
    cleaned = (text or "").strip()
    if len(cleaned) < 40:
        return False
    if _TITLE_LABEL_RE.match(cleaned):
        return False
    return True


def work_to_out(work: Work) -> WorkOut:
    return WorkOut(
        id=work.id,
        title=work.title,
        shortTitle=work.short_title,
        author=work.author,
        kind=work.kind,
        category=work.category,
        description=work.description,
        translation=work.translation,
        edition=work.edition,
        source=work.source,
        rights=work.rights,
        blockCount=work.block_count,
    )


def block_to_paragraph(block: Block, verse: Optional[int] = None) -> ParagraphOut:
    return ParagraphOut(
        id=block.id,
        locusId=block.locus_id,
        label=block.label,
        kind=block.kind,
        text=block.text,
        verse=verse,
    )


@router.get("/works", response_model=list[WorkOut])
def list_works(
    session: Session = Depends(session_dependency),
    category: Optional[str] = None,
    kind: Optional[str] = None,
    author: Optional[str] = None,
    q: Optional[str] = Query(None, description="substring match on title or author"),
) -> list[WorkOut]:
    statement = select(Work)
    if category:
        statement = statement.where(Work.category == category)
    if kind:
        statement = statement.where(Work.kind == kind)
    if author:
        statement = statement.where(col(Work.author).ilike(f"%{author}%"))
    if q:
        statement = statement.where(
            col(Work.title).ilike(f"%{q}%") | col(Work.author).ilike(f"%{q}%")
        )
    works = session.exec(statement.order_by(Work.category, Work.title)).all()
    return [work_to_out(work) for work in works]


@router.get("/works/{work_id}", response_model=WorkOut)
def get_work(work_id: str, session: Session = Depends(session_dependency)) -> WorkOut:
    work = session.get(Work, work_id)
    if work is None:
        raise HTTPException(404, f"no work with id {work_id!r}")
    return work_to_out(work)


@router.get("/works/{work_id}/sections", response_model=list[SectionOut])
def get_sections(work_id: str, session: Session = Depends(session_dependency)) -> list[SectionOut]:
    if session.get(Work, work_id) is None:
        raise HTTPException(404, f"no work with id {work_id!r}")

    sections = session.exec(
        select(Section).where(Section.work_id == work_id).order_by(Section.order_index)
    ).all()

    # Pull kind+text so we can distinguish title stubs from real paragraphs.
    block_rows = session.exec(
        select(Block.section_id, Block.kind, Block.text)
        .where(Block.work_id == work_id)
        .where(col(Block.section_id).is_not(None))
    ).all()
    counts: dict[str, int] = {}
    content_counts: dict[str, int] = {}
    for section_id, kind, text in block_rows:
        if not section_id:
            continue
        counts[section_id] = counts.get(section_id, 0) + 1
        if _is_content_block(kind, text):
            content_counts[section_id] = content_counts.get(section_id, 0) + 1

    nodes = {
        s.id: SectionOut(
            id=s.id,
            title=s.title,
            level=s.level,
            blockCount=counts.get(s.id, 0),
            contentBlockCount=0
            if _FRONT_MATTER_RE.match(s.title.strip())
            else content_counts.get(s.id, 0),
            children=[],
        )
        for s in sections
    }
    roots: list[SectionOut] = []
    for section in sections:
        node = nodes[section.id]
        parent = nodes.get(section.parent_id) if section.parent_id else None
        if parent is None:
            roots.append(node)
        else:
            parent.children.append(node)
    return roots


@router.get("/sections/{section_id:path}/blocks", response_model=list[ParagraphOut])
def get_section_blocks(
    section_id: str, session: Session = Depends(session_dependency)
) -> list[ParagraphOut]:
    blocks = session.exec(
        select(Block).where(Block.section_id == section_id).order_by(Block.order_index)
    ).all()
    if not blocks:
        # Empty front-matter / structural TOC nodes used to 404; return [] so
        # the reader can show a friendly empty state instead of a hard error.
        section = session.get(Section, section_id)
        if section is None:
            raise HTTPException(404, f"no section {section_id!r}")
        return []
    return [block_to_paragraph(block) for block in blocks]


@router.get("/works/{work_id}/blocks", response_model=list[ParagraphOut])
def get_work_blocks(
    work_id: str,
    session: Session = Depends(session_dependency),
    offset: int = 0,
    limit: int = Query(200, le=2000),
) -> list[ParagraphOut]:
    if session.get(Work, work_id) is None:
        raise HTTPException(404, f"no work with id {work_id!r}")
    blocks = session.exec(
        select(Block)
        .where(Block.work_id == work_id)
        .order_by(Block.order_index)
        .offset(offset)
        .limit(limit)
    ).all()
    return [block_to_paragraph(block) for block in blocks]


@router.get("/locus/{work_id}/{locus_id:path}", response_model=list[BlockDetailOut])
def get_locus(
    work_id: str, locus_id: str, session: Session = Depends(session_dependency)
) -> list[BlockDetailOut]:
    """Return a locus and any continuation blocks (CCC.1803 plus CCC.1803.1...)."""
    blocks = session.exec(
        select(Block)
        .where(Block.work_id == work_id)
        .where((Block.locus_id == locus_id) | col(Block.locus_id).startswith(f"{locus_id}."))
        .order_by(Block.order_index)
    ).all()
    if not blocks:
        raise HTTPException(404, f"no block at locus {locus_id!r} in {work_id!r}")

    pks = [block.pk for block in blocks]
    footnotes = session.exec(select(Footnote).where(col(Footnote.block_pk).in_(pks))).all()
    crossrefs = session.exec(select(CrossRef).where(col(CrossRef.from_block_pk).in_(pks))).all()

    out: list[BlockDetailOut] = []
    for block in blocks:
        out.append(
            BlockDetailOut(
                id=block.id,
                locusId=block.locus_id,
                label=block.label,
                kind=block.kind,
                text=block.text,
                workId=block.work_id,
                sectionId=block.section_id,
                footnotes=[
                    FootnoteOut(marker=f.marker, text=f.text) for f in footnotes if f.block_pk == block.pk
                ],
                crossrefs=[
                    CrossRefOut(targetLocus=c.target_locus, kind=c.kind)
                    for c in crossrefs
                    if c.from_block_pk == block.pk
                ],
            )
        )
    return out


@router.get("/stats")
def stats(session: Session = Depends(session_dependency)) -> dict:
    works = session.exec(select(func.count()).select_from(Work)).one()
    blocks = session.exec(select(func.count()).select_from(Block)).one()
    return {"works": works, "blocks": blocks}
