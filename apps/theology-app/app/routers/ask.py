"""RAG Ask: retrieve library passages via FTS, synthesize with gpt-4o-mini."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, col, select

from ..catalog import catalog_with_library
from ..config import ASK_MAX_ROUNDS, ASK_MAX_TOKENS
from ..db import session_dependency
from ..llm import LlmError, chat_completion, llm_configured
from ..models import AskMessageRow, AskThread, Note, Section, Work
from ..schemas import (
    AskActionTakenOut,
    AskCitationOut,
    AskIn,
    AskLocusOut,
    AskMessageOut,
    AskOut,
    AskPendingActionOut,
    AskRecommendationOut,
    AskResourceOut,
    AskThreadIn,
    AskThreadOut,
    AskThreadUpdate,
    SearchHitOut,
)
from .search import run_search, strip_marks

router = APIRouter(tags=["ask"])
log = logging.getLogger(__name__)

_JSON_FENCE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)
_WORD_RE = re.compile(r"[A-Za-z][A-Za-z'-]{2,}")

_STOPWORDS = frozenset(
    """
    a an the and or but if then else when where what which who whom whose why how
    is are was were be been being have has had do does did will would could should
    may might must can to of in on at for from with by as into about over after
    before between through during without within along across behind beyond under
    again further once here there all both each few more most other some such no
    nor not only own same so than too very just also my me i you your we our us
    they them their this that these those it its look looking delete deleted
    replace replacing want wanted please like especially including include full
    page pages breakdown note notes chat make create write give get need needs
    them that this those into onto over them
    """.split()
)

SYSTEM_PROMPT = """You are Study Desk, a careful Catholic study companion.

Write answers and note bodies in Study Desk NOTES DIALECT (not generic ChatGPT markdown).

Notes dialect (use these markers only):
- Headers: a single "# Title" line only (main title)
- Subtitles / section headings: "## Section" (use these instead of bullet section titles)
- Quotes from library text: a line starting with "> " then the quote
- Immediately after a quote, a citation line: — [[LocusId|Label]]
  e.g. — [[dark-night-of-the-soul.214|Dark Night · unknown road]]
  Use the exact locusId from Library passages (never a bare work id).
- Bullets: "- item" for list points only (not section titles)
- Checklists: "- [ ] item" or "- [x] done"
- Comments: "// note"
- Inline links: [label](studydesk://locus/workId/LocusId) or [label](studydesk://work/workId)
- Mid-text emphasis: **bold** and *italic*
- Plain paragraphs: no marker

Do NOT use: ###, HTML, code fences, nested/indented markdown, or bare URLs without
the link syntax above. Every marker line must start at column 0 (no leading spaces before
#, ##, >, -, or —). Use flat structure — never indent sub-bullets or nest quotes under them.
Prefer "## Section Title" for sections. In chat answers, mix short headings, bullets,
and brief paragraphs — not a wall of prose and not a wall of bullets alone.

Spacing (critical — do not pad every line):
- Use a single newline between consecutive content lines. Do NOT put a blank line after
  every paragraph, quote, citation, or bullet.
- A blank line is allowed ONLY immediately before a "## Subtitle" (and nowhere else).
- Keep "> quote" and its "— [[…]]" citation on consecutive lines with no blank between.
- Example shape:
  # Title
  Intro paragraph.
  ## First section
  Body text.
  > Quoted passage
  — [[locusId|Label]]
  More body.
  ## Next section
  …

You receive:
1) Library passages retrieved from the user's imported texts.
2) A wishlist catalog of Catholic works (some imported, some not).
3) Optional consented note bodies (only when the user approved sharing them).
4) Recent chat turns in this thread.
5) A retrieval-round hint.

Rules:
- Prefer grounding claims in the provided library passages.
- NEVER invent quotations. If a quote the user wants is not in Library passages,
  emit search_library with short keyword queries instead of guessing.
- When quoting, copy text from Library passages into a "> " block + citation line.
- If passages are empty or missing needed material, prefer search_library over answering.
- You MAY recommend catalog works not yet imported and explain why they fit.
- You MAY also recommend a specific chapter / question inside an imported work
  (especially the Summa). Prefer that when a particular question or chapter is
  the right next read — not only the whole book.
- Do not invent exact paragraph numbers for works not in the retrieved passages.
- Notes are PRIVATE. Do not assume note contents unless under "Consented notes".
- If the user asks you to read/use a note and it is NOT in Consented notes, return
  request_note_context (do not invent the note body). Prefer that BEFORE rewriting
  or deleting that note.
- Create/update/delete note actions belong on the FINAL answer round, after you have
  enough passages (or after note consent is granted).
- Note titles: short human titles (ChatGPT-style doc names), NOT the user's raw prompt.
- Prefer British OCR spellings in search queries when relevant (traveller, not traveler).
- When the user wants a specific image/quote (e.g. traveler on unknown roads), search until
  Library passages contain that passage; do not paraphrase it as if quoted.
- threadTitle: ALWAYS include a short ChatGPT-style chat title (about 3–7 words) that
  names the topic — e.g. "Mount Carmel vs Dark Night", "Dark Night traveler image".
  Never reuse the user's full question. Never use "New chat" or "Untitled".
  Especially important on the first turn of a thread.
- Chapter recommendations: when a specific Summa question (or other book chapter) is the
  best next read, put it in recommendations with catalogId + sectionId (preferred) and/or
  sectionHint like "I.Q2" / "I-II.Q5". Use the Navigable chapters list when provided.
  Title the reason so a reader knows why that chapter helps. You may recommend 1–3
  chapters alongside (or instead of) whole-book recommendations.

Chat vs note (critical — pick ONE primary path per turn):
Default is CONVERSATION. Put the real response in "answer". Do NOT create/update a note
unless the user clearly asks to save/write one.

A) Conversation (default) — questions, comparisons, explanations, follow-ups,
   "what is…", "how does X relate to Y", "tell me about…":
  - Write a substantive "answer" in notes dialect: typically ~150–450 words.
    More if they ask for depth; less for a yes/no or tiny clarification.
  - Structure like ChatGPT (critical — not one wall of paragraphs):
    * Optional one-line lead-in (plain text, no "# Title" unless they asked for a titled essay).
    * Use "## Section" headings to break the answer into scannable parts.
    * Use "- item" bullets for lists, contrasts, takeaways, and numbered steps
      (prefer bullets over long comma-spliced sentences).
    * Keep body text in short paragraphs (1–3 sentences) under each heading.
    * Use **bold** sparingly for key terms.
    * Example shape for a comparison:
      Ascent of Mount Carmel and Dark Night are companion works…
      ## Shared aim
      - Both describe purification toward union with God.
      ## How they differ
      - Mount Carmel emphasizes the active journey…
      - Dark Night emphasizes the passive purification…
      ## How to read them together
      Short guidance paragraph.
  - Prefer explanation and synthesis over quotation. Use at most 1–2 short quotes,
    and only when a primary text really helps — otherwise paraphrase and cite locus
    ids in citationLocusIds instead of dumping "> " blocks.
  - Put the structured content in "answer" (with ## and -). Do not rely on the
    "bullets" JSON field for the main structure.
  - Do NOT emit create_note / update_note.
  - "answer" IS the content the user reads. Do not shrink it to a 2-sentence stub.

B) Note writeup — only when the user clearly wants a saved document, e.g.
   "make a note", "create a note", "write this up", "save this", "breakdown for my notes",
   "1–2 pages", "full writeup", "put this in Notes":
  - Emit create_note (or update_note) with the full body (~600–1200 words when they
    ask for a long writeup), with several real library quotes.
  - "answer" = short confirmation only (2–5 sentences): what you saved / where to look.
    Never paste the full note into "answer".
  - Note body = the note ONLY. Start with "# Title" or content.
    No chat voice, no "Creating a detailed…", no status lines.

C) Ambiguous ("breakdown", "overview", "compare in detail") without save language:
  - Stay in Conversation (A). Offer at the end: they can ask you to save it as a note.
  - Never invent a note "just because" the answer is long.

Other action rules:
- update_note: "mode": "append" (default) or "replace".
- delete_note requires UI confirmation; still emit the action so the UI can ask.
- While you still need library search, set answer to a brief status line and include
  search_library actions; do not create the long note (or the full chat essay) yet.

Return STRICT JSON only:
{
  "threadTitle": "short ChatGPT-style chat name",
  "answer": "full chat reply for conversation, OR short confirmation if you created a note",
  "bullets": ["optional short takeaways"],
  "citationLocusIds": ["Mt.16.24", "..."],
  "recommendations": [
    {"catalogId": "dark-night-of-the-soul", "reason": "why this book fits"},
    {
      "catalogId": "summa-theologica",
      "sectionId": "summa-theologica/part-i/q2",
      "sectionHint": "I.Q2",
      "reason": "why this chapter/question fits"
    }
  ],
  "actions": [
    {"type": "search_library", "query": "unknown unpleasing road traveller", "message": "Searching…"},
    {"type": "create_note", "title": "...", "section": "personal"|"apologetics", "body": "..."},
    {"type": "update_note", "noteId": "optional", "title": "...", "section": "personal"|"apologetics", "body": "...", "mode": "append"|"replace"},
    {"type": "delete_note", "noteId": "optional", "title": "..."},
    {"type": "request_note_context", "noteId": "optional", "title": "...", "message": "May I read your note …?"}
  ]
}
"""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _locus(hit: SearchHitOut) -> AskLocusOut:
    return AskLocusOut(
        workId=hit.workId,
        locusId=hit.locusId,
        label=f"{hit.workTitle} · {hit.locusId}",
    )


def _resources_from_hits(hits: list[SearchHitOut]) -> list[AskResourceOut]:
    return [
        AskResourceOut(locus=_locus(hit), reason=strip_marks(hit.snippet)[:400])
        for hit in hits
    ]


def _citations_from_hits(
    hits: list[SearchHitOut],
    locus_ids: list[str] | None = None,
    limit: int = 6,
) -> list[AskCitationOut]:
    by_id = {h.locusId: h for h in hits}
    ordered: list[SearchHitOut] = []
    if locus_ids:
        for lid in locus_ids:
            hit = by_id.get(lid)
            if hit and hit not in ordered:
                ordered.append(hit)
    for hit in hits:
        if hit not in ordered:
            ordered.append(hit)
        if len(ordered) >= limit:
            break
    return [
        AskCitationOut(
            locus=AskLocusOut(workId=hit.workId, locusId=hit.locusId, label=hit.locusId),
            snippet=strip_marks(hit.snippet)[:320],
        )
        for hit in ordered[:limit]
    ]


def _fallback(answer: str, hits: list[SearchHitOut], thread_id: str | None = None) -> AskOut:
    return AskOut(
        answer=answer,
        resources=_resources_from_hits(hits),
        citations=_citations_from_hits(hits),
        bullets=[f"{h.locusId}: {strip_marks(h.snippet)[:120]}" for h in hits[:5]],
        threadId=thread_id,
    )


def _thread_out(t: AskThread) -> AskThreadOut:
    return AskThreadOut(
        id=t.id,
        title=t.title,
        createdAt=_iso(t.created_at),
        updatedAt=_iso(t.updated_at),
    )


def _message_out(m: AskMessageRow) -> AskMessageOut:
    response = None
    if m.response_json:
        try:
            response = json.loads(m.response_json)
        except json.JSONDecodeError:
            response = None
    return AskMessageOut(
        id=m.id,
        threadId=m.thread_id,
        role=m.role,
        content=m.content,
        response=response,
        createdAt=_iso(m.created_at),
    )


def _ensure_thread(session: Session, thread_id: str | None, question: str) -> AskThread:
    if thread_id:
        t = session.get(AskThread, thread_id)
        if t:
            return t
    # Placeholder until the model returns threadTitle on the first turn.
    t = AskThread(
        id=f"ath-{uuid4().hex[:12]}",
        title="New chat",
        created_at=_now(),
        updated_at=_now(),
    )
    session.add(t)
    session.commit()
    session.refresh(t)
    return t


def _title_from_answer(answer: str) -> str | None:
    """Fallback chat title from first ## heading in the answer."""
    for line in (answer or "").splitlines():
        m = re.match(r"^##\s+(.+)$", line.strip())
        if m:
            title = m.group(1).strip()
            if title:
                return title[:60]
    return None


def _pick_thread_title(
    data: dict[str, Any],
    actions_taken: list[AskActionTakenOut],
    answer: str,
) -> str | None:
    raw = str(data.get("threadTitle") or data.get("chatTitle") or "").strip()
    raw = re.sub(r'^["“]+|["”]+$', "", raw).strip()
    if raw and raw.lower() not in {"new chat", "untitled", "chat"}:
        return raw[:60]
    for a in actions_taken:
        if a.type == "create_note" and a.title:
            return str(a.title).strip()[:60]
    return _title_from_answer(answer)


def _load_history(session: Session, thread_id: str, limit: int = 12) -> list[AskMessageRow]:
    rows = session.exec(
        select(AskMessageRow)
        .where(AskMessageRow.thread_id == thread_id)
        .order_by(col(AskMessageRow.created_at).desc())
        .limit(limit)
    ).all()
    return list(reversed(rows))


def _build_user_prompt(
    question: str,
    hits: list[SearchHitOut],
    seed: str | None,
    catalog: list[dict[str, Any]],
    note_titles: list[Note],
    consented_notes: list[Note],
    history: list[AskMessageRow],
    *,
    round_idx: int = 1,
    max_rounds: int = ASK_MAX_ROUNDS,
    searched_queries: list[str] | None = None,
    chapter_guide: str | None = None,
) -> str:
    lines = [
        f"Question:\n{question.strip()}\n",
        f"Retrieval round: {round_idx} of {max_rounds}.",
    ]
    if searched_queries:
        lines.append("Already searched: " + " | ".join(searched_queries[-8:]))
    if round_idx < max_rounds:
        lines.append(
            "If Library passages are insufficient for quotes the user asked for, "
            "emit search_library with short keyword queries and a brief status answer."
        )
    else:
        lines.append(
            "Final round: do not emit search_library. Answer with what you have; "
            "if a quote is still missing, say so rather than inventing it."
        )
    lines.append("")
    if history:
        lines.append("Recent chat turns:")
        for m in history[-10:]:
            role = "User" if m.role == "user" else "Assistant"
            lines.append(f"{role}: {m.content[:1200]}")
        lines.append("")
    if seed and seed.strip():
        lines.append(f"Selected passage seed:\n{seed.strip()[:2500]}\n")
    if hits:
        lines.append(f"Library passages ({len(hits)}):")
        for i, hit in enumerate(hits, start=1):
            lines.append(
                f"{i}. [{hit.locusId}] workId={hit.workId} ({hit.workTitle})\n"
                f"{strip_marks(hit.snippet)}\n"
            )
    else:
        lines.append(
            "Library passages: (none yet — emit search_library with short keyword queries)\n"
        )
    if chapter_guide:
        lines.append(chapter_guide.rstrip() + "\n")
    lines.append("Wishlist catalog (inLibrary true means already imported):")
    for entry in catalog[:40]:
        lines.append(
            f"- id={entry['id']} | {entry['title']} — {entry.get('author','')} | "
            f"inLibrary={entry.get('inLibrary')} workId={entry.get('workId')} | "
            f"topics={', '.join(entry.get('topics') or [])} | {entry.get('summary','')}"
        )
    if note_titles:
        lines.append("Existing notes (titles only — bodies private unless consented):")
        for n in note_titles[:40]:
            lines.append(f"- id={n.id} | [{n.section}] {n.title}")
    if consented_notes:
        lines.append("Consented notes (full bodies — user approved):")
        for n in consented_notes:
            lines.append(f"--- note id={n.id} title={n.title} ---\n{n.body[:8000]}\n")
    lines.append("Respond with JSON only.")
    return "\n".join(lines)


_SUMMA_HINT_RE = re.compile(
    r"\b(?:(I-II|II-II|III|I)\s*[.\s]+)?Q\.?\s*(\d+)\b",
    re.IGNORECASE,
)


def _chapter_guide_for_hits(session: Session, hits: list[SearchHitOut]) -> str:
    """Compact navigable-chapter hints for works that appear in retrieval (esp. Summa)."""
    work_ids = sorted({h.workId for h in hits if h.workId})
    # Always include Summa when present in the library so chapter recs stay available.
    summa = session.get(Work, "summa-theologica")
    if summa and "summa-theologica" not in work_ids:
        work_ids.append("summa-theologica")
    if not work_ids:
        return ""

    lines = [
        "Navigable chapters (recommend with catalogId + sectionId; optional sectionHint):",
    ]
    for work_id in work_ids[:4]:
        work = session.get(Work, work_id)
        if not work:
            continue
        if work_id == "summa-theologica":
            lines.append(
                "- summa-theologica (Summa Theologica): sectionId patterns "
                "`summa-theologica/part-i/q{N}` (Part I) and "
                "`summa-theologica/part-i-ii/q{N}` (Part I-II). "
                "sectionHint examples: I.Q2, I-II.Q5."
            )
            # Treatises for orientation.
            treatises = session.exec(
                select(Section)
                .where(Section.work_id == work_id, Section.level == 1)
                .order_by(col(Section.order_index))
            ).all()
            for t in treatises:
                lines.append(f"  · {t.title} [{t.id}]")
            # Questions touched by current hits.
            related: list[Section] = []
            seen_sec: set[str] = set()
            for hit in hits:
                if hit.workId != work_id:
                    continue
                # Map locus ST.I.Q2… → section
                m = re.match(r"^ST\.(I-II|II-II|III|I)\.Q(\d+)", hit.locusId or "", re.I)
                if not m:
                    continue
                part, qn = m.group(1).upper(), m.group(2)
                slug = "part-i-ii" if part == "I-II" else "part-i" if part == "I" else f"part-{part.lower()}"
                sid = f"{work_id}/{slug}/q{qn}"
                if sid in seen_sec:
                    continue
                seen_sec.add(sid)
                sec = session.get(Section, sid)
                if sec:
                    related.append(sec)
            if related:
                lines.append("  Questions related to current passages:")
                for sec in related[:12]:
                    lines.append(f"    - {sec.title} | sectionId={sec.id}")
            continue

        # Generic: show a few top-level sections for other works in hits.
        tops = session.exec(
            select(Section)
            .where(Section.work_id == work_id, Section.level == 0)
            .order_by(col(Section.order_index))
            .limit(12)
        ).all()
        if not tops:
            continue
        lines.append(f"- {work_id} ({work.title}):")
        for sec in tops:
            lines.append(f"  · {sec.title} | sectionId={sec.id}")
    return "\n".join(lines)


def _resolve_section_recommendation(
    session: Session,
    *,
    work_id: str | None,
    section_id: str | None,
    section_hint: str | None,
) -> tuple[str | None, str | None]:
    """Return (sectionId, sectionTitle) if resolvable."""
    if section_id:
        sec = session.get(Section, section_id.strip())
        if sec:
            return sec.id, sec.title
        # Allow bare q ids under summa when work is known.
        if work_id and not section_id.startswith(work_id):
            cand = f"{work_id}/{section_id.lstrip('/')}"
            sec = session.get(Section, cand)
            if sec:
                return sec.id, sec.title

    hint = (section_hint or "").strip()
    if not hint:
        return None, None

    # Summa-style hints: I.Q2, I-II Q.5, Q.2 (defaults to Part I if work is summa)
    m = _SUMMA_HINT_RE.search(hint)
    target_work = work_id or "summa-theologica"
    if m and (target_work == "summa-theologica" or "summa" in target_work):
        part = (m.group(1) or "I").upper()
        qn = m.group(2)
        slug = "part-i-ii" if part == "I-II" else "part-i" if part == "I" else f"part-{part.lower()}"
        sid = f"summa-theologica/{slug}/q{qn}"
        sec = session.get(Section, sid)
        if sec:
            return sec.id, sec.title

    # Fuzzy title match within work.
    if target_work:
        rows = session.exec(
            select(Section)
            .where(Section.work_id == target_work)
            .order_by(col(Section.order_index))
        ).all()
        needle = hint.lower()
        for sec in rows:
            if needle in (sec.title or "").lower() or needle in (sec.id or "").lower():
                return sec.id, sec.title
    return None, None


def _keywords_from_text(text: str, *, limit: int = 12) -> list[str]:
    words: list[str] = []
    seen: set[str] = set()
    for raw in _WORD_RE.findall(text or ""):
        w = raw.lower()
        if w in _STOPWORDS or w in seen:
            continue
        seen.add(w)
        words.append(w)
        if len(words) >= limit:
            break
    return words


def _sanitize_notes_body(body: str) -> str:
    """Strip chat preambles, collapse ###+ to ##, un-indent markers, tighten spacing.

    Blank lines are kept only immediately before ## subtitles — not between every line.
    """
    text = (body or "").replace("\r\n", "\n").strip()
    if not text:
        return ""
    lines = text.split("\n")
    meta_re = re.compile(
        r"^(Creating|Here(?:'s| is)|I (?:will|have|am)|Sure|Okay|Alright|Below is|"
        r"I've (?:created|written)|Let me)\b",
        re.IGNORECASE,
    )
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines:
        first = lines[0].strip()
        if first.startswith(("#", ">", "-", "—", "//")):
            break
        if meta_re.match(first) or (
            len(first) < 160
            and first.endswith((".", "…", "..."))
            and any(
                w in first.lower()
                for w in ("creating", "breakdown", "here is", "i will", "including significant")
            )
        ):
            lines.pop(0)
            while lines and not lines[0].strip():
                lines.pop(0)
            continue
        break
    raw: list[str] = []
    marker_re = re.compile(r"^(#{1,}|-|—|>|//|- \[[ xX]\])")
    for line in lines:
        stripped = line.lstrip()
        # Collapse ###+ to ## (subtitle). Keep single # and ## as-is.
        m3 = re.match(r"^(#{3,})\s+(.*)$", stripped)
        if m3:
            raw.append(f"## {m3.group(2).strip()}")
            continue
        if marker_re.match(stripped):
            raw.append(stripped)
        else:
            raw.append(stripped if stripped else "")
    # Drop empty lines, then re-insert a single blank only before ## subtitles.
    content = [ln for ln in raw if ln.strip() != ""]
    out: list[str] = []
    for ln in content:
        if out and ln.startswith("## "):
            out.append("")
        out.append(ln)
    return "\n".join(out).strip()


def _merge_hits(existing: list[SearchHitOut], new: list[SearchHitOut], *, cap: int = 16) -> list[SearchHitOut]:
    by_key: dict[str, SearchHitOut] = {}
    for hit in [*existing, *new]:
        key = f"{hit.workId}:{hit.locusId}"
        if key not in by_key:
            by_key[key] = hit
    return list(by_key.values())[:cap]


def _search_queries_from_actions(actions: list[Any]) -> list[str]:
    out: list[str] = []
    for raw in actions:
        if not isinstance(raw, dict):
            continue
        if str(raw.get("type") or "") != "search_library":
            continue
        q = str(raw.get("query") or raw.get("q") or "").strip()
        if q:
            # Normalize American spelling that misses OCR text
            q = re.sub(r"\btraveler\b", "traveller", q, flags=re.IGNORECASE)
            out.append(q[:120])
    return out


def _has_action(actions: list[Any], atype: str) -> bool:
    for raw in actions:
        if isinstance(raw, dict) and str(raw.get("type") or "") == atype:
            return True
    return False


def _work_hint_from_question(question: str) -> str | None:
    q = (question or "").lower()
    if "dark night" in q:
        return "dark-night-of-the-soul"
    if "ascent" in q and "carmel" in q:
        return "ascent-of-mount-carmel"
    if "confessions" in q or "augustine" in q:
        return "confessions-augustine"
    return None


def _extra_quote_queries(question: str) -> list[str]:
    q = (question or "").lower()
    extras: list[str] = []
    if any(w in q for w in ("travel", "road", "lost", "unknown", "foreign")):
        extras.extend(
            [
                "unknown unpleasing road traveller",
                "traveller foreign lands unfamiliar roads",
                "lost her way unknown road",
            ]
        )
    if "dark night" in q:
        extras.append("dark night of the soul")
    return extras


def _initial_search_queries(question: str, seed: str | None) -> list[str]:
    """Build compact FTS queries so long chatty prompts do not AND to zero hits."""
    queries: list[str] = []
    kw = _keywords_from_text(question, limit=10)
    # Prefer traveller spelling in keyword bag
    kw = ["traveller" if w == "traveler" else w for w in kw]
    if len(kw) >= 2:
        queries.append(" ".join(kw[:8]))
    if len(kw) >= 4:
        queries.append(" ".join(kw[:4]))
    for m in re.finditer(r'"([^"]{4,80})"', question):
        queries.append(m.group(1).strip())
    queries.extend(_extra_quote_queries(question))
    if seed:
        sk = _keywords_from_text(seed, limit=8)
        if sk:
            queries.append(" ".join(sk[:6]))
    seen: set[str] = set()
    unique: list[str] = []
    for q in queries:
        key = q.lower()
        if key in seen or len(q) < 3:
            continue
        seen.add(key)
        unique.append(q)
    return unique[:6]


def _retrieve_for_queries(
    session: Session,
    queries: list[str],
    *,
    limit: int,
    existing: list[SearchHitOut] | None = None,
    work_id: str | None = None,
) -> tuple[list[SearchHitOut], list[str]]:
    hits = list(existing or [])
    ran: list[str] = []
    per = max(3, min(limit, 8))
    for q in queries:
        q = q.strip()
        if not q:
            continue
        ran.append(q)
        scoped_hits: list[SearchHitOut] = []
        if work_id:
            scoped = run_search(
                session, q, limit=per, include_text=True, work_id=work_id
            )
            scoped_hits = scoped.hits
            hits = _merge_hits(hits, scoped_hits, cap=max(limit * 2, 16))
        result = run_search(session, q, limit=per, include_text=True)
        hits = _merge_hits(hits, result.hits, cap=max(limit * 2, 16))
        if not result.hits and not scoped_hits:
            soft = " ".join(_keywords_from_text(q, limit=4))
            if soft and soft.lower() != q.lower():
                result2 = run_search(
                    session, soft, limit=per, include_text=True, work_id=work_id
                )
                hits = _merge_hits(hits, result2.hits, cap=max(limit * 2, 16))
                if work_id:
                    result3 = run_search(session, soft, limit=per, include_text=True)
                    hits = _merge_hits(hits, result3.hits, cap=max(limit * 2, 16))
    # Prefer hinted work near the front
    if work_id and hits:
        preferred = [h for h in hits if h.workId == work_id]
        other = [h for h in hits if h.workId != work_id]
        hits = [*preferred, *other][: max(limit * 2, 16)]
    return hits, ran


def _parse_llm_json(raw: str) -> dict[str, Any]:
    text = raw.strip()
    fence = _JSON_FENCE.search(text)
    if fence:
        text = fence.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("LLM JSON was not an object")
    return data


def _find_note(session: Session, note_id: str, title: str) -> Note | None:
    if note_id:
        note = session.get(Note, note_id)
        if note:
            return note
    if title:
        return session.exec(select(Note).where(Note.title == title)).first()
    return None


def _apply_confirmed_deletes(
    session: Session, confirmed: list[dict]
) -> list[AskActionTakenOut]:
    """Apply delete_note actions the client already confirmed (even without a new LLM emit)."""
    taken: list[AskActionTakenOut] = []
    for raw in confirmed:
        if not isinstance(raw, dict):
            continue
        if str(raw.get("type") or "") != "delete_note":
            continue
        note_id = str(raw.get("noteId") or "")
        title = str(raw.get("title") or "").strip()
        note = _find_note(session, note_id, title)
        if note is None:
            taken.append(
                AskActionTakenOut(
                    type="delete_note",
                    message=f"Could not find note to delete ({title or note_id or 'unknown'}).",
                )
            )
            continue
        session.delete(note)
        session.commit()
        taken.append(
            AskActionTakenOut(
                type="delete_note",
                noteId=note.id,
                title=note.title,
                message=f"Deleted note “{note.title}”.",
            )
        )
    return taken


def _apply_actions(
    session: Session,
    actions: list[Any],
    *,
    allow: bool,
    confirmed: list[dict],
    skip_confirmed_deletes: bool = False,
    allow_mutations: bool = True,
) -> tuple[list[AskActionTakenOut], list[AskPendingActionOut]]:
    if not allow or not actions:
        return [], []
    taken: list[AskActionTakenOut] = []
    pending: list[AskPendingActionOut] = []
    now = _now()

    confirmed_deletes = {
        (str(a.get("type") or ""), str(a.get("noteId") or ""), str(a.get("title") or "").strip())
        for a in confirmed
        if isinstance(a, dict)
    }

    for raw in actions:
        if not isinstance(raw, dict):
            continue
        atype = str(raw.get("type") or "")
        title = str(raw.get("title") or "Untitled").strip() or "Untitled"
        section = str(raw.get("section") or "personal")
        if section not in ("personal", "apologetics"):
            section = "personal"
        body = str(raw.get("body") or "").strip()
        note_id = str(raw.get("noteId") or "")

        if atype == "search_library":
            q = str(raw.get("query") or raw.get("q") or "").strip()
            if q:
                taken.append(
                    AskActionTakenOut(
                        type="search_library",
                        message=str(raw.get("message") or f"Searched library for “{q}”."),
                        title=q[:80],
                    )
                )
            continue

        if atype == "request_note_context":
            note = _find_note(session, note_id, title if title != "Untitled" else "")
            pending.append(
                AskPendingActionOut(
                    type="request_note_context",
                    noteId=(note.id if note else note_id) or None,
                    title=(note.title if note else title),
                    message=str(
                        raw.get("message")
                        or f"May I read your note “{note.title if note else title}” for context?"
                    ),
                )
            )
            continue

        if not allow_mutations:
            continue

        if atype == "delete_note":
            matched = any(
                str(a.get("type")) == "delete_note"
                and (
                    (note_id and str(a.get("noteId") or "") == note_id)
                    or (title and str(a.get("title") or "").strip() == title)
                )
                for a in confirmed
                if isinstance(a, dict)
            )
            if not matched:
                key = ("delete_note", note_id, title if not note_id else "")
                key2 = ("delete_note", note_id, title)
                matched = key in confirmed_deletes or key2 in confirmed_deletes
            if not matched:
                pending.append(
                    AskPendingActionOut(
                        type="delete_note",
                        noteId=note_id or None,
                        title=title,
                        message=f"Delete note “{title}”?",
                    )
                )
                continue
            if skip_confirmed_deletes:
                # Already applied via _apply_confirmed_deletes this turn.
                continue
            note = _find_note(session, note_id, title)
            if note is None:
                taken.append(
                    AskActionTakenOut(
                        type="delete_note",
                        message=f"Could not find note to delete ({title}).",
                    )
                )
                continue
            session.delete(note)
            session.commit()
            taken.append(
                AskActionTakenOut(
                    type="delete_note",
                    noteId=note.id,
                    title=note.title,
                    message=f"Deleted note “{note.title}”.",
                )
            )
            continue

        if atype == "create_note":
            note = Note(
                id=f"n-{uuid4().hex[:12]}",
                title=title,
                section=section,
                body=_sanitize_notes_body(body),
                created_at=now,
                updated_at=now,
            )
            session.add(note)
            session.commit()
            taken.append(
                AskActionTakenOut(
                    type="create_note",
                    noteId=note.id,
                    title=note.title,
                    message=f"Created note “{note.title}”.",
                )
            )
            continue

        if atype == "update_note":
            note = _find_note(session, note_id, title)
            if note is None:
                taken.append(
                    AskActionTakenOut(
                        type="update_note",
                        message=f"Could not find note to update ({title}).",
                    )
                )
                continue
            mode = str(raw.get("mode") or "append").lower()
            if title:
                note.title = title
            if body:
                clean = _sanitize_notes_body(body)
                if mode == "replace":
                    note.body = clean
                else:
                    note.body = (
                        (note.body.rstrip() + "\n\n" + clean).strip()
                        if note.body.strip()
                        else clean
                    )
            note.section = section
            note.updated_at = now
            session.add(note)
            session.commit()
            taken.append(
                AskActionTakenOut(
                    type="update_note",
                    noteId=note.id,
                    title=note.title,
                    message=f"Updated note “{note.title}”.",
                )
            )
    return taken, pending


# --- Thread CRUD -------------------------------------------------------------


@router.get("/ask/threads", response_model=list[AskThreadOut])
def list_threads(session: Session = Depends(session_dependency)) -> list[AskThreadOut]:
    rows = session.exec(select(AskThread).order_by(col(AskThread.updated_at).desc())).all()
    return [_thread_out(t) for t in rows]


@router.post("/ask/threads", response_model=AskThreadOut)
def create_thread(
    body: AskThreadIn | None = None,
    session: Session = Depends(session_dependency),
) -> AskThreadOut:
    title = (body.title if body and body.title else None) or "New chat"
    t = AskThread(id=f"ath-{uuid4().hex[:12]}", title=title.strip() or "New chat")
    session.add(t)
    session.commit()
    session.refresh(t)
    return _thread_out(t)


@router.patch("/ask/threads/{thread_id}", response_model=AskThreadOut)
def update_thread(
    thread_id: str,
    body: AskThreadUpdate,
    session: Session = Depends(session_dependency),
) -> AskThreadOut:
    t = session.get(AskThread, thread_id)
    if not t:
        raise HTTPException(404, "Thread not found")
    t.title = body.title.strip() or t.title
    t.updated_at = _now()
    session.add(t)
    session.commit()
    session.refresh(t)
    return _thread_out(t)


@router.delete("/ask/threads/{thread_id}")
def delete_thread(thread_id: str, session: Session = Depends(session_dependency)) -> dict:
    t = session.get(AskThread, thread_id)
    if not t:
        raise HTTPException(404, "Thread not found")
    msgs = session.exec(select(AskMessageRow).where(AskMessageRow.thread_id == thread_id)).all()
    for m in msgs:
        session.delete(m)
    session.delete(t)
    session.commit()
    return {"ok": True}


@router.get("/ask/threads/{thread_id}/messages", response_model=list[AskMessageOut])
def list_messages(
    thread_id: str,
    session: Session = Depends(session_dependency),
) -> list[AskMessageOut]:
    t = session.get(AskThread, thread_id)
    if not t:
        raise HTTPException(404, "Thread not found")
    rows = session.exec(
        select(AskMessageRow)
        .where(AskMessageRow.thread_id == thread_id)
        .order_by(col(AskMessageRow.created_at).asc())
    ).all()
    return [_message_out(m) for m in rows]


@router.post("/ask", response_model=AskOut)
async def ask(
    body: AskIn,
    session: Session = Depends(session_dependency),
) -> AskOut:
    question = (body.question or "").strip()
    if len(question) < 2:
        return AskOut(answer="Ask a short question about your library.")

    thread = _ensure_thread(session, body.threadId, question)
    history = _load_history(session, thread.id)
    # Exclude the current question if client already persisted it (it hasn't yet).
    history_for_prompt = [m for m in history if m.content.strip() != question]
    pre_taken = _apply_confirmed_deletes(session, list(body.confirmedActions or []))

    limit = max(1, min(body.limit or 8, 12))
    max_rounds = max(1, min(ASK_MAX_ROUNDS, 4))
    work_hint = _work_hint_from_question(question)

    hits, searched = _retrieve_for_queries(
        session,
        _initial_search_queries(question, body.seed),
        limit=limit,
        work_id=work_hint,
    )
    if not hits and body.seed:
        seed_terms = " ".join((body.seed or "").split()[:24])
        if len(seed_terms) >= 2:
            hits, extra = _retrieve_for_queries(
                session,
                [seed_terms],
                limit=limit,
                existing=hits,
                work_id=work_hint,
            )
            searched.extend(extra)

    catalog = catalog_with_library(session)
    note_titles = list(session.exec(select(Note).order_by(Note.updated_at.desc()).limit(40)).all())
    consented: list[Note] = []
    for nid in body.noteIds or []:
        n = session.get(Note, str(nid))
        if n:
            consented.append(n)

    if not llm_configured():
        if hits:
            return _fallback(
                "Found related passages. Add OPENAI_API_KEY to enable synthesized answers.",
                hits,
                thread.id,
            )
        return AskOut(
            answer="Add OPENAI_API_KEY on the Study Desk API to enable Ask.",
            recommendations=[
                AskRecommendationOut(
                    catalogId=str(c["id"]),
                    title=str(c["title"]),
                    author=str(c.get("author") or ""),
                    inLibrary=bool(c.get("inLibrary")),
                    workId=c.get("workId"),
                    reason=str(c.get("summary") or ""),
                )
                for c in catalog[:5]
            ],
            threadId=thread.id,
        )

    data: dict[str, Any] = {}
    loop_taken: list[AskActionTakenOut] = []
    pending_actions: list[AskPendingActionOut] = []
    actions_taken: list[AskActionTakenOut] = list(pre_taken)

    for round_idx in range(1, max_rounds + 1):
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": _build_user_prompt(
                    question,
                    hits,
                    body.seed,
                    catalog,
                    note_titles,
                    consented,
                    history_for_prompt,
                    round_idx=round_idx,
                    max_rounds=max_rounds,
                    searched_queries=searched,
                    chapter_guide=_chapter_guide_for_hits(session, hits),
                ),
            },
        ]
        try:
            raw = await chat_completion(messages, max_tokens=ASK_MAX_TOKENS)
            data = _parse_llm_json(raw)
        except (LlmError, ValueError, json.JSONDecodeError) as exc:
            log.warning("ask LLM failed (round %s): %s", round_idx, exc)
            if hits:
                return _fallback(
                    f"Found related passages, but could not synthesize an answer ({exc}).",
                    hits,
                    thread.id,
                )
            return AskOut(answer=f"Ask failed: {exc}", threadId=thread.id)

        actions = list(data.get("actions") or [])
        search_qs = _search_queries_from_actions(actions)
        # Drop queries we already ran
        search_qs = [q for q in search_qs if q.lower() not in {s.lower() for s in searched}]

        # Always surface request_note_context immediately (needs user consent).
        mid_taken, mid_pending = _apply_actions(
            session,
            actions,
            allow=bool(body.allowActions),
            confirmed=list(body.confirmedActions or []),
            skip_confirmed_deletes=bool(pre_taken),
            allow_mutations=False,
        )
        loop_taken.extend(mid_taken)
        if mid_pending:
            pending_actions = mid_pending
            actions_taken = [*pre_taken, *loop_taken]
            # Stop loop so the UI can ask for note consent before rewriting.
            break

        if search_qs and round_idx < max_rounds:
            hits, extra = _retrieve_for_queries(
                session,
                search_qs,
                limit=limit,
                existing=hits,
                work_id=work_hint,
            )
            searched.extend(extra)
            for q in extra:
                loop_taken.append(
                    AskActionTakenOut(
                        type="search_library",
                        title=q[:80],
                        message=f"Searched library for “{q}”.",
                    )
                )
            continue

        # Final round (or model did not request more search): apply mutations.
        final_taken, final_pending = _apply_actions(
            session,
            actions,
            allow=bool(body.allowActions),
            confirmed=list(body.confirmedActions or []),
            skip_confirmed_deletes=bool(pre_taken),
            allow_mutations=True,
        )
        actions_taken = [*pre_taken, *loop_taken, *final_taken]
        # Avoid duplicate search_library lines already in loop_taken
        pending_actions = final_pending
        break
    else:
        actions_taken = [*pre_taken, *loop_taken]

    answer = str(data.get("answer") or "").strip() or "Here is what I found."
    # If we created a note, keep chat as a short confirmation (don't dump the note body).
    created = next((a for a in actions_taken if a.type == "create_note" and a.title), None)
    if created and (
        len(answer) > 900
        or answer.lstrip().startswith(("Creating", "# ", "## "))
        or answer.count("## ") >= 2
        or answer.count("\n> ") >= 2
    ):
        answer = (
            f"Created note “{created.title}”. Open it in Notes for the full writeup "
            f"with quotes from your library."
        )
    # Chat answers may use ## sections; only normalize ###+ down to ##.
    if "###" in answer:
        answer = re.sub(r"^#{3,}\s+", "## ", answer, flags=re.MULTILINE)
    # Tighten accidental blank-line padding in chat too (blank only before ##).
    if "\n\n" in answer:
        ans_lines = [ln.rstrip() for ln in answer.replace("\r\n", "\n").split("\n")]
        content = [ln for ln in ans_lines if ln.strip() != ""]
        rebuilt: list[str] = []
        for ln in content:
            if rebuilt and ln.startswith("## "):
                rebuilt.append("")
            rebuilt.append(ln)
        answer = "\n".join(rebuilt).strip()

    bullets = [str(b).strip() for b in (data.get("bullets") or []) if str(b).strip()][:10]

    citation_ids: list[str] = []
    for item in data.get("citationLocusIds") or []:
        if isinstance(item, str) and item.strip():
            citation_ids.append(item.strip())

    catalog_by_id = {c["id"]: c for c in catalog}
    recommendations: list[AskRecommendationOut] = []
    seen_rec: set[str] = set()
    for raw_rec in data.get("recommendations") or []:
        if not isinstance(raw_rec, dict):
            continue
        cid = str(raw_rec.get("catalogId") or raw_rec.get("workId") or "").strip()
        entry = catalog_by_id.get(cid)
        work_id = None
        if entry:
            work_id = entry.get("workId") or (cid if entry.get("inLibrary") else None)
            title = str(entry["title"])
            author = str(entry.get("author") or "")
            in_library = bool(entry.get("inLibrary"))
        else:
            # Allow recommending an imported work by work id even if catalog key differs.
            work = session.get(Work, cid)
            if not work:
                continue
            work_id = work.id
            title = work.title
            author = work.author or ""
            in_library = True
            cid = work.id

        section_id_raw = str(raw_rec.get("sectionId") or "").strip() or None
        section_hint = str(
            raw_rec.get("sectionHint") or raw_rec.get("chapter") or raw_rec.get("question") or ""
        ).strip() or None
        sec_id, sec_title = _resolve_section_recommendation(
            session,
            work_id=str(work_id) if work_id else None,
            section_id=section_id_raw,
            section_hint=section_hint,
        )
        display_title = title
        if sec_title:
            display_title = f"{title}: {sec_title}"
        key = f"{cid}:{sec_id or ''}"
        if key in seen_rec:
            continue
        seen_rec.add(key)
        recommendations.append(
            AskRecommendationOut(
                catalogId=cid,
                title=display_title,
                author=author,
                inLibrary=in_library,
                workId=str(work_id) if work_id else None,
                reason=str(raw_rec.get("reason") or (entry or {}).get("summary") or ""),
                sectionId=sec_id,
                sectionTitle=sec_title,
            )
        )
        if len(recommendations) >= 6:
            break

    # Deduplicate search actions in actionsTaken
    seen_msgs: set[str] = set()
    deduped: list[AskActionTakenOut] = []
    for a in actions_taken:
        key = f"{a.type}:{a.title}:{a.message}"
        if key in seen_msgs:
            continue
        seen_msgs.add(key)
        deduped.append(a)
    actions_taken = deduped

    out = AskOut(
        answer=answer,
        resources=_resources_from_hits(hits),
        citations=_citations_from_hits(hits, citation_ids),
        bullets=bullets,
        recommendations=recommendations,
        actionsTaken=actions_taken,
        pendingActions=pending_actions,
        threadId=thread.id,
    )

    now = _now()
    user_msg = AskMessageRow(
        id=f"am-{uuid4().hex[:12]}",
        thread_id=thread.id,
        role="user",
        content=question,
        created_at=now,
    )
    asst_msg = AskMessageRow(
        id=f"am-{uuid4().hex[:12]}",
        thread_id=thread.id,
        role="assistant",
        content=answer,
        response_json=json.dumps(out.model_dump()),
        created_at=now,
    )
    thread.updated_at = now
    # Name the chat on first turn (or while still a placeholder), never with the raw prompt.
    q_line = question.split("\n", 1)[0].strip()
    title_now = (thread.title or "").strip()
    still_placeholder = (
        not history
        or title_now in ("", "New chat")
        or (q_line and title_now == q_line[:60])
    )
    if still_placeholder:
        nice = _pick_thread_title(data, actions_taken, answer)
        if nice:
            thread.title = nice
    session.add(user_msg)
    session.add(asst_msg)
    session.add(thread)
    session.commit()

    return out
