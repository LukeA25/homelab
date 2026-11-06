"""Content schema for the theology library.

Content (works, sections, blocks) is kept strictly separate from user data
(notes, highlights, bookmarks) so that re-importing or re-parsing a source file
can never destroy anything the user wrote. Everything the user creates points at
a `Block.locus_id`, which is stable across re-parses.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, Index, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Work(SQLModel, table=True):
    """A single imported text. `file_path` always points at an unmodified original."""

    id: str = Field(primary_key=True)
    title: str
    short_title: str = ""
    author: str = ""
    kind: str = "book"  # bible | catechism | summa | book | fathers
    category: str = "reference"
    description: str = ""

    translation: Optional[str] = None  # e.g. "NABRE"; None for non-Bible works
    edition: Optional[str] = None
    translator: Optional[str] = None

    source: str = "Unknown"  # "Purchased", "Project Gutenberg", ...
    source_url: Optional[str] = None
    rights: str = "Unknown"  # "Public Domain", "All rights reserved", ...

    format: str = "epub"
    file_path: str = ""  # relative to LIBRARY_DIR
    file_sha256: str = ""

    parser: str = "generic"
    parser_version: int = 1
    imported_at: datetime = Field(default_factory=_now)

    block_count: int = 0


class Section(SQLModel, table=True):
    """A node in a work's table of contents. Forms a tree via `parent_id`."""

    id: str = Field(primary_key=True)
    work_id: str = Field(foreign_key="work.id", index=True)
    parent_id: Optional[str] = Field(default=None, index=True)
    order_index: int = 0
    level: int = 0
    title: str = ""

    __table_args__ = (Index("ix_section_work_order", "work_id", "order_index"),)


class Block(SQLModel, table=True):
    """A verse, paragraph, or heading. The atom of display and search.

    `pk` is an internal integer used to join the FTS index; `id` and `locus_id`
    are the stable public identifiers.
    """

    pk: Optional[int] = Field(default=None, primary_key=True)
    id: str = Field(index=True, unique=True)
    work_id: str = Field(foreign_key="work.id", index=True)
    section_id: Optional[str] = Field(default=None, index=True)
    order_index: int = 0

    locus_id: str = Field(index=True)  # "Matt.16.24", "CCC.2085"
    label: str = ""  # "24", "2085"
    kind: str = "paragraph"  # verse | paragraph | heading | quote
    text: str = ""

    __table_args__ = (
        Index("ix_block_work_locus", "work_id", "locus_id"),
        Index("ix_block_section_order", "section_id", "order_index"),
    )


class BibleBook(SQLModel, table=True):
    """One book of a Bible work. `number` is the translation's own numbering.

    The NABRE EPUB numbers Genesis 1 through Revelation 74 with gaps, so the
    number is read from the file rather than assumed.
    """

    pk: Optional[int] = Field(default=None, primary_key=True)
    work_id: str = Field(foreign_key="work.id", index=True)
    number: int = Field(index=True)
    name: str = Field(index=True)  # canonical name used by the reference parser
    display_name: str = ""  # as printed in the source
    abbrev: str = ""
    testament: str = "OT"  # OT | NT
    canon_order: int = 0
    chapter_count: int = 0

    __table_args__ = (Index("ix_biblebook_work_number", "work_id", "number"),)


class BibleVerse(SQLModel, table=True):
    """Lookup index turning (book, chapter, verse) into a Block in one hop."""

    pk: Optional[int] = Field(default=None, primary_key=True)
    work_id: str = Field(foreign_key="work.id", index=True)
    book_number: int = 0
    chapter: int = 0
    verse: int = 0
    block_pk: int = Field(index=True)

    __table_args__ = (
        Index("ix_verse_lookup", "work_id", "book_number", "chapter", "verse"),
    )


class Footnote(SQLModel, table=True):
    """Editorial footnote lifted out of the body text so it cannot corrupt it."""

    pk: Optional[int] = Field(default=None, primary_key=True)
    work_id: str = Field(foreign_key="work.id", index=True)
    block_pk: Optional[int] = Field(default=None, index=True)
    marker: str = ""
    text: str = ""


class CrossRef(SQLModel, table=True):
    """A pointer out of a block: a scripture citation or a marginal reference."""

    pk: Optional[int] = Field(default=None, primary_key=True)
    work_id: str = Field(foreign_key="work.id", index=True)
    from_block_pk: Optional[int] = Field(default=None, index=True)
    target_locus: str = ""
    kind: str = "scripture"  # scripture | marginal | footnote


# --- User data (never touched by re-import) ---------------------------------


class Note(SQLModel, table=True):
    id: str = Field(primary_key=True)
    title: str = ""
    section: str = "personal"  # personal | apologetics
    body: str = ""
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class AskThread(SQLModel, table=True):
    __tablename__ = "ask_thread"
    id: str = Field(primary_key=True)
    title: str = "New chat"
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class AskMessageRow(SQLModel, table=True):
    __tablename__ = "ask_message"
    id: str = Field(primary_key=True)
    thread_id: str = Field(index=True, foreign_key="ask_thread.id")
    role: str = "user"  # user | assistant
    content: str = ""
    response_json: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)


class Highlight(SQLModel, table=True):
    id: str = Field(primary_key=True)
    work_id: str = Field(index=True)
    paragraph_id: str = Field(index=True)
    locus_id: str = Field(index=True)
    color: str = "amber"
    created_at: datetime = Field(default_factory=_now)


class Bookmark(SQLModel, table=True):
    id: str = Field(primary_key=True)
    work_id: str = Field(index=True)
    """Scope for uniqueness: work_id for books, or bible book prefix e.g. bible-nabre/Mt."""
    scope: str = Field(default="", index=True)
    section_id: str = Field(default="", index=True)
    paragraph_id: str = Field(index=True)
    locus_id: str = Field(index=True)
    label: str = ""
    note: str = ""
    created_at: datetime = Field(default_factory=_now)