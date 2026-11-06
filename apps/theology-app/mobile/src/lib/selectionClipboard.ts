import type { Paragraph } from "./types";

/** Compact label for a contiguous or listed locus selection (e.g. Mt.16.24–28). */
export function formatLocusRange(locusIds: string[]): string {
  const ids = locusIds.map((id) => id.trim()).filter(Boolean);
  if (!ids.length) return "Reference";
  if (ids.length === 1) return ids[0];

  const parts = ids.map((id) => {
    const m = id.match(/^(.*)\.(\d+)$/);
    return m
      ? { prefix: m[1], verse: Number(m[2]), raw: id }
      : { prefix: id, verse: Number.NaN, raw: id };
  });
  const prefix = parts[0]?.prefix;
  if (
    prefix &&
    parts.every((p) => p.prefix === prefix && Number.isFinite(p.verse))
  ) {
    const verses = parts.map((p) => p.verse);
    const first = verses[0]!;
    const last = verses[verses.length - 1]!;
    const contiguous =
      last - first + 1 === verses.length &&
      verses.every((v, i) => v === first + i);
    if (contiguous) return `${prefix}.${first}–${last}`;
    return `${prefix}.${verses.join(", ")}`;
  }
  return ids.join("; ");
}

/**
 * Paste payload for notes: a quote line, then a wiki-style reference link.
 * Internal href stays in [[…]] form (no studydesk:// URL).
 */
export function selectionClipboardPayload(paragraphs: Paragraph[]): string {
  const quote = paragraphs
    .map((p) => p.text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
  const locusIds = paragraphs.map((p) => p.locusId).filter(Boolean);
  const href = locusIds[0] ?? "Reference";
  const label = formatLocusRange(locusIds);
  const link =
    label === href ? `— [[${href}]]` : `— [[${href}|${label}]]`;
  return quote ? `> ${quote}\n${link}` : link;
}

export function workIdForLocus(locusId: string): string {
  return locusId.toUpperCase().startsWith("CCC") ? "ccc" : "bible-nabre";
}
