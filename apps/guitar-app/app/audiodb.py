"""TheAudioDB client — free track metadata (BPM / key).

Uses the public demo API key by default (rate-limited). Override with
THEAUDIODB_API_KEY if you register a personal key.
"""

from __future__ import annotations

import os
import re
from typing import Any, Optional

import httpx

AUDIODB_BASE = "https://www.theaudiodb.com/api/v1/json"
USER_AGENT = "FretworkGuitarApp/0.1 (homelab)"


class AudioDbError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def _api_key() -> str:
    return os.environ.get("THEAUDIODB_API_KEY", "2").strip() or "2"


def _normalize_key(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    text = raw.strip()
    if not text or text.lower() in {"null", "none", "0", "-"}:
        return None
    # Common forms: "Cm", "C minor", "Cmaj", "G Major"
    m = re.match(r"^([A-G][#b]?)\s*(m|min|minor|maj|major)?$", text, re.IGNORECASE)
    if not m:
        return text[:8]
    root = m.group(1)[0].upper() + m.group(1)[1:]
    mode = (m.group(2) or "").lower()
    if mode in {"m", "min", "minor"}:
        return f"{root}m"
    return root


def _pick_track(
    tracks: list[dict[str, Any]],
    title: str,
    duration_ms: Optional[int],
) -> Optional[dict[str, Any]]:
    if not tracks:
        return None
    title_l = title.strip().lower()

    def score(t: dict[str, Any]) -> tuple:
        name = (t.get("strTrack") or "").strip().lower()
        exact = 0 if name == title_l else 1
        dur = None
        try:
            dur = int(t.get("intDuration") or 0) or None
        except (TypeError, ValueError):
            dur = None
        dur_diff = abs((dur or 0) - duration_ms) if duration_ms and dur else 10**9
        has_tempo = 0 if _parse_bpm(t.get("intTempo")) else 1
        has_key = 0 if _normalize_key(t.get("strKey")) else 1
        return (exact, has_tempo + has_key, dur_diff)

    return sorted(tracks, key=score)[0]


def _parse_bpm(raw: Any) -> Optional[int]:
    if raw is None or raw == "":
        return None
    try:
        n = int(round(float(raw)))
    except (TypeError, ValueError):
        return None
    if n < 40 or n > 240:
        return None
    return n


def lookup_track_meta(
    title: str,
    artist: str,
    duration_ms: Optional[int] = None,
) -> dict[str, Any]:
    """Return bpm/key suggestions for a title + artist."""
    title = title.strip()
    artist = artist.strip()
    if not title or not artist:
        return {"found": False, "bpm": None, "key": None, "source": None}

    url = f"{AUDIODB_BASE}/{_api_key()}/searchtrack.php"
    try:
        with httpx.Client(timeout=20.0, headers={"User-Agent": USER_AGENT}) as client:
            res = client.get(url, params={"s": artist, "t": title})
    except httpx.HTTPError as exc:
        raise AudioDbError(f"TheAudioDB request failed: {exc}") from exc

    if res.status_code >= 400:
        raise AudioDbError(f"TheAudioDB error {res.status_code}", res.status_code)

    data = res.json() if res.content else {}
    tracks = data.get("track") or []
    if not isinstance(tracks, list):
        tracks = []

    pick = _pick_track(tracks, title, duration_ms)
    if not pick:
        # Soft fallback: Deezer often has BPM when AudioDB doesn't
        deezer = _deezer_bpm(title, artist, duration_ms)
        if deezer:
            return {
                "found": True,
                "bpm": deezer,
                "key": None,
                "source": "deezer",
                "matchedTitle": title,
                "matchedArtist": artist,
            }
        return {"found": False, "bpm": None, "key": None, "source": None}

    bpm = _parse_bpm(pick.get("intTempo"))
    key = _normalize_key(pick.get("strKey"))
    source = "theaudiodb"

    if bpm is None:
        deezer = _deezer_bpm(title, artist, duration_ms)
        if deezer:
            bpm = deezer
            source = "theaudiodb+deezer"

    return {
        "found": bpm is not None or key is not None,
        "bpm": bpm,
        "key": key,
        "source": source if (bpm or key) else None,
        "matchedTitle": pick.get("strTrack"),
        "matchedArtist": pick.get("strArtist"),
        "album": pick.get("strAlbum"),
    }


def _deezer_bpm(
    title: str,
    artist: str,
    duration_ms: Optional[int],
) -> Optional[int]:
    q = f"{title} {artist}".strip()
    try:
        with httpx.Client(timeout=15.0, headers={"User-Agent": USER_AGENT}) as client:
            res = client.get("https://api.deezer.com/search", params={"q": q, "limit": 5})
            if res.status_code >= 400:
                return None
            hits = (res.json() or {}).get("data") or []
            if not hits:
                return None

            def score(t: dict[str, Any]) -> tuple:
                name = (t.get("title") or "").lower()
                art = ((t.get("artist") or {}).get("name") or "").lower()
                exact = 0 if name == title.lower() and artist.lower() in art else 1
                dur = int((t.get("duration") or 0) * 1000)
                dur_diff = abs(dur - duration_ms) if duration_ms and dur else 10**9
                return (exact, dur_diff)

            best = sorted(hits, key=score)[0]
            detail = client.get(f"https://api.deezer.com/track/{best['id']}")
            if detail.status_code >= 400:
                return None
            return _parse_bpm((detail.json() or {}).get("bpm"))
    except httpx.HTTPError:
        return None
