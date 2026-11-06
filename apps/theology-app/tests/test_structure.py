"""Unit tests for parse profiles (no LLM)."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.importer.base import ParsedBlock, ParsedSection, ParsedWork  # noqa: E402
from app.importer.structure import (  # noqa: E402
    ParseProfile,
    apply_parse_profile,
    needs_structure_help,
    validate_parse_profile,
)


def _page_blocks() -> list[ParsedBlock]:
    pages = [
        "Google This is a digital copy of a book that was preserved for generations. Usage guidelines ask that you: + Make non-commercial use Digitized by Google",
        "CONTENTS PAGE CHAPTER I Something 9 CHAPTER II Other 11 CHAPTER III More 13 Digitized by Google",
        "THE ASCENT OF MOUNT CARMEL BOOK I THE NATURE OF THE DARK NIGHT CHAPTER I. Two kinds of this night corresponding with the division of the soul. Digitized by Google",
        "THE ASCENT OF MOUNT CARMEL more body text about beginners and desires continuing the argument from before. Digitized by Google",
        "THE ASCENT OF MOUNT CARMEL CHAPTER II. The nature and cause of the dark night is explained for the reader at length with examples. Digitized by Google",
        "THE ASCENT OF MOUNT CARMEL CHAPTER III. The first cause of this night, the privation of the desire in all things, is treated next. Digitized by Google",
        "BOOK II PROXIMATE MEANS OF UNION CHAPTER I. The second stanza begins the second book of the treatise. Digitized by Google",
        "CHAPTER II. Faith, the dark night of the soul. Proofs from reason and the Holy Scriptures follow here. Digitized by Google",
    ]
    return [
        ParsedBlock(locus_id=f"w.{i+1}", text=t, kind="paragraph", order_index=i + 1)
        for i, t in enumerate(pages)
    ]


def test_validate_rejects_broad_regex() -> None:
    try:
        validate_parse_profile(ParseProfile(chapter_pattern=".*", book_pattern="BOOK"))
        raise AssertionError("expected ValueError")
    except ValueError:
        pass


def test_apply_splits_chapters_and_strips_google() -> None:
    profile = validate_parse_profile(
        ParseProfile(
            work_id="w",
            title="Ascent of Mount Carmel",
            running_headers=["THE ASCENT OF MOUNT CARMEL"],
            strip_patterns=["Digitized by Google"],
            skip_page_if_matches=["Usage guidelines", "This is a digital copy of a book", "CONTENTS"],
            book_pattern=r"BOOK\s+[IVXLC0-9]+",
            chapter_pattern=r"CHAPTER\s+[IVXLC0-9]+\.?",
            prologue_pattern=r"PROLOGUE\b",
            split_on_heading_inside_page=True,
        )
    )
    parsed = ParsedWork(title="Ascent", author="John", blocks=_page_blocks(), sections=[])
    out = apply_parse_profile("w", parsed, profile)
    titles = [s.title for s in out.sections]
    assert any("BOOK I" in t.upper() for t in titles), titles
    assert sum(1 for t in titles if "CHAPTER" in t.upper()) >= 3, titles
    joined = "\n".join(b.text for b in out.blocks)
    assert "Digitized by Google" not in joined
    assert "Usage guidelines" not in joined
    assert "CONTENTS PAGE" not in joined


def test_needs_structure_help_page_chunks() -> None:
    blocks = [
        ParsedBlock(locus_id=f"w.{i}", text="x" * 1000, kind="paragraph", order_index=i)
        for i in range(1, 6)
    ]
    parsed = ParsedWork(
        title="X",
        blocks=blocks,
        sections=[
            ParsedSection(id="w/s1", title="Pages 1–18", order_index=1),
            ParsedSection(id="w/s2", title="Pages 19–36", order_index=2),
        ],
    )
    assert needs_structure_help(parsed) is True


def run() -> int:
    test_validate_rejects_broad_regex()
    test_apply_splits_chapters_and_strips_google()
    test_needs_structure_help_page_chunks()
    print("OK parse profile tests")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
