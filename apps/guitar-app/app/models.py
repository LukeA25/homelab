"""SQLModel tables for the guitar repertoire app."""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Column, Text
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Song(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    artist: str
    genre: str = "Other"
    style: str = "chords"  # fingerpicking | chords | mix
    status: str = "want"  # know | learning | rusty | want
    key: str = "C"
    capo: int = 0
    bpm: int = 90
    has_art: bool = False
    art_hue: int = 200
    artwork_url: Optional[str] = None
    apple_music_id: Optional[str] = None
    featured: bool = False
    last_practiced: datetime = Field(default_factory=utcnow)
    # Chord/lyric sheet as JSON list of {kind, ...} objects
    lines_json: str = Field(default="[]", sa_column=Column(Text, nullable=False))
    # Links as JSON list of {label, url, type}
    links_json: str = Field(default="[]", sa_column=Column(Text, nullable=False))


class Playlist(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: str = ""
    art_hue: int = 200
    # Ordered song ids as JSON list of ints
    song_ids_json: str = Field(default="[]", sa_column=Column(Text, nullable=False))
