import { useEffect, useState } from "react";
import { AddScreen } from "./components/AddScreen";
import { DesktopSidebar, MobileBottomNav } from "./components/AppNav";
import { HomeScreen } from "./components/HomeScreen";
import { MetronomeScreen } from "./components/MetronomeScreen";
import { PlaylistsScreen } from "./components/PlaylistsScreen";
import { SettingsScreen } from "./components/SettingsScreen";
import { SheetScreen } from "./components/SheetScreen";
import { TracksScreen } from "./components/TracksScreen";
import { MOCK_SONGS } from "./data/songs";
import type { Screen, Song, Status, ThemeId } from "./lib/types";

const THEME_KEY = "fretwork-theme-v3";

function readTheme(): ThemeId {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "teal" || stored === "purple" || stored === "amber") return stored;
  return "purple";
}

export default function App() {
  const [theme, setTheme] = useState<ThemeId>(readTheme);
  const [screen, setScreen] = useState<Screen>("library");
  const [sheetReturnTo, setSheetReturnTo] = useState<Exclude<Screen, "sheet">>("library");
  const [songs, setSongs] = useState<Song[]>(() => MOCK_SONGS.map((s) => ({ ...s })));
  const [activeSongId, setActiveSongId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [metronomeBpm, setMetronomeBpm] = useState(92);

  const activeSong = songs.find((s) => s.id === activeSongId) ?? null;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    if (meta && bg) meta.setAttribute("content", bg);
  }, [theme]);

  function navigate(next: Screen) {
    if (next !== "sheet") setActiveSongId(null);
    setScreen(next);
  }

  function openSong(song: Song) {
    if (screen !== "sheet") {
      setSheetReturnTo(screen as Exclude<Screen, "sheet">);
    }
    setActiveSongId(song.id);
    setMetronomeBpm(song.bpm);
    setScreen("sheet");
  }

  function updateSongStatus(status: Status) {
    if (!activeSongId) return;
    setSongs((prev) =>
      prev.map((song) => (song.id === activeSongId ? { ...song, status } : song)),
    );
  }

  const navScreen = screen === "sheet" ? sheetReturnTo : screen;

  return (
    <div className="min-h-dvh font-body text-text md:flex md:items-start">
      <DesktopSidebar screen={navScreen} onNavigate={navigate} />

      <main className="min-w-0 flex-1 md:min-h-dvh md:overflow-y-auto">
        {screen === "library" && (
          <HomeScreen
            songs={songs}
            query={query}
            onQueryChange={setQuery}
            onOpenSong={openSong}
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
          <PlaylistsScreen songs={songs} onOpenSong={openSong} />
        )}
        {screen === "sheet" && activeSong && (
          <SheetScreen
            song={activeSong}
            onBack={() => navigate(sheetReturnTo)}
            onStatusChange={updateSongStatus}
          />
        )}
        {screen === "metronome" && <MetronomeScreen initialBpm={metronomeBpm} />}
        {screen === "add" && <AddScreen />}
        {screen === "settings" && (
          <SettingsScreen theme={theme} onThemeChange={setTheme} />
        )}
      </main>

      <MobileBottomNav screen={navScreen} onNavigate={navigate} />
    </div>
  );
}
