"""ChordPro + Ultimate-Guitar-style paste → sheet line parser."""

from __future__ import annotations

import re
from typing import Any

_CHORD_RE = re.compile(r"\[([^\]]+)\]")
_META_RE = re.compile(r"^\{([^}:]+)(?::\s*(.*))?\}$")
_INLINE_CHORDPRO = re.compile(r"\[[A-G][#b]?[^\]]*\]\S")
_CHORD_TOKEN = re.compile(
    r"^(?:N\.?C\.?|[A-G](?:#|b)?(?:maj|min|m|dim|aug|sus|add|maj7|m7|7|9|11|13|6|2|4|5|"
    r"maj9|m9|m6|dim7|aug7|sus2|sus4)*(?:/[A-G](?:#|b)?)?)\*?$",
    re.IGNORECASE,
)
_REPEAT = re.compile(r"^x\d+$", re.IGNORECASE)
_CHORD_FIND = re.compile(
    r"(?:N\.?C\.?|[A-G](?:#|b)?(?:maj|min|m|dim|aug|sus|add|maj7|m7|7|9|11|13|6|2|4|5|"
    r"maj9|m9|m6|dim7|aug7|sus2|sus4)*(?:/[A-G](?:#|b)?)?)\*?",
    re.IGNORECASE,
)


def _normalize_chord_token(token: str) -> str:
    """Chord name for diagrams / lookup — trailing UG * is ignored."""
    return token.rstrip("*")


def _chord_names(chord_line: str) -> list[str]:
    return [_normalize_chord_token(m.group(0)) for m in _CHORD_FIND.finditer(chord_line)]


def _lyric(
    words: str,
    *,
    chord_line: str = "",
    chords: list[str] | None = None,
) -> dict[str, Any]:
    names = chords if chords is not None else _chord_names(chord_line)
    return {
        "kind": "lyric",
        "words": words,
        "chordLine": chord_line,
        "chords": names,
    }


def _break() -> dict[str, Any]:
    return {"kind": "break"}


def _append_break_if_needed(lines: list[dict[str, Any]], pending: bool) -> bool:
    """Insert at most one paragraph break between content blocks."""
    if pending and lines and lines[-1].get("kind") != "break":
        lines.append(_break())
    return False


def parse_chordpro(text: str) -> list[dict[str, Any]]:
    """Parse ChordPro-ish / plain lyric text into sheet lines.

    Blank lines become a single paragraph break (not dropped).
    """
    lines: list[dict[str, Any]] = []
    pending_break = False
    for raw in text.splitlines():
        line = raw.rstrip()
        stripped = line.strip()
        if not stripped:
            pending_break = True
            continue

        meta = _META_RE.match(stripped)
        if meta:
            key = meta.group(1).strip().lower()
            value = (meta.group(2) or "").strip()
            if key in {"title", "t", "artist", "subtitle", "st", "key", "capo"}:
                continue
            if key in {"comment", "c", "soc", "eoc", "sob", "eob"} and value:
                pending_break = _append_break_if_needed(lines, pending_break)
                lines.append({"kind": "section", "label": value})
            continue

        chords = _CHORD_RE.findall(stripped)
        words = _CHORD_RE.sub("", stripped).strip()
        if len(chords) == 1 and not words and not re.search(r"[0-9#b/]", chords[0]):
            token = chords[0]
            if len(token) > 3 and not re.search(r"[0-9#]", token):
                pending_break = _append_break_if_needed(lines, pending_break)
                lines.append({"kind": "section", "label": token})
                continue

        if not chords and not words:
            continue

        pending_break = _append_break_if_needed(lines, pending_break)
        # Rebuild a readable chord line for display (ChordPro has no columns)
        chord_line = "  ".join(chords) if chords else ""
        lines.append(_lyric(words or "(instrumental)", chord_line=chord_line, chords=chords))

    return lines


def _tokens_for_chord_check(line: str) -> list[str]:
    return [
        _normalize_chord_token(t)
        for t in line.strip().split()
        if not _REPEAT.match(t)
    ]


def _is_chord_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped or stripped.startswith("["):
        return False
    tokens = _tokens_for_chord_check(stripped)
    if not tokens:
        return False
    chordish = sum(1 for t in tokens if _CHORD_TOKEN.match(t))
    return chordish >= 1 and chordish / len(tokens) >= 0.6


def _is_section_header(stripped: str) -> bool:
    if not (stripped.startswith("[") and stripped.endswith("]")):
        return False
    inner = stripped[1:-1].strip()
    if not inner:
        return False
    if _CHORD_TOKEN.match(inner):
        return False
    return True


def parse_ug_style(text: str) -> list[dict[str, Any]]:
    """Parse Ultimate Guitar–style paste (chord line above lyric line).

    Preserves the original chord-line spacing in `chordLine` so the UI can
    render monospace alignment like UG. Blank lines become paragraph breaks.
    """
    raw_lines = text.splitlines()
    lines: list[dict[str, Any]] = []
    i = 0
    pending_break = False
    while i < len(raw_lines):
        line = raw_lines[i].rstrip("\n").rstrip("\r")
        # Keep trailing spaces off but preserve leading indent for alignment
        chord_display = line.rstrip()
        stripped = line.strip()
        if not stripped:
            pending_break = True
            i += 1
            continue

        if _META_RE.match(stripped):
            i += 1
            continue

        if _is_section_header(stripped):
            pending_break = _append_break_if_needed(lines, pending_break)
            lines.append({"kind": "section", "label": stripped[1:-1].strip()})
            i += 1
            continue

        if _is_chord_line(line):
            j = i + 1
            while j < len(raw_lines) and not raw_lines[j].strip():
                j += 1
            if j < len(raw_lines):
                next_line = raw_lines[j].rstrip("\n").rstrip("\r")
                next_stripped = next_line.strip()
                if (
                    next_stripped
                    and not _is_chord_line(next_line)
                    and not _is_section_header(next_stripped)
                    and not _META_RE.match(next_stripped)
                ):
                    pending_break = _append_break_if_needed(lines, pending_break)
                    lines.append(
                        _lyric(next_stripped, chord_line=chord_display)
                    )
                    i = j + 1
                    continue

            names = [
                t for t in _tokens_for_chord_check(stripped) if _CHORD_TOKEN.match(t)
            ]
            repeat = ""
            for t in stripped.split():
                if _REPEAT.match(t):
                    repeat = f" ({t})"
                    break
            pending_break = _append_break_if_needed(lines, pending_break)
            lines.append(
                _lyric(
                    f"(instrumental){repeat}",
                    chord_line=chord_display,
                    chords=names,
                )
            )
            i += 1
            continue

        pending_break = _append_break_if_needed(lines, pending_break)
        lines.append(_lyric(stripped, chord_line=""))
        i += 1

    return lines


def _looks_like_ug(text: str) -> bool:
    ug_chords = 0
    sections = 0
    for ln in text.splitlines():
        s = ln.strip()
        if _is_section_header(s):
            sections += 1
        if _is_chord_line(ln):
            ug_chords += 1
    return ug_chords >= 1 or sections >= 2


def parse_sheet_text(text: str) -> list[dict[str, Any]]:
    """Auto-detect ChordPro vs UG-style paste."""
    if not text or not text.strip():
        return []

    has_inline_chordpro = bool(_INLINE_CHORDPRO.search(text))
    first = next((ln.strip() for ln in text.splitlines() if ln.strip()), "")
    has_leading_meta = bool(_META_RE.match(first))

    if has_inline_chordpro and not _looks_like_ug(text):
        return normalize_sheet_lines(parse_chordpro(text))

    if _looks_like_ug(text):
        return normalize_sheet_lines(parse_ug_style(text))

    if has_inline_chordpro or has_leading_meta or "{" in text:
        parsed = parse_chordpro(text)
        if parsed:
            return normalize_sheet_lines(parsed)

    return normalize_sheet_lines(parse_ug_style(text) or parse_chordpro(text))


def normalize_sheet_lines(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Repair starred chord rows saved as lyrics; keep * visible on the chord line."""
    out: list[dict[str, Any]] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.get("kind") != "lyric":
            out.append(line)
            i += 1
            continue

        chord_line = line.get("chordLine") or ""
        words = line.get("words") or ""

        # Chord row with * mistakenly stored as lyric text — pair as normal chords
        if not chord_line.strip() and "*" in words and _is_chord_line(words):
            chord_display = words.rstrip()
            j = i + 1
            if j < len(lines) and lines[j].get("kind") == "lyric":
                nxt = lines[j]
                next_words = nxt.get("words") or ""
                next_chords = nxt.get("chordLine") or ""
                if (
                    next_words
                    and not next_chords.strip()
                    and not _is_chord_line(next_words)
                    and not next_words.startswith("(instrumental)")
                ):
                    out.append(_lyric(next_words, chord_line=chord_display))
                    i = j + 1
                    continue
            out.append(_lyric("(instrumental)", chord_line=chord_display))
            i += 1
            continue

        # Ensure diagram chord list ignores *; leave chordLine (with *) alone
        if chord_line:
            names = _chord_names(chord_line)
            if names != (line.get("chords") or []):
                out.append(_lyric(words, chord_line=chord_line, chords=names))
            else:
                out.append(line)
            i += 1
            continue

        out.append(line)
        i += 1

    return out
