import { Home, ListMusic, Library, Plus, Settings2, Timer } from "lucide-react";
import type { Screen } from "../lib/types";

type AppNavProps = {
  screen: Screen;
  onNavigate: (screen: Screen) => void;
};

const ITEMS: {
  id: Exclude<Screen, "sheet">;
  label: string;
  short: string;
  icon: typeof Home;
}[] = [
  { id: "library", label: "Home", short: "Home", icon: Home },
  { id: "tracks", label: "All tracks", short: "Tracks", icon: Library },
  { id: "playlists", label: "Playlists", short: "Lists", icon: ListMusic },
  { id: "metronome", label: "Metronome", short: "Tempo", icon: Timer },
  { id: "add", label: "Add song", short: "Add", icon: Plus },
  { id: "settings", label: "Themes", short: "Themes", icon: Settings2 },
];

function isActive(screen: Screen, id: Exclude<Screen, "sheet">) {
  return screen === id || (id === "library" && screen === "sheet");
}

export function DesktopSidebar({ screen, onNavigate }: AppNavProps) {
  return (
    <aside className="hidden md:sticky md:top-0 md:flex md:h-dvh md:w-[15.5rem] md:shrink-0 md:flex-col md:self-start md:p-4 lg:w-64">
      <div className="panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel px-4 py-6">
        <div className="mb-8 shrink-0 px-2">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-accent text-sm font-extrabold text-ink shadow-glow-sm">
              F
            </span>
            <div>
              <p className="text-base font-bold leading-tight">Fretwork</p>
              <p className="text-xs text-muted">Your repertoire</p>
            </div>
          </div>
        </div>

        <p className="mb-2 shrink-0 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Menu
        </p>
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {ITEMS.map(({ id, label, icon: Icon }) => {
            const active = isActive(screen, id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm transition ${
                  active
                    ? "btn-accent shadow-glow-sm"
                    : "text-muted hover:bg-surface hover:text-text"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
                {label}
              </button>
            );
          })}
        </nav>

        <div className="mt-4 shrink-0 rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold">Tip</p>
          <p className="mt-1 text-xs text-muted">
            Open a song sheet for chords, lyrics, and BPM — then use Metronome to lock tempo.
          </p>
        </div>
      </div>
    </aside>
  );
}

export function MobileBottomNav({ screen, onNavigate }: AppNavProps) {
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden">
      <div className="pointer-events-auto panel flex w-full max-w-lg items-center justify-around rounded-pill px-1 py-1.5">
        {ITEMS.map(({ id, short, icon: Icon }) => {
          const active = isActive(screen, id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              className={`flex min-w-[2.75rem] flex-col items-center gap-0.5 rounded-pill px-1.5 py-1.5 transition ${
                active ? "btn-accent shadow-glow-sm" : "text-muted hover:text-text"
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={active ? 2.4 : 1.8} />
              <span className="text-[9px] font-medium tracking-wide">{short}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
