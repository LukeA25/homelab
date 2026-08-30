"""Canonical book names and the alias table used to normalize citations.

Lectionary sources, the NABRE EPUB's own table of contents, and hand-typed
references all spell books differently ("Sirach" vs "Ecclesiasticus", "Sg" vs
"Song of Songs", "The Book of Wisdom" vs "Wis"). Everything funnels through
`normalize_book_name` so the rest of the system only ever sees one spelling.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Optional

OLD_TESTAMENT = "OT"
NEW_TESTAMENT = "NT"

# canonical name -> (testament, canon order, USCCB-style abbreviation, aliases)
BOOKS: dict[str, tuple[str, int, str, tuple[str, ...]]] = {
    "Genesis": (OLD_TESTAMENT, 1, "Gn", ("gen", "gn", "ge")),
    "Exodus": (OLD_TESTAMENT, 2, "Ex", ("ex", "exod", "exo")),
    "Leviticus": (OLD_TESTAMENT, 3, "Lv", ("lev", "lv", "le")),
    "Numbers": (OLD_TESTAMENT, 4, "Nm", ("num", "nm", "nu", "nb")),
    "Deuteronomy": (OLD_TESTAMENT, 5, "Dt", ("deut", "dt", "deu")),
    "Joshua": (OLD_TESTAMENT, 6, "Jos", ("josh", "jos", "jsh")),
    "Judges": (OLD_TESTAMENT, 7, "Jgs", ("judg", "jgs", "jdg", "jg")),
    "Ruth": (OLD_TESTAMENT, 8, "Ru", ("ru", "rut", "rth")),
    "1 Samuel": (OLD_TESTAMENT, 9, "1 Sm", ("1 sam", "1 sm", "1 sa", "1 kingdoms")),
    "2 Samuel": (OLD_TESTAMENT, 10, "2 Sm", ("2 sam", "2 sm", "2 sa", "2 kingdoms")),
    "1 Kings": (OLD_TESTAMENT, 11, "1 Kgs", ("1 kgs", "1 kg", "1 ki", "3 kingdoms")),
    "2 Kings": (OLD_TESTAMENT, 12, "2 Kgs", ("2 kgs", "2 kg", "2 ki", "4 kingdoms")),
    "1 Chronicles": (OLD_TESTAMENT, 13, "1 Chr", ("1 chr", "1 ch", "1 par", "1 paralipomenon")),
    "2 Chronicles": (OLD_TESTAMENT, 14, "2 Chr", ("2 chr", "2 ch", "2 par", "2 paralipomenon")),
    "Ezra": (OLD_TESTAMENT, 15, "Ezr", ("ezr", "ezra")),
    "Nehemiah": (OLD_TESTAMENT, 16, "Neh", ("neh", "ne")),
    "Tobit": (OLD_TESTAMENT, 17, "Tb", ("tob", "tb", "tobias")),
    "Judith": (OLD_TESTAMENT, 18, "Jdt", ("jdt", "jth", "jdth")),
    "Esther": (OLD_TESTAMENT, 19, "Est", ("est", "esth", "es")),
    "1 Maccabees": (OLD_TESTAMENT, 20, "1 Mc", ("1 mac", "1 mc", "1 macc", "1 ma")),
    "2 Maccabees": (OLD_TESTAMENT, 21, "2 Mc", ("2 mac", "2 mc", "2 macc", "2 ma")),
    "Job": (OLD_TESTAMENT, 22, "Jb", ("jb", "job")),
    "Psalms": (OLD_TESTAMENT, 23, "Ps", ("ps", "psa", "psalm", "pss", "psalms")),
    "Proverbs": (OLD_TESTAMENT, 24, "Prv", ("prov", "prv", "pr", "pro")),
    "Ecclesiastes": (OLD_TESTAMENT, 25, "Eccl", ("eccl", "eccles", "ec", "qoheleth", "qoh")),
    "Song of Songs": (
        OLD_TESTAMENT,
        26,
        "Sg",
        ("sg", "song", "songs", "song of solomon", "canticle of canticles", "canticles", "cant", "sos"),
    ),
    "Wisdom": (OLD_TESTAMENT, 27, "Wis", ("wis", "wisd", "the book of wisdom", "book of wisdom", "wisdom of solomon")),
    "Sirach": (OLD_TESTAMENT, 28, "Sir", ("sir", "ecclesiasticus", "ben sira")),
    "Isaiah": (OLD_TESTAMENT, 29, "Is", ("is", "isa", "isai")),
    "Jeremiah": (OLD_TESTAMENT, 30, "Jer", ("jer", "je")),
    "Lamentations": (OLD_TESTAMENT, 31, "Lam", ("lam", "la")),
    "Baruch": (OLD_TESTAMENT, 32, "Bar", ("bar", "ba")),
    "Ezekiel": (OLD_TESTAMENT, 33, "Ez", ("ez", "ezek", "eze")),
    "Daniel": (OLD_TESTAMENT, 34, "Dn", ("dn", "dan", "da")),
    "Hosea": (OLD_TESTAMENT, 35, "Hos", ("hos", "ho", "osee")),
    "Joel": (OLD_TESTAMENT, 36, "Jl", ("jl", "joel", "joe")),
    "Amos": (OLD_TESTAMENT, 37, "Am", ("am", "amos")),
    "Obadiah": (OLD_TESTAMENT, 38, "Ob", ("ob", "obad", "abdias")),
    "Jonah": (OLD_TESTAMENT, 39, "Jon", ("jon", "jonah", "jona")),
    "Micah": (OLD_TESTAMENT, 40, "Mi", ("mi", "mic", "micheas")),
    "Nahum": (OLD_TESTAMENT, 41, "Na", ("na", "nah", "nahum")),
    "Habakkuk": (OLD_TESTAMENT, 42, "Hb", ("hb", "hab", "habacuc")),
    "Zephaniah": (OLD_TESTAMENT, 43, "Zep", ("zep", "zeph", "sophonias")),
    "Haggai": (OLD_TESTAMENT, 44, "Hg", ("hg", "hag", "aggeus")),
    "Zechariah": (OLD_TESTAMENT, 45, "Zec", ("zec", "zech", "zacharias")),
    "Malachi": (OLD_TESTAMENT, 46, "Mal", ("mal", "malachias")),
    "Matthew": (NEW_TESTAMENT, 47, "Mt", ("mt", "matt", "mat")),
    "Mark": (NEW_TESTAMENT, 48, "Mk", ("mk", "mrk", "mar", "mc")),
    "Luke": (NEW_TESTAMENT, 49, "Lk", ("lk", "luk", "lu")),
    "John": (NEW_TESTAMENT, 50, "Jn", ("jn", "joh", "jhn")),
    "Acts": (NEW_TESTAMENT, 51, "Acts", ("ac", "act", "acts of the apostles")),
    "Romans": (NEW_TESTAMENT, 52, "Rom", ("rom", "ro", "rm")),
    "1 Corinthians": (NEW_TESTAMENT, 53, "1 Cor", ("1 cor", "1 co", "1 corinth")),
    "2 Corinthians": (NEW_TESTAMENT, 54, "2 Cor", ("2 cor", "2 co", "2 corinth")),
    "Galatians": (NEW_TESTAMENT, 55, "Gal", ("gal", "ga")),
    "Ephesians": (NEW_TESTAMENT, 56, "Eph", ("eph", "ep")),
    "Philippians": (NEW_TESTAMENT, 57, "Phil", ("phil", "php", "pp")),
    "Colossians": (NEW_TESTAMENT, 58, "Col", ("col", "cl")),
    "1 Thessalonians": (NEW_TESTAMENT, 59, "1 Thes", ("1 thes", "1 thess", "1 th")),
    "2 Thessalonians": (NEW_TESTAMENT, 60, "2 Thes", ("2 thes", "2 thess", "2 th")),
    "1 Timothy": (NEW_TESTAMENT, 61, "1 Tm", ("1 tim", "1 tm", "1 ti")),
    "2 Timothy": (NEW_TESTAMENT, 62, "2 Tm", ("2 tim", "2 tm", "2 ti")),
    "Titus": (NEW_TESTAMENT, 63, "Ti", ("ti", "tit", "titus")),
    "Philemon": (NEW_TESTAMENT, 64, "Phlm", ("phlm", "phm", "philem")),
    "Hebrews": (NEW_TESTAMENT, 65, "Heb", ("heb", "hebr")),
    "James": (NEW_TESTAMENT, 66, "Jas", ("jas", "jm", "jam")),
    "1 Peter": (NEW_TESTAMENT, 67, "1 Pt", ("1 pt", "1 pet", "1 pe")),
    "2 Peter": (NEW_TESTAMENT, 68, "2 Pt", ("2 pt", "2 pet", "2 pe")),
    "1 John": (NEW_TESTAMENT, 69, "1 Jn", ("1 jn", "1 joh", "1 jhn")),
    "2 John": (NEW_TESTAMENT, 70, "2 Jn", ("2 jn", "2 joh", "2 jhn")),
    "3 John": (NEW_TESTAMENT, 71, "3 Jn", ("3 jn", "3 joh", "3 jhn")),
    "Jude": (NEW_TESTAMENT, 72, "Jude", ("jud", "jd")),
    "Revelation": (NEW_TESTAMENT, 73, "Rv", ("rv", "rev", "apoc", "apocalypse", "revelations")),
}

# "Hebrews" would otherwise collide with Habakkuk's "hb" abbreviation; the NT
# book wins only on the explicit spellings above.
_ORDINAL_WORDS = {
    "first": "1",
    "second": "2",
    "third": "3",
    "i": "1",
    "ii": "2",
    "iii": "3",
}


def _strip_accents(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", value) if not unicodedata.combining(c))


def _normalize_key(value: str) -> str:
    """Lowercase, drop punctuation, and turn leading ordinals into digits."""
    text = _strip_accents(value).lower().strip()
    text = text.replace(".", " ").replace("_", " ")
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    parts = text.split(" ")
    if parts and parts[0] in _ORDINAL_WORDS:
        parts[0] = _ORDINAL_WORDS[parts[0]]
        text = " ".join(parts)

    # "1st"/"2nd"/"3rd" -> "1"/"2"/"3"
    text = re.sub(r"^(\d)(st|nd|rd|th)\b", r"\1", text)
    return text


def _build_lookup() -> dict[str, str]:
    lookup: dict[str, str] = {}
    for canonical, (_testament, _order, abbrev, aliases) in BOOKS.items():
        keys = {_normalize_key(canonical), _normalize_key(abbrev)}
        keys.update(_normalize_key(a) for a in aliases)
        for key in keys:
            if key:
                lookup.setdefault(key, canonical)
    return lookup


_LOOKUP = _build_lookup()


def normalize_book_name(raw: str) -> Optional[str]:
    """Return the canonical book name for any known spelling, else None."""
    if not raw:
        return None
    key = _normalize_key(raw)
    if key in _LOOKUP:
        return _LOOKUP[key]

    # Tolerate a trailing "the book of" style prefix or stray words.
    key = re.sub(r"^(the\s+)?(book\s+of\s+)?", "", key).strip()
    return _LOOKUP.get(key)


def book_meta(canonical: str) -> Optional[tuple[str, int, str]]:
    """Return (testament, canon_order, abbreviation) for a canonical name."""
    entry = BOOKS.get(canonical)
    if not entry:
        return None
    testament, order, abbrev, _aliases = entry
    return testament, order, abbrev


def all_canonical_names() -> tuple[str, ...]:
    return tuple(BOOKS.keys())
