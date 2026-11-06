"""Reference-parser cases drawn from real lectionary citations."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.bible.reference import parse, parse_first  # noqa: E402

# raw citation -> expected list of (chapter, start_verse, end_verse) tuples
CASES: list[tuple[str, str, list[tuple[int, int, int]]]] = [
    ("Matthew 16:24-28", "Matthew", [(16, 24, 28)]),
    ("Mt 16:24-28", "Matthew", [(16, 24, 28)]),
    ("Genesis 7:1-10", "Genesis", [(7, 1, 10)]),
    ("Nahum 2:1, 3; 3:1-3, 6-7", "Nahum", [(2, 1, 1), (2, 3, 3), (3, 1, 3), (3, 6, 7)]),
    (
        "Deuteronomy 32:35cd-36ab, 39abcd, 41",
        "Deuteronomy",
        [(32, 35, 36), (32, 39, 39), (32, 41, 41)],
    ),
    ("1 Kings 19:9a, 11-13a", "1 Kings", [(19, 9, 9), (19, 11, 13)]),
    (
        "Psalm 98:1, 2-3, 3-4, 5-6.",
        "Psalms",
        [(98, 1, 1), (98, 2, 3), (98, 3, 4), (98, 5, 6)],
    ),
    (
        "Psalm 90:3-4, 5-6, 12-13, 14 and 17",
        "Psalms",
        [(90, 3, 4), (90, 5, 6), (90, 12, 13), (90, 14, 14), (90, 17, 17)],
    ),
    ("Philemon 9-10, 12-17", "Philemon", [(1, 9, 10), (1, 12, 17)]),
    ("Wisdom 9:13-18b", "Wisdom", [(9, 13, 18)]),
    ("Romans 9:1-5", "Romans", [(9, 1, 5)]),
    ("Sirach 3:2-6, 12-14", "Sirach", [(3, 2, 6), (3, 12, 14)]),
    ("Ecclesiasticus 3:2-6", "Sirach", [(3, 2, 6)]),
    ("Canticle of Canticles 2:8-14", "Song of Songs", [(2, 8, 14)]),
    ("The Book of Wisdom 9:13", "Wisdom", [(9, 13, 13)]),
    ("Acts of the Apostles 2:1-11", "Acts", [(2, 1, 11)]),
    ("Rv 21:1-5a", "Revelation", [(21, 1, 5)]),
    ("Matthew 5:1-7:29", "Matthew", [(5, 1, 29)]),  # end chapter differs; checked below
    ("I Corinthians 10:1-6", "1 Corinthians", [(10, 1, 6)]),
    ("Jude 17, 20-25", "Jude", [(1, 17, 17), (1, 20, 25)]),
]


def run() -> int:
    failures = 0

    for raw, expected_book, expected in CASES:
        parsed = parse_first(raw)
        got = [(r.start_chapter, r.start_verse, r.end_verse) for r in parsed.ranges]
        problems = []
        if not parsed.ok:
            problems.append(f"not ok (error={parsed.error})")
        if parsed.book != expected_book:
            problems.append(f"book {parsed.book!r} != {expected_book!r}")
        if got != expected:
            problems.append(f"ranges {got} != {expected}")
        if problems:
            failures += 1
            print(f"FAIL  {raw!r}: {'; '.join(problems)}")
        else:
            print(f"ok    {raw!r} -> {parsed.ranges[0].label()}" + (f" (+{len(got) - 1})" if len(got) > 1 else ""))

    # Part letters must survive so the UI can show "35cd" even though we
    # resolve the whole verse.
    deut = parse_first("Deuteronomy 32:35cd-36ab")
    if deut.ranges[0].start_part != "cd" or deut.ranges[0].end_part != "ab":
        failures += 1
        print(f"FAIL  part letters lost: {deut.ranges[0]}")
    else:
        print("ok    part letters preserved (35cd-36ab)")

    # Chapter-crossing range keeps its distinct end chapter.
    crossing = parse_first("Matthew 5:1-7:29")
    if crossing.ranges[0].end_chapter != 7:
        failures += 1
        print(f"FAIL  chapter-crossing end chapter: {crossing.ranges[0]}")
    else:
        print("ok    chapter-crossing range (Matthew 5:1-7:29)")

    # Alternatives split, second inherits the book.
    alts = parse("Luke 12:32-48 or 12:35-40")
    if len(alts) != 2 or alts[1].book != "Luke" or not alts[1].ok:
        failures += 1
        print(f"FAIL  alternatives: {[(a.book, a.ok) for a in alts]}")
    else:
        print("ok    alternative readings (Luke 12:32-48 or 12:35-40)")

    # Whole-chapter citation.
    whole = parse_first("Psalm 23")
    if not whole.ok or not whole.ranges[0].is_whole_chapter:
        failures += 1
        print(f"FAIL  whole chapter: {whole}")
    else:
        print("ok    whole chapter (Psalm 23)")

    # Garbage degrades instead of raising.
    bad = parse_first("Zorblax 4:5")
    if bad.ok or not bad.error:
        failures += 1
        print(f"FAIL  bad input should not be ok: {bad}")
    else:
        print("ok    unknown book rejected cleanly")

    print()
    print("FAILURES:" if failures else "all reference-parser cases passed", failures or "")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(run())
