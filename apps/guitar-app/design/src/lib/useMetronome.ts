import { useEffect, useRef, useState } from "react";

const BLINK_MS = 120;

export function useMetronome(initialBpm: number, beatsPerBar = 4) {
  const [bpm, setBpm] = useState(initialBpm);
  const [playing, setPlaying] = useState(false);
  const [flashBeat, setFlashBeat] = useState<number | null>(null);
  const [beats, setBeats] = useState(beatsPerBar);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextNoteRef = useRef(0);
  const beatRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const bpmRef = useRef(bpm);
  const beatsRef = useRef(beats);

  useEffect(() => {
    setBpm(initialBpm);
  }, [initialBpm]);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    beatsRef.current = beats;
  }, [beats]);

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

  function toggle() {
    if (playing) stop();
    else start();
  }

  return {
    bpm,
    setBpm,
    playing,
    flashBeat,
    beats,
    setBeats,
    start,
    stop,
    toggle,
  };
}
