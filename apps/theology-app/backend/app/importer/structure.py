"""Per-book parse profiles for generic EPUB ingest.

The LLM sees a small sample (1–2 chapter windows) and returns a JSON profile:
strip patterns, running headers, skip-page rules, and chapter/book regexes.
Deterministic code then applies that profile to the whole book — no prose rewrite,
no generated Python.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .base import ParsedBlock, ParsedSection, ParsedWork
from .generic import IA_BOILERPLATE_RE

log = logging.getLogger(__name__)

PROFILE_VERSION = 2
MAX_TITLE_LEN = 120
MAX_SECTIONS = 500
MAX_PATTERN_LEN = 200
SAMPLE_PAGE_COUNT = 36  # ~2 chapter windows of IA page-scan text
SAMPLE_CHARS_PER_PAGE = 900

_JSON_FENCE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)
_PAGE_RANGE_RE = re.compile(r"^Pages?\s+\d", re.I)
_BROAD_PATTERN_RE = re.compile(r"^(\.\*?|\.\+|[\^]?\.[\*\+]?\$?)$")


@dataclass
class ParseProfile:
    """Cached rules for cleaning + splitting one EPUB."""

    version: int = PROFILE_VERSION
    work_id: str = ""
    file_sha256: str = ""
    parser_version: int = 0
    model: str = ""
    title: str = ""
    running_headers: list[str] = field(default_factory=list)
    strip_patterns: list[str] = field(default_factory=list)
    skip_page_if_matches: list[str] = field(default_factory=list)
    book_pattern: str = r"BOOK\s+(?:THE\s+)?(?:FIRST|SECOND|THIRD|FOURTH|[IVXLCDM0-9]+)"
    chapter_pattern: str = r"CHAPTER\s+[IVXLCDM0-9]+\.?"
    prologue_pattern: str = r"PROLOGUE\b"
    split_on_heading_inside_page: bool = True
    notes: str = ""

    def to_json(self) -> dict:
        return {
            "version": self.version,
            "workId": self.work_id,
            "fileSha256": self.file_sha256,
            "parserVersion": self.parser_version,
            "model": self.model,
            "title": self.title,
            "runningHeaders": self.running_headers,
            "stripPatterns": self.strip_patterns,
            "skipPageIfMatches": self.skip_page_if_matches,
            "bookPattern": self.book_pattern,
            "chapterPattern": self.chapter_pattern,
            "prologuePattern": self.prologue_pattern,
            "splitOnHeadingInsidePage": self.split_on_heading_inside_page,
            "notes": self.notes,
        }

    @classmethod
    def from_json(cls, data: dict) -> "ParseProfile":
        return cls(
            version=int(data.get("version") or PROFILE_VERSION),
            work_id=str(data.get("workId") or ""),
            file_sha256=str(data.get("fileSha256") or ""),
            parser_version=int(data.get("parserVersion") or 0),
            model=str(data.get("model") or ""),
            title=str(data.get("title") or ""),
            running_headers=[str(x) for x in (data.get("runningHeaders") or []) if str(x).strip()],
            strip_patterns=[str(x) for x in (data.get("stripPatterns") or []) if str(x).strip()],
            skip_page_if_matches=[
                str(x) for x in (data.get("skipPageIfMatches") or []) if str(x).strip()
            ],
            book_pattern=str(data.get("bookPattern") or cls.book_pattern),
            chapter_pattern=str(data.get("chapterPattern") or cls.chapter_pattern),
            prologue_pattern=str(data.get("prologuePattern") or cls.prologue_pattern),
            split_on_heading_inside_page=bool(data.get("splitOnHeadingInsidePage", True)),
            notes=str(data.get("notes") or ""),
        )


def structure_map_path(epub_path: Path) -> Path:
    """Store beside the EPUB: ascent-of-mount-carmel.epub → …structure.json."""
    return epub_path.with_suffix(".structure.json")


def load_parse_profile(epub_path: Path) -> Optional[ParseProfile]:
    path = structure_map_path(epub_path)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        log.warning("could not read parse profile %s: %s", path, exc)
        return None
    if not isinstance(data, dict):
        return None
    # Legacy v1 break-maps are not profiles — ignore and regenerate.
    if "breaks" in data and "chapterPattern" not in data and "bookPattern" not in data:
        log.info("ignoring legacy v1 structure map at %s", path)
        return None
    try:
        return validate_parse_profile(ParseProfile.from_json(data))
    except ValueError as exc:
        log.warning("invalid parse profile %s: %s", path, exc)
        return None


def save_parse_profile(epub_path: Path, profile: ParseProfile) -> Path:
    path = structure_map_path(epub_path)
    validated = validate_parse_profile(profile)
    path.write_text(
        json.dumps(validated.to_json(), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return path


# Back-compat aliases used by older call sites / tests migrating over.
load_structure_map = load_parse_profile
save_structure_map = save_parse_profile


def needs_structure_help(parsed: ParsedWork) -> bool:
    """True when the heuristic outline looks like page-scan fallback junk."""
    if not parsed.blocks:
        return False
    if len(parsed.sections) < 2:
        return True
    pageish = sum(1 for s in parsed.sections if _PAGE_RANGE_RE.match(s.title or ""))
    if pageish >= max(2, len(parsed.sections) // 2):
        return True
    bare = sum(
        1
        for s in parsed.sections
        if (s.title or "").lower().startswith("page")
        or re.fullmatch(r"page[_-]?\d+", (s.title or ""), re.I)
    )
    if bare >= max(3, len(parsed.sections) // 2):
        return True
    # Few giant sections (book-level only) still need chapter splitting.
    if len(parsed.sections) <= 6 and len(parsed.blocks) >= 80:
        avg = sum(len(b.text) for b in parsed.blocks) / max(len(parsed.blocks), 1)
        if avg >= 800:
            return True
    return False


def profile_is_compatible(
    profile: ParseProfile,
    *,
    work_id: str,
    file_sha256: str,
    parser_version: int,
) -> bool:
    if profile.work_id and profile.work_id != work_id:
        return False
    if profile.file_sha256 and profile.file_sha256 != file_sha256:
        return False
    if profile.parser_version and profile.parser_version != parser_version:
        return False
    try:
        validate_parse_profile(profile)
    except ValueError:
        return False
    return True


def _validate_regex(name: str, pattern: str, *, required: bool) -> str:
    text = (pattern or "").strip()
    if not text:
        if required:
            raise ValueError(f"{name} is required")
        return ""
    if len(text) > MAX_PATTERN_LEN:
        raise ValueError(f"{name} too long")
    # Drop inline global flags — we apply IGNORECASE|MULTILINE ourselves.
    text = re.sub(r"\(\?[aiLmsux]+\)", "", text)
    text = re.sub(r"\(\?[aiLmsux]+:", "(?:", text)
    if _BROAD_PATTERN_RE.match(text) or text in {".", ".*", ".+", "^", "$"}:
        raise ValueError(f"{name} is too broad: {text!r}")
    try:
        re.compile(text, re.IGNORECASE | re.MULTILINE)
    except re.error as exc:
        raise ValueError(f"{name} is not a valid regex: {exc}") from exc
    return text


def validate_parse_profile(profile: ParseProfile) -> ParseProfile:
    book = _validate_regex("bookPattern", profile.book_pattern, required=True)
    chapter = _validate_regex("chapterPattern", profile.chapter_pattern, required=True)
    prologue = _validate_regex("prologuePattern", profile.prologue_pattern, required=False)

    default_book = r"BOOK\s+(?:THE\s+)?(?:FIRST|SECOND|THIRD|FOURTH|[IVXLCDM0-9]+)\.?"
    # If the model overfitted to one book (e.g. only SECOND), broaden.
    if re.search(r"SECOND", book, re.I) and not re.search(r"FIRST", book, re.I):
        book = default_book
    if re.search(r"BOOK\s+THE\s+FIRST", book, re.I) and not re.search(r"SECOND", book, re.I):
        book = default_book

    strip: list[str] = []
    for item in profile.strip_patterns:
        s = " ".join(str(item).split())
        if s and s not in strip:
            strip.append(s[:180])

    headers: list[str] = []
    for item in profile.running_headers:
        s = " ".join(str(item).split())
        if s and s not in headers:
            headers.append(s[:120])

    skips: list[str] = []
    for item in profile.skip_page_if_matches:
        s = " ".join(str(item).split())
        if s and s not in skips:
            skips.append(s[:180])

    # Always strip common Google / IA watermarks even if the model forgets.
    for builtin in (
        "Digitized by Google",
        "Digitized by Googk",
        "http://books.google.com/",
        "http://books.qoogle.com/",
    ):
        if builtin not in strip:
            strip.append(builtin)

    title = " ".join((profile.title or "").split())[:200]
    return ParseProfile(
        version=PROFILE_VERSION,
        work_id=profile.work_id,
        file_sha256=profile.file_sha256,
        parser_version=profile.parser_version,
        model=profile.model,
        title=title,
        running_headers=headers,
        strip_patterns=strip,
        skip_page_if_matches=skips,
        book_pattern=book,
        chapter_pattern=chapter,
        prologue_pattern=prologue or r"PROLOGUE\b",
        split_on_heading_inside_page=bool(profile.split_on_heading_inside_page),
        notes=(profile.notes or "")[:500],
    )


def parse_llm_profile_json(content: str) -> ParseProfile:
    text = content.strip()
    fence = _JSON_FENCE.search(text)
    if fence:
        text = fence.group(1).strip()
    if not text.startswith("{"):
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            text = text[start : end + 1]
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("LLM profile response is not an object")
    return ParseProfile.from_json(data)


def build_profile_sample(parsed: ParsedWork, *, page_count: int = SAMPLE_PAGE_COUNT) -> dict:
    """Pick a mid-book window of pages for the LLM (not the whole EPUB)."""
    blocks = parsed.blocks
    n = len(blocks)
    if n == 0:
        return {"pages": [], "metaDescription": (parsed.description or "")[:2500]}

    # Skip first/last 10% to avoid Google frontmatter / indexes.
    lo = max(0, int(n * 0.10))
    hi = max(lo + 1, int(n * 0.90))
    span = max(hi - lo, 1)
    start = lo + max(0, (span - page_count) // 2)
    end = min(n, start + page_count)
    start = max(0, end - page_count)

    pages = []
    for i in range(start, end):
        text = " ".join(blocks[i].text.split())
        pages.append({"pageIndex": i, "text": text[:SAMPLE_CHARS_PER_PAGE]})

    return {
        "hintTitle": parsed.title,
        "hintAuthor": parsed.author,
        "blockCount": n,
        "samplePageRange": [start, end - 1],
        "metaDescription": (parsed.description or "")[:2500],
        "pages": pages,
    }


def _compile_flags(pattern: str) -> re.Pattern[str]:
    return re.compile(pattern, re.IGNORECASE | re.MULTILINE)


def _should_skip_page(text: str, needles: list[str]) -> bool:
    lowered = text.lower()
    # Whole-page Google / usage boilerplate.
    if "this is a digital copy of a book" in lowered and "google" in lowered:
        return True
    if "usage guidelines" in lowered and "google" in lowered:
        return True
    chapter_hits = len(re.findall(r"\bCHAPTER\s+[IVXLCDM0-9]+\b", text, re.I))
    # TOC pages: many chapter markers + leader dots / short overall page.
    if chapter_hits >= 4 and (text.count("•") >= 4 or text.count("·") >= 6 or len(text) < 2800):
        return True
    if chapter_hits >= 6:
        return True
    for needle in needles:
        n = needle.lower()
        if n not in lowered:
            continue
        if n == "contents":
            if chapter_hits >= 3 or text.count("•") >= 6:
                return True
            continue
        return True
    return False


def _strip_noise(text: str, profile: ParseProfile) -> str:
    out = text
    out = re.sub(r"Digitized by\s*Goog\w*", " ", out, flags=re.IGNORECASE)
    out = re.sub(r"Digitized by\s*$", " ", out, flags=re.IGNORECASE | re.MULTILINE)
    out = re.sub(r"https?://books\.\w*google\.\w+\S*", " ", out, flags=re.IGNORECASE)
    for pattern in profile.strip_patterns:
        out = re.sub(re.escape(pattern), " ", out, flags=re.IGNORECASE)
    for header in profile.running_headers:
        escaped = re.escape(header)
        out = re.sub(rf"(?m)^\s*{escaped}\s*", " ", out, flags=re.IGNORECASE)
        out = re.sub(rf"\s*{escaped}\s*", " ", out, count=2, flags=re.IGNORECASE)
    # Common IA running folio marks: "BOOK I.] …" / "BOOK I.J …"
    out = re.sub(
        r"\bBOOK\s+(?:THE\s+)?(?:FIRST|SECOND|THIRD|FOURTH|[IVXLCDM0-9]+)\.?\s*[\]Jj]\s*",
        " ",
        out,
        flags=re.IGNORECASE,
    )
    out = IA_BOILERPLATE_RE.sub(" ", out)
    out = re.sub(r"[ \t]+\n", "\n", out)
    out = re.sub(r"\n{3,}", "\n\n", out)
    out = re.sub(r"[ \t]{2,}", " ", out)
    return out.strip()


def _heading_splitter(profile: ParseProfile) -> re.Pattern[str]:
    parts = [
        f"(?P<book>{profile.book_pattern})",
        f"(?P<chapter>{profile.chapter_pattern})",
    ]
    if profile.prologue_pattern:
        parts.append(f"(?P<prologue>{profile.prologue_pattern})")
    parts.append(r"(?P<argument>(?:^|(?<=\n))ARGUMENT\b)")
    return re.compile("|".join(parts), re.IGNORECASE | re.MULTILINE)


def _title_from_match(match: re.Match[str], text: str) -> tuple[str, int]:
    """Return (title, level) for a heading match; level 0=book/prologue, 1=chapter."""
    kind = match.lastgroup or "chapter"
    start = match.start()
    tail = text[start : start + 160]
    line = re.split(r"[\n\r]", tail, maxsplit=1)[0]
    line = " ".join(line.split())
    line = re.split(r"(?<=\.)\s+(?=[A-Z])", line, maxsplit=1)[0]
    if kind == "book":
        m = re.match(
            r"(BOOK\s+(?:THE\s+)?(?:FIRST|SECOND|THIRD|FOURTH|[IVXLCDM0-9]+)\.?)",
            line,
            re.IGNORECASE,
        )
        if m:
            line = m.group(1)
    if kind == "chapter":
        m = re.match(r"(CHAPTER\s+[IVXLCDM0-9]+\.?)", line, re.IGNORECASE)
        if m:
            line = m.group(1)
    if kind == "prologue":
        line = "Prologue"
    if kind == "argument":
        line = "Argument"
    if len(line) > MAX_TITLE_LEN:
        line = line[: MAX_TITLE_LEN - 1] + "…"
    if kind in {"book", "prologue", "argument"}:
        return line or kind.title(), 0
    return line or "Chapter", 1


def _plausible_heading(match: re.Match[str], text: str) -> bool:
    """Reject OCR running headers and mid-sentence false hits."""
    kind = match.lastgroup or ""
    after = text[match.end() : match.end() + 24]
    if after.lstrip().startswith(("]", "J", "j")):
        return False
    title, _level = _title_from_match(match, text)
    if kind == "prologue":
        rest = text[match.end() : match.end() + 1]
        if rest.islower():
            return False
    if kind == "book":
        if re.search(r",\s*ch\.?\b", text[match.start() : match.start() + 40], re.I):
            return False
        if not re.match(
            r"(?i)^BOOK\s+(?:THE\s+)?(?:FIRST|SECOND|THIRD|FOURTH|[IVXLCDM0-9]+)\.?$",
            title.strip(),
        ):
            return False
    if kind == "chapter":
        if not re.match(r"(?i)^CHAPTER\s+[IVXLCDM0-9]+\.?$", title.strip()):
            return False
    return True


def apply_parse_profile(work_id: str, parsed: ParsedWork, profile: ParseProfile) -> ParsedWork:
    """Clean pages, split on heading patterns, rebuild chapter-level sections."""
    profile = validate_parse_profile(profile)
    splitter = _heading_splitter(profile) if profile.split_on_heading_inside_page else None

    pieces: list[tuple[str, str, int]] = []  # (kind, text, level) kind in body|heading
    for block in parsed.blocks:
        raw = block.text or ""
        if _should_skip_page(raw, profile.skip_page_if_matches):
            continue
        cleaned = _strip_noise(raw, profile)
        if len(cleaned) < 8:
            continue

        if not splitter:
            pieces.append(("body", cleaned, 0))
            continue

        matches = [m for m in splitter.finditer(cleaned) if _plausible_heading(m, cleaned)]
        if not matches:
            pieces.append(("body", cleaned, 0))
            continue

        # Drop TOC-only pages: many CHAPTER hits + little prose between them.
        if len(matches) >= 4:
            span = sum(max(0, (matches[i + 1].start() - matches[i].end())) for i in range(len(matches) - 1))
            avg_gap = span / max(len(matches) - 1, 1)
            if avg_gap < 40 and cleaned.upper().count("CHAPTER") >= 4:
                continue

        cursor = 0
        for match in matches:
            if match.start() > cursor:
                before = cleaned[cursor : match.start()].strip()
                if len(before) >= 8:
                    pieces.append(("body", before, 0))
            title, level = _title_from_match(match, cleaned)
            pieces.append(("heading", title, level))
            cursor = match.end()
        after = cleaned[cursor:].strip()
        if len(after) >= 8:
            pieces.append(("body", after, 0))

    if not pieces:
        return parsed

    sections: list[ParsedSection] = []
    blocks: list[ParsedBlock] = []
    current_section_id: Optional[str] = None
    current_book_id: Optional[str] = None
    order = 0
    seen_titles: set[str] = set()

    def ensure_front_matter() -> str:
        nonlocal current_section_id, order
        if current_section_id:
            return current_section_id
        order += 1
        sid = f"{work_id}/s{order}"
        sections.append(
            ParsedSection(id=sid, title="Front matter", parent_id=None, level=0, order_index=order)
        )
        current_section_id = sid
        return sid

    for kind, text, level in pieces:
        if kind == "heading":
            norm = re.sub(r"\s+", " ", text).strip().lower()
            # Skip duplicate consecutive headings (OCR repeats).
            if norm in seen_titles and sections and sections[-1].title.lower() == norm:
                current_section_id = sections[-1].id
                continue
            order += 1
            sid = f"{work_id}/s{order}"
            parent_id = None
            if level >= 1 and current_book_id:
                parent_id = current_book_id
            sections.append(
                ParsedSection(
                    id=sid,
                    title=text[:MAX_TITLE_LEN],
                    parent_id=parent_id,
                    level=level,
                    order_index=order,
                )
            )
            seen_titles.add(norm)
            if level == 0 and re.match(r"(?i)^book\b", text):
                current_book_id = sid
            current_section_id = sid
            blocks.append(
                ParsedBlock(
                    locus_id=f"{work_id}.{len(blocks) + 1}",
                    text=text[:MAX_TITLE_LEN],
                    label="",
                    kind="heading",
                    section_id=sid,
                    order_index=len(blocks) + 1,
                )
            )
            continue

        sid = current_section_id or ensure_front_matter()
        chunks = _paragraph_chunks(text)
        for chunk in chunks:
            blocks.append(
                ParsedBlock(
                    locus_id=f"{work_id}.{len(blocks) + 1}",
                    text=chunk,
                    label="",
                    kind="paragraph",
                    section_id=sid,
                    order_index=len(blocks) + 1,
                )
            )

    if len(sections) > MAX_SECTIONS:
        raise ValueError(f"profile produced too many sections ({len(sections)})")

    title = profile.title or parsed.title
    return ParsedWork(
        title=title,
        author=parsed.author,
        short_title=parsed.short_title or title[:40],
        kind=parsed.kind,
        description=parsed.description,
        translation=parsed.translation,
        edition=parsed.edition,
        translator=parsed.translator,
        rights=parsed.rights,
        sections=sections,
        blocks=blocks,
        books=parsed.books,
    )


def _paragraph_chunks(text: str) -> list[str]:
    """Split cleaned page remnants into readable paragraphs."""
    parts = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if len(parts) >= 2:
        return [p for p in parts if len(p) >= 8]
    # Single blob: soft-split on sentence boundaries into ~800-char chunks.
    cleaned = " ".join(text.split())
    if len(cleaned) <= 1100:
        return [cleaned] if len(cleaned) >= 8 else []
    chunks: list[str] = []
    buf = ""
    for sentence in re.split(r"(?<=[.!?])\s+", cleaned):
        if not sentence:
            continue
        if buf and len(buf) + 1 + len(sentence) > 900:
            chunks.append(buf)
            buf = sentence
        else:
            buf = f"{buf} {sentence}".strip() if buf else sentence
    if buf:
        chunks.append(buf)
    return chunks
