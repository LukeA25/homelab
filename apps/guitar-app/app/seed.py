"""First-run seed data matching the design prototype library."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from .models import Playlist, Song


def _days_ago(n: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=n)


SEED_SONGS: list[dict] = [
    {
        "title": "Blackbird",
        "artist": "The Beatles",
        "genre": "Folk",
        "style": "fingerpicking",
        "status": "know",
        "key": "G",
        "capo": 0,
        "bpm": 92,
        "has_art": True,
        "art_hue": 160,
        "last_practiced": _days_ago(2),
        "links": [
            {"label": "Tutorial", "url": "https://youtube.com", "type": "youtube"},
            {"label": "Tab notes", "url": "#", "type": "tab"},
        ],
        "lines": [
            {"kind": "section", "label": "Verse"},
            {
                "kind": "lyric",
                "chords": ["G", "", "Am", ""],
                "words": "Blackbird singing in the dead of night",
            },
            {
                "kind": "lyric",
                "chords": ["G", "A7", "D", ""],
                "words": "Take these broken wings and learn to fly",
            },
            {"kind": "lyric", "chords": ["C", "A7", "D", ""], "words": "All your life"},
            {
                "kind": "lyric",
                "chords": ["G", "Em", "C", "D"],
                "words": "You were only waiting for this moment to arise",
            },
        ],
    },
    {
        "title": "Yesterday",
        "artist": "The Beatles",
        "genre": "Folk",
        "style": "chords",
        "status": "know",
        "key": "F",
        "capo": 0,
        "bpm": 96,
        "has_art": True,
        "art_hue": 210,
        "last_practiced": _days_ago(12),
        "links": [],
        "lines": [
            {"kind": "section", "label": "Verse"},
            {
                "kind": "lyric",
                "chords": ["F", "Em7", "A7", "Dm"],
                "words": "Yesterday, all my troubles seemed so far away",
            },
        ],
    },
    {
        "title": "Let It Be",
        "artist": "The Beatles",
        "genre": "Rock",
        "style": "chords",
        "status": "rusty",
        "key": "C",
        "capo": 0,
        "bpm": 72,
        "has_art": True,
        "art_hue": 280,
        "last_practiced": _days_ago(48),
        "links": [],
        "lines": [
            {"kind": "section", "label": "Verse"},
            {
                "kind": "lyric",
                "chords": ["C", "G", "Am", "F"],
                "words": "When I find myself in times of trouble",
            },
        ],
    },
    {
        "title": "Wish You Were Here",
        "artist": "Pink Floyd",
        "genre": "Rock",
        "style": "mix",
        "status": "know",
        "key": "Em",
        "capo": 0,
        "bpm": 62,
        "has_art": True,
        "art_hue": 28,
        "featured": True,
        "last_practiced": _days_ago(1),
        "links": [
            {"label": "Where I learned it", "url": "https://youtube.com", "type": "youtube"}
        ],
        "lines": [
            {"kind": "section", "label": "Intro"},
            {"kind": "lyric", "chords": ["Em", "G", "Em", "G"], "words": "(riff)"},
            {"kind": "section", "label": "Verse"},
            {
                "kind": "lyric",
                "chords": ["C", "D", "Am", ""],
                "words": "So, so you think you can tell",
            },
            {
                "kind": "lyric",
                "chords": ["G", "D", "C", "Am"],
                "words": "Heaven from Hell, blue skies from pain",
            },
        ],
    },
    {
        "title": "Fast Car",
        "artist": "Tracy Chapman",
        "genre": "Folk",
        "style": "fingerpicking",
        "status": "learning",
        "key": "C",
        "capo": 2,
        "bpm": 104,
        "has_art": False,
        "art_hue": 200,
        "last_practiced": _days_ago(0),
        "links": [
            {"label": "Fingerstyle lesson", "url": "https://youtube.com", "type": "youtube"}
        ],
        "lines": [
            {"kind": "section", "label": "Verse"},
            {
                "kind": "lyric",
                "chords": ["C", "G", "Em", "D"],
                "words": "You got a fast car, I want a ticket to anywhere",
            },
            {
                "kind": "lyric",
                "chords": ["C", "G", "Em", "D"],
                "words": "Maybe we make a deal, maybe together we can get somewhere",
            },
        ],
    },
    {
        "title": "Hotel California",
        "artist": "Eagles",
        "genre": "Rock",
        "style": "mix",
        "status": "rusty",
        "key": "Bm",
        "capo": 0,
        "bpm": 74,
        "has_art": True,
        "art_hue": 340,
        "last_practiced": _days_ago(67),
        "links": [
            {"label": "Solo breakdown", "url": "https://youtube.com", "type": "youtube"}
        ],
        "lines": [
            {"kind": "section", "label": "Verse"},
            {
                "kind": "lyric",
                "chords": ["Bm", "F#", "A", "E"],
                "words": "On a dark desert highway, cool wind in my hair",
            },
            {
                "kind": "lyric",
                "chords": ["G", "D", "Em", "F#"],
                "words": "Warm smell of colitas, rising up through the air",
            },
        ],
    },
    {
        "title": "Hallelujah",
        "artist": "Leonard Cohen",
        "genre": "Folk",
        "style": "chords",
        "status": "know",
        "key": "C",
        "capo": 0,
        "bpm": 68,
        "has_art": False,
        "art_hue": 250,
        "last_practiced": _days_ago(5),
        "links": [],
        "lines": [
            {"kind": "section", "label": "Verse"},
            {
                "kind": "lyric",
                "chords": ["C", "Am", "", ""],
                "words": "I heard there was a secret chord",
            },
            {
                "kind": "lyric",
                "chords": ["C", "Am", "", ""],
                "words": "That David played and it pleased the Lord",
            },
            {
                "kind": "lyric",
                "chords": ["F", "G", "C", "G"],
                "words": "But you don't really care for music, do you?",
            },
        ],
    },
    {
        "title": "Neon",
        "artist": "John Mayer",
        "genre": "Blues",
        "style": "fingerpicking",
        "status": "want",
        "key": "E",
        "capo": 0,
        "bpm": 108,
        "has_art": True,
        "art_hue": 175,
        "last_practiced": _days_ago(90),
        "links": [
            {"label": "Want to learn", "url": "https://youtube.com", "type": "youtube"}
        ],
        "lines": [
            {"kind": "section", "label": "Groove"},
            {"kind": "lyric", "chords": ["E", "B", "C#m", "A"], "words": "When tonight is over"},
            {"kind": "lyric", "chords": ["E", "B", "A", ""], "words": "You're gonna turn blue"},
        ],
    },
    {
        "title": "Dust in the Wind",
        "artist": "Kansas",
        "genre": "Rock",
        "style": "fingerpicking",
        "status": "learning",
        "key": "C",
        "capo": 0,
        "bpm": 94,
        "has_art": False,
        "art_hue": 45,
        "last_practiced": _days_ago(3),
        "links": [
            {"label": "Pattern practice", "url": "https://youtube.com", "type": "youtube"}
        ],
        "lines": [
            {"kind": "section", "label": "Verse"},
            {
                "kind": "lyric",
                "chords": ["C", "G/B", "Am", "G"],
                "words": "I close my eyes, only for a moment, and the moment's gone",
            },
            {
                "kind": "lyric",
                "chords": ["C", "G/B", "Am", "G"],
                "words": "All my dreams pass before my eyes, a curiosity",
            },
        ],
    },
    {
        "title": "Wonderwall",
        "artist": "Oasis",
        "genre": "Rock",
        "style": "chords",
        "status": "know",
        "key": "Em",
        "capo": 2,
        "bpm": 87,
        "has_art": True,
        "art_hue": 120,
        "last_practiced": _days_ago(8),
        "links": [],
        "lines": [
            {"kind": "section", "label": "Verse"},
            {
                "kind": "lyric",
                "chords": ["Em7", "G", "Dsus4", "A7sus4"],
                "words": "Today is gonna be the day that they're gonna throw it back to you",
            },
            {
                "kind": "lyric",
                "chords": ["Em7", "G", "Dsus4", "A7sus4"],
                "words": "By now you should've somehow realized what you gotta do",
            },
        ],
    },
]


def seed_if_empty(session: Session) -> None:
    if session.exec(select(Song)).first():
        return

    songs: list[Song] = []
    for raw in SEED_SONGS:
        song = Song(
            title=raw["title"],
            artist=raw["artist"],
            genre=raw["genre"],
            style=raw["style"],
            status=raw["status"],
            key=raw["key"],
            capo=raw["capo"],
            bpm=raw["bpm"],
            has_art=raw["has_art"],
            art_hue=raw["art_hue"],
            featured=raw.get("featured", False),
            last_practiced=raw["last_practiced"],
            lines_json=json.dumps(raw["lines"]),
            links_json=json.dumps(raw["links"]),
        )
        session.add(song)
        songs.append(song)
    session.commit()
    for song in songs:
        session.refresh(song)

    # Seed playlists using the auto-assigned ids (insertion order above).
    by_title = {s.title: s.id for s in songs}
    playlists = [
        Playlist(
            name="Fingerpicking focus",
            description="Patterns and soft pieces",
            art_hue=165,
            song_ids_json=json.dumps(
                [
                    by_title["Blackbird"],
                    by_title["Fast Car"],
                    by_title["Dust in the Wind"],
                ]
            ),
        ),
        Playlist(
            name="Campfire chords",
            description="Easy singalongs",
            art_hue=35,
            song_ids_json=json.dumps(
                [
                    by_title["Hallelujah"],
                    by_title["Wonderwall"],
                    by_title["Let It Be"],
                ]
            ),
        ),
        Playlist(
            name="Classic rock night",
            description="Bigger arrangements",
            art_hue=320,
            song_ids_json=json.dumps(
                [
                    by_title["Wish You Were Here"],
                    by_title["Hotel California"],
                    by_title["Wonderwall"],
                ]
            ),
        ),
    ]
    for playlist in playlists:
        session.add(playlist)
    session.commit()
