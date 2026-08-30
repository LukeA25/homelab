"""Command line entry point for the library importer.

    python -m app.importer ingest <file> --category bible --source Purchased
    python -m app.importer inbox --category theology
    python -m app.importer reparse bible-nabre
    python -m app.importer list
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlmodel import Session, select

from ..config import CATEGORIES, INBOX_DIR, ensure_library_tree
from ..db import engine, init_db
from ..models import Work
from .service import ingest, reparse


def _report(result) -> None:
    print(f"  work:      {result.work_id}  ({result.parser} parser)")
    print(f"  title:     {result.title}")
    print(f"  file:      {result.file_path}")
    print(f"  sections:  {result.sections}")
    print(f"  blocks:    {result.blocks}")
    if getattr(result, "structure_source", ""):
        print(f"  structure: {result.structure_source}")
    if result.books:
        print(f"  books:     {result.books}")
        print(f"  verses:    {result.verses}")
    print(f"  footnotes: {result.footnotes}")
    print(f"  crossrefs: {result.crossrefs}")
    print(f"  indexed:   {result.indexed}")


def cmd_ingest(args) -> int:
    result = ingest(
        Path(args.path),
        category=args.category,
        source=args.source,
        source_url=args.source_url,
        rights=args.rights,
        work_id=args.work_id,
        parser_name=args.parser,
        title_override=args.title,
        regen_structure=bool(args.regen_structure),
    )
    print(f"imported {Path(args.path).name}")
    _report(result)
    return 0


def cmd_inbox(args) -> int:
    files = sorted(INBOX_DIR.glob("*.epub"))
    if not files:
        print(f"nothing to import in {INBOX_DIR}")
        return 0
    for path in files:
        print(f"\nimporting {path.name} ...")
        result = ingest(
            path,
            category=args.category,
            source=args.source,
            source_url=args.source_url,
            rights=args.rights,
            regen_structure=bool(getattr(args, "regen_structure", False)),
        )
        _report(result)
        path.unlink()
        print(f"  removed {path.name} from _inbox")
    return 0


def cmd_reparse(args) -> int:
    result = reparse(args.work_id, regen_structure=bool(args.regen_structure))
    print(f"reparsed {args.work_id}")
    _report(result)
    return 0


def cmd_list(_args) -> int:
    with Session(engine) as session:
        works = session.exec(select(Work).order_by(Work.category, Work.title)).all()
    if not works:
        print("library is empty")
        return 0
    print(f"{'id':28} {'category':16} {'kind':10} {'blocks':>8}  title")
    for work in works:
        print(f"{work.id:28} {work.category:16} {work.kind:10} {work.block_count:>8}  {work.title[:50]}")
    return 0


def cmd_fetch_catalog(args) -> int:
    """Download curated catalog EPUBs (Gutenberg / Internet Archive) and ingest them."""
    from ..catalog import import_catalog_entry, load_works_catalog

    catalog = load_works_catalog()
    wanted = set(args.ids) if args.ids else None
    limit = args.limit
    imported = 0
    for entry in catalog:
        if wanted is not None and entry["id"] not in wanted:
            continue
        if limit is not None and imported >= limit:
            break
        if not (entry.get("gutenbergId") or entry.get("archiveId") or entry.get("epubUrl")):
            print(f"skip {entry['id']}: no downloadable source")
            continue
        print(f"fetch {entry['id']}")
        try:
            result = import_catalog_entry(entry, force=bool(args.force))
            _report(result)
            imported += 1
        except Exception as exc:  # noqa: BLE001
            print(f"  FAILED {entry['id']}: {exc}")
    print(f"done — imported {imported}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.importer", description="Study Desk library importer")
    sub = parser.add_subparsers(dest="command", required=True)

    def add_common(target):
        target.add_argument("--category", required=True, choices=CATEGORIES)
        target.add_argument("--source", default="Unknown", help='e.g. "Purchased", "Project Gutenberg"')
        target.add_argument("--source-url", default=None)
        target.add_argument("--rights", default=None, help='e.g. "Public Domain"')

    p_ingest = sub.add_parser("ingest", help="import a single EPUB")
    p_ingest.add_argument("path")
    add_common(p_ingest)
    p_ingest.add_argument("--work-id", default=None, help="override the generated slug")
    p_ingest.add_argument("--parser", default="auto", help="auto | nabre | ccc | generic")
    p_ingest.add_argument("--title", default=None, help="override the title from the file")
    p_ingest.add_argument(
        "--regen-structure",
        action="store_true",
        help="ignore cached .structure.json and ask the LLM again",
    )
    p_ingest.set_defaults(func=cmd_ingest)

    p_inbox = sub.add_parser("inbox", help="import everything dropped in library/_inbox")
    add_common(p_inbox)
    p_inbox.add_argument(
        "--regen-structure",
        action="store_true",
        help="ignore cached .structure.json and ask the LLM again",
    )
    p_inbox.set_defaults(func=cmd_inbox)

    p_reparse = sub.add_parser("reparse", help="rebuild a work from its stored source file")
    p_reparse.add_argument("work_id")
    p_reparse.add_argument(
        "--regen-structure",
        action="store_true",
        help="ignore cached .structure.json and ask the LLM again",
    )
    p_reparse.set_defaults(func=cmd_reparse)

    p_list = sub.add_parser("list", help="show what is in the library")
    p_list.set_defaults(func=cmd_list)

    p_fetch = sub.add_parser("fetch-catalog", help="download curated Gutenberg EPUBs and ingest")
    p_fetch.add_argument("--ids", nargs="*", default=None, help="optional catalog ids")
    p_fetch.add_argument("--limit", type=int, default=None, help="max number to import")
    p_fetch.add_argument("--force", action="store_true", help="re-download even if file exists")
    p_fetch.set_defaults(func=cmd_fetch_catalog)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    ensure_library_tree()
    init_db()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
