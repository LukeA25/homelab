export type ChordLyricSegment = {
  chordLine: string;
  words: string;
};

/**
 * Wrap a UG-style chord line + lyric line at the same character columns,
 * preferring a word boundary in the lyrics so chords stay aligned.
 *
 * Only wraps while lyrics overflow. Trailing chords past the lyric end stay
 * on the last segment (never become orphan "floating" chord rows).
 */
export function wrapChordLyricPair(
  chordLine: string,
  words: string,
  maxCols: number,
): ChordLyricSegment[] {
  const cols = Math.max(8, Math.floor(maxCols));
  const segments: ChordLyricSegment[] = [];
  let chords = chordLine;
  let lyrics = words;

  while (lyrics.length > cols) {
    let breakAt = cols;
    const space = lyrics.lastIndexOf(" ", cols);
    if (space >= Math.floor(cols * 0.35)) {
      breakAt = space;
    }

    segments.push({
      chordLine: chords.slice(0, breakAt).replace(/\s+$/, ""),
      words: lyrics.slice(0, breakAt).replace(/\s+$/, ""),
    });

    const restChords = chords.slice(breakAt);
    const restLyrics = lyrics.slice(breakAt);
    const lead = /^( *)/.exec(restLyrics)?.[1].length ?? 0;
    chords = restChords.slice(lead);
    lyrics = restLyrics.slice(lead);
  }

  segments.push({ chordLine: chords, words: lyrics });

  // Drop blank segments; merge chord-only leftovers onto the previous lyric.
  const out: ChordLyricSegment[] = [];
  for (const seg of segments) {
    const hasWords = seg.words.trim().length > 0;
    const hasChord = seg.chordLine.trim().length > 0;
    if (!hasWords && !hasChord) continue;
    if (!hasWords && hasChord) {
      if (out.length > 0) {
        const prev = out[out.length - 1]!;
        prev.chordLine = `${prev.chordLine.replace(/\s+$/, "")}  ${seg.chordLine.trim()}`;
      } else {
        out.push(seg);
      }
      continue;
    }
    out.push(seg);
  }

  return out.length > 0 ? out : [{ chordLine: "", words: "" }];
}
