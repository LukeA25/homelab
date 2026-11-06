"""Shared vocabulary between EPUB parsers and the persistence layer.

A parser's only job is to turn a source file into these plain dataclasses. It
never touches the database and never modifies the source file, which is what
makes `ingest --reparse` safe to run at any time.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Protocol, runtime_checkable


@dataclass
class ParsedSection:
    id: str
    title: str
    parent_id: Optional[str] = None
    level: int = 0
    order_index: int = 0


@dataclass
class ParsedFootnote:
    marker: str
    text: str


@dataclass
class ParsedCrossRef:
    target_locus: str
    kind: str = "scripture"


@dataclass
class ParsedBlock:
    locus_id: str
    text: str
    label: str = ""
    kind: str = "paragraph"  # verse | paragraph | heading | quote
    section_id: Optional[str] = None
    order_index: int = 0

    # Populated only for Bible works.
    book_number: Optional[int] = None
    chapter: Optional[int] = None
    verse: Optional[int] = None

    footnotes: list[ParsedFootnote] = field(default_factory=list)
    crossrefs: list[ParsedCrossRef] = field(default_factory=list)


@dataclass
class ParsedBibleBook:
    number: int
    name: str  # canonical
    display_name: str
    testament: str = "OT"
    canon_order: int = 0
    chapter_count: int = 0


@dataclass
class ParsedWork:
    """Everything a parser extracted, ready to be written to the database."""

    title: str
    author: str = ""
    short_title: str = ""
    kind: str = "book"
    description: str = ""
    translation: Optional[str] = None
    edition: Optional[str] = None
    translator: Optional[str] = None
    rights: str = "Unknown"

    sections: list[ParsedSection] = field(default_factory=list)
    blocks: list[ParsedBlock] = field(default_factory=list)
    books: list[ParsedBibleBook] = field(default_factory=list)


@runtime_checkable
class WorkParser(Protocol):
    """Implemented by each format adapter (NABRE, CCC, generic EPUB)."""

    name: str
    version: int

    def detect(self, epub) -> bool:
        """True if this parser recognizes the file."""

    def parse(self, epub, work_id: str) -> ParsedWork:
        """Extract structure and text. Must not mutate the source file."""
