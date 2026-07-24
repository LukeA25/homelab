type ChordPosition = {
  frets: number[];
  fingers: number[];
  baseFret: number;
  barres?: number[];
  capo?: boolean;
};

/**
 * Extra slash / inversion shapes not covered (or sparsely covered) by
 * @tombatossals/chords-db. Frets are low-E → high-e: -1 muted, 0 open.
 *
 * Sources: common open-position grips (JustinGuitar, Applied Guitar Theory,
 * MusicScene slash-chord guides).
 */
export type ExtraChordEntry = {
  key: string;
  suffix: string;
  positions: ChordPosition[];
};

export const EXTRA_CHORDS: ExtraChordEntry[] = [
  // ——— B ———
  {
    key: "B",
    suffix: "/F#",
    positions: [
      { frets: [2, 2, 4, 4, 4, 2], fingers: [1, 1, 3, 4, 2, 1], baseFret: 1, barres: [2] },
      { frets: [-1, 2, 4, 4, 4, 2], fingers: [0, 1, 3, 4, 2, 1], baseFret: 1, barres: [2] },
    ],
  },
  {
    key: "B",
    suffix: "/A",
    positions: [{ frets: [-1, 0, 4, 4, 4, 2], fingers: [0, 0, 2, 3, 4, 1], baseFret: 1 }],
  },
  {
    key: "B",
    suffix: "m/F#",
    positions: [
      { frets: [2, 2, 4, 4, 3, 2], fingers: [1, 1, 3, 4, 2, 1], baseFret: 1, barres: [2] },
      { frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], baseFret: 1, barres: [2] },
    ],
  },
  {
    key: "B",
    suffix: "m/A",
    positions: [{ frets: [-1, 0, 4, 4, 3, 2], fingers: [0, 0, 3, 4, 2, 1], baseFret: 1 }],
  },

  // ——— Bb ———
  {
    key: "Bb",
    suffix: "/F",
    positions: [
      { frets: [1, 1, 3, 3, 3, 1], fingers: [1, 1, 2, 3, 4, 1], baseFret: 1, barres: [1] },
      { frets: [-1, 1, 3, 3, 3, 1], fingers: [0, 1, 2, 3, 4, 1], baseFret: 1, barres: [1] },
    ],
  },
  {
    key: "Bb",
    suffix: "m/F",
    positions: [
      { frets: [1, 1, 3, 3, 2, 1], fingers: [1, 1, 3, 4, 2, 1], baseFret: 1, barres: [1] },
    ],
  },

  // ——— C# / Db ———
  {
    key: "Csharp",
    suffix: "/G#",
    positions: [
      { frets: [4, 4, 6, 6, 6, 4], fingers: [1, 1, 2, 3, 4, 1], baseFret: 1, barres: [4] },
    ],
  },
  {
    key: "Csharp",
    suffix: "m/G#",
    positions: [
      { frets: [4, 4, 6, 6, 5, 4], fingers: [1, 1, 3, 4, 2, 1], baseFret: 1, barres: [4] },
    ],
  },

  // ——— Walking-bass / passing shapes often missing ———
  {
    key: "C",
    suffix: "/B",
    positions: [
      { frets: [-1, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0], baseFret: 1 },
      { frets: [-1, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], baseFret: 1 },
    ],
  },
  {
    key: "C",
    suffix: "/D",
    positions: [{ frets: [-1, -1, 0, 0, 1, 0], fingers: [0, 0, 0, 0, 1, 0], baseFret: 1 }],
  },
  {
    key: "C",
    suffix: "/A",
    positions: [{ frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0], baseFret: 1 }],
  },
  {
    key: "D",
    suffix: "/C",
    positions: [{ frets: [-1, 3, 0, 2, 3, 2], fingers: [0, 2, 0, 1, 3, 1], baseFret: 1 }],
  },
  {
    key: "D",
    suffix: "/E",
    positions: [{ frets: [0, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], baseFret: 1 }],
  },
  {
    key: "E",
    suffix: "/A",
    positions: [{ frets: [-1, 0, 2, 1, 0, 0], fingers: [0, 0, 2, 1, 0, 0], baseFret: 1 }],
  },
  {
    key: "E",
    suffix: "m/A",
    positions: [{ frets: [-1, 0, 2, 0, 0, 0], fingers: [0, 0, 1, 0, 0, 0], baseFret: 1 }],
  },
  {
    key: "E",
    suffix: "m/C",
    positions: [{ frets: [-1, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0], baseFret: 1 }],
  },
  {
    key: "F",
    suffix: "/Bb",
    positions: [{ frets: [-1, 1, 3, 2, 1, 1], fingers: [0, 1, 3, 2, 1, 1], baseFret: 1, barres: [1] }],
  },
  {
    key: "G",
    suffix: "/A",
    positions: [{ frets: [-1, 0, 0, 0, 0, 3], fingers: [0, 0, 0, 0, 0, 3], baseFret: 1 }],
  },
  {
    key: "G",
    suffix: "/C",
    positions: [{ frets: [-1, 3, 0, 0, 0, 3], fingers: [0, 2, 0, 0, 0, 3], baseFret: 1 }],
  },
  {
    key: "A",
    suffix: "/B",
    positions: [{ frets: [-1, 2, 2, 2, 2, 0], fingers: [0, 1, 1, 1, 1, 0], baseFret: 1, barres: [2] }],
  },
  {
    key: "A",
    suffix: "/D",
    positions: [{ frets: [-1, -1, 0, 2, 2, 0], fingers: [0, 0, 0, 1, 2, 0], baseFret: 1 }],
  },
  {
    key: "A",
    suffix: "m/B",
    positions: [{ frets: [-1, 2, 2, 2, 1, 0], fingers: [0, 2, 3, 4, 1, 0], baseFret: 1 }],
  },
  {
    key: "A",
    suffix: "m/D",
    positions: [{ frets: [-1, -1, 0, 2, 1, 0], fingers: [0, 0, 0, 2, 1, 0], baseFret: 1 }],
  },

  // ——— Add9 / sus slash forms people hit in UG paste ———
  {
    key: "C",
    suffix: "add9",
    positions: [
      { frets: [-1, 3, 2, 0, 3, 0], fingers: [0, 2, 1, 0, 3, 0], baseFret: 1 },
      { frets: [-1, 3, 2, 0, 3, 3], fingers: [0, 2, 1, 0, 3, 4], baseFret: 1 },
    ],
  },
  {
    key: "G",
    suffix: "add9",
    positions: [
      { frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3], baseFret: 1 },
      { frets: [3, 2, 0, 2, 0, 3], fingers: [3, 1, 0, 2, 0, 4], baseFret: 1 },
    ],
  },
  {
    key: "D",
    suffix: "add9",
    positions: [{ frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 3, 0], baseFret: 1 }],
  },
  {
    key: "E",
    suffix: "add9",
    positions: [{ frets: [0, 2, 2, 1, 0, 2], fingers: [0, 2, 3, 1, 0, 4], baseFret: 1 }],
  },
  {
    key: "A",
    suffix: "add9",
    positions: [{ frets: [-1, 0, 2, 4, 2, 0], fingers: [0, 0, 1, 3, 2, 0], baseFret: 1 }],
  },
];

const byKey = new Map<string, ExtraChordEntry[]>();
for (const entry of EXTRA_CHORDS) {
  const list = byKey.get(entry.key) ?? [];
  list.push(entry);
  byKey.set(entry.key, list);
}

export function lookupExtraChord(
  keyName: string,
  suffix: string,
): { positions: ChordPosition[] } | null {
  const list = byKey.get(keyName);
  if (!list) return null;
  const hit = list.find((e) => e.suffix === suffix);
  return hit ? { positions: hit.positions } : null;
}
