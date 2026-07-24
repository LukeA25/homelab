import {
  ChevronDown,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { STYLE_LABELS } from "../data/songs";
import { songHasArtist, splitArtists } from "../lib/artists";
import type { Song, Style } from "../lib/types";
import { Page, PageHeader } from "./Page";
import { SongArt } from "./SongArt";
import { StatusTag } from "./StatusTag";

const STYLE_OPTIONS: Style[] = ["fingerpicking", "chords", "mix"];

type SortKey = "title" | "artist" | "genre" | "status";

type TracksScreenProps = {
  songs: Song[];
  query: string;
  onQueryChange: (query: string) => void;
  onOpenSong: (song: Song) => void;
};

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-pill px-3 py-1.5 text-sm transition ${
        active
          ? "btn-accent shadow-glow-sm"
          : "border border-border bg-surface text-muted hover:text-text"
      }`}
    >
      {label}
    </button>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function TracksScreen({ songs, query, onQueryChange, onOpenSong }: TracksScreenProps) {
  const [styles, setStyles] = useState<Style[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [artists, setArtists] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("title");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const genreOptions = useMemo(() => uniqueSorted(songs.map((s) => s.genre)), [songs]);
  const artistOptions = useMemo(
    () => uniqueSorted(songs.flatMap((s) => splitArtists(s.artist))),
    [songs],
  );
  const activeFilterCount = styles.length + genres.length + artists.length;

  const allTracks = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = songs.filter((song) => {
      const textOk =
        !q ||
        song.title.toLowerCase().includes(q) ||
        song.artist.toLowerCase().includes(q) ||
        song.genre.toLowerCase().includes(q);
      if (!textOk) return false;
      if (styles.length > 0 && !styles.includes(song.style)) return false;
      if (genres.length > 0 && !genres.includes(song.genre)) return false;
      if (artists.length > 0 && !artists.some((a) => songHasArtist(song.artist, a))) {
        return false;
      }
      return true;
    });
    return [...filtered].sort((a, b) => String(a[sortBy]).localeCompare(String(b[sortBy])));
  }, [songs, query, styles, genres, artists, sortBy]);

  function clearFilters() {
    setStyles([]);
    setGenres([]);
    setArtists([]);
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Library"
        title="All tracks"
        description="Full library — filter by style, genre, and artist."
        action={
          <label className="glass hidden w-72 items-center gap-3 rounded-pill px-4 py-3 sm:flex md:w-80">
            <Search className="h-4 w-4 shrink-0 text-muted" />
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search your library"
              className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
            />
          </label>
        }
      />

      <label className="glass mb-4 flex items-center gap-3 rounded-pill px-4 py-3 sm:hidden">
        <Search className="h-4 w-4 text-muted" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search your library"
          className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
        />
      </label>

      <div className="grid gap-5 lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)] lg:items-start">
        <aside className="panel order-1 rounded-panel lg:sticky lg:top-6">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              className="flex items-center gap-2 text-sm font-semibold lg:pointer-events-none"
            >
              <SlidersHorizontal className="h-4 w-4 text-accent" />
              Filters
              {activeFilterCount > 0 && (
                <span className="rounded-pill bg-accent px-2 py-0.5 text-[11px] font-bold text-ink">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown
                className={`h-4 w-4 text-muted transition lg:hidden ${filtersOpen ? "rotate-180" : ""}`}
              />
            </button>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 text-xs text-muted hover:text-text"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>

          <div className={`${filtersOpen ? "block" : "hidden"} space-y-5 p-4 lg:block`}>
            <FilterGroup title="Style">
              {STYLE_OPTIONS.map((style) => (
                <FilterChip
                  key={style}
                  label={STYLE_LABELS[style]}
                  active={styles.includes(style)}
                  onClick={() => setStyles((prev) => toggleValue(prev, style))}
                />
              ))}
            </FilterGroup>

            <FilterGroup title="Genre">
              {genreOptions.map((genre) => (
                <FilterChip
                  key={genre}
                  label={genre}
                  active={genres.includes(genre)}
                  onClick={() => setGenres((prev) => toggleValue(prev, genre))}
                />
              ))}
            </FilterGroup>

            <FilterGroup title="Artist">
              {artistOptions.map((artist) => (
                <FilterChip
                  key={artist}
                  label={artist}
                  active={artists.includes(artist)}
                  onClick={() => setArtists((prev) => toggleValue(prev, artist))}
                />
              ))}
            </FilterGroup>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Sort by
              </p>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="glass w-full appearance-none rounded-2xl px-3 py-2.5 text-sm outline-none"
              >
                <option value="title">Title</option>
                <option value="artist">Artist</option>
                <option value="genre">Genre</option>
                <option value="status">Status</option>
              </select>
            </div>
          </div>
        </aside>

        <div className="order-2 min-w-0">
          <p className="mb-3 text-sm text-muted">
            {allTracks.length} song{allTracks.length === 1 ? "" : "s"}
            {activeFilterCount > 0 ? " matching filters" : ""}
          </p>

          <div className="panel overflow-hidden rounded-panel">
            <div className="divide-y divide-border">
              {allTracks.map((song, index) => (
                <button
                  key={song.id}
                  type="button"
                  onClick={() => onOpenSong(song)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface sm:px-5"
                >
                  <span className="w-5 text-sm text-muted">{index + 1}</span>
                  <SongArt
                    title={song.title}
                    artist={song.artist}
                    hasArt={song.hasArt}
                    artHue={song.artHue}
                    artworkUrl={song.artworkUrl}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{song.title}</p>
                    <p className="truncate text-xs text-muted">
                      {song.artist} · {STYLE_LABELS[song.style]} · {song.bpm} BPM
                    </p>
                  </div>
                  <span className="hidden text-xs text-muted sm:inline">{song.genre}</span>
                  <StatusTag status={song.status} />
                </button>
              ))}
            </div>
          </div>

          {allTracks.length === 0 && (
            <div className="panel mt-4 rounded-panel px-5 py-10 text-center">
              <p className="text-lg font-semibold">No songs match</p>
              <p className="mt-1 text-sm text-muted">Clear some filters or try another search.</p>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="btn-accent mt-4 rounded-pill px-4 py-2 text-sm"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
