import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { MOCK_PLAYLISTS } from "../data/songs";
import type { Playlist, Song } from "../lib/types";
import { Page, PageHeader } from "./Page";
import { SongArt } from "./SongArt";

type PlaylistsScreenProps = {
  songs: Song[];
  onOpenSong: (song: Song) => void;
};

type Draft = {
  id?: string;
  name: string;
  description: string;
  songIds: string[];
  artHue: number;
};

const emptyDraft = (): Draft => ({
  name: "",
  description: "",
  songIds: [],
  artHue: Math.floor(Math.random() * 360),
});

export function PlaylistsScreen({ songs, onOpenSong }: PlaylistsScreenProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>(() => [...MOCK_PLAYLISTS]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(MOCK_PLAYLISTS[0]?.id ?? null);

  const selected = useMemo(
    () => playlists.find((p) => p.id === selectedId) ?? null,
    [playlists, selectedId],
  );

  const selectedSongs = useMemo(() => {
    if (!selected) return [];
    return selected.songIds
      .map((id) => songs.find((s) => s.id === id))
      .filter((s): s is Song => Boolean(s));
  }, [selected, songs]);

  function openCreate() {
    setEditing(emptyDraft());
  }

  function openEdit(playlist: Playlist) {
    setEditing({
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      songIds: [...playlist.songIds],
      artHue: playlist.artHue,
    });
  }

  function toggleSong(id: string) {
    if (!editing) return;
    setEditing({
      ...editing,
      songIds: editing.songIds.includes(id)
        ? editing.songIds.filter((s) => s !== id)
        : [...editing.songIds, id],
    });
  }

  function saveDraft() {
    if (!editing || !editing.name.trim()) return;
    if (editing.id) {
      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === editing.id
            ? {
                ...p,
                name: editing.name.trim(),
                description: editing.description.trim(),
                songIds: editing.songIds,
                artHue: editing.artHue,
              }
            : p,
        ),
      );
      setSelectedId(editing.id);
    } else {
      const id = `p-${Date.now()}`;
      const next: Playlist = {
        id,
        name: editing.name.trim(),
        description: editing.description.trim() || "Custom playlist",
        songIds: editing.songIds,
        artHue: editing.artHue,
      };
      setPlaylists((prev) => [...prev, next]);
      setSelectedId(id);
    }
    setEditing(null);
  }

  function deletePlaylist(id: string) {
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
    if (selectedId === id) setSelectedId(null);
    if (editing?.id === id) setEditing(null);
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Library"
        title="Playlists"
        description="Group songs for practice — create and edit your own."
        action={
          <button
            type="button"
            onClick={openCreate}
            className="btn-accent inline-flex items-center gap-2 rounded-pill px-4 py-2.5 text-sm shadow-glow-sm"
          >
            <Plus className="h-4 w-4" />
            New playlist
          </button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] lg:items-start">
        <aside className="space-y-3">
          {playlists.map((playlist) => {
            const active = playlist.id === selectedId;
            return (
              <button
                key={playlist.id}
                type="button"
                onClick={() => setSelectedId(playlist.id)}
                className={`panel flex w-full items-center gap-3 rounded-panel p-3 text-left transition ${
                  active ? "border-accent/50 shadow-glow-sm" : "hover:border-accent/30"
                }`}
              >
                <div
                  className="h-14 w-14 shrink-0 rounded-2xl"
                  style={{
                    background: `linear-gradient(135deg, hsl(${playlist.artHue} 70% 45%), hsl(${(playlist.artHue + 60) % 360} 60% 25%))`,
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{playlist.name}</p>
                  <p className="truncate text-xs text-muted">
                    {playlist.songIds.length} songs · {playlist.description}
                  </p>
                </div>
              </button>
            );
          })}

          {playlists.length === 0 && (
            <div className="panel rounded-panel px-4 py-8 text-center text-sm text-muted">
              No playlists yet. Create one to get started.
            </div>
          )}
        </aside>

        <section className="panel rounded-panel p-5 md:p-6">
          {!selected ? (
            <div className="py-12 text-center text-sm text-muted">
              Select a playlist or create a new one.
            </div>
          ) : (
            <>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold">{selected.name}</h2>
                  <p className="mt-1 text-sm text-muted">{selected.description}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(selected)}
                    className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface px-3 py-2 text-sm"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePlaylist(selected.id)}
                    className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface px-3 py-2 text-sm text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>

              <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
                {selectedSongs.map((song, index) => (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => onOpenSong(song)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface"
                  >
                    <span className="w-5 text-sm text-muted">{index + 1}</span>
                    <SongArt
                      title={song.title}
                      artist={song.artist}
                      hasArt={song.hasArt}
                      artHue={song.artHue}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{song.title}</p>
                      <p className="truncate text-xs text-muted">
                        {song.artist} · {song.bpm} BPM
                      </p>
                    </div>
                  </button>
                ))}
                {selectedSongs.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-muted">
                    This playlist is empty. Edit it to add songs.
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 sm:items-center">
          <div className="panel max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-panel p-5 shadow-panel">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">
                {editing.id ? "Edit playlist" : "New playlist"}
              </h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="grid h-9 w-9 place-items-center rounded-full border border-border"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mb-3 block">
              <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Name</span>
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="glass w-full rounded-2xl px-4 py-3 text-sm outline-none"
                placeholder="Playlist name"
              />
            </label>
            <label className="mb-4 block">
              <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted">
                Description
              </span>
              <input
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                className="glass w-full rounded-2xl px-4 py-3 text-sm outline-none"
                placeholder="Optional"
              />
            </label>

            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Songs
            </p>
            <div className="mb-5 max-h-56 space-y-1 overflow-y-auto rounded-2xl border border-border p-2">
              {songs.map((song) => {
                const on = editing.songIds.includes(song.id);
                return (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => toggleSong(song.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm ${
                      on ? "bg-accent-soft text-text" : "text-muted hover:bg-surface"
                    }`}
                  >
                    <span
                      className={`grid h-5 w-5 place-items-center rounded-md border text-[10px] ${
                        on ? "border-accent bg-accent text-ink" : "border-border"
                      }`}
                    >
                      {on ? "✓" : ""}
                    </span>
                    <span className="truncate font-medium">{song.title}</span>
                    <span className="ml-auto truncate text-xs text-muted">{song.artist}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="flex-1 rounded-pill border border-border py-3 text-sm text-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveDraft}
                className="btn-accent flex-1 rounded-pill py-3 text-sm"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
