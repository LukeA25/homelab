"""LRCLIB lyrics client (free, no API key)."""

from __future__ import annotations

from typing import Any, Optional

import httpx

LRCLIB_BASE = "https://lrclib.net/api"


class LyricsError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def _get(path: str, params: Optional[dict[str, Any]] = None) -> Any:
    try:
        with httpx.Client(timeout=20.0) as client:
            res = client.get(f"{LRCLIB_BASE}{path}", params=params)
    except httpx.HTTPError as exc:
        raise LyricsError(f"LRCLIB request failed: {exc}") from exc
    if res.status_code == 404:
        return None
    if res.status_code >= 400:
        raise LyricsError(f"LRCLIB error {res.status_code}", res.status_code)
    return res.json()


def fetch_lyrics(
    title: str,
    artist: str,
    duration_ms: Optional[int] = None,
) -> dict[str, Any]:
    """Return plain lyrics (+ optional synced) for a track."""
    params: dict[str, Any] = {
        "track_name": title,
        "artist_name": artist,
    }
    if duration_ms and duration_ms > 0:
        params["duration"] = round(duration_ms / 1000)

    record = None
    if "duration" in params:
        record = _get("/get", params)

    if not record:
        results = _get(
            "/search",
            {"track_name": title, "artist_name": artist},
        )
        if isinstance(results, list) and results:
            record = results[0]

    if not record:
        return {
            "found": False,
            "plainLyrics": None,
            "instrumental": False,
            "chordPro": None,
            "lines": [],
        }

    plain = record.get("plainLyrics") or ""
    instrumental = bool(record.get("instrumental"))
    chord_pro = lyrics_to_chordpro(title, artist, plain) if plain else None
    lines = lyrics_to_lines(plain) if plain else []

    return {
        "found": bool(plain) or instrumental,
        "plainLyrics": plain or None,
        "syncedLyrics": record.get("syncedLyrics"),
        "instrumental": instrumental,
        "chordPro": chord_pro,
        "lines": lines,
        "sourceId": record.get("id"),
    }


def lyrics_to_chordpro(title: str, artist: str, plain: str) -> str:
    parts = [f"{{title: {title}}}", f"{{artist: {artist}}}", ""]
    for line in plain.splitlines():
        parts.append(line.rstrip())
    return "\n".join(parts).strip() + "\n"


def lyrics_to_lines(plain: str) -> list[dict[str, Any]]:
    lines: list[dict[str, Any]] = []
    pending_break = False
    for raw in plain.splitlines():
        text = raw.rstrip()
        if not text.strip():
            pending_break = True
            continue
        if pending_break and lines and lines[-1].get("kind") != "break":
            lines.append({"kind": "break"})
            pending_break = False
        # Section-ish ALL CAPS short lines
        if text.isupper() and 2 <= len(text) <= 24 and " " not in text.strip():
            lines.append({"kind": "section", "label": text.title()})
            continue
        lines.append({"kind": "lyric", "chords": [], "chordLine": "", "words": text})
    return lines
