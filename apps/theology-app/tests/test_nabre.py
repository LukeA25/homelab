"""Parse a few real NABRE chapters and check the text came out clean.

The failure mode this guards against is subtle: a generic extractor produces
verse text that looks fine at a glance but has study-note numbers and
cross-reference letters welded onto words ("himself,300 take up his cross").
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.importer.epub import EpubFile  # noqa: E402
from app.importer.htmltext import body_of, parse_xhtml  # noqa: E402
from app.importer.nabre import NabreParser  # noqa: E402

EPUB = Path("/data/library/bible/bible-nabre.epub")


def extract(parser: NabreParser, epub: EpubFile, href: str):
    root = parse_xhtml(epub.read(href))
    body = body_of(root)
    footnotes, crossrefs = parser._harvest_notes(body)
    parser._prepare(body)
    return parser._blocks_for_document(body), footnotes, crossrefs


def run() -> int:
    failures = 0
    parser = NabreParser()
    epub = EpubFile(EPUB)

    print(f"epub version {epub.version}, spine {len(epub.spine)} docs")
    if not parser.detect(epub):
        print("FAIL  detect() did not recognize the NABRE")
        return 1
    print("ok    detect() recognized the NABRE")

    names = parser._book_names(epub)
    print(f"ok    discovered {len(names)} books")
    for number in (1, 23, 28, 42, 48, 74):
        print(f"        {number:>2} -> {names.get(number)!r}")
    if names.get(48) != "Matthew" or names.get(28) != "Sirach" or names.get(1) != "Genesis":
        failures += 1
        print("FAIL  book name mapping is wrong")
    if len(names) != 73:
        failures += 1
        print(f"FAIL  expected 73 books in the Catholic canon, got {len(names)}")

    # --- Matthew 16 ---
    entries, footnotes, crossrefs = extract(parser, epub, "nab-1043.html")
    verses = {k[2]: t for k, kind, t in entries if kind == "verse"}
    headings = [(k[2], t) for k, kind, t in entries if kind == "heading"]
    print(f"\nMatthew 16: {len(verses)} verses, {len(headings)} headings")

    if len(verses) != 28:
        failures += 1
        print(f"FAIL  Matthew 16 should have 28 verses, got {len(verses)}")
    else:
        print("ok    Matthew 16 has 28 verses")

    v24 = verses.get(24, "")
    print(f'\n  16:24  "{v24}"')
    if not v24.startswith("Then Jesus said to his disciples"):
        failures += 1
        print("FAIL  16:24 does not start as expected")
    else:
        print("ok    16:24 starts correctly")

    # Study-note numbers (299, 300) and cross-ref letters must be gone.
    if re.search(r"\d", v24):
        failures += 1
        print(f"FAIL  16:24 still contains digits: {re.findall(r'[^ ]*\\d[^ ]*', v24)}")
    else:
        print("ok    16:24 contains no stray note numbers")

    print("\n  Matthew 16:24-28 as resolved:")
    for n in range(24, 29):
        print(f"    {n:>2}. {verses.get(n, '<MISSING>')}")
        if n not in verses:
            failures += 1

    print("\n  headings in Matthew 16:")
    for verse, title in headings:
        print(f"    before v{verse}: {title}")
    if not any("Conditions of Discipleship" in t for _v, t in headings):
        failures += 1
        print("FAIL  expected 'The Conditions of Discipleship' heading")
    else:
        print("ok    pericope heading captured")

    # Cross-references harvested from p.en, keyed to the right verse.
    xrefs_24 = [c.target_locus for c in crossrefs.get((48, 16, 24), [])]
    print(f"\n  cross-refs on 16:24: {xrefs_24}")
    if "Lk 14:27" not in xrefs_24:
        failures += 1
        print("FAIL  expected cross-reference 'Lk 14:27' on 16:24")
    else:
        print("ok    cross-reference captured")

    notes_1 = [f.text[:60] for f in footnotes.get((48, 16, 1), [])]
    print(f"  study note on 16:1: {notes_1}")

    # --- Genesis 1 ---
    entries, _f, _c = extract(parser, epub, "nab-0009.html")
    gen = {k[2]: t for k, kind, t in entries if kind == "verse"}
    gen_headings = [t for _k, kind, t in entries if kind == "heading"]
    print(f"\nGenesis 1: {len(gen)} verses")
    print(f'  1:1  "{gen.get(1, "")}"')
    if not gen.get(1, "").startswith("In the beginning, when God created"):
        failures += 1
        print("FAIL  Genesis 1:1 wrong")
    else:
        print("ok    Genesis 1:1 correct")
    if len(gen) != 31:
        failures += 1
        print(f"FAIL  Genesis 1 should have 31 verses, got {len(gen)}")
    else:
        print("ok    Genesis 1 has 31 verses")
    print(f"  headings: {gen_headings}")

    epub.close()
    print()
    print(f"{failures} failure(s)" if failures else "all NABRE parser checks passed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(run())
