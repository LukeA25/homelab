"""Fretwork — personal guitar repertoire app.

FastAPI + SQLModel/SQLite API under /api, with the Vite SPA served from
frontend_dist in production (same pattern as finance-app).
"""

from __future__ import annotations

import json
import os
import random
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from . import audiodb, itunes, lyrics
from .chordpro import normalize_sheet_lines, parse_sheet_text
from .db import get_session, init_db
from .models import Playlist, Song
from .seed import seed_if_empty

app = FastAPI(title="Fretwork")
api = APIRouter()

Style = Literal["fingerpicking", "chords", "mix"]
Status = Literal["know", "learning", "rusty", "want"]
LinkType = Literal["youtube", "tab", "other"]


# --- Schemas (camelCase to match the React prototype) ---


class SongLinkIn(BaseModel):
    label: str
    url: str
    type: LinkType = "other"


class SongCreate(BaseModel):
    title: str
    artist: str
    genre: str = "Other"
    style: Style = "chords"
    status: Status = "want"
    key: str = "C"
    capo: int = 0
    bpm: int = 90
    hasArt: bool = False
    artHue: Optional[int] = None
    artworkUrl: Optional[str] = None
    appleMusicId: Optional[str] = None
    featured: bool = False
    links: list[SongLinkIn] = Field(default_factory=list)
    lines: list[dict[str, Any]] = Field(default_factory=list)
    chordPro: Optional[str] = None


class SongUpdate(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    genre: Optional[str] = None
    style: Optional[Style] = None
    status: Optional[Status] = None
    key: Optional[str] = None
    capo: Optional[int] = None
    bpm: Optional[int] = None
    hasArt: Optional[bool] = None
    artHue: Optional[int] = None
    artworkUrl: Optional[str] = None
    appleMusicId: Optional[str] = None
    featured: Optional[bool] = None
    links: Optional[list[SongLinkIn]] = None
    lines: Optional[list[dict[str, Any]]] = None
    chordPro: Optional[str] = None
    touchPracticed: bool = False


class PlaylistCreate(BaseModel):
    name: str
    description: str = ""
    songIds: list[str] = Field(default_factory=list)
    artHue: Optional[int] = None


class PlaylistUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    songIds: Optional[list[str]] = None
    artHue: Optional[int] = None


def _loads(raw: str, default: Any) -> Any:
    try:
        return json.loads(raw) if raw else default
    except json.JSONDecodeError:
        return default


def _iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def song_out(song: Song) -> dict[str, Any]:
    return {
        "id": str(song.id),
        "title": song.title,
        "artist": song.artist,
        "genre": song.genre,
        "style": song.style,
        "status": song.status,
        "key": song.key,
        "capo": song.capo,
        "bpm": song.bpm,
        "hasArt": song.has_art or bool(song.artwork_url),
        "artHue": song.art_hue,
        "artworkUrl": song.artwork_url,
        "appleMusicId": song.apple_music_id,
        "featured": song.featured,
        "lastPracticed": _iso(song.last_practiced),
        "links": _loads(song.links_json, []),
        "lines": normalize_sheet_lines(_loads(song.lines_json, [])),
    }


def playlist_out(playlist: Playlist) -> dict[str, Any]:
    ids = _loads(playlist.song_ids_json, [])
    return {
        "id": str(playlist.id),
        "name": playlist.name,
        "description": playlist.description,
        "artHue": playlist.art_hue,
        "songIds": [str(i) for i in ids],
    }


def _parse_song_ids(ids: list[str]) -> list[int]:
    out: list[int] = []
    for raw in ids:
        try:
            out.append(int(raw))
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=f"Invalid song id: {raw}") from exc
    return out


@app.on_event("startup")
def on_startup():
    init_db()
    with get_session() as session:
        seed_if_empty(session)


def get_db():
    with get_session() as session:
        yield session


# --- Songs ---


@api.get("/songs")
def list_songs(session: Session = Depends(get_db)):
    songs = session.exec(select(Song).order_by(Song.title)).all()
    return [song_out(s) for s in songs]


@api.get("/songs/{song_id}")
def get_song(song_id: int, session: Session = Depends(get_db)):
    song = session.get(Song, song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    return song_out(song)


@api.post("/songs", status_code=201)
def create_song(body: SongCreate, session: Session = Depends(get_db)):
    lines = body.lines
    if body.chordPro and body.chordPro.strip():
        lines = parse_sheet_text(body.chordPro)
    song = Song(
        title=body.title.strip(),
        artist=body.artist.strip(),
        genre=body.genre.strip() or "Other",
        style=body.style,
        status=body.status,
        key=body.key.strip() or "C",
        capo=body.capo,
        bpm=body.bpm,
        has_art=body.hasArt or bool(body.artworkUrl),
        art_hue=body.artHue if body.artHue is not None else random.randint(0, 359),
        artwork_url=body.artworkUrl,
        apple_music_id=body.appleMusicId,
        featured=body.featured,
        last_practiced=datetime.now(timezone.utc),
        lines_json=json.dumps(lines),
        links_json=json.dumps([link.model_dump() for link in body.links]),
    )
    session.add(song)
    session.commit()
    session.refresh(song)
    return song_out(song)


@api.patch("/songs/{song_id}")
def update_song(song_id: int, body: SongUpdate, session: Session = Depends(get_db)):
    song = session.get(Song, song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    data = body.model_dump(exclude_unset=True)
    touch = data.pop("touchPracticed", False)
    chord_pro = data.pop("chordPro", None)
    links = data.pop("links", None)
    lines = data.pop("lines", None)

    field_map = {
        "title": "title",
        "artist": "artist",
        "genre": "genre",
        "style": "style",
        "status": "status",
        "key": "key",
        "capo": "capo",
        "bpm": "bpm",
        "hasArt": "has_art",
        "artHue": "art_hue",
        "artworkUrl": "artwork_url",
        "appleMusicId": "apple_music_id",
        "featured": "featured",
    }
    for camel, attr in field_map.items():
        if camel in data:
            value = data[camel]
            if isinstance(value, str):
                value = value.strip()
            setattr(song, attr, value)

    if chord_pro is not None:
        song.lines_json = json.dumps(
            parse_sheet_text(chord_pro) if chord_pro.strip() else []
        )
    elif lines is not None:
        song.lines_json = json.dumps(lines)

    if links is not None:
        song.links_json = json.dumps(links)

    if touch:
        song.last_practiced = datetime.now(timezone.utc)

    session.add(song)
    session.commit()
    session.refresh(song)
    return song_out(song)


@api.delete("/songs/{song_id}", status_code=204)
def delete_song(song_id: int, session: Session = Depends(get_db)):
    song = session.get(Song, song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    session.delete(song)
    session.commit()
    return None


# --- Playlists ---


@api.get("/playlists")
def list_playlists(session: Session = Depends(get_db)):
    playlists = session.exec(select(Playlist).order_by(Playlist.name)).all()
    return [playlist_out(p) for p in playlists]


@api.get("/playlists/{playlist_id}")
def get_playlist(playlist_id: int, session: Session = Depends(get_db)):
    playlist = session.get(Playlist, playlist_id)
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return playlist_out(playlist)


@api.post("/playlists", status_code=201)
def create_playlist(body: PlaylistCreate, session: Session = Depends(get_db)):
    playlist = Playlist(
        name=body.name.strip(),
        description=body.description.strip(),
        art_hue=body.artHue if body.artHue is not None else random.randint(0, 359),
        song_ids_json=json.dumps(_parse_song_ids(body.songIds)),
    )
    session.add(playlist)
    session.commit()
    session.refresh(playlist)
    return playlist_out(playlist)


@api.patch("/playlists/{playlist_id}")
def update_playlist(
    playlist_id: int, body: PlaylistUpdate, session: Session = Depends(get_db)
):
    playlist = session.get(Playlist, playlist_id)
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    data = body.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        playlist.name = data["name"].strip()
    if "description" in data and data["description"] is not None:
        playlist.description = data["description"].strip()
    if "artHue" in data and data["artHue"] is not None:
        playlist.art_hue = data["artHue"]
    if "songIds" in data and data["songIds"] is not None:
        playlist.song_ids_json = json.dumps(_parse_song_ids(data["songIds"]))

    session.add(playlist)
    session.commit()
    session.refresh(playlist)
    return playlist_out(playlist)


@api.delete("/playlists/{playlist_id}", status_code=204)
def delete_playlist(playlist_id: int, session: Session = Depends(get_db)):
    playlist = session.get(Playlist, playlist_id)
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    session.delete(playlist)
    session.commit()
    return None


@api.get("/catalog/status")
def catalog_status():
    return {"configured": True, "provider": "itunes"}


@api.get("/catalog/search")
def catalog_search(q: str = "", limit: int = 12):
    if not q.strip():
        return []
    try:
        return itunes.search_songs(q.strip(), limit=min(limit, 25))
    except itunes.ITunesError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@api.get("/catalog/discover")
def catalog_discover(artist: str = "", limit: int = 8):
    if not artist.strip():
        return {"artist": None, "tracks": []}
    try:
        tracks = itunes.discover_by_artist(artist.strip(), limit=min(limit, 20))
        return {"artist": artist.strip(), "tracks": tracks}
    except itunes.ITunesError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@api.get("/catalog/lyrics")
def catalog_lyrics(title: str = "", artist: str = "", durationMs: Optional[int] = None):
    if not title.strip() or not artist.strip():
        raise HTTPException(status_code=400, detail="title and artist are required")
    try:
        return lyrics.fetch_lyrics(title.strip(), artist.strip(), durationMs)
    except lyrics.LyricsError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@api.get("/catalog/audio-meta")
def catalog_audio_meta(title: str = "", artist: str = "", durationMs: Optional[int] = None):
    """Lookup BPM / key suggestions (TheAudioDB + Deezer fallback)."""
    if not title.strip() or not artist.strip():
        raise HTTPException(status_code=400, detail="title and artist are required")
    try:
        return audiodb.lookup_track_meta(title.strip(), artist.strip(), durationMs)
    except audiodb.AudioDbError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


# Legacy Apple Music routes — redirect shape for older frontend builds
@api.get("/apple-music/status")
def apple_music_status_legacy():
    return catalog_status()


@api.get("/apple-music/search")
def apple_music_search_legacy(q: str = "", limit: int = 12):
    return catalog_search(q=q, limit=limit)


@api.get("/apple-music/discover")
def apple_music_discover_legacy(artist: str = "", limit: int = 8):
    return catalog_discover(artist=artist, limit=limit)


@api.get("/health")
def health():
    return {"ok": True}


app.include_router(api, prefix="/api")

_DIST = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend_dist")
_ASSETS = os.path.join(_DIST, "assets")

if os.path.isdir(_ASSETS):
    app.mount("/assets", StaticFiles(directory=_ASSETS), name="assets")


@app.get("/{full_path:path}")
def spa(full_path: str):
    index = os.path.join(_DIST, "index.html")
    if os.path.isfile(index):
        return FileResponse(index)
    raise HTTPException(
        status_code=404,
        detail="Frontend build not found. Run the Vite build (see Dockerfile).",
    )
