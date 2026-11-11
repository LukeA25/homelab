"""Refresh episode audio URLs from the public podcast RSS feed.

The mp3 files are not downloaded. A background refresh only replaces the
enclosure URL, title, and year stored for each day.
"""

from __future__ import annotations

import json
import logging
import re
import threading
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

from ..config import CACHE_DIR

log = logging.getLogger(__name__)

RSS_URL = "https://feeds.fireside.fm/bibleinayear/rss"
_CACHE_PATH = CACHE_DIR / "bible-in-a-year.json"
_DAY_TITLE = re.compile(r"^Day\s+(\d+)\s*:\s*(.*?)(?:\s*\((\d{4})\))?\s*$", re.IGNORECASE)
_lock = threading.Lock()
_audio: dict[int, dict] = {}
_started = False


def parse_feed(xml_bytes: bytes) -> dict[int, dict]:
    root = ET.fromstring(xml_bytes)
    channel = root.find("channel")
    if channel is None:
        return {}
    best: dict[int, dict] = {}
    for item in channel.findall("item"):
        title = (item.findtext("title") or "").strip()
        match = _DAY_TITLE.match(title)
        if not match:
            continue
        day = int(match.group(1))
        if day < 1 or day > 365:
            continue
        enclosure = item.find("enclosure")
        url = enclosure.get("url") if enclosure is not None else ""
        if not url or not str(url).startswith("https://"):
            continue
        year = int(match.group(3) or 0)
        current = best.get(day)
        if current and int(current["year"]) > year:
            continue
        best[day] = {
            "title": match.group(2).strip(" -") or f"Day {day}",
            "year": year,
            "audioUrl": url,
        }
    return best


def _load_cache() -> None:
    if not _CACHE_PATH.is_file():
        return
    try:
        data = json.loads(_CACHE_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return
    parsed: dict[int, dict] = {}
    for key, value in (data.get("episodes") or {}).items():
        try:
            day = int(key)
        except (TypeError, ValueError):
            continue
        url = str(value.get("audioUrl") or "")
        if day < 1 or day > 365 or not url.startswith("https://"):
            continue
        parsed[day] = {
            "title": value.get("title") or f"Day {day}",
            "year": int(value.get("year") or 0),
            "audioUrl": url,
        }
    with _lock:
        _audio.clear()
        _audio.update(parsed)


def audio_overrides() -> dict[int, dict]:
    with _lock:
        return dict(_audio)


def refresh_feed() -> None:
    """Download the RSS feed and replace cached enclosure URLs. Never raises."""
    try:
        request = urllib.request.Request(RSS_URL, headers={"User-Agent": "homelab-theology-app"})
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = response.read()
        episodes = parse_feed(payload)
        if len(episodes) < 300:
            log.warning("bible in a year feed returned %s day episodes", len(episodes))
            return
        _CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        _CACHE_PATH.write_text(
            json.dumps({"episodes": {str(day): row for day, row in episodes.items()}})
        )
        with _lock:
            _audio.clear()
            _audio.update(episodes)
    except Exception:
        log.warning("bible in a year feed refresh failed", exc_info=True)


def start_feed_refresh() -> None:
    global _started
    if _started:
        return
    _started = True
    _load_cache()
    threading.Thread(target=refresh_feed, name="bible-in-a-year-feed", daemon=True).start()
