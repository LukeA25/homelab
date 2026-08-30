"""Ingest orchestration: file intake, parser selection, and persistence.

The source file is treated as immutable. Importing copies it into the library
under its category, records a SHA-256, and writes the parsed representation to
the database. Re-parsing later rebuilds every row from that same untouched file.
"""

from __future__ import annotations

import hashlib
import logging
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from sqlmodel import Session, delete, select

from ..config import LIBRARY_DIR, category_dir
from ..db import engine, reindex_work
from ..models import BibleBook, BibleVerse, Block, CrossRef, Footnote, Section, Work
from .base import ParsedWork
from .ccc import CccParser
from .epub import EpubFile, slugify
from .generic import GenericEpubParser
from .nabre import NabreParser
from .summa import COMBINED_WORK_ID, SummaParser

log = logging.getLogger(__name__)

# Order matters: the generic parser matches everything, so it must come last.
PARSERS = [NabreParser(), CccParser(), SummaParser(), GenericEpubParser()]
PARSERS_BY_NAME = {parser.name: parser for parser in PARSERS}


@dataclass
class IngestResult:
    work_id: str
    title: str
    parser: str
    blocks: int
    sections: int
    books: int
    verses: int
    footnotes: int
    crossrefs: int
    indexed: int
    file_path: str
    reused_existing_file: bool
    structure_source: str = ""  # "", "cache", "llm", "heuristic"


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def select_parser(epub: EpubFile, requested: Optional[str] = None):
    if requested and requested != "auto":
        if requested not in PARSERS_BY_NAME:
            raise ValueError(f"unknown parser {requested!r}; expected one of {', '.join(PARSERS_BY_NAME)}")
        return PARSERS_BY_NAME[requested]
    for parser in PARSERS:
        if parser.detect(epub):
            return parser
    return PARSERS[-1]


def file_for_work(source: Path, category: str, filename: Optional[str] = None) -> tuple[Path, bool]:
    """Place the source file in its category folder, returning (path, was_already_there)."""
    target_dir = category_dir(category)
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / (filename or source.name)

    if source.resolve() == target.resolve():
        return target, True
    if target.exists() and sha256_of(target) == sha256_of(source):
        return target, True
    shutil.copy2(source, target)
    return target, False


def _clear_work(session: Session, work_id: str) -> None:
    """Remove every content row for a work. User data is in other tables."""
    for model in (BibleVerse, Footnote, CrossRef, Block, Section, BibleBook):
        session.execute(delete(model).where(model.work_id == work_id))
    session.commit()


def persist(
    session: Session,
    work_id: str,
    parsed: ParsedWork,
    *,
    parser_name: str,
    parser_version: int,
    category: str,
    source: str,
    source_url: Optional[str],
    rights: Optional[str],
    file_path: Path,
    file_sha256: str,
) -> IngestResult:
    _clear_work(session, work_id)

    work = session.get(Work, work_id)
    if work is None:
        work = Work(id=work_id)
        session.add(work)

    work.title = parsed.title
    work.short_title = parsed.short_title or parsed.title[:40]
    work.author = parsed.author
    work.kind = parsed.kind
    work.category = category
    work.description = parsed.description
    work.translation = parsed.translation
    work.edition = parsed.edition
    work.translator = parsed.translator
    work.source = source
    work.source_url = source_url
    work.rights = rights or parsed.rights
    work.format = "epub"
    work.file_path = str(file_path.relative_to(LIBRARY_DIR))
    work.file_sha256 = file_sha256
    work.parser = parser_name
    work.parser_version = parser_version
    work.block_count = len(parsed.blocks)
    session.commit()

    for section in parsed.sections:
        session.add(
            Section(
                id=section.id,
                work_id=work_id,
                parent_id=section.parent_id,
                order_index=section.order_index,
                level=section.level,
                title=section.title,
            )
        )
    session.commit()

    for book in parsed.books:
        session.add(
            BibleBook(
                work_id=work_id,
                number=book.number,
                name=book.name,
                display_name=book.display_name,
                abbrev=book.name,
                testament=book.testament,
                canon_order=book.canon_order,
                chapter_count=book.chapter_count,
            )
        )
    session.commit()

    verses = footnotes = crossrefs = 0
    batch: list[Block] = []
    for parsed_block in parsed.blocks:
        batch.append(
            Block(
                id=f"{work_id}:{parsed_block.locus_id}",
                work_id=work_id,
                section_id=parsed_block.section_id,
                order_index=parsed_block.order_index,
                locus_id=parsed_block.locus_id,
                label=parsed_block.label,
                kind=parsed_block.kind,
                text=parsed_block.text,
            )
        )
        if len(batch) >= 2000:
            session.add_all(batch)
            session.commit()
            batch = []
    if batch:
        session.add_all(batch)
        session.commit()

    # Second pass: rows that need the generated Block.pk.
    pk_by_locus = {
        locus: pk
        for locus, pk in session.execute(
            select(Block.locus_id, Block.pk).where(Block.work_id == work_id)
        ).all()
    }

    pending: list = []
    for parsed_block in parsed.blocks:
        block_pk = pk_by_locus.get(parsed_block.locus_id)
        if block_pk is None:
            continue
        if parsed_block.verse is not None:
            pending.append(
                BibleVerse(
                    work_id=work_id,
                    book_number=parsed_block.book_number or 0,
                    chapter=parsed_block.chapter or 0,
                    verse=parsed_block.verse,
                    block_pk=block_pk,
                )
            )
            verses += 1
        for note in parsed_block.footnotes:
            pending.append(
                Footnote(work_id=work_id, block_pk=block_pk, marker=note.marker, text=note.text)
            )
            footnotes += 1
        for ref in parsed_block.crossrefs:
            pending.append(
                CrossRef(
                    work_id=work_id,
                    from_block_pk=block_pk,
                    target_locus=ref.target_locus,
                    kind=ref.kind,
                )
            )
            crossrefs += 1
        if len(pending) >= 2000:
            session.add_all(pending)
            session.commit()
            pending = []
    if pending:
        session.add_all(pending)
        session.commit()

    indexed = reindex_work(session, work_id)

    return IngestResult(
        work_id=work_id,
        title=parsed.title,
        parser=parser_name,
        blocks=len(parsed.blocks),
        sections=len(parsed.sections),
        books=len(parsed.books),
        verses=verses,
        footnotes=footnotes,
        crossrefs=crossrefs,
        indexed=indexed,
        file_path=work.file_path,
        reused_existing_file=False,
        structure_source="",
    )


def enhance_generic_structure(
    parsed: ParsedWork,
    *,
    work_id: str,
    epub_path: Path,
    file_sha256: str,
    parser_version: int,
    regen: bool = False,
) -> tuple[ParsedWork, str]:
    """Apply a cached or freshly planned parse profile when heuristics look weak.

    Returns (parsed, source) where source is cache|llm|heuristic|"".
    """
    from .structure import (
        apply_parse_profile,
        load_parse_profile,
        needs_structure_help,
        profile_is_compatible,
        save_parse_profile,
    )
    from .structure_llm import plan_parse_profile

    if not needs_structure_help(parsed) and not regen:
        return parsed, "heuristic"

    cached = None if regen else load_parse_profile(epub_path)
    if cached and profile_is_compatible(
        cached,
        work_id=work_id,
        file_sha256=file_sha256,
        parser_version=parser_version,
    ):
        try:
            return apply_parse_profile(work_id, parsed, cached), "cache"
        except ValueError as exc:
            log.warning("cached parse profile failed for %s: %s", work_id, exc)

    planned = plan_parse_profile(
        parsed,
        work_id=work_id,
        file_sha256=file_sha256,
        parser_version=parser_version,
    )
    if planned is None:
        return parsed, "heuristic"

    save_parse_profile(epub_path, planned)
    try:
        return apply_parse_profile(work_id, parsed, planned), "llm"
    except ValueError as exc:
        log.warning("planned parse profile failed for %s: %s", work_id, exc)
        return parsed, "heuristic"


def ingest(
    path: Path,
    *,
    category: str,
    source: str = "Unknown",
    source_url: Optional[str] = None,
    rights: Optional[str] = None,
    work_id: Optional[str] = None,
    parser_name: Optional[str] = None,
    title_override: Optional[str] = None,
    author_override: Optional[str] = None,
    regen_structure: bool = False,
) -> IngestResult:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(path)

    target, already_there = file_for_work(path, category)
    digest = sha256_of(target)

    with EpubFile(target) as epub:
        parser = select_parser(epub, parser_name)
        resolved_id = work_id or slugify(
            title_override or epub.metadata.get("title") or target.stem, fallback=target.stem
        )
        if parser.name == "summa":
            resolved_id = COMBINED_WORK_ID
        parsed = parser.parse(epub, resolved_id)

    if title_override:
        parsed.title = title_override
    if author_override:
        parsed.author = author_override

    structure_source = ""
    if parser.name == "generic":
        parsed, structure_source = enhance_generic_structure(
            parsed,
            work_id=resolved_id,
            epub_path=target,
            file_sha256=digest,
            parser_version=parser.version,
            regen=regen_structure,
        )

    with Session(engine) as session:
        result = persist(
            session,
            resolved_id,
            parsed,
            parser_name=parser.name,
            parser_version=parser.version,
            category=category,
            source=source,
            source_url=source_url,
            rights=rights,
            file_path=target,
            file_sha256=digest,
        )
        if parser.name == "summa":
            # Drop legacy split Part I / I-II works after successful combine.
            for legacy_id in ("summa-theologica-1", "summa-theologica-1-2"):
                if legacy_id == resolved_id:
                    continue
                _clear_work(session, legacy_id)
                legacy = session.get(Work, legacy_id)
                if legacy is not None:
                    session.delete(legacy)
                    session.commit()
                    log.info("removed legacy Summa work %s", legacy_id)
    result.reused_existing_file = already_there
    result.structure_source = structure_source
    return result


def reparse(work_id: str, *, regen_structure: bool = False) -> IngestResult:
    """Rebuild a work's rows from its untouched source file."""
    with Session(engine) as session:
        work = session.get(Work, work_id)
        if work is None:
            raise KeyError(f"no work with id {work_id!r}")
        target = LIBRARY_DIR / work.file_path
        metadata = (
            work.category,
            work.source,
            work.source_url,
            work.rights,
            work.parser,
            work.title,
            work.author,
            work.description,
            work.short_title,
        )

    if not target.exists():
        raise FileNotFoundError(target)

    category, source, source_url, rights, parser_name, title, author, description, short_title = metadata
    force_parser = parser_name if parser_name and parser_name != "generic" else None
    if work_id.startswith("summa-theologica"):
        force_parser = "summa"
    with EpubFile(target) as epub:
        parser = select_parser(epub, force_parser)
        parse_id = COMBINED_WORK_ID if parser.name == "summa" else work_id
        parsed = parser.parse(epub, parse_id)

    if title and parser.name != "summa":
        parsed.title = title
    if short_title and parser.name != "summa":
        parsed.short_title = short_title
    if author:
        parsed.author = author
    if description and parser.name != "summa":
        parsed.description = description

    structure_source = ""
    if parser.name == "generic":
        parsed, structure_source = enhance_generic_structure(
            parsed,
            work_id=work_id,
            epub_path=target,
            file_sha256=sha256_of(target),
            parser_version=parser.version,
            regen=regen_structure,
        )

    persist_id = COMBINED_WORK_ID if parser.name == "summa" else work_id
    with Session(engine) as session:
        result = persist(
            session,
            persist_id,
            parsed,
            parser_name=parser.name,
            parser_version=parser.version,
            category=category,
            source=source,
            source_url=source_url,
            rights=rights,
            file_path=target,
            file_sha256=sha256_of(target),
        )
        if parser.name == "summa":
            for legacy_id in ("summa-theologica-1", "summa-theologica-1-2"):
                if legacy_id == persist_id:
                    continue
                _clear_work(session, legacy_id)
                legacy = session.get(Work, legacy_id)
                if legacy is not None:
                    session.delete(legacy)
                    session.commit()
    result.structure_source = structure_source
    return result
