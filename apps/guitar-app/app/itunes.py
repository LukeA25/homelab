"""Free iTunes Search API client (no developer key required)."""

from __future__ import annotations

from typing import Any, Optional

import httpx

ITUNES_SEARCH = "https://itunes.apple.com/search"
ITUNES_LOOKUP = "https://itunes.apple.com/lookup"


class ITunesError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def _artwork_url(url: Optional[str], size: int = 600) -> Optional[str]:
    if not url:
        return None
    # iTunes returns .../100x100bb.jpg — bump resolution
    for old in ("100x100bb", "60x60bb", "30x30bb"):
        if old in url:
            return url.replace(old, f"{size}x{size}bb")
    return url


def _art_hue(track_id: int | str) -> int:
    try:
        return int(track_id) % 360
    except (TypeError, ValueError):
        return 200


def track_summary(item: dict[str, Any]) -> dict[str, Any]:
    track_id = item.get("trackId") or item.get("collectionId") or ""
    return {
        "id": str(track_id),
        "title": item.get("trackName") or item.get("collectionName") or "Unknown",
        "artist": item.get("artistName") or "Unknown",
        "album": item.get("collectionName"),
        "genre": item.get("primaryGenreName") or "Other",
        "durationMs": item.get("trackTimeMillis"),
        "artworkUrl": _artwork_url(item.get("artworkUrl100") or item.get("artworkUrl60")),
        "artHue": _art_hue(track_id),
        "url": item.get("trackViewUrl") or item.get("collectionViewUrl"),
    }


def _get(params: dict[str, Any]) -> dict[str, Any]:
    try:
        with httpx.Client(timeout=20.0) as client:
            res = client.get(ITUNES_SEARCH, params=params)
    except httpx.HTTPError as exc:
        raise ITunesError(f"iTunes request failed: {exc}") from exc
    if res.status_code >= 400:
        raise ITunesError(f"iTunes error {res.status_code}", res.status_code)
    return res.json()


def search_songs(term: str, limit: int = 12, country: str = "US") -> list[dict[str, Any]]:
    data = _get(
        {
            "term": term,
            "media": "music",
            "entity": "song",
            "limit": limit,
            "country": country,
        }
    )
    results = data.get("results") or []
    return [track_summary(r) for r in results if r.get("wrapperType") == "track" or r.get("trackName")]


def discover_by_artist(artist: str, limit: int = 8, country: str = "US") -> list[dict[str, Any]]:
    """Search songs for an artist name; prefer exact artist matches."""
    tracks = search_songs(artist, limit=min(limit * 3, 25), country=country)
    exact = [t for t in tracks if t["artist"].lower() == artist.lower()]
    pool = exact or tracks
    # Dedupe by title
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for t in pool:
        key = t["title"].lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(t)
        if len(out) >= limit:
            break
    return out
