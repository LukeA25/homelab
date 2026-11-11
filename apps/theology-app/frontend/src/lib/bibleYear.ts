/**
 * Bible in a Year catalog plus one audio element that survives tab switches.
 * The episode file is streamed from the podcast URL; it is not stored.
 */

import { useSyncExternalStore } from "react";
import {
  getBibleYear,
  updateBibleYear,
  type BibleYearDay,
  type BibleYearPlan,
  type BibleYearProgress,
} from "./api";

type PlanState = {
  plan: BibleYearPlan | null;
  error: string | null;
  loading: boolean;
};

type PlayerState = {
  day: number | null;
  title: string;
  audioUrl: string;
  playing: boolean;
  currentTime: number;
  duration: number;
  ended: boolean;
  error: string | null;
};

const planListeners = new Set<() => void>();
const playerListeners = new Set<() => void>();

let planState: PlanState = { plan: null, error: null, loading: false };
let playerState: PlayerState = {
  day: null,
  title: "",
  audioUrl: "",
  playing: false,
  currentTime: 0,
  duration: 0,
  ended: false,
  error: null,
};

const positions = new Map<number, number>();
let audio: HTMLAudioElement | null = null;
let lastSavedAt = 0;

function emitPlan() {
  planListeners.forEach((listener) => listener());
}

function emitPlayer() {
  playerListeners.forEach((listener) => listener());
}

function setPlayer(patch: Partial<PlayerState>) {
  playerState = { ...playerState, ...patch };
  emitPlayer();
}

function applyProgress(progress: BibleYearProgress) {
  if (!planState.plan) return;
  planState = {
    ...planState,
    plan: { ...planState.plan, ...progress },
  };
  for (const [day, seconds] of Object.entries(progress.positions)) {
    positions.set(Number(day), seconds);
  }
  emitPlan();
}

export function positionFor(day: number): number {
  if (positions.has(day)) return positions.get(day) ?? 0;
  const saved = planState.plan?.positions[String(day)];
  return typeof saved === "number" ? saved : 0;
}

export function loadBibleYear() {
  if (planState.loading || planState.plan) return;
  planState = { ...planState, loading: true, error: null };
  emitPlan();
  void getBibleYear()
    .then((plan) => {
      for (const [day, seconds] of Object.entries(plan.positions)) {
        positions.set(Number(day), seconds);
      }
      planState = { plan, error: null, loading: false };
      emitPlan();
    })
    .catch((err: unknown) => {
      planState = {
        plan: null,
        error: err instanceof Error ? err.message : "Could not load Bible in a Year",
        loading: false,
      };
      emitPlan();
    });
}

export function retryBibleYear() {
  planState = { plan: null, error: null, loading: false };
  emitPlan();
  loadBibleYear();
}

export async function setDayCompleted(day: number, completed: boolean) {
  const progress = await updateBibleYear({ day, completed });
  applyProgress(progress);
  return progress;
}

export async function setCurrentDay(day: number) {
  const progress = await updateBibleYear({ currentDay: day });
  applyProgress(progress);
  return progress;
}

function rememberPosition(day: number, seconds: number) {
  const safe = Math.max(0, seconds);
  positions.set(day, safe);
  void updateBibleYear({ day, positionSeconds: safe }).catch(() => undefined);
}

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio;
  const element = new Audio();
  element.preload = "metadata";
  element.addEventListener("timeupdate", () => {
    const current = element.currentTime || 0;
    playerState = {
      ...playerState,
      currentTime: current,
      duration: Number.isFinite(element.duration) ? element.duration : playerState.duration,
    };
    emitPlayer();
    if (playerState.day != null && current - lastSavedAt >= 5) {
      lastSavedAt = current;
      rememberPosition(playerState.day, current);
    }
  });
  element.addEventListener("play", () => setPlayer({ playing: true, ended: false, error: null }));
  element.addEventListener("pause", () => {
    const day = playerState.day;
    const time = element.currentTime || 0;
    setPlayer({ playing: false, currentTime: time });
    // Changing episode src pauses the element and resets its clock. Don't
    // replace a real saved position with that zero.
    if (day == null) return;
    if (time < 0.5 && positionFor(day) > 1) return;
    rememberPosition(day, time);
  });
  element.addEventListener("ended", () => {
    setPlayer({ playing: false, ended: true, currentTime: element.duration || playerState.currentTime });
    if (playerState.day != null) rememberPosition(playerState.day, element.duration || 0);
  });
  element.addEventListener("loadedmetadata", () => {
    setPlayer({ duration: element.duration || 0 });
  });
  element.addEventListener("error", () => {
    setPlayer({ playing: false, error: "This episode couldn't be played." });
  });
  audio = element;
  return element;
}

export function playDay(day: BibleYearDay) {
  if (!day.audioUrl) return;
  const element = ensureAudio();
  const switching = playerState.day !== day.day;
  if (switching) {
    if (playerState.day != null) rememberPosition(playerState.day, element.currentTime || 0);
    const resumeAt = positionFor(day.day);
    element.src = day.audioUrl;
    lastSavedAt = resumeAt;
    if (resumeAt > 1) {
      const seek = () => {
        element.currentTime = resumeAt;
      };
      element.addEventListener("loadedmetadata", seek, { once: true });
    }
    playerState = {
      day: day.day,
      title: day.title,
      audioUrl: day.audioUrl,
      playing: true,
      currentTime: resumeAt,
      duration: 0,
      ended: false,
      error: null,
    };
    emitPlayer();
  } else if (playerState.ended) {
    element.currentTime = 0;
    setPlayer({ ended: false, currentTime: 0 });
  }
  void element.play().catch(() => {
    setPlayer({ playing: false, error: "Press play again to start the episode." });
  });
}

export function togglePlayback() {
  if (!playerState.audioUrl) return;
  const element = ensureAudio();
  if (!element.paused && !playerState.ended) {
    element.pause();
    return;
  }
  if (playerState.ended) element.currentTime = 0;
  void element.play().catch(() => {
    setPlayer({ playing: false, error: "Press play again to start the episode." });
  });
}

export function seekPlayback(seconds: number) {
  if (!playerState.audioUrl) return;
  const element = ensureAudio();
  const next = Math.max(0, seconds);
  element.currentTime = next;
  lastSavedAt = next;
  setPlayer({ currentTime: next, ended: false });
  if (playerState.day != null) rememberPosition(playerState.day, next);
}

export function useBibleYearPlan(): PlanState {
  return useSyncExternalStore(
    (listener) => {
      planListeners.add(listener);
      return () => planListeners.delete(listener);
    },
    () => planState,
    () => planState,
  );
}

export function useBibleYearPlayer(): PlayerState {
  return useSyncExternalStore(
    (listener) => {
      playerListeners.add(listener);
      return () => playerListeners.delete(listener);
    },
    () => playerState,
    () => playerState,
  );
}
