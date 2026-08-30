"""Dedicated parser for Aquinas's Summa Theologica (Benziger / Gutenberg).

Combines Prima Pars + Prima Secundae into one navigable work:

  Part (L0) → Treatise (L1) → Question (L2 "chapter")

Loci are citation-stable: ``ST.I.Q1``, ``ST.I.Q1.A1``, ``ST.I-II.Q6.A2``.
Articles that Gutenberg left as ``<p>`` are promoted to headings.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .base import ParsedBlock, ParsedSection, ParsedWork
from .epub import EpubFile
from .htmltext import body_of, element_text, parse_xhtml

BLOCK_TAGS = ("p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "li")
HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
MIN_TEXT_LENGTH = 2

SKIP_FILES = (
    "cover",
    "titlepage",
    "copyright",
    "toc",
    "nav",
    "colophon",
    "notice",
)

PART_HEADING_RE = re.compile(
    r'^PART\s+(I-II|II-II|III|I)\b',
    re.IGNORECASE,
)
QUESTION_RE = re.compile(r'^QUESTION\s+(\d+)\s*$', re.IGNORECASE)
# Title line after QUESTION N, e.g. "THE NATURE AND EXTENT OF SACRED DOCTRINE (in Ten Articles)"
QUESTION_TITLE_RE = re.compile(
    r'^[A-Z][A-Z0-9\s\'\",;:\-\(\)\.]+(?:\(.*ARTICLES?\))?$',
)
ARTICLE_RE = re.compile(
    r'ARTICLE\s*\[\s*(I-II|II-II|III|I)\s*,\s*Q\.?\s*(\d+)\s*,\s*A(?:rt)?\.?\s*(\d+)\s*\]',
    re.IGNORECASE,
)
ARTICLE_ORDINAL_RE = re.compile(
    r'^(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH|'
    r'ELEVENTH|TWELFTH|THIRTEENTH|FOURTEENTH|FIFTEENTH|SIXTEENTH|'
    r'SEVENTEENTH|EIGHTEENTH|NINETEENTH|TWENTIETH)\s+ARTICLE\b',
    re.IGNORECASE,
)
ORDINAL_TO_N = {
    "first": 1,
    "second": 2,
    "third": 3,
    "fourth": 4,
    "fifth": 5,
    "sixth": 6,
    "seventh": 7,
    "eighth": 8,
    "ninth": 9,
    "tenth": 10,
    "eleventh": 11,
    "twelfth": 12,
    "thirteenth": 13,
    "fourteenth": 14,
    "fifteenth": 15,
    "sixteenth": 16,
    "seventeenth": 17,
    "eighteenth": 18,
    "nineteenth": 19,
    "twentieth": 20,
}
TREATISE_LINE_RE = re.compile(r'^TREATISE ON\b', re.IGNORECASE)
PROLOGUE_RE = re.compile(r'^PROLOGUE\b', re.IGNORECASE)
LICENSE_RE = re.compile(
    r'PROJECT GUTENBERG|FULL PROJECT GUTENBERG|END OF (THE )?PROJECT GUTENBERG',
    re.IGNORECASE,
)
CONTENTS_RE = re.compile(r'^CONTENTS\b', re.IGNORECASE)

# Manual treatise maps — Dominican / Benziger chapter organization.
# (start_q, end_q, title)
PART_I_TREATISES: list[tuple[int, int, str]] = [
    (1, 1, "Treatise on Sacred Doctrine"),
    (2, 26, "Treatise on the One God"),
    (27, 43, "Treatise on the Most Holy Trinity"),
    (44, 49, "Treatise on the Creation"),
    (50, 64, "Treatise on the Angels"),
    (65, 74, "Treatise on the Work of the Six Days"),
    (75, 102, "Treatise on Man"),
    (103, 119, "Treatise on the Divine Government"),
]

PART_I_II_TREATISES: list[tuple[int, int, str]] = [
    (1, 5, "Treatise on the Last End"),
    (6, 21, "Treatise on Human Acts"),
    (22, 48, "Treatise on the Passions"),
    (49, 54, "Treatise on Habits"),
    (55, 70, "Treatise on Virtues"),
    (71, 89, "Treatise on Vice and Sin"),
    (90, 108, "Treatise on Law"),
    (109, 114, "Treatise on Grace"),
]

PART_META = {
    "I": {
        "code": "I",
        "title": "Part I (Prima Pars)",
        "section_slug": "part-i",
        "treatises": PART_I_TREATISES,
        "file_names": ("summa-theologica-1.epub",),
        "detect": ("prima pars", "part i (", "part i "),
    },
    "I-II": {
        "code": "I-II",
        "title": "Part I-II (Prima Secundae)",
        "section_slug": "part-i-ii",
        "treatises": PART_I_II_TREATISES,
        "file_names": ("summa-theologica-1-2.epub",),
        "detect": ("prima secundae", "part i-ii", "pars prima secundae"),
    },
}

COMBINED_WORK_ID = "summa-theologica"
LEGACY_PART_IDS = {
    "summa-theologica-1": "I",
    "summa-theologica-1-2": "I-II",
}


@dataclass
class _RawBlock:
    text: str
    kind: str  # heading | paragraph | quote


def _norm(text: str) -> str:
    return " ".join((text or "").split()).strip()


def _title_case_question(raw: str) -> str:
    """Turn ALL-CAPS question titles into readable Title Case-ish labels."""
    t = _norm(raw)
    if not t:
        return t
    letters = [c for c in t if c.isalpha()]
    if not letters or sum(1 for c in letters if c.isupper()) < len(letters) * 0.55:
        return t
    small = {"of", "the", "and", "in", "on", "to", "a", "an", "for", "from", "with", "or", "as"}
    words: list[str] = []
    for i, token in enumerate(t.split()):
        prefix = ""
        suffix = ""
        body = token
        while body and body[0] in "([*\"":
            prefix += body[0]
            body = body[1:]
        while body and body[-1] in ")].,;:\"":
            suffix = body[-1] + suffix
            body = body[:-1]
        if not body:
            words.append(token)
            continue
        if i > 0 and body.lower() in small:
            words.append(prefix + body.lower() + suffix)
        else:
            words.append(prefix + body[:1].upper() + body[1:].lower() + suffix)
    return " ".join(words)


def _treatise_for(part_code: str, q: int) -> tuple[int, str]:
    meta = PART_META[part_code]
    for idx, (start, end, title) in enumerate(meta["treatises"]):
        if start <= q <= end:
            return idx, title
    return 0, f"Questions ({part_code})"


class SummaParser:
    name = "summa"
    version = 1

    def detect(self, epub: EpubFile) -> bool:
        title = (epub.metadata.get("title") or "").lower()
        if "summa theologica" in title or "summa theologi" in title:
            return True
        # Filename / path fallback when metadata is thin.
        name = epub.path.name.lower()
        if "summa-theologica" in name or "summa_theologica" in name:
            return True
        # Probe early spine for QUESTION + ARTICLE citation pattern.
        for href in epub.spine[:30]:
            try:
                raw = epub.read(href)
            except KeyError:
                continue
            if b"QUESTION" in raw and b"ARTICLE" in raw and (b"[I," in raw or b"[I-II," in raw):
                return True
        return False

    @staticmethod
    def _skip_file(href: str) -> bool:
        lowered = href.rsplit("/", 1)[-1].lower()
        return any(token in lowered for token in SKIP_FILES)

    def _detect_part_code(self, epub: EpubFile) -> str:
        title = (epub.metadata.get("title") or "").lower()
        name = epub.path.name.lower()
        for code, meta in PART_META.items():
            if any(token in title for token in meta["detect"]):
                return code
            if any(token.replace(" ", "-") in name or token in name for token in meta["detect"]):
                return code
        if "1-2" in name or "i-ii" in name or "1_2" in name:
            return "I-II"
        return "I"

    def _extract_raw_blocks(self, epub: EpubFile) -> list[_RawBlock]:
        out: list[_RawBlock] = []
        for href in epub.spine:
            if self._skip_file(href):
                continue
            try:
                raw = epub.read(href)
            except KeyError:
                continue
            root = parse_xhtml(raw)
            if root is None:
                continue
            body = body_of(root)
            for element in body.iter(*BLOCK_TAGS):
                parent = element.getparent()
                if parent is not None and parent.tag in ("blockquote", "li"):
                    continue
                text = _norm(element_text(element))
                if len(text) < MIN_TEXT_LENGTH:
                    continue
                if element.tag in HEADING_TAGS:
                    kind = "heading"
                elif element.tag == "blockquote":
                    kind = "quote"
                else:
                    kind = "paragraph"
                # Promote Summa structural lines even when they are <p>.
                if kind == "paragraph":
                    if (
                        QUESTION_RE.match(text)
                        or ARTICLE_RE.search(text)
                        or PART_HEADING_RE.match(text)
                        or TREATISE_LINE_RE.match(text)
                        or PROLOGUE_RE.match(text)
                    ):
                        kind = "heading"
                out.append(_RawBlock(text=text, kind=kind))
        return out

    def _trim_front_and_license(self, blocks: list[_RawBlock]) -> list[_RawBlock]:
        """Drop Gutenberg front/TOC noise and trailing license."""
        # Find body start: prefer first real QUESTION, else first ARTICLE citation.
        start = 0
        for i, b in enumerate(blocks):
            if QUESTION_RE.match(b.text):
                start = i
                break
            m = ARTICLE_RE.search(b.text)
            if m and int(m.group(2)) == 1 and int(m.group(3)) == 1:
                # I-II often lacks QUESTION 1 heading — start a bit earlier for prologue.
                start = max(0, i - 8)
                break
        else:
            # Fallback: first PART heading after some front matter.
            for i, b in enumerate(blocks):
                if PART_HEADING_RE.match(b.text) and i > 5:
                    start = i
                    break

        # Prefer including the body PROLOGUE just before Q1 when present.
        for j in range(max(0, start - 15), start):
            if PROLOGUE_RE.match(blocks[j].text) and not CONTENTS_RE.match(blocks[j].text):
                # Skip TOC "PROLOGUE" if still inside CONTENTS region.
                window = " ".join(b.text for b in blocks[max(0, j - 5) : j + 1])
                if not CONTENTS_RE.search(window):
                    start = j
                    break

        trimmed = blocks[start:]
        end = len(trimmed)
        for i, b in enumerate(trimmed):
            if LICENSE_RE.search(b.text) and i > 20:
                end = i
                break
        return trimmed[:end]

    def _parse_part(
        self,
        epub: EpubFile,
        work_id: str,
        part_code: str,
        *,
        section_order_start: int = 1,
        block_order_start: int = 1,
    ) -> tuple[list[ParsedSection], list[ParsedBlock], int, int]:
        meta = PART_META[part_code]
        raw = self._trim_front_and_license(self._extract_raw_blocks(epub))

        sections: list[ParsedSection] = []
        blocks: list[ParsedBlock] = []
        order = section_order_start
        block_order = block_order_start

        part_id = f"{work_id}/{meta['section_slug']}"
        sections.append(
            ParsedSection(
                id=part_id,
                title=meta["title"],
                parent_id=None,
                level=0,
                order_index=order,
            )
        )
        order += 1

        treatise_ids: dict[int, str] = {}
        question_ids: dict[int, str] = {}
        used_loci: set[str] = set()

        def unique_locus(base: str) -> str:
            if base not in used_loci:
                used_loci.add(base)
                return base
            n = 2
            while f"{base}.{n}" in used_loci:
                n += 1
            locus = f"{base}.{n}"
            used_loci.add(locus)
            return locus

        def ensure_treatise(q: int) -> str:
            nonlocal order
            t_idx, t_title = _treatise_for(part_code, q)
            if t_idx in treatise_ids:
                return treatise_ids[t_idx]
            sid = f"{work_id}/{meta['section_slug']}/t{t_idx + 1}"
            sections.append(
                ParsedSection(
                    id=sid,
                    title=t_title,
                    parent_id=part_id,
                    level=1,
                    order_index=order,
                )
            )
            order += 1
            treatise_ids[t_idx] = sid
            return sid

        def ensure_question(q: int, title: str) -> str:
            nonlocal order
            if q in question_ids:
                # Update title if we only had a placeholder.
                for s in sections:
                    if s.id == question_ids[q] and s.title.startswith(f"Q. {q}") and "—" not in s.title and title:
                        nice = _title_case_question(title)
                        s.title = f"Q. {q} — {nice}"
                return question_ids[q]
            parent = ensure_treatise(q)
            nice = _title_case_question(title) if title else ""
            label = f"Q. {q} — {nice}" if nice else f"Q. {q}"
            sid = f"{work_id}/{meta['section_slug']}/q{q}"
            sections.append(
                ParsedSection(
                    id=sid,
                    title=label,
                    parent_id=parent,
                    level=2,
                    order_index=order,
                )
            )
            order += 1
            question_ids[q] = sid
            return sid

        current_q: Optional[int] = None
        current_section = part_id
        seen_body = False

        i = 0
        while i < len(raw):
            b = raw[i]
            text = b.text

            # Skip leftover TOC treatise lines before real body if they appear alone.
            if not seen_body and TREATISE_LINE_RE.match(text) and i + 1 < len(raw):
                nxt = raw[i + 1].text
                if QUESTION_RE.match(nxt) or ARTICLE_RE.search(nxt) or PROLOGUE_RE.match(nxt):
                    pass  # keep — rare
                elif CONTENTS_RE.match(text) or text.isupper() and len(text) < 80:
                    # Likely TOC residue; skip standalone TOC treatises near start.
                    if i < 30 and not ARTICLE_RE.search(text):
                        i += 1
                        continue

            qm = QUESTION_RE.match(text)
            if qm:
                seen_body = True
                qn = int(qm.group(1))
                # Gutenberg occasionally duplicates a QUESTION heading.
                if qn in question_ids:
                    i += 1
                    continue
                title = ""
                if i + 1 < len(raw):
                    nxt = raw[i + 1].text
                    if (
                        not QUESTION_RE.match(nxt)
                        and not ARTICLE_RE.search(nxt)
                        and not PART_HEADING_RE.match(nxt)
                        and not PROLOGUE_RE.match(nxt)
                        and len(nxt) < 220
                        and (
                            QUESTION_TITLE_RE.match(nxt)
                            or nxt.isupper()
                            or "article" in nxt.lower()
                            or "Articles" in nxt
                        )
                    ):
                        title = nxt
                pending_title = title
                current_q = qn
                current_section = ensure_question(qn, title)
                locus = unique_locus(f"ST.{part_code}.Q{qn}")
                blocks.append(
                    ParsedBlock(
                        locus_id=locus,
                        text=f"Question {qn}",
                        label=f"Q. {qn}",
                        kind="heading",
                        section_id=current_section,
                        order_index=block_order,
                    )
                )
                block_order += 1
                if pending_title:
                    blocks.append(
                        ParsedBlock(
                            locus_id=unique_locus(f"ST.{part_code}.Q{qn}.title"),
                            text=_title_case_question(pending_title),
                            label="",
                            kind="heading",
                            section_id=current_section,
                            order_index=block_order,
                        )
                    )
                    block_order += 1
                    i += 2
                    continue
                i += 1
                continue

            am = ARTICLE_RE.search(text)
            if am:
                seen_body = True
                a_part, a_q, a_n = am.group(1).upper(), int(am.group(2)), int(am.group(3))
                if a_part not in PART_META:
                    a_part = part_code
                # Prefer English ordinal when the bracket Art. number disagrees
                # (common Gutenberg OCR glitch: "NINTH ARTICLE [… Art. 8]").
                om = ARTICLE_ORDINAL_RE.match(text)
                if om:
                    ord_n = ORDINAL_TO_N.get(om.group(1).lower())
                    if ord_n and ord_n != a_n:
                        a_n = ord_n
                current_q = a_q
                current_section = ensure_question(a_q, "")
                locus = unique_locus(f"ST.{a_part}.Q{a_q}.A{a_n}")
                blocks.append(
                    ParsedBlock(
                        locus_id=locus,
                        text=text,
                        label=f"Art. {a_n}",
                        kind="heading",
                        section_id=current_section,
                        order_index=block_order,
                    )
                )
                block_order += 1
                i += 1
                continue

            if PROLOGUE_RE.match(text) and not CONTENTS_RE.match(text):
                seen_body = True
                if current_q is None:
                    current_section = part_id
                locus = unique_locus(f"ST.{part_code}.prologue")
                blocks.append(
                    ParsedBlock(
                        locus_id=locus,
                        text=text,
                        label="Prologue",
                        kind="heading",
                        section_id=current_section,
                        order_index=block_order,
                    )
                )
                block_order += 1
                i += 1
                continue

            if PART_HEADING_RE.match(text):
                blocks.append(
                    ParsedBlock(
                        locus_id=unique_locus(f"ST.{part_code}.part-heading"),
                        text=text,
                        label=meta["title"],
                        kind="heading",
                        section_id=part_id,
                        order_index=block_order,
                    )
                )
                block_order += 1
                i += 1
                continue

            # I-II Q1: title appears before first article without QUESTION heading.
            if (
                current_q is None
                and ("LAST END" in text.upper() or "MAN'S LAST END" in text.upper())
                and "article" in text.lower()
            ):
                seen_body = True
                current_q = 1
                current_section = ensure_question(1, text)
                blocks.append(
                    ParsedBlock(
                        locus_id=unique_locus(f"ST.{part_code}.Q1"),
                        text="Question 1",
                        label="Q. 1",
                        kind="heading",
                        section_id=current_section,
                        order_index=block_order,
                    )
                )
                block_order += 1
                blocks.append(
                    ParsedBlock(
                        locus_id=unique_locus(f"ST.{part_code}.Q1.title"),
                        text=_title_case_question(text),
                        label="",
                        kind="heading",
                        section_id=current_section,
                        order_index=block_order,
                    )
                )
                block_order += 1
                i += 1
                continue

            # Ordinary body text
            if current_q is not None:
                current_section = question_ids.get(current_q, current_section)
            if current_q is not None:
                locus = unique_locus(f"ST.{part_code}.Q{current_q}.p{block_order}")
            else:
                locus = unique_locus(f"ST.{part_code}.p{block_order}")
            blocks.append(
                ParsedBlock(
                    locus_id=locus,
                    text=text,
                    label="",
                    kind=b.kind if b.kind in ("heading", "quote", "paragraph") else "paragraph",
                    section_id=current_section,
                    order_index=block_order,
                )
            )
            block_order += 1
            i += 1

        return sections, blocks, order, block_order

    def _sibling_paths(self, epub: EpubFile) -> dict[str, Path]:
        directory = epub.path.parent
        found: dict[str, Path] = {}
        for code, meta in PART_META.items():
            for name in meta["file_names"]:
                candidate = directory / name
                if candidate.exists():
                    found[code] = candidate
                    break
            # Also accept the currently opened file under its detected code.
        code = self._detect_part_code(epub)
        found.setdefault(code, epub.path)
        return found

    def parse(self, epub: EpubFile, work_id: str) -> ParsedWork:
        # Always prefer the combined work id when either legacy or combined is requested.
        resolved_id = COMBINED_WORK_ID
        if work_id in LEGACY_PART_IDS:
            resolved_id = COMBINED_WORK_ID
        elif work_id and work_id != COMBINED_WORK_ID and not work_id.startswith("summa"):
            resolved_id = work_id

        siblings = self._sibling_paths(epub)
        # If only one part file is present, still parse that part alone under combined id.
        parts_order = [c for c in ("I", "I-II") if c in siblings]
        if not parts_order:
            parts_order = [self._detect_part_code(epub)]
            siblings[parts_order[0]] = epub.path

        all_sections: list[ParsedSection] = []
        all_blocks: list[ParsedBlock] = []
        section_order = 1
        block_order = 1

        for code in parts_order:
            path = siblings[code]
            with EpubFile(path) as part_epub:
                secs, blks, section_order, block_order = self._parse_part(
                    part_epub,
                    resolved_id,
                    code,
                    section_order_start=section_order,
                    block_order_start=block_order,
                )
            all_sections.extend(secs)
            all_blocks.extend(blks)

        return ParsedWork(
            title="Summa Theologica",
            short_title="Summa",
            author="St. Thomas Aquinas",
            kind="summa",
            description=(
                "Aquinas's Summa Theologica — Part I (Prima Pars) and "
                "Part I-II (Prima Secundae), organized by treatise and question."
            ),
            translation="Fathers of the English Dominican Province",
            edition="Benziger Bros. edition (Project Gutenberg)",
            rights="Public Domain",
            sections=all_sections,
            blocks=all_blocks,
        )
