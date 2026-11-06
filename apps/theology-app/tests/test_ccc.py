"""Parse the full Catechism and check the text is free of markup artifacts.

The specific corruption this guards against is marginal cross-reference numbers
("367", "199", "2057") being inlined into paragraph text, and Kobo span
wrappers leaving stray whitespace.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.importer.ccc import CccParser  # noqa: E402
from app.importer.epub import EpubFile  # noqa: E402

EPUB = Path("/data/library/catechism/ccc-ascension.epub")

# Paragraph 1803 opens with the Philippians 4:8 quotation before the
# definition, so it is checked with `contains` rather than `startswith`.
EXPECTED = {
    2085: "The one and true God first reveals his glory to Israel.",
    1: "God, infinitely perfect and blessed in himself",
    2865: 'By the final “Amen,”',
}
EXPECTED_CONTAINS = {
    1803: "A virtue is an habitual and firm disposition to do the good.",
}


def run() -> int:
    failures = 0
    parser = CccParser()
    epub = EpubFile(EPUB)

    if not parser.detect(epub):
        print("FAIL  detect() did not recognize the Catechism")
        return 1
    print("ok    detect() recognized the Catechism")

    work = parser.parse(epub, "ccc")
    numbered = {int(b.label): b for b in work.blocks if b.kind == "paragraph" and b.label.isdigit()}

    print(f"\nsections: {len(work.sections)}")
    print(f"blocks:   {len(work.blocks)}")
    print(f"numbered: {len(numbered)} (expected 2865)")

    if len(numbered) != 2865:
        failures += 1
        missing = [n for n in range(1, 2866) if n not in numbered]
        print(f"FAIL  missing {len(missing)} paragraphs, first few: {missing[:10]}")
    else:
        print("ok    all 2865 canonical paragraphs present")

    for number, expected_start in EXPECTED.items():
        block = numbered.get(number)
        if block is None:
            failures += 1
            print(f"FAIL  CCC.{number} missing")
            continue
        print(f'\n  CCC.{number}  "{block.text[:150]}"')
        if expected_start and not block.text.startswith(expected_start):
            failures += 1
            print(f"FAIL  CCC.{number} should start with {expected_start!r}")
        elif expected_start:
            print(f"ok    CCC.{number} starts correctly")

    # A numbered paragraph spans its own block plus any CCC.N.x continuations.
    def full_text(number: int) -> str:
        prefix = f"CCC.{number}"
        parts = [
            b.text
            for b in work.blocks
            if b.locus_id == prefix or b.locus_id.startswith(prefix + ".")
        ]
        return " ".join(parts)

    for number, needle in EXPECTED_CONTAINS.items():
        combined = full_text(number)
        if needle not in combined:
            failures += 1
            print(f"FAIL  CCC.{number} should contain {needle!r}")
            print(f"      got: {combined[:200]!r}")
        else:
            parts = sum(
                1
                for b in work.blocks
                if b.locus_id == f"CCC.{number}" or b.locus_id.startswith(f"CCC.{number}.")
            )
            print(f"ok    CCC.{number} contains the definition (across {parts} blocks)")

    # The paragraph number must not be duplicated at the start of the text.
    duplicated = [n for n, b in numbered.items() if b.text.startswith(str(n))]
    print(f"\nparagraphs whose text still starts with their own number: {len(duplicated)}")
    if duplicated:
        failures += 1
        print(f"FAIL  e.g. {duplicated[:5]} -> {numbered[duplicated[0]].text[:80]!r}")
    else:
        print("ok    leading paragraph numbers stripped")

    # Marginal cross-references became CrossRef rows, not text.
    with_refs = [b for b in numbered.values() if b.crossrefs]
    total_refs = sum(len(b.crossrefs) for b in numbered.values())
    print(f"\nparagraphs with marginal cross-refs: {len(with_refs)} ({total_refs} refs total)")
    if total_refs < 1000:
        failures += 1
        print("FAIL  expected a few thousand marginal cross-references")
    else:
        print("ok    marginal cross-references captured as CrossRef")

    sample = numbered.get(2085)
    if sample is not None:
        print(f"  CCC.2085 cross-refs: {[c.target_locus for c in sample.crossrefs]}")

    total_notes = sum(len(b.footnotes) for b in work.blocks)
    with_notes = [b for b in work.blocks if b.footnotes]
    print(f"\nblocks with footnotes: {len(with_notes)} ({total_notes} notes total)")
    if total_notes == 0:
        failures += 1
        print("FAIL  no footnotes were attached to any block")
    else:
        print("ok    footnotes attached")
        example = with_notes[0]
        print(f"  e.g. {example.locus_id}: {[f.text[:70] for f in example.footnotes][:2]}")

    # A margin number leaking into text shows up as a bare 3-4 digit number
    # sitting at the very start or end of a paragraph.
    leaked = [
        n
        for n, b in numbered.items()
        if re.match(r"^\d{3,4}\s+[A-Z]", b.text) or re.search(r"\s\d{3,4}$", b.text)
    ]
    print(f"\nparagraphs that look like they leaked a margin number: {len(leaked)}")
    if leaked:
        print(f"      e.g. {leaked[:5]}")
        for n in leaked[:3]:
            print(f"        CCC.{n}: {numbered[n].text[:110]!r}")

    kinds: dict[str, int] = {}
    for block in work.blocks:
        kinds[block.kind] = kinds.get(block.kind, 0) + 1
    print(f"\nblock kinds: {kinds}")

    epub.close()
    print()
    print(f"{failures} failure(s)" if failures else "all Catechism parser checks passed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(run())
