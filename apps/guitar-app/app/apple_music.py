"""Apple Music API client (catalog only — developer token, no user login).

Requires a MusicKit private key from Apple Developer. See:
https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens
"""

from __future__ import annotations

import colorsys
import os
import time
from typing import Any, Optional

import httpx
import jwt

APPLE_MUSIC_BASE = "https://api.music.apple.com/v1"

_token_cache: dict[str, Any] = {"token": None, "exp": 0}


class AppleMusicNotConfigured(Exception):
    pass


class AppleMusicError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def is_configured() -> bool:
    return bool(
        os.getenv("APPLE_MUSIC_TEAM_ID")
        and os.getenv("APPLE_MUSIC_KEY_ID")
        and (_private_key_pem() is not None)
    )


def _private_key_pem() -> Optional[str]:
    raw = os.getenv("APPLE_MUSIC_PRIVATE_KEY")
    if raw:
        return raw.replace("\\n", "\n").strip()
    path = os.getenv("APPLE_MUSIC_PRIVATE_KEY_PATH")
    if path and os.path.isfile(path):
        with open(path, encoding="utf-8") as f:
            return f.read().strip()
    return None


def storefront() -> str:
    return os.getenv("APPLE_MUSIC_STOREFRONT", "us")


def developer_token() -> str:
    """Mint (or reuse) an ES256 developer token. Max lifetime is 6 months."""
    if not is_configured():
        raise AppleMusicNotConfigured(
            "Apple Music is not configured. Set APPLE_MUSIC_TEAM_ID, "
            "APPLE_MUSIC_KEY_ID, and APPLE_MUSIC_PRIVATE_KEY (or _PATH)."
        )

    now = int(time.time())
    cached = _token_cache["token"]
    if cached and _token_cache["exp"] - now > 3600:
        return cached

    team_id = os.environ["APPLE_MUSIC_TEAM_ID"]
    key_id = os.environ["APPLE_MUSIC_KEY_ID"]
    private_key = _private_key_pem()
    assert private_key is not None

    # Keep well under Apple's 6-month max (~15777000s)
    lifetime = 60 * 60 * 24 * 30  # 30 days
    exp = now + lifetime
    token = jwt.encode(
        {"iss": team_id, "iat": now, "exp": exp},
        private_key,
        algorithm="ES256",
        headers={"alg": "ES256", "kid": key_id},
    )
    _token_cache["token"] = token
    _token_cache["exp"] = exp
    return token


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {developer_token()}",
        "Accept": "application/json",
    }


def artwork_url(artwork: Optional[dict[str, Any]], size: int = 400) -> Optional[str]:
    if not artwork or not artwork.get("url"):
        return None
    return (
        artwork["url"]
        .replace("{w}", str(size))
        .replace("{h}", str(size))
    )


def hue_from_bg(bg_color: Optional[str], fallback: int = 200) -> int:
    """Approximate HSL hue from Apple's 6-digit hex bgColor."""
    if not bg_color or len(bg_color) < 6:
        return fallback
    try:
        r = int(bg_color[0:2], 16) / 255
        g = int(bg_color[2:4], 16) / 255
        b = int(bg_color[4:6], 16) / 255
        h, _, _ = colorsys.rgb_to_hsv(r, g, b)
        return int(h * 360) % 360
    except ValueError:
        return fallback


def song_summary(item: dict[str, Any]) -> dict[str, Any]:
    attrs = item.get("attributes") or {}
    artwork = attrs.get("artwork") or {}
    artists = attrs.get("artistName") or ""
    genre_names = attrs.get("genreNames") or []
    return {
        "id": item.get("id"),
        "title": attrs.get("name") or "Unknown",
        "artist": artists,
        "album": attrs.get("albumName"),
        "genre": genre_names[0] if genre_names else "Other",
        "durationMs": attrs.get("durationInMillis"),
        "artworkUrl": artwork_url(artwork),
        "artHue": hue_from_bg(artwork.get("bgColor")),
        "url": attrs.get("url"),
        "isrc": attrs.get("isrc"),
    }


def artist_summary(item: dict[str, Any]) -> dict[str, Any]:
    attrs = item.get("attributes") or {}
    artwork = attrs.get("artwork") or {}
    return {
        "id": item.get("id"),
        "name": attrs.get("name") or "Unknown",
        "artworkUrl": artwork_url(artwork),
        "artHue": hue_from_bg(artwork.get("bgColor")),
        "url": attrs.get("url"),
    }


def _get(path: str, params: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    url = f"{APPLE_MUSIC_BASE}{path}"
    try:
        with httpx.Client(timeout=20.0) as client:
            res = client.get(url, headers=_headers(), params=params)
    except httpx.HTTPError as exc:
        raise AppleMusicError(f"Apple Music request failed: {exc}") from exc

    if res.status_code == 401:
        raise AppleMusicError("Apple Music auth failed — check MusicKit key/team id", 401)
    if res.status_code == 429:
        raise AppleMusicError("Apple Music rate limit hit — try again shortly", 429)
    if res.status_code >= 400:
        detail = res.text[:300]
        raise AppleMusicError(f"Apple Music error {res.status_code}: {detail}", res.status_code)

    return res.json()


def search_songs(term: str, limit: int = 12) -> list[dict[str, Any]]:
    data = _get(
        f"/catalog/{storefront()}/search",
        params={"term": term, "types": "songs", "limit": limit},
    )
    songs = (((data.get("results") or {}).get("songs") or {}).get("data")) or []
    return [song_summary(s) for s in songs]


def search_artists(term: str, limit: int = 5) -> list[dict[str, Any]]:
    data = _get(
        f"/catalog/{storefront()}/search",
        params={"term": term, "types": "artists", "limit": limit},
    )
    artists = (((data.get("results") or {}).get("artists") or {}).get("data")) or []
    return [artist_summary(a) for a in artists]


def get_song(song_id: str) -> dict[str, Any]:
    data = _get(f"/catalog/{storefront()}/songs/{song_id}")
    items = data.get("data") or []
    if not items:
        raise AppleMusicError("Song not found", 404)
    return song_summary(items[0])


def artist_top_songs(artist_id: str, limit: int = 8) -> list[dict[str, Any]]:
    data = _get(
        f"/catalog/{storefront()}/artists/{artist_id}/view/top-songs",
        params={"limit": limit},
    )
    items = data.get("data") or []
    return [song_summary(s) for s in items]


def find_artist_id_by_name(name: str) -> Optional[str]:
    artists = search_artists(name, limit=5)
    if not artists:
        return None
    exact = next((a for a in artists if a["name"].lower() == name.lower()), None)
    return (exact or artists[0])["id"]
