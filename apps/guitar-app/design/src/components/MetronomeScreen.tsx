import { Minus, Plus, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Page, PageHeader } from "./Page";

const MIN_BPM = 40;
const MAX_BPM = 220;
const BLINK_MS = 120;

type MetronomeScreenProps = {
  initialBpm?: number;
};

export function MetronomeScreen({ initialBpm = 92 }: MetronomeScreenProps) {
  const [bpm, setBpm] = useState(initialBpm);
  const [playing, setPlaying] = useState(false);
  const [flashBeat, setFlashBeat] = useState<number | null>(null);
  const [beatsPerBar, setBeatsPerBar] = useState(4);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextNoteRef = useRef(0);
  const beatRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const bpmRef = useRef(bpm);
  const beatsRef = useRef(beatsPerBar);

  useEffect(() => {
    setBpm(initialBpm);
  }, [initialBpm]);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    beatsRef.current = beatsPerBar;
  }, [beatsPerBar]);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      if (flashTimerRef.current != null) window.clearTimeout(flashTimerRef.current);
      void audioCtxRef.current?.close();
    };
  }, []);

  function ensureAudio() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }

  function click(accent: boolean) {
    const ctx = ensureAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = accent ? 1200 : 880;
    gain.gain.value = accent ? 0.18 : 0.1;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  function blink(index: number) {
    setFlashBeat(index);
    if (flashTimerRef.current != null) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => {
      setFlashBeat(null);
      flashTimerRef.current = null;
    }, BLINK_MS);
  }

  function schedule() {
    const ctx = ensureAudio();
    const secondsPerBeat = 60 / bpmRef.current;
    const lookAhead = 0.1;

    while (nextNoteRef.current < ctx.currentTime + lookAhead) {
      const beatIndex = beatRef.current % beatsRef.current;
      const accent = beatIndex === 0;
      const delay = Math.max(0, (nextNoteRef.current - ctx.currentTime) * 1000);
      window.setTimeout(() => {
        click(accent);
        blink(beatIndex);
      }, delay);

      nextNoteRef.current += secondsPerBeat;
      beatRef.current += 1;
    }

    timerRef.current = window.setTimeout(schedule, 25);
  }

  function start() {
    const ctx = ensureAudio();
    void ctx.resume();
    nextNoteRef.current = ctx.currentTime + 0.05;
    beatRef.current = 0;
    setFlashBeat(null);
    setPlaying(true);
    schedule();
  }

  function stop() {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (flashTimerRef.current != null) {
      window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
    setPlaying(false);
    setFlashBeat(null);
    beatRef.current = 0;
  }

  function nudge(delta: number) {
    setBpm((v) => Math.min(MAX_BPM, Math.max(MIN_BPM, v + delta)));
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Practice"
        title="Metronome"
        description="Keep time while you practice — works offline in the browser."
      />

      <div className="mx-auto grid max-w-xl gap-5">
        <section className="panel rounded-panel p-6 text-center sm:p-8">
          <p className="text-sm font-medium text-muted">Tempo</p>
          <p className="mt-2 font-mono text-6xl font-bold tabular-nums tracking-tight sm:text-7xl">
            {bpm}
          </p>
          <p className="mt-1 text-sm text-muted">BPM</p>

          <input
            type="range"
            min={MIN_BPM}
            max={MAX_BPM}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="mt-6 w-full accent-[var(--accent)]"
          />

          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => nudge(-1)}
              className="grid h-11 w-11 place-items-center rounded-full border border-border bg-surface"
              aria-label="Slower"
            >
              <Minus className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => (playing ? stop() : start())}
              className="btn-accent min-w-[9rem] rounded-pill px-8 py-3.5 text-sm shadow-glow"
            >
              {playing ? "Stop" : "Start"}
            </button>
            <button
              type="button"
              onClick={() => nudge(1)}
              className="grid h-11 w-11 place-items-center rounded-full border border-border bg-surface"
              aria-label="Faster"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-8 flex justify-center gap-3">
            {Array.from({ length: beatsPerBar }, (_, i) => {
              const lit = flashBeat === i;
              return (
                <span
                  key={i}
                  className={`h-3.5 w-3.5 rounded-full transition-all duration-75 ${
                    lit
                      ? "scale-150 border-2 border-accent bg-accent shadow-glow"
                      : "scale-100 border border-border bg-transparent"
                  }`}
                  style={lit ? { backgroundColor: "var(--accent)" } : undefined}
                />
              );
            })}
          </div>
        </section>

        <section className="panel rounded-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-accent" />
              <p className="text-sm font-semibold">Time signature</p>
            </div>
            <div className="flex gap-2">
              {[3, 4, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setBeatsPerBar(n)}
                  className={`rounded-pill px-3 py-1.5 text-sm ${
                    beatsPerBar === n
                      ? "btn-accent"
                      : "border border-border bg-surface text-muted"
                  }`}
                >
                  {n}/4
                </button>
              ))}
            </div>
          </div>
          <p className="mt-3 text-sm text-muted">
            Each beat flashes the next circle, then goes dark until it comes around again.
          </p>
        </section>
      </div>
    </Page>
  );
}
