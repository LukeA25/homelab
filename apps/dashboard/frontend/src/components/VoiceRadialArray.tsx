import { useEffect, useRef, type RefObject } from "react";
import type { VoicePhase } from "@/lib/assistantClient";

const SIZE = 280;
const TAU = 2 * Math.PI;
const MINT = "#9ce9ac";
const AMBER = "#ffc071";
const ROUTES = [
  [[21, 0], [98, 0]],
  [[30, 4], [62, 4], [72, 14], [91, 14]],
  [[33, -5], [55, -5], [66, -16], [82, -16]],
] as const;
const SIGNAL_ROUTES = ROUTES.map((route) => [[0, 0] as const, ...route]);
const PULSE_LIFETIME = 0.8;

type Pulse = { born: number; arm: number; path: number; listening: boolean };
type Band = { angle: number; activity: number };
type Point = readonly [number, number];

function arc(ctx: CanvasRenderingContext2D, radius: number, start: number, end: number, color: string, width: number) {
  ctx.beginPath();
  ctx.arc(0, 0, radius, start, end);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawPulse(ctx: CanvasRenderingContext2D, route: readonly Point[], progress: number, color: string) {
  const lengths = route.slice(1).map(([x, y], i) => Math.hypot(x - route[i][0], y - route[i][1]));
  let distance = progress * lengths.reduce((total, length) => total + length, 0);
  for (const [i, length] of lengths.entries()) {
    if (distance <= length) {
      const [x, y] = route[i];
      const [nextX, nextY] = route[i + 1];
      ctx.fillStyle = ctx.shadowColor = color;
      ctx.shadowBlur = 7;
      ctx.beginPath();
      ctx.arc(x + (nextX - x) * distance / length, y + (nextY - y) * distance / length, 2.2, 0, TAU);
      ctx.fill();
      return;
    }
    distance -= length;
  }
}

function blend(from: number[], to: number[], amount: number) {
  return from.map((value, i) => Math.round(value + (to[i] - value) * amount)).join(",");
}

function drawArray(ctx: CanvasRenderingContext2D, time: number, energy: number, tint: number, amber: Band, mint: Band, pulses: Pulse[]) {
  const core = blend([255, 186, 92], [158, 244, 178], tint);
  const highlight = blend([255, 242, 205], [234, 255, 237], tint);
  const radius = 46 + 35 * energy + 3 * Math.sin(time * 1.4);
  const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, radius);
  glow.addColorStop(0, `rgba(${core},${0.23 + 0.47 * energy})`);
  glow.addColorStop(0.42, `rgba(${core},${0.07 + 0.17 * energy})`);
  glow.addColorStop(1, `rgba(${core},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);

  arc(ctx, 103, 0, TAU, "#709a7c", 1.1);
  arc(ctx, 131, 0, TAU, "#709a7c", 1.1);
  for (let i = 0; i < 4; i++) {
    const orbit = i * TAU / 4 + time * 0.13;
    arc(ctx, 120, orbit, orbit + 1.05, "#a0e9ad", 1.8);
    const start = i * TAU / 4 + amber.angle;
    arc(ctx, 109, start, start + TAU / 10, AMBER, 2.7 + 1.7 * amber.activity);
  }
  for (let i = 0; i < 3; i++) {
    const start = i * TAU / 3 + mint.angle;
    arc(ctx, 125, start, start + 1.38, "#81bc95", 1.1 + 0.8 * mint.activity);
    arc(ctx, 128, start, start + 0.24, MINT, 2 + 1.5 * mint.activity);
  }
  for (let arm = 0; arm < 8; arm++) {
    ctx.save();
    ctx.rotate(arm * TAU / 8);
    ROUTES.forEach((route, i) => {
      const [startX, startY] = route[0];
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      route.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.strokeStyle = i === 0 ? MINT : "#5c9772";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      const [x, y] = route[route.length - 1];
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, TAU);
      ctx.stroke();
    });
    ctx.restore();
  }

  ctx.save();
  ctx.rotate(-time * 0.047);
  for (let i = 0; i < 60; i++) {
    ctx.rotate(TAU / 60);
    ctx.fillStyle = i % 5 ? "#41644e" : "#9cc7a4";
    ctx.fillRect(116, 0, i % 5 ? 2 : 5, 1);
  }
  ctx.restore();

  for (const pulse of pulses) {
    ctx.save();
    ctx.rotate(pulse.arm * TAU / 8);
    const progress = (time - pulse.born) / PULSE_LIFETIME;
    drawPulse(ctx, SIGNAL_ROUTES[pulse.path], pulse.listening ? 1 - progress : progress, pulse.listening ? MINT : AMBER);
    ctx.restore();
  }

  const coreRadius = 17 + Math.sin(time * 1.7) + energy * 9;
  const gradient = ctx.createRadialGradient(0, 0, 1, 0, 0, coreRadius);
  gradient.addColorStop(0, `rgb(${highlight})`);
  gradient.addColorStop(0.56, `rgb(${core})`);
  gradient.addColorStop(1, `rgba(${core},0.32)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, coreRadius, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    const start = time * 0.31 + i * TAU / 4;
    arc(ctx, coreRadius + 4, start, start + 1.03, `rgb(${core})`, 1.6);
  }
}

function rms(samples: Float32Array) {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.min(1, Math.sqrt(sum / Math.max(1, samples.length)) * 4);
}

type Props = {
  phase: VoicePhase;
  streamRef: RefObject<MediaStream>;
  audioRef: RefObject<HTMLAudioElement>;
};

export function VoiceRadialArray({ phase, streamRef, audioRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentPhase = useRef(phase);
  currentPhase.current = phase;
  const readLevel = useRef<(() => number) | null>(null);

  useEffect(() => {
    const stream = streamRef.current;
    const audio = audioRef.current;
    let context: AudioContext | undefined;
    let active = true;
    try {
      if (phase === "listening" && stream) {
        context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        context.createMediaStreamSource(stream).connect(analyser);
        const samples = new Float32Array(512);
        readLevel.current = () => {
          analyser.getFloatTimeDomainData(samples);
          return rms(samples);
        };
        void context.resume().catch(() => undefined);
      } else if (phase === "speaking" && audio) {
        // Decode a copy for metering. The existing audio element still owns playback.
        const binary = atob(audio.src.slice(audio.src.indexOf(",") + 1));
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        const decoder = new OfflineAudioContext(1, 1, 44_100);
        void decoder.decodeAudioData(bytes.buffer).then((buffer) => {
          if (!active) return;
          const samples = buffer.getChannelData(0);
          readLevel.current = () => {
            const offset = Math.floor(audio.currentTime * buffer.sampleRate);
            return audio.paused ? 0 : rms(samples.subarray(offset, offset + 512));
          };
        }).catch(() => undefined);
      }
    } catch {
      // Phase-based animation remains available when audio metering is unsupported.
    }
    return () => {
      active = false;
      readLevel.current = null;
      void context?.close().catch(() => undefined);
    };
  }, [phase, streamRef, audioRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const amber = { activity: 0, angle: 0 };
    const mint = { activity: 0, angle: 0 };
    let pulses: Pulse[] = [];
    let frame = 0;
    let last = 0;
    let time = 0;
    let energy = 0;
    let tint = 0;
    let step = 0;
    let nextPulse = 0;

    const draw = () => {
      const size = Math.round(canvas.clientWidth * Math.min(devicePixelRatio, 2));
      if (!size) return;
      if (canvas.width !== size) canvas.width = canvas.height = size;
      const scale = size / SIZE;
      ctx.setTransform(scale, 0, 0, scale, size / 2, size / 2);
      ctx.clearRect(-SIZE / 2, -SIZE / 2, SIZE, SIZE);
      drawArray(ctx, time, energy, tint, amber, mint, pulses);
    };

    const tick = (now: number) => {
      const elapsed = last ? (now - last) / 1000 : 1 / 30;
      if (elapsed >= 1 / 32) {
        last = now;
        const dt = Math.min(0.1, elapsed);
        time += dt;
        const listening = currentPhase.current === "listening" || currentPhase.current === "wake";
        const speaking = currentPhase.current === "speaking";
        const level = listening || speaking
          ? readLevel.current?.() ?? (0.25 + 0.35 * Math.abs(Math.sin(time * 8.6)))
          : 0;
        energy += (level - energy) * (1 - Math.exp(-dt / (level > energy ? 0.07 : 0.2)));
        tint += (Number(listening) - tint) * (1 - Math.exp(-dt / 0.105));
        const active = level >= 0.085;
        amber.activity += (Number(active && speaking) - amber.activity) * (1 - Math.exp(-dt / 0.11));
        mint.activity += (Number(active && listening) - mint.activity) * (1 - Math.exp(-dt / 0.11));
        amber.angle += 0.06 * (1 + 0.4 * amber.activity) * dt;
        mint.angle -= 0.19 * (1 + 0.4 * mint.activity) * dt;
        pulses = pulses.filter(({ born }) => time - born < PULSE_LIFETIME);
        if (!active) nextPulse = time;
        else if (time >= nextPulse) {
          for (const offset of [0, 4]) {
            pulses.push({ born: time, arm: (step * 3 + offset) % 8, path: Math.floor(step / 4) % ROUTES.length, listening });
          }
          step++;
          nextPulse = time + 0.2 - 0.11 * level;
        }
        draw();
      }
      frame = requestAnimationFrame(tick);
    };

    const syncMotion = () => {
      cancelAnimationFrame(frame);
      last = 0;
      if (motion.matches) {
        pulses = [];
        energy = tint = 0;
        draw();
      } else {
        frame = requestAnimationFrame(tick);
      }
    };
    const resize = new ResizeObserver(draw);
    resize.observe(canvas);
    motion.addEventListener("change", syncMotion);
    syncMotion();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      motion.removeEventListener("change", syncMotion);
    };
  }, []);

  return <canvas ref={canvasRef} width={322} height={322} aria-hidden="true" />;
}
