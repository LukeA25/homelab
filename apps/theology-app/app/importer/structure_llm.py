"""Ask the configured LLM for a per-book parse profile from a small sample."""

from __future__ import annotations

import asyncio
import concurrent.futures
import json
import logging
from typing import Optional

from ..config import ASK_MODEL
from ..llm import LlmError, chat_completion, llm_configured
from .base import ParsedWork
from .structure import (
    PROFILE_VERSION,
    ParseProfile,
    build_profile_sample,
    parse_llm_profile_json,
    validate_parse_profile,
)

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """You design a parsing profile for one scanned EPUB (often Internet Archive / Google Books OCR).
You see only a SAMPLE of mid-book pages plus optional OPF/metadata TOC text — not the whole book.

Return STRICT JSON only:
{
  "title": "canonical work title",
  "runningHeaders": ["THE ASCENT OF MOUNT CARMEL"],
  "stripPatterns": ["Digitized by Google", "http://books.google.com/"],
  "skipPageIfMatches": ["Usage guidelines", "This is a digital copy of a book", "CONTENTS"],
  "bookPattern": "BOOK\\\\s+[IVXLC0-9]+",
  "chapterPattern": "CHAPTER\\\\s+[IVXLC0-9]+\\\\.?",
  "prologuePattern": "PROLOGUE\\\\b",
  "splitOnHeadingInsidePage": true,
  "notes": "short note"
}

Rules:
- Patterns are Python regex fragments (string values). Escape backslashes properly in JSON.
- bookPattern MUST match real book openers (e.g. "BOOK I." or "BOOK THE FIRST"), not folio
  running headers like "BOOK I.]" at the top of every page.
- chapterPattern must match how THIS edition labels chapters (e.g. "CHAPTER III.").
- prologuePattern should match a true prologue title line, not the word Prologue as a running header.
  Prefer a strict pattern such as "(?m)^PROLOGUE\\\\.?$" when the sample shows that.
- runningHeaders: repeated page headers to strip (exact-ish phrases from the sample).
- stripPatterns: watermarks / digitization junk to remove wherever they appear.
- skipPageIfMatches: if a page contains these, drop the whole page (Google frontmatter, TOC pages).
- Prefer CHAPTER-level splitting (splitOnHeadingInsidePage: true) for treatises.
- Do NOT rewrite book text. Do NOT invent patterns unseen in the sample/TOC.
- If metadata TOC shows CHAPTER I, CHAPTER II, … mirror that style in chapterPattern.
"""


def plan_parse_profile(
    parsed: ParsedWork,
    *,
    work_id: str,
    file_sha256: str,
    parser_version: int,
) -> Optional[ParseProfile]:
    """Call the Ask LLM with a mid-book sample; return a validated ParseProfile."""
    if not llm_configured():
        log.info("parse profile LLM skipped: LLM not configured")
        return None
    if not parsed.blocks:
        return None

    sample = build_profile_sample(parsed)
    if len(sample.get("pages") or []) < 4:
        log.info("parse profile LLM skipped: sample too small")
        return None

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                "Create a parse profile for this EPUB sample. "
                "workId="
                + work_id
                + "\n\n"
                + json.dumps(sample, ensure_ascii=False)
            ),
        },
    ]

    try:
        content = _run_chat(messages)
    except LlmError as exc:
        log.warning("parse profile LLM failed for %s: %s", work_id, exc)
        return None

    try:
        raw = parse_llm_profile_json(content)
        raw.work_id = work_id
        raw.file_sha256 = file_sha256
        raw.parser_version = parser_version
        raw.model = ASK_MODEL
        raw.version = PROFILE_VERSION
        return validate_parse_profile(raw)
    except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        log.warning("parse profile LLM returned invalid JSON for %s: %s", work_id, exc)
        return None


# Back-compat name for service imports during migration.
plan_structure_map = plan_parse_profile


def _run_chat(messages: list[dict[str, str]]) -> str:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop and loop.is_running():
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(
                lambda: asyncio.run(chat_completion(messages, temperature=0.1, max_tokens=1800))
            ).result()
    return asyncio.run(chat_completion(messages, temperature=0.1, max_tokens=1800))
