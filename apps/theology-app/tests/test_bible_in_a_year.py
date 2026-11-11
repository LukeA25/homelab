"""Bible in a Year citations, the 365-day plan, and the seeded progress."""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.bible_in_a_year.plan import TOTAL_DAYS, load_plan  # noqa: E402
from app.bible_in_a_year.references import links_for_citation, split_citations  # noqa: E402


def _labels(raw: str) -> list[tuple[str, str | None, int | None, int | None]]:
    return [
        (link.label, link.section_id, link.verse_start, link.verse_end)
        for link in links_for_citation(raw)
    ]


def run() -> int:
    failures = 0

    def check(name: str, ok: bool, detail: object = "") -> None:
        nonlocal failures
        if ok:
            print(f"ok    {name}")
        else:
            failures += 1
            print(f"FAIL  {name}: {detail}")

    check("split two books", split_citations("Genesis 1-2 and Psalm 19") == ["Genesis 1-2", "Psalm 19"])
    check(
        "genesis chapters",
        _labels("Genesis 1-2") == [
            ("Genesis 1", "bible-nabre/Gn/1", None, None),
            ("Genesis 2", "bible-nabre/Gn/2", None, None),
        ],
        _labels("Genesis 1-2"),
    )
    check(
        "proverbs verses",
        _labels("Proverbs 17:1-4") == [("Proverbs 17:1-4", "bible-nabre/Prv/17", 1, 4)],
        _labels("Proverbs 17:1-4"),
    )
    check(
        "psalm 119 stays one chapter",
        _labels("Psalm 119:121-176") == [("Psalms 119:121-176", "bible-nabre/Ps/119", 121, 176)],
        _labels("Psalm 119:121-176"),
    )
    check(
        "proverbs verse range is not later chapters",
        _labels("Proverbs 6:23-35") == [("Proverbs 6:23-35", "bible-nabre/Prv/6", 23, 35)],
        _labels("Proverbs 6:23-35"),
    )
    luke_cross = _labels("Luke 22:39-24:53")
    check(
        "luke cross-chapter",
        [item[1] for item in luke_cross] == ["bible-nabre/Lk/22", "bible-nabre/Lk/23", "bible-nabre/Lk/24"]
        and luke_cross[0][2] == 39
        and luke_cross[2][3] == 53,
        luke_cross,
    )
    check(
        "luke open chapter range",
        [item[0] for item in _labels("Luke 20-22:38")] == ["Luke 20", "Luke 21", "Luke 22:1-38"],
        _labels("Luke 20-22:38"),
    )
    esther = links_for_citation("Esther 11-12")
    check(
        "esther additions collapse",
        len(esther) == 1 and esther[0].section_id == "bible-nabre/Est/41" and esther[0].note,
        [(link.label, link.section_id, link.note) for link in esther],
    )
    esther_parts = [link.section_id for link in links_for_citation("Esther 15, 6-7")]
    check(
        "esther 15 then 6-7",
        esther_parts == ["bible-nabre/Est/44", "bible-nabre/Est/6", "bible-nabre/Est/7"],
        esther_parts,
    )
    malachi = _labels("Malachi 4")
    check(
        "malachi 4 is nabre 3:19-24",
        malachi == [("Malachi 4:19-24", "bible-nabre/Mal/3", 19, 24)],
        malachi,
    )
    check(
        "philemon whole book",
        _labels("Philemon") == [("Philemon 1", "bible-nabre/Phlm/1", None, None)],
        _labels("Philemon"),
    )
    check(
        "obadiah chapter",
        _labels("Obadiah 1") == [("Obadiah 1", "bible-nabre/Ob/1", None, None)],
        _labels("Obadiah 1"),
    )
    check(
        "song of solomon",
        _labels("Song of Solomon 6") == [("Song of Songs 6", "bible-nabre/Sg/6", None, None)],
        _labels("Song of Solomon 6"),
    )
    letters = split_citations("2 John, 3 John and 1 Timothy 4-6")
    check("letters split", letters == ["2 John", "3 John", "1 Timothy 4-6"], letters)

    days = load_plan()
    check("365 days", len(days) == TOTAL_DAYS, len(days))
    by_day = {day["day"]: day for day in days}
    check(
        "day 248 readings",
        by_day[248]["readings"] == ["Jeremiah 35-36", "Judith 6-7", "Proverbs 17:1-4"]
        and by_day[248]["period"] == "Exile"
        and str(by_day[248]["audioUrl"]).startswith("https://"),
        by_day[248],
    )
    broken = []
    for day in days:
        if not day.get("period") or not day.get("title") or not str(day.get("audioUrl", "")).startswith("https://"):
            broken.append((day["day"], "metadata"))
        for reference in day["readings"]:
            links = links_for_citation(reference)
            if not links or any(link.section_id is None for link in links):
                broken.append((day["day"], reference, [(link.label, link.section_id) for link in links]))
    check("every reading links into the nabre", not broken, broken[:6])

    db_path = Path("/srv/appdata/theology-app/theology.db")
    if db_path.is_file():
        connection = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        missing = []
        for reference in by_day[248]["readings"]:
            for link in links_for_citation(reference):
                row = connection.execute("SELECT 1 FROM section WHERE id = ?", (link.section_id,)).fetchone()
                if row is None:
                    missing.append(link.section_id)
        connection.close()
        check("day 248 sections exist in the library", not missing, missing)
    else:
        print("ok    skipped library section check (no theology.db)")

    from sqlmodel import Session, SQLModel, create_engine, select

    from app.models import BiyDay, BiyState  # noqa: E402
    from app.bible_in_a_year.progress import ensure_progress, update_progress  # noqa: E402

    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        state = ensure_progress(session)
        done = session.exec(select(BiyDay).where(BiyDay.completed == True)).all()  # noqa: E712
        check("seed current day", state.current_day == 248, state.current_day)
        check("seed finished through 247", len(done) == 247, len(done))
        ensure_progress(session)
        check("seed once", len(session.exec(select(BiyState)).all()) == 1)
        updated = update_progress(session, day=248, completed=True, position_seconds=12.2)
        check("finishing 248 advances", updated["currentDay"] == 249, updated["currentDay"])
        check("position kept", updated["positions"].get("248") == 12.2, updated["positions"])
        check("248 completed", 248 in updated["completedDays"])

    print()
    print("FAILURES:" if failures else "all bible-in-a-year cases passed", failures or "")
    return 1 if failures else 0


def test_bible_in_a_year() -> None:
    assert run() == 0


if __name__ == "__main__":
    raise SystemExit(run())
