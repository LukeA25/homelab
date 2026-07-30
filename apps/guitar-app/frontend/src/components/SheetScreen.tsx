import {
  ArrowLeft,
  ExternalLink,
  Maximize2,
  Minus,
  Pencil,
  Plus,
  Trash2,
  Type,
  X,
  Youtube,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isAsciiTabLine } from "../lib/asciiTab";
import { extractArtworkPalette, paletteFromHue, type ArtworkPalette } from "../lib/artworkColors";
import { uniqueChordsFromLines } from "../lib/chordDiagrams";
import { wrapChordLyricPair } from "../lib/wrapChordLyric";
import { STYLE_LABELS } from "../data/songs";
import type { Song, Status, Style } from "../lib/types";
import { transposeChord, transposeChordLine, transposeKey } from "../lib/transpose";
import { ChordDiagramStrip } from "./ChordDiagramStrip";
import { MiniMetronome } from "./MiniMetronome";
import { Page } from "./Page";
import { SongArt } from "./SongArt";
import { MetaTag, StatusTag } from "./StatusTag";

export type SongEditInput = {
  chordPro: string;
  style: Style;
  bpm: number;
  key: string;
  capo: number;
  youtubeUrl: string;
};

type SheetScreenProps = {
  song: Song;
  onBack: () => void;
  onStatusChange?: (status: Status) => void;
  onUpdateSheet?: (input: SongEditInput) => Promise<void>;
  onFocusModeChange?: (active: boolean) => void;
  onDelete?: () => Promise<void>;
};

function youtubeUrlFromSong(song: Song): string {
  return song.links.find((l) => l.type === "youtube")?.url ?? "";
}

function coverThemeVars(palette: ArtworkPalette): React.CSSProperties {
  const { dominant: d, secondary: s } = palette;
  // Readable chord accent on dark UI — lift lightness, keep cover hue/sat
  const accentS = Math.round(Math.min(82, Math.max(28, d.s * 100 + 12)));
  const accentL = Math.round(Math.min(72, Math.max(52, d.l * 100 + 28)));
  const washS = Math.round(Math.min(75, Math.max(25, d.s * 100)));
  const washL = Math.round(Math.min(48, Math.max(22, d.l * 100)));
  const softS = Math.round(Math.min(70, Math.max(20, s.s * 100)));
  const softL = Math.round(Math.min(45, Math.max(18, s.l * 100)));

  return {
    ["--sheet-accent" as string]: `hsl(${d.h.toFixed(1)} ${accentS}% ${accentL}%)`,
    ["--sheet-accent-soft" as string]: `hsl(${d.h.toFixed(1)} ${accentS}% ${accentL}% / 0.18)`,
    ["--sheet-accent-glow" as string]: `hsl(${d.h.toFixed(1)} ${accentS}% ${accentL}% / 0.4)`,
    ["--sheet-wash" as string]: `hsl(${d.h.toFixed(1)} ${washS}% ${washL}% / 0.55)`,
    ["--sheet-wash-soft" as string]: `hsl(${s.h.toFixed(1)} ${softS}% ${softL}% / 0.42)`,
  };
}

const SHEET_TEXT_KEY = "fretwork-sheet-text-v1";

const SHEET_TEXT_STEPS = [
  { chord: "0.7rem", leading: 1.15, gap: "0.35rem", section: "0.65rem" },
  { chord: "0.8rem", leading: 1.22, gap: "0.45rem", section: "0.7rem" },
  { chord: "0.9rem", leading: 1.28, gap: "0.55rem", section: "0.75rem" },
  { chord: "1.05rem", leading: 1.35, gap: "0.7rem", section: "0.85rem" },
  { chord: "1.2rem", leading: 1.4, gap: "0.85rem", section: "0.95rem" },
] as const;

function readTextStep(): number {
  const raw = localStorage.getItem(SHEET_TEXT_KEY);
  const n = raw == null ? 1 : Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.min(SHEET_TEXT_STEPS.length - 1, Math.max(0, Math.round(n)));
}

function TransposeControls({
  semitones,
  keyLabel,
  onDown,
  onUp,
  className = "",
}: {
  semitones: number;
  keyLabel: string;
  onDown: () => void;
  onUp: () => void;
  className?: string;
}) {
  return (
    <div
      className={`panel flex h-full flex-col justify-between rounded-2xl p-2.5 ${className}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Transpose</p>
      <div className="my-1.5 flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={onDown}
          className="grid h-7 w-7 place-items-center rounded-full bg-accent-soft text-accent"
          aria-label="Transpose down"
        >
          <Minus className="h-3 w-3" />
        </button>
        <div className="min-w-0 px-1 text-center">
          <p className="font-mono text-sm font-bold tabular-nums leading-none">
            {semitones === 0 ? "0" : semitones > 0 ? `+${semitones}` : `${semitones}`}
          </p>
          <p className="truncate text-[9px] text-muted">{keyLabel}</p>
        </div>
        <button
          type="button"
          onClick={onUp}
          className="grid h-7 w-7 place-items-center rounded-full bg-accent-soft text-accent"
          aria-label="Transpose up"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function TextSizeControls({
  step,
  onDown,
  onUp,
  className = "",
}: {
  step: number;
  onDown: () => void;
  onUp: () => void;
  className?: string;
}) {
  return (
    <div
      className={`panel flex h-full flex-col justify-between rounded-2xl p-2.5 ${className}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Text</p>
      <div className="my-1.5 flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={onDown}
          disabled={step <= 0}
          className="grid h-7 w-7 place-items-center rounded-full bg-accent-soft text-accent disabled:opacity-40"
          aria-label="Smaller text"
        >
          <Minus className="h-3 w-3" />
        </button>
        <div className="grid h-7 w-7 place-items-center text-muted">
          <Type className="h-3.5 w-3.5" />
        </div>
        <button
          type="button"
          onClick={onUp}
          disabled={step >= SHEET_TEXT_STEPS.length - 1}
          className="grid h-7 w-7 place-items-center rounded-full bg-accent-soft text-accent disabled:opacity-40"
          aria-label="Larger text"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function spacedChordLine(chords: string[], words: string): string {
  /** Rebuild approximate UG spacing from legacy slot arrays (no chordLine saved). */
  if (!chords.some(Boolean)) return "";
  const width = Math.max(words.length, 48);
  const cells = Array.from({ length: width }, () => " ");
  const n = Math.max(chords.length, 1);
  chords.forEach((chord, i) => {
    if (!chord) return;
    const ideal = Math.floor((i / n) * width);
    const start = Math.min(Math.max(0, ideal), Math.max(0, width - chord.length));
    for (let k = 0; k < chord.length && start + k < width; k++) {
      cells[start + k] = chord[k]!;
    }
  });
  return cells.join("").replace(/\s+$/g, "");
}

function displayChordLine(line: Extract<Song["lines"][number], { kind: "lyric" }>): string {
  if (line.chordLine != null && line.chordLine !== "") return line.chordLine;
  return spacedChordLine(line.chords, line.words);
}

function linesToEditableText(song: Song): string {
  const parts: string[] = [];
  for (const line of song.lines) {
    if (line.kind === "break") {
      parts.push("");
      continue;
    }
    if (line.kind === "section") {
      parts.push(`[${line.label}]`);
      continue;
    }
    if (line.chordLine != null && line.chordLine !== "") {
      parts.push(line.chordLine);
      if (!line.words.startsWith("(instrumental)")) {
        parts.push(line.words);
      }
      continue;
    }
    const chordRow = spacedChordLine(line.chords, line.words);
    if (chordRow) {
      parts.push(chordRow);
      if (!line.words.startsWith("(instrumental)")) {
        parts.push(line.words);
      }
      continue;
    }
    parts.push(line.words);
  }
  return parts.join("\n");
}

type TextStyle = (typeof SHEET_TEXT_STEPS)[number];

function ChordLyricBlock({
  chordRow,
  words,
  hasChords,
  useUgLayout,
  textStyle,
  maxCols,
}: {
  chordRow: string;
  words: string;
  hasChords: boolean;
  useUgLayout: boolean;
  textStyle: TextStyle;
  maxCols: number;
}) {
  const segments = useMemo(() => {
    if (!useUgLayout) return [{ chordLine: chordRow, words }];
    return wrapChordLyricPair(hasChords ? chordRow : "", words, maxCols);
  }, [chordRow, words, hasChords, useUgLayout, maxCols]);

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden">
      <div className="space-y-1">
        {segments.map((seg, i) => (
          <div
            key={i}
            className={useUgLayout ? "font-mono" : "font-body"}
            style={{
              tabSize: 4,
              fontSize: textStyle.chord,
              lineHeight: textStyle.leading,
            }}
          >
            {useUgLayout && (
              <div
                className={`font-semibold text-accent${hasChords ? "" : " opacity-0"}`}
                style={{ whiteSpace: "pre" }}
                aria-hidden={!hasChords}
              >
                {hasChords ? seg.chordLine || "\u00a0" : "\u00a0"}
              </div>
            )}
            <div className="text-text" style={{ whiteSpace: useUgLayout ? "pre" : "pre-wrap" }}>
              {seg.words}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SheetLines({
  lines,
  semitones,
  textStyle,
}: {
  lines: Song["lines"];
  semitones: number;
  textStyle: TextStyle;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [maxCols, setMaxCols] = useState(40);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      if (el.clientWidth < 48) return;
      const probe = document.createElement("span");
      probe.className = "font-mono";
      probe.style.cssText = `font-size:${textStyle.chord};position:absolute;visibility:hidden;white-space:pre;pointer-events:none`;
      probe.textContent = "0".repeat(100);
      el.appendChild(probe);
      const charW = probe.getBoundingClientRect().width / 100;
      probe.remove();
      if (charW <= 0) return;
      const next = Math.max(12, Math.floor((el.clientWidth - 4) / charW));
      setMaxCols((prev) => (prev === next ? prev : next));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [textStyle.chord]);

  // UG sheets mix chorded and bare lyric lines — keep a chord-row slot on every
  // lyric so vertical rhythm stays even (and monospace matches chorded lines).
  const sheetHasChords = lines.some(
    (l) =>
      l.kind === "lyric" &&
      (Boolean(l.chordLine?.trim()) || l.chords.some(Boolean)),
  );

  const nodes: ReactNode[] = [];
  let idx = 0;
  while (idx < lines.length) {
    const line = lines[idx]!;

    if (line.kind === "break") {
      nodes.push(
        <div
          key={`b-${idx}`}
          aria-hidden
          style={{ height: `calc(${textStyle.gap} + 0.55em)` }}
        />,
      );
      idx += 1;
      continue;
    }

    if (line.kind === "section") {
      nodes.push(
        <p
          key={`s-${idx}`}
          className="pt-2 font-semibold uppercase tracking-wide text-accent"
          style={{ fontSize: textStyle.section }}
        >
          {line.label}
        </p>,
      );
      idx += 1;
      continue;
    }

    if (isAsciiTabLine(line.words)) {
      const start = idx;
      const tabRows: string[] = [];
      while (idx < lines.length) {
        const tabLine = lines[idx]!;
        if (tabLine.kind !== "lyric" || !isAsciiTabLine(tabLine.words)) break;
        tabRows.push(tabLine.words.replace(/\s+$/, ""));
        idx += 1;
      }
      nodes.push(
        <div key={`tab-${start}`} className="overflow-x-auto py-1">
          <pre
            className="m-0 font-mono text-text"
            style={{
              fontSize: textStyle.chord,
              lineHeight: 1.15,
              whiteSpace: "pre",
              tabSize: 4,
            }}
          >
            {tabRows.join("\n")}
          </pre>
        </div>,
      );
      continue;
    }

    const chordRow = transposeChordLine(displayChordLine(line), semitones);
    const hasChords = Boolean(chordRow.trim()) || line.chords.some(Boolean);

    nodes.push(
      <ChordLyricBlock
        key={`l-${idx}`}
        chordRow={chordRow}
        words={line.words}
        hasChords={hasChords}
        useUgLayout={sheetHasChords}
        textStyle={textStyle}
        maxCols={maxCols}
      />,
    );
    idx += 1;
  }

  return (
    <div
      ref={containerRef}
      className="mx-auto w-full min-w-0 max-w-full overflow-x-hidden"
      style={{ gap: textStyle.gap, display: "flex", flexDirection: "column" }}
    >
      {lines.length === 0 && (
        <p className="text-sm text-muted">
          No lyrics or chords yet. Use Edit chords to paste Ultimate Guitar or ChordPro.
        </p>
      )}
      {nodes}
    </div>
  );
}

type SectionChunk = {
  label: string;
  lines: Song["lines"];
};

function splitIntoSections(lines: Song["lines"]): SectionChunk[] {
  if (lines.length === 0) return [];
  const chunks: SectionChunk[] = [];
  let current: SectionChunk | null = null;

  for (const line of lines) {
    if (line.kind === "section") {
      current = { label: line.label, lines: [line] };
      chunks.push(current);
      continue;
    }
    if (!current) {
      current = { label: "Start", lines: [] };
      chunks.push(current);
    }
    current.lines.push(line);
  }
  return chunks;
}

type PackedPage = { start: number; end: number };

function packSectionsIntoPages(heights: number[], gap: number, viewportH: number): PackedPage[] {
  if (heights.length === 0 || viewportH <= 0) return [{ start: 0, end: 0 }];
  const pages: PackedPage[] = [];
  let i = 0;
  while (i < heights.length) {
    const start = i;
    let used = 0;
    while (i < heights.length) {
      const add = heights[i]! + (i > start ? gap : 0);
      if (i > start && used + add > viewportH) break;
      used += add;
      i += 1;
    }
    if (i === start) i = start + 1;
    pages.push({ start, end: i });
  }
  return pages;
}

function pagesEqual(a: PackedPage[], b: PackedPage[]): boolean {
  return (
    a.length === b.length &&
    a.every((p, i) => p.start === b[i]!.start && p.end === b[i]!.end)
  );
}

function LyricsFocusPopup({
  song,
  semitones,
  textStyle,
  onExit,
}: {
  song: Song;
  semitones: number;
  textStyle: TextStyle;
  onExit: () => void;
}) {
  const sections = useMemo(() => splitIntoSections(song.lines), [song.lines]);
  const [pages, setPages] = useState<PackedPage[]>([{ start: 0, end: 0 }]);
  const [pageIndex, setPageIndex] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  const remeasure = useCallback(() => {
    const viewport = viewportRef.current;
    const measure = measureRef.current;
    if (!viewport || !measure) return;
    const kids = Array.from(measure.children) as HTMLElement[];
    if (kids.length === 0) {
      setPages((prev) => (pagesEqual(prev, [{ start: 0, end: 0 }]) ? prev : [{ start: 0, end: 0 }]));
      return;
    }
    const gap = Number.parseFloat(getComputedStyle(measure).rowGap || getComputedStyle(measure).gap) || 0;
    const heights = kids.map((el) => el.getBoundingClientRect().height);
    const next = packSectionsIntoPages(heights, gap, viewport.clientHeight);
    setPages((prev) => (pagesEqual(prev, next) ? prev : next));
  }, []);

  useLayoutEffect(() => {
    remeasure();
  }, [remeasure, sections, textStyle, semitones]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const ro = new ResizeObserver(() => remeasure());
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [remeasure]);

  useEffect(() => {
    setPageIndex((i) => Math.min(i, Math.max(0, pages.length - 1)));
  }, [pages]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const safeIndex = Math.min(pageIndex, Math.max(0, pages.length - 1));
  const page = pages[safeIndex] ?? { start: 0, end: 0 };
  const pageSections = sections.slice(page.start, page.end);
  const pageLabel =
    pageSections.length === 0
      ? "Lyrics"
      : pageSections.length === 1
        ? pageSections[0]!.label
        : pageSections.map((s) => s.label).join(" · ");
  const canPrev = safeIndex > 0;
  const canNext = safeIndex < pages.length - 1;

  function jumpFromClientX(clientX: number, target: HTMLElement) {
    const rect = target.getBoundingClientRect();
    const mid = rect.left + rect.width / 2;
    if (clientX < mid) {
      if (canPrev) setPageIndex((i) => i - 1);
    } else if (canNext) {
      setPageIndex((i) => i + 1);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/60 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-6">
      <div className="panel relative flex w-full max-w-2xl flex-col overflow-hidden rounded-panel shadow-panel">
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{pageLabel}</p>
            <p className="truncate text-xs text-muted">
              {pages.length === 0 ? 0 : safeIndex + 1} / {pages.length || 1}
            </p>
          </div>
          <button
            type="button"
            onClick={onExit}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden p-4 sm:p-5">
          <div
            ref={viewportRef}
            className="relative h-full overflow-hidden"
            onClick={(e) => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              jumpFromClientX(e.clientX, e.currentTarget);
            }}
            onTouchStart={(e) => {
              const t = e.touches[0];
              if (!t) return;
              touchStart.current = { x: t.clientX, y: t.clientY };
            }}
            onTouchEnd={(e) => {
              const start = touchStart.current;
              touchStart.current = null;
              if (!start) return;
              const t = e.changedTouches[0];
              if (!t) return;
              if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > 14) return;
              suppressClick.current = true;
              jumpFromClientX(t.clientX, e.currentTarget);
            }}
          >
            <div
              className="h-full overflow-y-auto"
              style={{ gap: textStyle.gap, display: "flex", flexDirection: "column" }}
            >
              {pageSections.length === 0 ? (
                <p className="text-sm text-muted">No lyrics</p>
              ) : (
                pageSections.map((section, i) => (
                  <SheetLines
                    key={`${page.start + i}-${section.label}`}
                    lines={section.lines}
                    semitones={semitones}
                    textStyle={textStyle}
                  />
                ))
              )}
            </div>

            <div
              ref={measureRef}
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 -z-10 flex w-full flex-col opacity-0"
              style={{ gap: textStyle.gap }}
            >
              {sections.map((section, i) => (
                <div key={`m-${i}-${section.label}`}>
                  <SheetLines lines={section.lines} semitones={semitones} textStyle={textStyle} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SheetScreen({
  song,
  onBack,
  onStatusChange,
  onUpdateSheet,
  onFocusModeChange,
  onDelete,
}: SheetScreenProps) {
  const [semitones, setSemitones] = useState(0);
  const [textStep, setTextStep] = useState(readTextStep);
  const [focusMode, setFocusMode] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [editStyle, setEditStyle] = useState<Style>("chords");
  const [editBpm, setEditBpm] = useState(90);
  const [editKey, setEditKey] = useState("C");
  const [editCapo, setEditCapo] = useState(0);
  const [editYoutube, setEditYoutube] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [palette, setPalette] = useState<ArtworkPalette | null>(null);
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    localStorage.setItem(SHEET_TEXT_KEY, String(textStep));
  }, [textStep]);

  useEffect(() => {
    onFocusModeChange?.(focusMode);
    return () => onFocusModeChange?.(false);
  }, [focusMode, onFocusModeChange]);

  useEffect(() => {
    let cancelled = false;
    setPalette(null);
    setThemeReady(false);

    function applyPalette(next: ArtworkPalette) {
      if (cancelled) return;
      setPalette(next);
      // Paint opacity 0 with colors set, then fade in on the next frames
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) setThemeReady(true);
        });
      });
    }

    if (!song.artworkUrl) {
      applyPalette(paletteFromHue(song.artHue));
      return () => {
        cancelled = true;
      };
    }

    extractArtworkPalette(song.artworkUrl).then((extracted) => {
      applyPalette(extracted ?? paletteFromHue(song.artHue));
    });

    return () => {
      cancelled = true;
    };
  }, [song.artworkUrl, song.artHue]);

  const textStyle = SHEET_TEXT_STEPS[textStep]!;

  const soundingKey = useMemo(
    () => transposeKey(song.key, song.capo + semitones),
    [song.key, song.capo, semitones],
  );
  const themeVars = useMemo((): React.CSSProperties => {
    if (!palette) return {};
    return coverThemeVars(palette);
  }, [palette]);
  const diagramChords = useMemo(
    () => uniqueChordsFromLines(song.lines, (c) => transposeChord(c, semitones)),
    [song.lines, semitones],
  );

  function openEditor() {
    setDraft(linesToEditableText(song));
    setEditStyle(song.style);
    setEditBpm(song.bpm);
    setEditKey(song.key);
    setEditCapo(song.capo);
    setEditYoutube(youtubeUrlFromSong(song));
    setEditError(null);
    setEditing(true);
  }

  async function saveEditor() {
    if (!onUpdateSheet) return;
    setSaving(true);
    setEditError(null);
    try {
      await onUpdateSheet({
        chordPro: draft,
        style: editStyle,
        bpm: editBpm,
        key: editKey.trim() || "C",
        capo: editCapo,
        youtubeUrl: editYoutube.trim(),
      });
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete");
      setDeleting(false);
    }
  }

  return (
    <div
      className={`sheet-theme min-h-full${themeReady ? " sheet-theme--ready" : ""}`}
      style={themeVars}
    >
      {song.artworkUrl && (
        <div
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden transition-opacity duration-[3000ms] ease-out"
          style={{ opacity: themeReady ? 1 : 0 }}
          aria-hidden
        >
          <img
            src={song.artworkUrl}
            alt=""
            className="absolute left-1/2 top-[-10%] h-[85%] w-[140%] max-w-none -translate-x-1/2 scale-110 object-cover opacity-[0.55] blur-[72px] saturate-[1.35]"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--bg)_48%,transparent)]" />
        </div>
      )}
      <Page denseBottom>
        <header className="mb-5 flex items-center justify-between gap-3 md:mb-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface text-text md:hidden"
              aria-label="Back to library"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={onBack}
              className="hidden items-center gap-2 rounded-pill border border-border bg-surface px-4 py-2 text-sm text-muted transition hover:text-text md:inline-flex"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to library
            </button>
          </div>
          {onUpdateSheet && (
            <button
              type="button"
              onClick={openEditor}
              className="inline-flex items-center gap-2 rounded-pill border border-border bg-surface px-3 py-2 text-sm"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] lg:items-start lg:gap-10">
          <aside className="min-w-0 space-y-4 lg:sticky lg:top-8">
            <div className="space-y-3 lg:space-y-5">
              <div className="flex items-center gap-3 sm:gap-4 lg:flex-col lg:items-stretch lg:gap-5">
                <SongArt
                  title={song.title}
                  artist={song.artist}
                  hasArt={song.hasArt}
                  artHue={song.artHue}
                  artworkUrl={song.artworkUrl}
                  size="lg"
                  className="!h-24 !w-24 !rounded-[1.25rem] !text-2xl lg:!h-auto lg:!w-full lg:aspect-square lg:!rounded-[1.35rem] lg:!text-4xl"
                />
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-bold leading-tight sm:text-3xl md:text-4xl">
                    {song.title}
                  </h1>
                  <p className="mt-1 text-base text-muted md:text-lg">{song.artist}</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted">
                  Key <span className="text-text">{song.key}</span>
                  {" · "}
                  {song.capo > 0 ? (
                    <>
                      Capo <span className="text-text">{song.capo}</span>
                    </>
                  ) : (
                    "No Capo"
                  )}
                  {song.capo > 0 || semitones !== 0 ? (
                    <>
                      {" · "}
                      Sounds <span className="text-accent">{soundingKey}</span>
                    </>
                  ) : null}
                  {" · "}
                  <span className="text-text">{song.bpm} BPM</span>
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusTag status={song.status} editable onChange={onStatusChange} />
                  <MetaTag>{song.genre}</MetaTag>
                  <MetaTag>{STYLE_LABELS[song.style]}</MetaTag>
                </div>
              </div>
            </div>

            {song.links.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {song.links.map((link) => (
                  <a
                    key={`${link.label}-${link.url}`}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-pill border border-border bg-surface px-3 py-2 text-sm text-text hover:border-accent"
                  >
                    {link.type === "youtube" ? (
                      <Youtube className="h-4 w-4 text-accent" />
                    ) : (
                      <ExternalLink className="h-4 w-4 text-accent" />
                    )}
                    {/apple|itunes/i.test(link.label) ? "Apple Music" : link.label}
                  </a>
                ))}
              </div>
            )}

            <div className="hidden lg:block">
              <ChordDiagramStrip chords={diagramChords} pageSize={4} />
            </div>
          </aside>

          <div className="min-w-0 space-y-3">
            <div className="lg:hidden">
              <ChordDiagramStrip chords={diagramChords} pageSize={4} />
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <MiniMetronome bpm={song.bpm} compact />
              <TransposeControls
                semitones={semitones}
                keyLabel={soundingKey}
                onDown={() => setSemitones((n) => n - 1)}
                onUp={() => setSemitones((n) => n + 1)}
              />
              <TextSizeControls
                step={textStep}
                onDown={() => setTextStep((n) => Math.max(0, n - 1))}
                onUp={() => setTextStep((n) => Math.min(SHEET_TEXT_STEPS.length - 1, n + 1))}
              />
            </div>

            <section className="panel relative min-w-0 rounded-panel p-3 sm:p-4 md:p-6">
              {song.lines.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFocusMode(true)}
                  className="absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-full border border-border bg-surface text-muted hover:text-text sm:right-3 sm:top-3"
                  aria-label="Expand lyrics"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              )}
              <SheetLines lines={song.lines} semitones={semitones} textStyle={textStyle} />
            </section>
          </div>
        </div>

        {onDelete && (
          <div className="mt-10 border-t border-border pt-6">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(true);
                  setDeleteError(null);
                }}
                className="inline-flex items-center gap-2 rounded-pill border border-border bg-surface px-4 py-2.5 text-sm text-danger"
              >
                <Trash2 className="h-4 w-4" />
                Delete song
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted">
                  Delete <span className="font-medium text-text">{song.title}</span>? This can’t be undone.
                </p>
                {deleteError && <p className="text-sm text-danger">{deleteError}</p>}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-pill border border-border px-4 py-2.5 text-sm text-muted disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={handleDelete}
                    className="inline-flex items-center gap-2 rounded-pill border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    {deleting ? "Deleting…" : "Delete forever"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Page>

      {focusMode && (
        <LyricsFocusPopup
          song={song}
          semitones={semitones}
          textStyle={textStyle}
          onExit={() => setFocusMode(false)}
        />
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 sm:items-center">
          <div className="panel max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-panel p-5 shadow-panel">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold">Edit song</h3>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="grid h-9 w-9 place-items-center rounded-full border border-border"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-xs text-muted">
              Update arrangement details and paste ChordPro or Ultimate Guitar chords / lyrics.
            </p>
            {editError && <p className="mb-2 text-sm text-danger">{editError}</p>}

            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Style</span>
                <select
                  value={editStyle}
                  onChange={(e) => setEditStyle(e.target.value as Style)}
                  className="glass w-full appearance-none rounded-card px-4 py-3 text-sm outline-none"
                >
                  <option value="fingerpicking">Fingerpicking</option>
                  <option value="chords">Chords</option>
                  <option value="mix">Mix</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted">BPM</span>
                <input
                  type="number"
                  min={40}
                  max={220}
                  value={editBpm}
                  onChange={(e) => setEditBpm(Number(e.target.value) || 90)}
                  className="glass w-full rounded-card px-4 py-3 text-sm outline-none focus:border-accent"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Key</span>
                <input
                  value={editKey}
                  onChange={(e) => setEditKey(e.target.value)}
                  className="glass w-full rounded-card px-4 py-3 text-sm outline-none focus:border-accent"
                  placeholder="G"
                  list="sheet-edit-keys"
                />
                <datalist id="sheet-edit-keys">
                  {["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B", "Am", "Em", "Dm"].map(
                    (k) => (
                      <option key={k} value={k} />
                    ),
                  )}
                </datalist>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Capo</span>
                <input
                  type="number"
                  min={0}
                  max={12}
                  value={editCapo}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setEditCapo(Number.isFinite(n) ? Math.min(12, Math.max(0, n)) : 0);
                  }}
                  className="glass w-full rounded-card px-4 py-3 text-sm outline-none focus:border-accent"
                />
              </label>
            </div>

            <label className="mb-3 block">
              <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted">
                YouTube (optional)
              </span>
              <input
                type="url"
                value={editYoutube}
                onChange={(e) => setEditYoutube(e.target.value)}
                className="glass w-full rounded-card px-4 py-3 text-sm outline-none focus:border-accent"
                placeholder="https://www.youtube.com/watch?v=…"
              />
            </label>

            <label className="mb-4 block">
              <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted">
                Lyrics / chords
              </span>
              <textarea
                rows={12}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="glass w-full rounded-2xl px-4 py-3 font-mono text-sm outline-none"
              />
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="flex-1 rounded-pill border border-border py-3 text-sm text-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={saveEditor}
                className="btn-accent flex-1 rounded-pill py-3 text-sm disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
