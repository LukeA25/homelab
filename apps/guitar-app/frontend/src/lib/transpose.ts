const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const FLAT_TO_SHARP: Record<string, string> = {
  Db: "C#",
  Eb: "D#",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#",
};

const CHORD_TOKEN_RE =
  /(?:N\.?C\.?|[A-G](?:#|b)?(?:maj|min|m|dim|aug|sus|add|maj7|m7|7|9|11|13|6|2|4|5|maj9|m9|m6|dim7|aug7|sus2|sus4)*(?:\/[A-G](?:#|b)?)?)\*?/gi;

function normalizeRoot(root: string): string {
  if (FLAT_TO_SHARP[root]) return FLAT_TO_SHARP[root];
  return root;
}

/** Transpose a chord name; preserves a trailing UG * annotation if present. */
export function transposeChord(chord: string, semitones: number): string {
  const starred = /\*+$/.test(chord);
  const cleaned = chord.replace(/\*+$/, "");
  if (!cleaned || /^N\.?C\.?$/i.test(cleaned)) return cleaned + (starred ? "*" : "");
  if (semitones === 0) return cleaned + (starred ? "*" : "");
  const next = cleaned
    .split("/")
    .map((part) => {
      const match = part.match(/^([A-G][b#]?)(.*)$/);
      if (!match) return part;
      const root = normalizeRoot(match[1]);
      const suffix = match[2];
      const idx = NOTES.indexOf(root as (typeof NOTES)[number]);
      if (idx === -1) return part;
      const tone = NOTES[(idx + semitones + 120) % 12];
      return `${tone}${suffix}`;
    })
    .join("/");
  return next + (starred ? "*" : "");
}

export function transposeKey(key: string, semitones: number): string {
  return transposeChord(key, semitones);
}

/** Transpose chord tokens in a UG-spaced chord line; keeps whitespace and * intact. */
export function transposeChordLine(line: string, semitones: number): string {
  if (!line) return line;
  if (!semitones) return line;
  return line.replace(CHORD_TOKEN_RE, (token) => transposeChord(token, semitones));
}
