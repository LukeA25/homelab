import { Minus, Plus } from "lucide-react";
import { useMetronome } from "../lib/useMetronome";

const MIN_BPM = 40;
const MAX_BPM = 220;

type MiniMetronomeProps = {
  bpm: number;
  className?: string;
  compact?: boolean;
};

export function MiniMetronome({ bpm: songBpm, className = "", compact = false }: MiniMetronomeProps) {
  const { bpm, setBpm, playing, flashBeat, beats, toggle } = useMetronome(songBpm, 4);

  function nudge(delta: number) {
    setBpm((v) => Math.min(MAX_BPM, Math.max(MIN_BPM, v + delta)));
  }

  if (compact) {
    return (
      <div className={`panel flex h-full flex-col justify-between rounded-2xl p-2.5 ${className}`}>
        <div className="flex items-center justify-between gap-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Tempo</p>
          <button
            type="button"
            onClick={toggle}
            className={`rounded-pill px-2.5 py-0.5 text-[10px] font-semibold ${
              playing ? "border border-border bg-surface text-text" : "btn-accent"
            }`}
          >
            {playing ? "Stop" : "Start"}
          </button>
        </div>

        <div className="my-1.5 flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={() => nudge(-1)}
            className="grid h-7 w-7 place-items-center rounded-full border border-border bg-surface"
            aria-label="Slower"
          >
            <Minus className="h-3 w-3" />
          </button>
          <div className="text-center">
            <p className="font-mono text-lg font-bold tabular-nums leading-none">{bpm}</p>
            <p className="text-[9px] text-muted">BPM</p>
          </div>
          <button
            type="button"
            onClick={() => nudge(1)}
            className="grid h-7 w-7 place-items-center rounded-full border border-border bg-surface"
            aria-label="Faster"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>

        <div className="flex justify-center gap-1.5">
          {Array.from({ length: beats }, (_, i) => {
            const lit = flashBeat === i;
            return (
              <span
                key={i}
                className={`h-2 w-2 rounded-full transition-all duration-75 ${
                  lit
                    ? "scale-150 border-2 border-accent shadow-glow-sm"
                    : "scale-100 border border-border bg-transparent"
                }`}
                style={lit ? { backgroundColor: "var(--accent)" } : undefined}
              />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={`panel rounded-panel p-3 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Metronome</p>
        <button
          type="button"
          onClick={toggle}
          className={`rounded-pill px-3 py-1 text-xs font-semibold ${
            playing ? "border border-border bg-surface text-text" : "btn-accent"
          }`}
        >
          {playing ? "Stop" : "Start"}
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => nudge(-1)}
          className="grid h-8 w-8 place-items-center rounded-full border border-border bg-surface"
          aria-label="Slower"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>

        <div className="text-center">
          <p className="font-mono text-xl font-bold tabular-nums leading-none">{bpm}</p>
          <p className="text-[10px] text-muted">BPM</p>
        </div>

        <button
          type="button"
          onClick={() => nudge(1)}
          className="grid h-8 w-8 place-items-center rounded-full border border-border bg-surface"
          aria-label="Faster"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3 flex justify-center gap-2">
        {Array.from({ length: beats }, (_, i) => {
          const lit = flashBeat === i;
          return (
            <span
              key={i}
              className={`h-2.5 w-2.5 rounded-full transition-all duration-75 ${
                lit
                  ? "scale-150 border-2 border-accent shadow-glow-sm"
                  : "scale-100 border border-border bg-transparent"
              }`}
              style={lit ? { backgroundColor: "var(--accent)" } : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
