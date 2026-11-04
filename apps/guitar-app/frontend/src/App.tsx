import { useCallback, useEffect, useRef, useState } from "react";
import { AddScreen } from "./components/AddScreen";
import { DesktopSidebar, MobileBottomNav } from "./components/AppNav";
import { HomeScreen } from "./components/HomeScreen";
import { MetronomeScreen } from "./components/MetronomeScreen";
import { PlaylistsScreen } from "./components/PlaylistsScreen";
import { SettingsScreen } from "./components/SettingsScreen";
import { SheetScreen } from "./components/SheetScreen";
import { TracksScreen } from "./components/TracksScreen";
import { api } from "./lib/api";
import { guitarRemoteControls, isCastScreen } from "./lib/cast";
import type { Playlist, Screen, Song, Status, ThemeId } from "./lib/types";

const THEME_KEY = "fretwork-theme-v3";

const SCREEN_PATHS: Record<Exclude<Screen, "sheet">, string> = {
  library: "/",
  tracks: "/tracks",
  playlists: "/playlists",
  add: "/add",
  settings: "/settings",
  metronome: "/metronome",
};

function routeFromPath(pathname: string): { screen: Screen; songId: string | null } {
  const song = pathname.match(/^\/song\/([^/]+)\/?$/);
  if (song) return { screen: "sheet", songId: decodeURIComponent(song[1]!) };
  const clean = pathname.replace(/(.)\/+$/, "$1");
  const screen = (Object.keys(SCREEN_PATHS) as Exclude<Screen, "sheet">[]).find(
    (k) => SCREEN_PATHS[k] === clean,
  );
  return { screen: screen ?? "library", songId: null };
}

function pathFor(screen: Screen, songId: string | null): string {
  if (screen === "sheet") return songId ? `/song/${encodeURIComponent(songId)}` : "/";
  return SCREEN_PATHS[screen];
}

function readTheme(): ThemeId {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "teal" || stored === "purple" || stored === "amber") return stored;
  return "purple";
}

export default function App() {
  const [theme, setTheme] = useState<ThemeId>(readTheme);
  const [screen, setScreen] = useState<Screen>(() => routeFromPath(window.location.pathname).screen);
  const [sheetReturnTo, setSheetReturnTo] = useState<Exclude<Screen, "sheet">>("library");
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSongId, setActiveSongId] = useState<string | null>(
    () => routeFromPath(window.location.pathname).songId,
  );
  const [query, setQuery] = useState("");
  const [metronomeBpm, setMetronomeBpm] = useState(92);
  const [sheetFocusMode, setSheetFocusMode] = useState(false);

  const activeSong = songs.find((s) => s.id === activeSongId) ?? null;
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const songsRef = useRef(songs);
  songsRef.current = songs;

  const refresh = useCallback(async () => {
    const [nextSongs, nextPlaylists] = await Promise.all([
      api.listSongs(),
      api.listPlaylists(),
    ]);
    setSongs(nextSongs);
    setPlaylists(nextPlaylists);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load library");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    if (!loading && screen === "sheet" && !activeSong) {
      setActiveSongId(null);
      setScreen("library");
    }
  }, [loading, screen, activeSong]);

  useEffect(() => {
    const path = pathFor(screen, activeSongId);
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path + window.location.search);
    }
  }, [screen, activeSongId]);

  useEffect(() => {
    const onPop = () => {
      const next = routeFromPath(window.location.pathname);
      const prev = screenRef.current;
      if (next.screen === "sheet" && prev !== "sheet") setSheetReturnTo(prev);
      if (next.screen !== "sheet") setSheetFocusMode(false);
      setActiveSongId(next.songId);
      setScreen(next.screen);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (isCastScreen) {
      const onRefresh = (e: Event) => {
        e.preventDefault();
        refresh().catch(() => undefined);
      };
      window.addEventListener("cast:refresh", onRefresh);
      return () => window.removeEventListener("cast:refresh", onRefresh);
    }
    window.castApp = {
      controlsLabel: "Song",
      pages: () => [
        { label: "Library", sub: "All songs", path: "/" },
        ...songsRef.current.map((s) => ({
          label: s.title,
          sub: s.artist,
          path: pathFor("sheet", s.id),
          tab: "app",
        })),
      ],
      controls: guitarRemoteControls,
    };
    return () => {
      delete window.castApp;
    };
  }, [refresh]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    if (meta && bg) meta.setAttribute("content", bg);
  }, [theme]);

  function navigate(next: Screen) {
    if (next !== "sheet") {
      setActiveSongId(null);
      setSheetFocusMode(false);
    }
    setScreen(next);
  }

  async function openSong(song: Song) {
    if (screen !== "sheet") {
      setSheetReturnTo(screen as Exclude<Screen, "sheet">);
    }
    setActiveSongId(song.id);
    setMetronomeBpm(song.bpm);
    setScreen("sheet");
    try {
      const updated = await api.updateSong(song.id, { touchPracticed: true });
      setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch {
      // practice stamp is best-effort
    }
  }

  async function updateSongStatus(status: Status) {
    if (!activeSongId) return;
    const updated = await api.updateSong(activeSongId, { status });
    setSongs((prev) => prev.map((song) => (song.id === updated.id ? updated : song)));
  }

  async function handleCreateSong(input: Parameters<typeof api.createSong>[0]) {
    const created = await api.createSong(input);
    setSongs((prev) => [...prev, created].sort((a, b) => a.title.localeCompare(b.title)));
    await openSong(created);
  }

  async function handleSavePlaylist(input: {
    id?: string;
    name: string;
    description: string;
    songIds: string[];
    artHue: number;
  }) {
    if (input.id) {
      const updated = await api.updatePlaylist(input.id, {
        name: input.name,
        description: input.description,
        songIds: input.songIds,
        artHue: input.artHue,
      });
      setPlaylists((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      return updated;
    }
    const created = await api.createPlaylist({
      name: input.name,
      description: input.description,
      songIds: input.songIds,
      artHue: input.artHue,
    });
    setPlaylists((prev) => [...prev, created]);
    return created;
  }

  async function handleDeletePlaylist(id: string) {
    await api.deletePlaylist(id);
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
  }

  const navScreen = screen === "sheet" ? sheetReturnTo : screen;

  return (
    <div className="min-h-dvh font-body text-text md:flex md:items-start">
      <DesktopSidebar screen={navScreen} onNavigate={navigate} />

      <main className="min-w-0 flex-1 md:min-h-dvh md:overflow-y-auto">
        {loading && (
          <div className="flex min-h-dvh items-center justify-center text-sm text-muted">
            Loading library…
          </div>
        )}
        {!loading && error && (
          <div className="mx-auto max-w-lg px-6 py-16 text-center">
            <p className="text-lg font-semibold">Couldn’t load Fretwork</p>
            <p className="mt-2 text-sm text-muted">{error}</p>
            <button
              type="button"
              className="btn-accent mt-6 rounded-pill px-5 py-2.5 text-sm"
              onClick={() => {
                setLoading(true);
                setError(null);
                refresh()
                  .catch((err) =>
                    setError(err instanceof Error ? err.message : "Failed to load library"),
                  )
                  .finally(() => setLoading(false));
              }}
            >
              Retry
            </button>
          </div>
        )}
        {!loading && !error && (
          <>
            {screen === "library" && (
              <HomeScreen
                songs={songs}
                onOpenSong={openSong}
                onImportAppleTrack={async (track) => {
                  let chordPro: string | undefined;
                  let bpm: number | undefined;
                  let key: string | undefined;
                  try {
                    const [lyr, meta] = await Promise.all([
                      api.catalogLyrics(track.title, track.artist, track.durationMs),
                      api
                        .catalogAudioMeta(track.title, track.artist, track.durationMs)
                        .catch(() => null),
                    ]);
                    if (lyr.chordPro) chordPro = lyr.chordPro;
                    if (meta?.bpm) bpm = meta.bpm;
                    if (meta?.key) key = meta.key;
                  } catch {
                    // lyrics / meta optional
                  }
                  const created = await api.createSong({
                    title: track.title,
                    artist: track.artist,
                    genre: track.genre || "Other",
                    status: "want",
                    hasArt: Boolean(track.artworkUrl),
                    artHue: track.artHue,
                    artworkUrl: track.artworkUrl,
                    appleMusicId: track.id,
                    chordPro,
                    bpm,
                    key,
                    links: [
                      {
                        label: "Apple Music",
                        url:
                          track.url ||
                          `https://music.apple.com/us/search?term=${encodeURIComponent(`${track.title} ${track.artist}`)}`,
                        type: "other",
                      },
                    ],
                  });
                  setSongs((prev) =>
                    [...prev, created].sort((a, b) => a.title.localeCompare(b.title)),
                  );
                }}
              />
            )}
            {screen === "tracks" && (
              <TracksScreen
                songs={songs}
                query={query}
                onQueryChange={setQuery}
                onOpenSong={openSong}
              />
            )}
            {screen === "playlists" && (
              <PlaylistsScreen
                songs={songs}
                playlists={playlists}
                onOpenSong={openSong}
                onSavePlaylist={handleSavePlaylist}
                onDeletePlaylist={handleDeletePlaylist}
              />
            )}
            {screen === "sheet" && activeSong && (
              <SheetScreen
                song={activeSong}
                onBack={() => navigate(sheetReturnTo)}
                onStatusChange={updateSongStatus}
                onFocusModeChange={setSheetFocusMode}
                onUpdateSheet={async (input) => {
                  const yt = input.youtubeUrl.trim();
                  const links = activeSong.links.filter((l) => l.type !== "youtube");
                  if (yt) {
                    links.push({
                      label: "YouTube",
                      url: yt.startsWith("http") ? yt : `https://${yt}`,
                      type: "youtube",
                    });
                  }
                  const updated = await api.updateSong(activeSong.id, {
                    chordPro: input.chordPro,
                    style: input.style,
                    bpm: input.bpm,
                    key: input.key,
                    capo: input.capo,
                    links,
                  });
                  setSongs((prev) =>
                    prev.map((s) => (s.id === updated.id ? updated : s)),
                  );
                }}
                onDelete={async () => {
                  await api.deleteSong(activeSong.id);
                  setSongs((prev) => prev.filter((s) => s.id !== activeSong.id));
                  setPlaylists((prev) =>
                    prev.map((p) => ({
                      ...p,
                      songIds: p.songIds.filter((id) => id !== activeSong.id),
                    })),
                  );
                  navigate(sheetReturnTo);
                }}
              />
            )}
            {screen === "metronome" && <MetronomeScreen initialBpm={metronomeBpm} />}
            {screen === "add" && <AddScreen onCreate={handleCreateSong} />}
            {screen === "settings" && (
              <SettingsScreen theme={theme} onThemeChange={setTheme} />
            )}
          </>
        )}
      </main>

      {!sheetFocusMode && <MobileBottomNav screen={navScreen} onNavigate={navigate} />}
    </div>
  );
}
