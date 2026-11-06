import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown } from "lucide-react";
import {
  BIBLE_ID,
  adjacentChapter,
  flattenBibleChapters,
  getSectionBlocks,
  getWorkSections,
  groupBibleRuns,
  toParagraph,
  toSectionNodes,
  toSuperscriptDigits,
  type ApiSection,
  type ChapterRef,
} from "../lib/api";
import type { Bookmark, Highlight, Paragraph, SectionNode } from "../lib/types";
import { Sheet } from "./Sheet";

const MAX_DRAG = 52;
const COMMIT = 36;
const EDGE = 28;

type BibleScreenProps = {
  sectionId: string;
  highlights: Highlight[];
  bookmarks: Bookmark[];
  focusLocusId?: string | null;
  focusNonce?: number;
  readingVerseStart?: number | null;
  readingVerseEnd?: number | null;
  readingVerses?: number[] | null;
  onSectionChange: (sectionId: string, title?: string) => void;
  onToggleHighlights: (paragraphs: Paragraph[]) => void;
  onBookmark: (paragraphs: Paragraph[]) => void;
  onAskSplit: (paragraphs: Paragraph[]) => void;
  onCopyToNotes: (paragraphs: Paragraph[]) => void;
  onClearReadingFocus?: () => void;
  textSize: number;
};

export function BibleScreen({
  sectionId,
  highlights,
  bookmarks,
  focusLocusId,
  focusNonce,
  readingVerseStart,
  readingVerseEnd,
  readingVerses,
  onSectionChange,
  onToggleHighlights,
  onBookmark,
  onAskSplit,
  onCopyToNotes,
  onClearReadingFocus,
  textSize,
}: BibleScreenProps) {
  const [roots, setRoots] = useState<ApiSection[]>([]);
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [readingFocusActive, setReadingFocusActive] = useState(false);
  const [appliedFocus, setAppliedFocus] = useState<{
    locusId: string | null;
    start: number | null;
    end: number | null;
    verses: number[] | null;
  } | null>(null);
  const [dragX, setDragX] = useState(0);
  const dragXRef = useRef(0);
  const rafRef = useRef(0);
  const startX = useRef(0);
  const tracking = useRef(false);
  const focusAppliedRef = useRef(false);
  const focusTimerRef = useRef(0);
  const chapterRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<{
    x: number;
    y: number;
    axis: "x" | "y" | null;
    id: number;
  } | null>(null);
  const swipedRef = useRef(false);

  const chapters = useMemo(() => flattenBibleChapters(roots), [roots]);
  const books = useMemo(() => toSectionNodes(roots), [roots]);
  const chapter: ChapterRef = useMemo(() => {
    return (
      chapters.find((c) => c.sectionId === sectionId) ?? {
        workId: BIBLE_ID,
        sectionId,
        bookTitle: "Bible",
        chapterTitle: sectionId.split("/").slice(-2).join(" "),
      }
    );
  }, [chapters, sectionId]);
  const prev = adjacentChapter(chapters, sectionId, -1);
  const next = adjacentChapter(chapters, sectionId, 1);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const tree = await getWorkSections(BIBLE_ID);
        if (!cancelled) setRoots(tree);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    focusAppliedRef.current = false;
    void (async () => {
      try {
        const blocks = await getSectionBlocks(sectionId);
        if (!cancelled) {
          setParagraphs(blocks.map(toParagraph));
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setParagraphs([]);
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sectionId]);

  useEffect(() => {
    setSelectedIds(new Set());
    setReadingFocusActive(false);
    setAppliedFocus(null);
    focusAppliedRef.current = false;
    window.clearTimeout(focusTimerRef.current);
    dragXRef.current = 0;
    setDragX(0);
    tracking.current = false;
  }, [sectionId]);

  useEffect(() => {
    focusAppliedRef.current = false;
  }, [focusLocusId, readingVerseStart, readingVerseEnd, readingVerses]);

  useEffect(() => {
    if (loading || !paragraphs.length) return;
    if (!focusLocusId && readingVerseStart == null && !readingVerses?.length) return;
    if (focusAppliedRef.current) return;
    focusAppliedRef.current = true;

    const snapshot = {
      locusId: focusLocusId ?? null,
      start: readingVerseStart ?? null,
      end: readingVerseEnd ?? null,
      verses: readingVerses?.length ? [...readingVerses] : null,
    };
    setAppliedFocus(snapshot);
    setReadingFocusActive(true);
    window.clearTimeout(focusTimerRef.current);
    focusTimerRef.current = window.setTimeout(() => setReadingFocusActive(false), 12000);

    requestAnimationFrame(() => {
      const verse = snapshot.verses?.[0] ?? snapshot.start;
      const root = chapterRef.current;
      const el = snapshot.locusId
        ? root?.querySelector(`[data-locus-id="${CSS.escape(snapshot.locusId)}"]`)
        : verse != null
          ? root?.querySelector(`[data-verse="${verse}"]`)
          : null;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      onClearReadingFocus?.();
    });
  }, [
    loading,
    paragraphs,
    sectionId,
    focusLocusId,
    focusNonce,
    readingVerseStart,
    readingVerseEnd,
    readingVerses,
    onClearReadingFocus,
  ]);

  const hlSet = new Set(
    highlights.filter((h) => h.workId === BIBLE_ID).map((h) => h.paragraphId),
  );
  const bmSet = new Set(
    bookmarks.filter((b) => b.workId === BIBLE_ID).map((b) => b.paragraphId),
  );
  const selectedParas = paragraphs.filter((p) => selectedIds.has(p.id));
  const runs = useMemo(() => groupBibleRuns(paragraphs), [paragraphs]);

  function toggleSelect(id: string) {
    setReadingFocusActive(false);
    setSelectedIds((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(id)) nextSet.delete(id);
      else nextSet.add(id);
      return nextSet;
    });
  }

  function verseInReadingFocus(p: Paragraph): boolean {
    if (!readingFocusActive || !appliedFocus) return false;
    if (appliedFocus.locusId && p.locusId === appliedFocus.locusId) return true;
    if (p.verse != null && appliedFocus.verses?.length) return appliedFocus.verses.includes(p.verse);
    if (appliedFocus.start == null || p.verse == null) return false;
    const end = appliedFocus.end ?? appliedFocus.start;
    return p.verse >= appliedFocus.start && p.verse <= end;
  }

  function scheduleDrag(x: number) {
    dragXRef.current = x;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      setDragX(dragXRef.current);
    });
  }

  function clampDrag(dx: number) {
    if (dx > 0 && !prev) return Math.min(dx * 0.15, 10);
    if (dx < 0 && !next) return Math.max(dx * 0.15, -10);
    const sign = Math.sign(dx) || 1;
    return sign * Math.min(Math.abs(dx), MAX_DRAG);
  }

  function onEdgePointerDown(e: ReactPointerEvent, side: "left" | "right") {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (side === "left" && !prev) return;
    if (side === "right" && !next) return;
    tracking.current = true;
    startX.current = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onEdgePointerMove(e: ReactPointerEvent) {
    if (!tracking.current) return;
    scheduleDrag(clampDrag(e.clientX - startX.current));
  }

  function finishDrag() {
    tracking.current = false;
    const dx = dragXRef.current;
    if (dx <= -COMMIT && next) {
      onSectionChange(next.sectionId, next.chapterTitle);
      return;
    }
    if (dx >= COMMIT && prev) {
      onSectionChange(prev.sectionId, prev.chapterTitle);
      return;
    }
    dragXRef.current = 0;
    setDragX(0);
  }

  function onChapterPointerDown(e: ReactPointerEvent) {
    if (e.pointerType === "mouse") return;
    gestureRef.current = { x: e.clientX, y: e.clientY, axis: null, id: e.pointerId };
  }

  function onChapterPointerMove(e: ReactPointerEvent) {
    const g = gestureRef.current;
    if (!g || g.id !== e.pointerId || tracking.current) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.axis) {
      if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return;
      g.axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? "x" : "y";
      if (g.axis === "y") return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    if (g.axis === "x") scheduleDrag(clampDrag(dx));
  }

  function onChapterPointerUp(e: ReactPointerEvent) {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g || g.id !== e.pointerId || g.axis !== "x" || tracking.current) return;
    swipedRef.current = Math.abs(dragXRef.current) >= COMMIT;
    finishDrag();
  }

  const peekOpacity = Math.min(1, Math.abs(dragX) / COMMIT);
  const showPrevPeek = dragX > 8 && prev;
  const showNextPeek = dragX < -8 && next;

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-bg">
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-center px-3 py-2">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface px-4 py-2 text-sm font-semibold"
        >
          {chapter.chapterTitle}
          <ChevronDown className="h-4 w-4 text-muted" />
        </button>
      </header>

      {showPrevPeek && (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-14 items-center justify-center"
          style={{ opacity: peekOpacity }}
        >
          <span className="rounded-pill border border-border bg-bg-elevated/95 px-2 py-3 text-xs font-semibold writing-vertical">
            {shortChapterLabel(prev.chapterTitle)}
          </span>
        </div>
      )}
      {showNextPeek && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 flex w-14 items-center justify-center"
          style={{ opacity: peekOpacity }}
        >
          <span className="rounded-pill border border-border bg-bg-elevated/95 px-2 py-3 text-xs font-semibold writing-vertical">
            {shortChapterLabel(next.chapterTitle)}
          </span>
        </div>
      )}

      <div
        className="absolute inset-y-0 left-0 z-20"
        style={{ width: EDGE, touchAction: "none" }}
        onPointerDown={(e) => onEdgePointerDown(e, "left")}
        onPointerMove={onEdgePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      />
      <div
        className="absolute inset-y-0 right-0 z-20"
        style={{ width: EDGE, touchAction: "none" }}
        onPointerDown={(e) => onEdgePointerDown(e, "right")}
        onPointerMove={onEdgePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      />

      <div
        ref={chapterRef}
        className="pane-scroll pane-fill overscroll-contain px-5 pb-28 pt-14"
        style={{
          ["--reader-size" as string]: `${textSize}rem`,
          WebkitOverflowScrolling: "touch",
        }}
        onPointerDown={onChapterPointerDown}
        onPointerMove={onChapterPointerMove}
        onPointerUp={onChapterPointerUp}
        onPointerCancel={onChapterPointerUp}
      >
        <p className="mb-5 text-center text-xs font-semibold uppercase tracking-[0.16em] text-muted">
          {chapter.bookTitle}
        </p>
        {error ? (
          <p className="mx-auto max-w-xl text-sm text-muted">Could not load chapter: {error}</p>
        ) : loading ? (
          <p className="mx-auto max-w-xl text-sm text-muted">Loading…</p>
        ) : (
          <article className="reader-prose mx-auto max-w-xl">
            {runs.map((run) => {
              if (run.type === "heading") {
                return (
                  <h3
                    key={run.paragraph.id}
                    className="mb-3 mt-6 font-display text-lg font-semibold text-text first:mt-0"
                  >
                    {run.paragraph.text}
                  </h3>
                );
              }
              return (
                <p key={run.verses[0]?.id} className="bible-para">
                  {run.verses.map((p, i) => {
                    const highlighted = hlSet.has(p.id);
                    const selected = selectedIds.has(p.id);
                    const bookmarked = bmSet.has(p.id);
                    const readingFocus = verseInReadingFocus(p);
                    const num = toSuperscriptDigits(p.verse ?? p.label);
                    const classes = [
                      "verse-run",
                      highlighted ? "is-highlighted" : "",
                      selected ? "is-selected" : "",
                      readingFocus ? "is-reading-focus" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <span
                        key={p.id}
                        role="button"
                        tabIndex={0}
                        data-locus-id={p.locusId}
                        data-verse={p.verse ?? ""}
                        onClick={() => {
                          if (swipedRef.current) {
                            swipedRef.current = false;
                            return;
                          }
                          toggleSelect(p.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleSelect(p.id);
                          }
                        }}
                        className={classes}
                      >
                        <span className="verse-num">{num}</span>
                        <span className={bookmarked ? "verse-underline" : undefined}>
                          {p.text}
                        </span>
                        {i < run.verses.length - 1 ? " " : null}
                      </span>
                    );
                  })}
                </p>
              );
            })}
          </article>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-40 flex justify-center px-3">
          <div className="pointer-events-auto flex items-center gap-1 rounded-pill border border-border bg-bg-elevated px-2 py-2 shadow-panel">
            <span className="px-2 text-xs font-semibold text-muted">{selectedIds.size}</span>
            <button
              type="button"
              onClick={() => onCopyToNotes(selectedParas)}
              className="rounded-pill px-3 py-2 text-sm font-medium hover:bg-surface"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => onAskSplit(selectedParas)}
              className="rounded-pill px-3 py-2 text-sm font-medium hover:bg-surface"
            >
              Ask AI
            </button>
            <button
              type="button"
              onClick={() => {
                onToggleHighlights(selectedParas);
              }}
              className="rounded-pill px-3 py-2 text-sm font-medium hover:bg-surface"
            >
              Highlight
            </button>
            <button
              type="button"
              onClick={() => {
                onBookmark(selectedParas);
                setSelectedIds(new Set());
              }}
              className="rounded-pill px-3 py-2 text-sm font-medium hover:bg-surface"
            >
              Bookmark
            </button>
          </div>
        </div>
      )}

      <BookPicker
        open={pickerOpen}
        books={books}
        currentSectionId={sectionId}
        onClose={() => setPickerOpen(false)}
        onPick={(id, title) => {
          onSectionChange(id, title);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

function shortChapterLabel(title: string) {
  return title.replace(/^(Psalms?|Genesis|Exodus|Matthew|John|Romans|Revelation)\s+/i, "");
}

function BookPicker({
  open,
  books,
  currentSectionId,
  onClose,
  onPick,
}: {
  open: boolean;
  books: SectionNode[];
  currentSectionId: string;
  onClose: () => void;
  onPick: (sectionId: string, title: string) => void;
}) {
  const [bookId, setBookId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setBookId(null);
  }, [open]);

  return (
    <Sheet open={open} title="Choose chapter" onClose={onClose}>
      {!bookId ? (
        <ul className="divide-y divide-border">
          {books.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => setBookId(b.id)}
                className="flex w-full items-center justify-between py-3.5 text-left text-base font-medium"
              >
                {b.title}
                <span className="text-sm text-muted">{b.children?.length ?? 0}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setBookId(null)}
            className="mb-2 text-sm font-medium text-accent"
          >
            ← Books
          </button>
          <ul className="grid grid-cols-4 gap-2">
            {(books.find((b) => b.id === bookId)?.children ?? []).map((ch) => {
              const on = ch.id === currentSectionId;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => onPick(ch.id, ch.title)}
                  className={`rounded-2xl px-2 py-3 text-sm font-semibold ${
                    on ? "btn-accent" : "border border-border bg-surface"
                  }`}
                >
                  {shortChapterLabel(ch.title)}
                </button>
              );
            })}
          </ul>
        </div>
      )}
    </Sheet>
  );
}
