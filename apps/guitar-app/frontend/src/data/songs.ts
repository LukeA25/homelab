import type { Song } from "../lib/types";

export const STYLE_LABELS: Record<Song["style"], string> = {
  fingerpicking: "Fingerpicking",
  chords: "Chords",
  mix: "Mix",
};

export const STATUS_LABELS: Record<Song["status"], string> = {
  know: "Know",
  learning: "Learning",
  rusty: "Rusty",
  want: "Want to learn",
};

export function daysSincePracticed(song: Song): number {
  const then = new Date(song.lastPracticed).getTime();
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}
