const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const FLAT_TO_SHARP: Record<string, string> = {
  Db: "C#",
  Eb: "D#",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#",
};

function normalizeRoot(root: string): string {
  if (FLAT_TO_SHARP[root]) return FLAT_TO_SHARP[root];
  return root;
}

export function transposeChord(chord: string, semitones: number): string {
  if (!chord || chord === "N.C.") return chord;
  const match = chord.match(/^([A-G][b#]?)(.*)$/);
  if (!match) return chord;
  const root = normalizeRoot(match[1]);
  const suffix = match[2];
  const idx = NOTES.indexOf(root as (typeof NOTES)[number]);
  if (idx === -1) return chord;
  const next = NOTES[(idx + semitones + 120) % 12];
  return `${next}${suffix}`;
}

export function transposeKey(key: string, semitones: number): string {
  return transposeChord(key, semitones);
}
