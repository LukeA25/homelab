import { Clock3, Play, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { STYLE_LABELS, daysSincePracticed } from "../data/songs";
import { api } from "../lib/api";
import type { CatalogTrack, Song } from "../lib/types";
import { Page } from "./Page";
import { SongArt } from "./SongArt";

const RUSTY_DAYS = 30;

/** Stable daily pick — same song all day, rotates tomorrow. */
function pickDailySong(songs: Song[], salt = ""): Song | undefined {
  if (songs.length === 0) return undefined;
  const day = new Date().toISOString().slice(0, 10);
  const seed = `${day}:${salt}:${songs.map((s) => s.id).join(",")}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return songs[Math.abs(hash) % songs.length];
}

type HomeScreenProps = {
  songs: Song[];
  onOpenSong: (song: Song) => void;
  onImportAppleTrack: (track: CatalogTrack) => Promise<void>;
};

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-xl font-bold">{title}</h2>
      {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
    </div>
  );
}

function HorizontalSongRail({
  songs,
  onOpenSong,
}: {
  songs: Song[];
  onOpenSong: (song: Song) => void;
}) {
  if (songs.length === 0) return null;
  return (
    <div className="scrollbar-none -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
      {songs.map((song) => (
        <button
          key={song.id}
          type="button"
          onClick={() => onOpenSong(song)}
          className="panel w-36 shrink-0 rounded-panel p-2.5 text-left transition hover:border-accent/40 sm:w-40"
        >
          <SongArt
            title={song.title}
            artist={song.artist}
            hasArt={song.hasArt}
            artHue={song.artHue}
            artworkUrl={song.artworkUrl}
            size="cover"
          />
          <p className="mt-2 truncate text-sm font-semibold">{song.title}</p>
          <p className="truncate text-xs text-muted">
            {song.artist} · {song.bpm} BPM
          </p>
        </button>
      ))}
    </div>
  );
}

export function HomeScreen({
  songs,
  onOpenSong,
  onImportAppleTrack,
}: HomeScreenProps) {
  const [discoverTracks, setDiscoverTracks] = useState<CatalogTrack[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const continueSong = useMemo(
    () =>
      [...songs].sort(
        (a, b) => new Date(b.lastPracticed).getTime() - new Date(a.lastPracticed).getTime(),
      )[0],
    [songs],
  );

  const featured = useMemo(() => {
    if (songs.length === 0) return undefined;
    // Prefer something other than Continue when possible
    const pool =
      continueSong && songs.length > 1
        ? songs.filter((s) => s.id !== continueSong.id)
        : songs;
    return pickDailySong(pool, "featured") ?? continueSong;
  }, [songs, continueSong]);

  const recents = useMemo(
    () =>
      [...songs]
        .sort(
          (a, b) => new Date(b.lastPracticed).getTime() - new Date(a.lastPracticed).getTime(),
        )
        .slice(0, 6),
    [songs],
  );

  const needsPractice = useMemo(
    () =>
      songs
        .filter((s) => s.status === "rusty" || daysSincePracticed(s) >= RUSTY_DAYS)
        .sort((a, b) => daysSincePracticed(b) - daysSincePracticed(a)),
    [songs],
  );

  const discoverArtist = useMemo(() => {
    const counts = songs.reduce<Record<string, number>>((acc, song) => {
      acc[song.artist] = (acc[song.artist] ?? 0) + 1;
      return acc;
    }, {});
    const multi = Object.entries(counts)
      .filter(([, n]) => n >= 2)
      .map(([artist]) => artist);
    return multi[0] ?? null;
  }, [songs]);

  const libraryKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const song of songs) {
      keys.add(`${song.title.toLowerCase()}::${song.artist.toLowerCase()}`);
      if (song.appleMusicId) keys.add(`am:${song.appleMusicId}`);
    }
    return keys;
  }, [songs]);

  useEffect(() => {
    if (!discoverArtist) {
      setDiscoverTracks([]);
      return;
    }
    let cancelled = false;
    setDiscoverLoading(true);
    setDiscoverError(null);
    api
      .catalogDiscover(discoverArtist)
      .then((res) => {
        if (cancelled) return;
        const missing = res.tracks.filter((track) => {
          if (libraryKeys.has(`am:${track.id}`)) return false;
          return !libraryKeys.has(`${track.title.toLowerCase()}::${track.artist.toLowerCase()}`);
        });
        setDiscoverTracks(missing);
      })
      .catch((err) => {
        if (cancelled) return;
        setDiscoverTracks([]);
        setDiscoverError(err instanceof Error ? err.message : "Discover unavailable");
      })
      .finally(() => {
        if (!cancelled) setDiscoverLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [discoverArtist, libraryKeys]);

  return (
    <Page>
      <div className="mb-6 lg:mb-8">
        <p className="text-sm font-medium text-muted">Welcome back</p>
        <h1 className="mt-1 text-3xl font-bold md:text-4xl">Home</h1>
      </div>

      <div className="mb-8 grid w-full min-w-0 gap-4 lg:grid-cols-2">
        {continueSong && (
          <button
            type="button"
            onClick={() => onOpenSong(continueSong)}
            className="panel flex w-full min-w-0 max-w-full items-center gap-3 overflow-hidden rounded-panel p-3 text-left transition hover:border-accent/40 sm:gap-4 sm:p-5"
          >
            <SongArt
              title={continueSong.title}
              artist={continueSong.artist}
              hasArt={continueSong.hasArt}
              artHue={continueSong.artHue}
              artworkUrl={continueSong.artworkUrl}
              size="md"
              className="sm:h-28 sm:w-28 sm:rounded-3xl sm:text-3xl"
            />
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-accent sm:text-xs">
                Continue practicing
              </p>
              <h2 className="mt-1 truncate text-lg font-bold sm:text-xl">{continueSong.title}</h2>
              <p className="truncate text-xs text-muted sm:text-sm">
                {continueSong.artist} · {continueSong.bpm} BPM
              </p>
              <p className="truncate text-xs text-muted">
                Last played{" "}
                {daysSincePracticed(continueSong) === 0
                  ? "today"
                  : `${daysSincePracticed(continueSong)}d ago`}
              </p>
              <span className="btn-accent mt-2 inline-flex max-w-full items-center gap-2 rounded-pill px-3 py-1.5 text-xs sm:mt-3 sm:px-4 sm:py-2 sm:text-sm">
                <Play className="h-3.5 w-3.5 shrink-0 fill-current" />
                Resume sheet
              </span>
            </div>
          </button>
        )}

        {featured && (
          <button
            type="button"
            onClick={() => onOpenSong(featured)}
            className="panel relative w-full min-w-0 max-w-full overflow-hidden rounded-panel p-3 text-left sm:p-5"
          >
            <div
              className="absolute inset-0 opacity-70"
              style={{
                background: `radial-gradient(circle at 80% 30%, hsl(${featured.artHue} 80% 55% / 0.45), transparent 55%)`,
              }}
            />
            <div className="relative flex min-w-0 items-center gap-3 sm:gap-4">
              <SongArt
                title={featured.title}
                artist={featured.artist}
                hasArt={featured.hasArt}
                artHue={featured.artHue}
                artworkUrl={featured.artworkUrl}
                size="md"
                className="sm:h-28 sm:w-28 sm:rounded-3xl sm:text-3xl"
              />
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-accent sm:text-xs">
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  Today's pick
                </p>
                <h2 className="mt-1 truncate text-lg font-bold sm:text-xl">{featured.title}</h2>
                <p className="truncate text-xs text-muted sm:text-sm">
                  {featured.artist} · {featured.bpm} BPM
                </p>
                <p className="truncate text-xs text-muted">{STYLE_LABELS[featured.style]}</p>
              </div>
            </div>
          </button>
        )}
      </div>

      <section className="mb-8">
        <SectionTitle title="Recents" subtitle="Songs you opened most recently." />
        <HorizontalSongRail songs={recents} onOpenSong={onOpenSong} />
      </section>

      {needsPractice.length > 0 && (
        <section className="mb-8">
          <SectionTitle
            title="Needs practice"
            subtitle={`Rusty or not played in ${RUSTY_DAYS}+ days.`}
          />
          <div className="panel divide-y divide-border overflow-hidden rounded-panel">
            {needsPractice.slice(0, 5).map((song) => (
              <button
                key={song.id}
                type="button"
                onClick={() => onOpenSong(song)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface"
              >
                <Clock3 className="h-4 w-4 shrink-0 text-accent" />
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
                    {song.artist} · {song.bpm} BPM
                  </p>
                </div>
                <span className="text-xs text-muted">{daysSincePracticed(song)}d ago</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {discoverArtist && (discoverLoading || discoverTracks.length > 0 || discoverError) && (
        <section>
          <SectionTitle
            title={`More from ${discoverArtist}`}
            subtitle="iTunes suggestions not in your library yet."
          />
          {discoverError && (
            <p className="mb-3 text-sm text-muted">{discoverError}</p>
          )}
          {discoverLoading && discoverTracks.length === 0 && (
            <p className="text-sm text-muted">Loading suggestions…</p>
          )}
          <div className="scrollbar-none -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
            {discoverTracks.map((track) => (
              <div key={track.id} className="panel w-40 shrink-0 rounded-panel p-2.5 sm:w-44">
                <SongArt
                  title={track.title}
                  artist={track.artist}
                  hasArt={Boolean(track.artworkUrl)}
                  artHue={track.artHue}
                  artworkUrl={track.artworkUrl}
                  size="cover"
                />
                <p className="mt-2 truncate text-sm font-semibold">{track.title}</p>
                <p className="truncate text-xs text-muted">{track.artist}</p>
                <button
                  type="button"
                  disabled={importingId === track.id}
                  onClick={async () => {
                    setImportingId(track.id);
                    try {
                      await onImportAppleTrack(track);
                    } finally {
                      setImportingId(null);
                    }
                  }}
                  className="mt-2 w-full rounded-pill border border-border bg-surface py-1.5 text-xs font-medium text-muted disabled:opacity-60"
                >
                  {importingId === track.id ? "Adding…" : "Add to library"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </Page>
  );
}
