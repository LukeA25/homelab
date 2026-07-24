import guitar from "@tombatossals/chords-db/lib/guitar";
import { lookupExtraChord } from "./extraChords";

export type ChordPosition = {
  frets: number[];
  fingers: number[];
  baseFret: number;
  barres?: number[];
  capo?: boolean;
};

type ChordEntry = {
  key: string;
  suffix: string;
  positions: ChordPosition[];
};

const db = guitar as {
  keys: string[];
  suffixes: string[];
  chords: Record<string, ChordEntry[]>;
};

const FLAT_TO_SHARP: Record<string, string> = {
  Db: "C#",
  Eb: "D#",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#",
};

/** Map display root → chords-db key name */
const KEY_ALIASES: Record<string, string> = {
  "C#": "Csharp",
  "D#": "Eb",
  "F#": "Fsharp",
  "G#": "Ab",
  "A#": "Bb",
};

/** Bass note spelling as used in chords-db slash suffixes */
const BASS_FOR_DB: Record<string, string> = {
  C: "C",
  "C#": "C#",
  Db: "C#",
  D: "D",
  "D#": "D#",
  Eb: "D#",
  E: "E",
  F: "F",
  "F#": "F#",
  Gb: "F#",
  G: "G",
  "G#": "G#",
  Ab: "G#",
  A: "A",
  "A#": "Bb",
  Bb: "Bb",
  B: "B",
};

const SUFFIX_MAP: Record<string, string> = {
  "": "major",
  maj: "major",
  major: "major",
  M: "major",
  m: "minor",
  min: "minor",
  minor: "minor",
  dim: "dim",
  o: "dim",
  aug: "aug",
  "+": "aug",
  sus: "sus4",
  sus2: "sus2",
  sus4: "sus4",
  "7": "7",
  maj7: "maj7",
  M7: "maj7",
  Δ: "maj7",
  Δ7: "maj7",
  m7: "m7",
  min7: "m7",
  dim7: "dim7",
  aug7: "aug7",
  "9": "9",
  maj9: "maj9",
  m9: "m9",
  "6": "6",
  m6: "m6",
  add9: "add9",
  add2: "add9",
  "2": "add9",
  "11": "11",
  "13": "13",
  "7sus4": "7sus4",
  "7sus": "7sus4",
  "5": "5",
  m7b5: "m7b5",
  "ø": "m7b5",
  "ø7": "m7b5",
};

function normalizeRoot(root: string): string {
  const capped = root[0]!.toUpperCase() + root.slice(1);
  return FLAT_TO_SHARP[capped] ?? capped;
}

function dbKeyName(root: string): string {
  const n = normalizeRoot(root);
  return KEY_ALIASES[n] ?? n;
}

function bassForDb(bass: string): string {
  const capped = bass[0]!.toUpperCase() + bass.slice(1);
  return BASS_FOR_DB[capped] ?? BASS_FOR_DB[normalizeRoot(capped)] ?? capped;
}

/** Map quality + optional bass → chords-db / extras suffix candidates (best first). */
function suffixCandidates(quality: string, bass: string | undefined): string[] {
  if (!bass) return [quality];
  const b = bassForDb(bass);
  const out: string[] = [];
  if (quality === "major") {
    out.push(`/${b}`);
  } else if (quality === "minor") {
    out.push(`m/${b}`);
  } else {
    out.push(`${quality}/${b}`);
    // common fallbacks: treat as major/minor slash if quality unknown in db
    if (quality.startsWith("m") && quality !== "maj7" && quality !== "maj9") {
      out.push(`m/${b}`);
    } else {
      out.push(`/${b}`);
    }
  }
  out.push(quality);
  return [...new Set(out)];
}

/** Parse "D/F#", "Gmaj7", "Am/E", "Asus4" → key + suffix candidates for lookup */
export function parseChordName(
  raw: string,
): { key: string; suffix: string; suffixes: string[]; label: string } | null {
  const label = raw.trim();
  // UG annotation * — keep on label, ignore for shape lookup
  const chord = label.replace(/\*+$/, "");
  if (!chord || /^N\.?C\.?$/i.test(chord)) return null;
  const match = chord.match(/^([A-G][b#]?)([^/]*)(?:\/([A-G][b#]?))?$/i);
  if (!match) return null;

  const root = match[1]![0]!.toUpperCase() + match[1]!.slice(1);
  const qualityRaw = match[2] || "";
  const bassRaw = match[3];

  const mapped =
    SUFFIX_MAP[qualityRaw] ??
    SUFFIX_MAP[qualityRaw.toLowerCase()] ??
    (qualityRaw ? qualityRaw : "major");

  const bass = bassRaw ? bassRaw[0]!.toUpperCase() + bassRaw.slice(1) : undefined;
  const suffixes = suffixCandidates(mapped, bass);

  return {
    key: root,
    suffix: suffixes[0]!,
    suffixes,
    label,
  };
}

function findEntry(
  entries: ChordEntry[],
  suffix: string,
): ChordEntry | undefined {
  return (
    entries.find((e) => e.suffix === suffix) ??
    entries.find((e) => e.suffix.toLowerCase() === suffix.toLowerCase())
  );
}

export function lookupChordPosition(
  chordName: string,
  positionIndex = 0,
): { label: string; position: ChordPosition } | null {
  const parsed = parseChordName(chordName);
  if (!parsed) return null;
  const keyName = dbKeyName(parsed.key);
  const entries = db.chords[keyName] ?? [];

  for (const suffix of parsed.suffixes) {
    const entry = findEntry(entries, suffix);
    if (entry?.positions?.length) {
      const pos = entry.positions[positionIndex] ?? entry.positions[0];
      if (pos) return { label: parsed.label, position: pos };
    }

    const extra = lookupExtraChord(keyName, suffix);
    if (extra?.positions?.length) {
      const pos = extra.positions[positionIndex] ?? extra.positions[0];
      if (pos) return { label: parsed.label, position: pos };
    }
  }

  // Last resort: plain major/minor for this key
  const fallback =
    findEntry(entries, parsed.suffixes[parsed.suffixes.length - 1] ?? "major") ??
    findEntry(entries, "major") ??
    entries[0];
  const pos = fallback?.positions[positionIndex] ?? fallback?.positions[0];
  if (!pos) return null;
  return { label: parsed.label, position: pos };
}

export function uniqueChordsFromLines(
  lines: { kind: string; chords?: string[]; chordLine?: string }[],
  transpose: (c: string) => string,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    if (line.kind !== "lyric") continue;
    const names = line.chords?.filter(Boolean) ?? [];
    const fromLine =
      names.length > 0
        ? names
        : (line.chordLine?.match(
            /(?:N\.?C\.?|[A-G](?:#|b)?(?:maj|min|m|dim|aug|sus|add|maj7|m7|7|9|11|13|6|2|4|5|maj9|m9|m6|dim7|aug7|sus2|sus4)*(?:\/[A-G](?:#|b)?)?)\*?/gi,
          ) ?? []);
    for (const c of fromLine) {
      if (!c) continue;
      const name = transpose(c.replace(/\*+$/, ""));
      if (seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}
