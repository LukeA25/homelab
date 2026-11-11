"""Build bible_in_a_year/plan.json from the public RSS feed and reading-plan PDF.

Audio files are not downloaded. The JSON keeps the enclosure URL, the episode
title, and the scripture references for each day.

Usage (from apps/theology-app):

    python3 scripts/build_bible_in_a_year.py

PDF parsing needs pypdf (`pip install pypdf`). Pass --rss-only to refresh
audio URLs on an existing plan without re-reading the PDF.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.bible_in_a_year.references import (  # noqa: E402
    citation_is_reference,
    links_for_citation,
    split_citations,
)

RSS_URL = "https://feeds.fireside.fm/bibleinayear/rss"
PDF_URL = "https://stthecla.com/wp-content/uploads/2021/09/Bible-in-a-Year-Reading-Plan.pdf"
PLAN_PATH = ROOT / "app" / "bible_in_a_year" / "plan.json"

PERIODS = (
    "Early World",
    "Patriarchs",
    "Egypt and Exodus",
    "Desert Wanderings",
    "Conquest and Judges",
    "Messianic Checkpoint",
    "Royal Kingdom",
    "Divided Kingdom",
    "Exile",
    "Return",
    "Maccabean Revolt",
    "Messianic Fulfillment",
    "The Church",
)

_DAY_TITLE = re.compile(r"^Day\s+(\d+)\s*:\s*(.*?)(?:\s*\((\d{4})\))?\s*$", re.IGNORECASE)
_CLAUSE_END = r"(?:\.|For the complete|$)"
_READING_CUES = (
    ("list", re.compile(rf"readings are\s+(.+?){_CLAUSE_END}", re.IGNORECASE)),
    ("list", re.compile(rf"read today from\s+(.+?){_CLAUSE_END}", re.IGNORECASE)),
    ("list", re.compile(rf"reads today from\s+(.+?){_CLAUSE_END}", re.IGNORECASE)),
    ("list", re.compile(rf"by reading\s+(.+?){_CLAUSE_END}", re.IGNORECASE)),
    (
        "prose",
        re.compile(
            rf"(?:as we|today we|we)\s+read(?:\s+from)?\s+(.+?){_CLAUSE_END}",
            re.IGNORECASE,
        ),
    ),
)


def _strip_html(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", text).strip()


def _salvage_citation(citation: str) -> str | None:
    words = citation.split()
    for count in range(len(words), 0, -1):
        candidate = " ".join(words[:count]).strip().rstrip(",;.")
        if candidate and citation_is_reference(candidate):
            return candidate
    return None


def _citations_from_clause(clause: str) -> list[str] | None:
    raw = split_citations(clause)
    if not raw or len(raw) > 5:
        return None
    cleaned: list[str] = []
    for citation in raw:
        saved = _salvage_citation(citation)
        if not saved:
            return None
        cleaned.append(saved)
    if not any(re.search(r"\d", citation) for citation in cleaned):
        return None
    return cleaned


def episode_citations(description: str) -> list[str] | None:
    text = _strip_html(description)
    found: list[tuple[str, list[str]]] = []
    for kind, pattern in _READING_CUES:
        for match in pattern.finditer(text):
            citations = _citations_from_clause(match.group(1))
            if not citations:
                continue
            # A single book mentioned in commentary is not the day's list.
            if kind == "prose" and len(citations) < 2:
                continue
            found.append((kind, citations))
    if not found:
        return None
    found.sort(key=lambda item: (item[0] == "list", len(item[1])), reverse=True)
    return found[0][1]


def parse_rss(xml_bytes: bytes) -> dict[int, dict]:
    root = ET.fromstring(xml_bytes)
    channel = root.find("channel")
    if channel is None:
        raise SystemExit("RSS feed has no channel")
    best: dict[int, dict] = {}
    for item in channel.findall("item"):
        title = (item.findtext("title") or "").strip()
        match = _DAY_TITLE.match(title)
        if not match:
            continue
        day = int(match.group(1))
        if day < 1 or day > 365:
            continue
        year = int(match.group(3) or 0)
        enclosure = item.find("enclosure")
        url = enclosure.get("url") if enclosure is not None else ""
        if not url or not url.startswith("https://"):
            continue
        current = best.get(day)
        if current and current["year"] > year:
            continue
        description = item.findtext("description") or ""
        best[day] = {
            "day": day,
            "title": match.group(2).strip(" -"),
            "year": year,
            "audioUrl": url,
            "citations": episode_citations(description),
        }
    return best


def parse_pdf(pdf_bytes: bytes) -> dict[int, dict]:
    from pypdf import PdfReader
    import io

    reader = PdfReader(io.BytesIO(pdf_bytes))
    days: dict[int, dict] = {}
    period: str | None = None
    last_day: int | None = None

    for page in reader.pages:
        chunks: list[tuple[float, float, str]] = []

        def visitor(text, cm, tm, _font, _size, _chunks=chunks):
            cleaned = (text or "").replace("\n", " ").strip()
            if not cleaned:
                return
            a, b, c, d, e, f = (float(value) for value in cm)
            raw_x, raw_y = float(tm[4]), float(tm[5])
            x = a * raw_x + c * raw_y + e
            y = b * raw_x + d * raw_y + f
            if y < 0 or y > 1100 or x < -20 or x > 700:
                return
            _chunks.append((y, x, cleaned))

        page.extract_text(visitor_text=visitor)
        rows: list[list] = []
        for y, x, text in sorted(chunks, key=lambda item: -item[0]):
            if rows and abs(rows[-1][0] - y) <= 2.5:
                rows[-1][1].append((x, text))
            else:
                rows.append([y, [(x, text)]])

        for y, parts in rows:
            parts.sort()
            period_hit = next((name for name in PERIODS if any(text.strip() == name for _x, text in parts)), None)
            if period_hit:
                # A label tucked just under a day names that day. A header
                # repeated at the top of the next page only applies forward.
                if last_day is not None and 0 < days[last_day]["y"] - y < 20:
                    days[last_day]["period"] = period_hit
                period = period_hit
                continue

            day_number = None
            for x, text in parts:
                found = re.search(r"Day\s+(\d+)", text)
                if found and x < 180:
                    day_number = int(found.group(1))
                    break
            if day_number is None or not 1 <= day_number <= 365:
                continue

            first: list[str] = []
            second: list[str] = []
            third: list[str] = []
            has_third_column = any(x >= 430 for x, _text in parts)
            for x, text in parts:
                if x < 180:
                    continue
                citations = split_citations(text)
                if not citations:
                    continue
                if x < 310:
                    first.extend(citations)
                elif x < 430:
                    if not has_third_column and len(citations) >= 2:
                        second.extend(citations[:-1])
                        third.append(citations[-1])
                    else:
                        second.extend(citations)
                else:
                    third.extend(citations)
            days[day_number] = {
                "period": period,
                "readings": first + second + third,
                "y": y,
            }
            last_day = day_number
    return days


def build(rss_xml: bytes, pdf_bytes: bytes | None, previous: dict | None) -> dict:
    episodes = parse_rss(rss_xml)
    pdf_days = parse_pdf(pdf_bytes) if pdf_bytes is not None else {}
    if previous and not pdf_days:
        pdf_days = {
            day["day"]: {"period": day.get("period"), "readings": day.get("planReadings") or day["readings"]}
            for day in previous.get("days", [])
        }

    missing = [day for day in range(1, 366) if day not in episodes or day not in pdf_days]
    if missing:
        raise SystemExit(f"missing days: {missing[:20]}{'…' if len(missing) > 20 else ''} ({len(missing)})")

    days = []
    overridden = []
    broken = []
    for number in range(1, 366):
        episode = episodes[number]
        plan_readings = [citation.strip().rstrip(",;.") for citation in pdf_days[number]["readings"]]
        episode_readings = episode["citations"]
        if episode_readings and episode_readings != plan_readings:
            readings = episode_readings
            source = "episode"
            overridden.append(number)
        else:
            readings = episode_readings or plan_readings
            source = "plan"
        if not readings or any(
            not (links := links_for_citation(citation)) or any(link.section_id is None for link in links)
            for citation in readings
        ):
            broken.append((number, readings))
        days.append(
            {
                "day": number,
                "period": pdf_days[number].get("period") or "",
                "title": episode["title"],
                "year": episode["year"],
                "audioUrl": episode["audioUrl"],
                "readings": readings,
                "readingsSource": source,
            }
        )
    if broken:
        preview = ", ".join(f"{day}:{readings}" for day, readings in broken[:8])
        raise SystemExit(f"{len(broken)} days have a reading that does not link: {preview}")
    return {
        "audio": "Streamed from the public Bible in a Year enclosure URL. The file is not stored.",
        "plan": PDF_URL,
        "feed": RSS_URL,
        "days": days,
        "overriddenDays": overridden,
    }


def _download(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "homelab-theology-app"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rss-only", action="store_true")
    parser.add_argument("--rss", type=Path, help="local RSS XML instead of downloading")
    parser.add_argument("--pdf", type=Path, help="local reading-plan PDF instead of downloading")
    args = parser.parse_args()

    if args.rss:
        rss_xml = args.rss.read_bytes()
    else:
        rss_xml = _download(RSS_URL)

    previous = json.loads(PLAN_PATH.read_text()) if args.rss_only and PLAN_PATH.exists() else None
    pdf_bytes = None
    if not args.rss_only:
        if args.pdf:
            pdf_bytes = args.pdf.read_bytes()
        else:
            pdf_bytes = _download(PDF_URL)

    plan = build(rss_xml, pdf_bytes, previous)
    overridden = plan.pop("overriddenDays")
    PLAN_PATH.write_text(json.dumps(plan, indent=2) + "\n")
    print(f"wrote {PLAN_PATH} ({len(plan['days'])} days, {len(overridden)} episode overrides)")
    if overridden:
        print("overrides", overridden)


if __name__ == "__main__":
    main()
