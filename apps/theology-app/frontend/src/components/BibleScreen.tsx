import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
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

const TEXT_SHIFT_MAX = 48;
const COMMIT = 56;
const EDGE = 28;
const TURN_MS = 240;

type BibleScreenProps = {
  sectionId: string;
  highlights: Highlight[];
  bookmarks: Bookmark[];
  focusLocusId?: string | null;
  focusNonce?: number;
  readingVerseStart?: number | null;
  readingVerseEnd?: number | null;
  readingVerses?: number[] | null;
  /** True while this chapter is still inside the opened reference. */
  highlightHold?: boolean;
  onSectionChange: (sectionId: string, title?: string) => void;
  onToggleHighlights: (paragraphs: Paragraph[]) => void;
  onBookmark: (paragraphs: Paragraph[]) => void;
  onAskSplit: (paragraphs: Paragraph[]) => void;
  onCopyToNotes: (paragraphs: Paragraph[]) => void;
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
  highlightHold = false,
  onSectionChange,
  onToggleHighlights,
  onBookmark,
  onAskSplit,
  onCopyToNotes,
  textSize,
}: BibleScreenProps) {
  const [roots, setRoots] = useState<ApiSection[]>([]);
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [dragX, setDragX] = useState(0);
  const [neighbors, setNeighbors] = useState<Record<string, Paragraph[]>>({});
  const [motion, setMotion] = useState<"drag" | "glide" | "snap">("snap");
  const [coverId, setCoverId] = useState<string | null>(null);
  const dragXRef = useRef(0);
  const rafRef = useRef(0);
  const startX = useRef(0);
  const tracking = useRef(false);
  const chapterRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const pendingSection = useRef<string | null>(null);
  const scrolledKey = useRef("");
  const turning = useRef(false);
  const neighborIds = useRef(new Set<string>());
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
    void (async () => {
      try {
        const blocks = await getSectionBlocks(sectionId);
        if (!cancelled) {
          setParagraphs(blocks.map(toParagraph));
          setLoading(false);
          if (pendingSection.current === sectionId) {
            pendingSection.current = null;
            turning.current = false;
            dragXRef.current = 0;
            setCoverId(null);
            setMotion("snap");
            setDragX(0);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setParagraphs([]);
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
          if (pendingSection.current === sectionId) {
            pendingSection.current = null;
            turning.current = false;
            dragXRef.current = 0;
            setCoverId(null);
            setMotion("snap");
            setDragX(0);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sectionId]);

  useEffect(() => {
    setSelectedIds(new Set());
    tracking.current = false;
  }, [sectionId]);

  useEffect(() => {
    const ids = [prev?.sectionId, next?.sectionId].filter((id): id is string => Boolean(id));
    for (const id of ids) {
      if (neighborIds.current.has(id)) continue;
      neighborIds.current.add(id);
      void getSectionBlocks(id)
        .then((blocks) => {
          setNeighbors((map) => (map[id] ? map : { ...map, [id]: blocks.map(toParagraph) }));
        })
        .catch(() => {
          neighborIds.current.delete(id);
        });
    }
  }, [prev?.sectionId, next?.sectionId]);

  useEffect(() => {
    if (loading || !paragraphs.length || !highlightHold) return;
    const key = `${sectionId}:${focusNonce ?? 0}`;
    if (scrolledKey.current === key) return;
    scrolledKey.current = key;
    const root = chapterRef.current;
    if (!root) return;
    const verse = readingVerses?.[0] ?? (readingVerseStart != null && readingVerseStart < 180 ? readingVerseStart : null);
    const locusOnly = Boolean(focusLocusId) && readingVerseStart == null && !readingVerses?.length;
    const el = locusOnly
      ? root.querySelector(`[data-locus-id="${CSS.escape(focusLocusId ?? "")}"]`)
      : verse != null
        ? root.querySelector(`[data-verse="${verse}"]`)
        : null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    else root.scrollTo({ top: 0 });
  }, [
    loading,
    paragraphs,
    sectionId,
    focusNonce,
    highlightHold,
    focusLocusId,
    readingVerseStart,
    readingVerses,
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
    setSelectedIds((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(id)) nextSet.delete(id);
      else nextSet.add(id);
      return nextSet;
    });
  }

  function verseInReadingFocus(p: Paragraph): boolean {
    if (!highlightHold) return false;
    if (p.verse != null && readingVerses?.length) return readingVerses.includes(p.verse);
    if (readingVerseStart != null && p.verse != null) {
      const end =
        readingVerseEnd == null || readingVerseEnd >= 180
          ? Number.POSITIVE_INFINITY
          : readingVerseEnd;
      return p.verse >= readingVerseStart && p.verse <= end;
    }
    if (focusLocusId && p.locusId === focusLocusId) return true;
    return !focusLocusId && readingVerseStart == null && !readingVerses?.length;
  }

  function scheduleDrag(x: number) {
    dragXRef.current = x;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      setDragX(dragXRef.current);
    });
  }

  function paneWidth() {
    return paneRef.current?.clientWidth || chapterRef.current?.clientWidth || 360;
  }

  function clampDrag(dx: number) {
    if (dx > 0 && !prev) return Math.min(dx * 0.15, 10);
    if (dx < 0 && !next) return Math.max(dx * 0.15, -10);
    const width = paneWidth();
    const sign = Math.sign(dx) || 1;
    return sign * Math.min(Math.abs(dx), width);
  }

  function textShift(dx: number) {
    return Math.max(-TEXT_SHIFT_MAX, Math.min(TEXT_SHIFT_MAX, dx * 0.4));
  }

  function turnTo(dir: "next" | "prev") {
    const target = dir === "next" ? next : prev;
    if (!target || turning.current) return;
    turning.current = true;
    pendingSection.current = target.sectionId;
    setCoverId(target.sectionId);
    const width = paneWidth();
    setMotion("glide");
    scheduleDrag(dir === "next" ? -width : width);
    window.setTimeout(() => {
      onSectionChange(target.sectionId, target.chapterTitle);
    }, TURN_MS);
  }

  function onEdgePointerDown(e: ReactPointerEvent, side: "left" | "right") {
    if (turning.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (side === "left" && !prev) return;
    if (side === "right" && !next) return;
    tracking.current = true;
    setMotion("drag");
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
      turnTo("next");
      return;
    }
    if (dx >= COMMIT && prev) {
      turnTo("prev");
      return;
    }
    setMotion("glide");
    dragXRef.current = 0;
    setDragX(0);
  }

  function onChapterPointerDown(e: ReactPointerEvent) {
    if (turning.current || e.pointerType === "mouse") return;
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
      setMotion("drag");
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

  const width = paneWidth();
  const dragged = dragX < -8 ? next : dragX > 8 ? prev : null;
  const incoming =
    (coverId ? chapters.find((item) => item.sectionId === coverId) ?? null : null) ?? dragged;
  const incomingPercent = !incoming
    ? 0
    : dragX < 0
      ? Math.max(0, 100 + (dragX / width) * 100)
      : Math.min(0, -100 + (dragX / width) * 100);
  const slideTransition = motion === "glide" ? `transform ${TURN_MS}ms ease` : "none";

  return (
    <div ref={paneRef} className="relative h-full min-h-0 overflow-hidden bg-bg">
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

      {incoming ? (
        <div
          className="pane-scroll pointer-events-none absolute inset-0 z-[5] overflow-hidden bg-bg px-5 pb-28 pt-14"
          style={{
            transform: `translateX(${incomingPercent}%)`,
            transition: slideTransition,
            ["--reader-size" as string]: `${textSize}rem`,
          }}
        >
          <ChapterPreview
            bookTitle={incoming.bookTitle}
            chapterTitle={incoming.chapterTitle}
            paragraphs={neighbors[incoming.sectionId] ?? []}
          />
        </div>
      ) : null}

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
          transform: `translateX(${textShift(dragX)}px)`,
          transition: slideTransition,
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
        {!loading && !error ? (
          <div className="mx-auto mt-14 flex max-w-xl items-center justify-between gap-3 pb-2">
            <button
              type="button"
              disabled={!prev}
              onClick={() => turnTo("prev")}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
              {prev ? shortChapterLabel(prev.chapterTitle) : "Previous"}
            </button>
            <button
              type="button"
              disabled={!next}
              onClick={() => turnTo("next")}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold disabled:opacity-30"
            >
              {next ? shortChapterLabel(next.chapterTitle) : "Next"}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : null}
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

function ChapterPreview({
  bookTitle,
  chapterTitle,
  paragraphs,
}: {
  bookTitle: string;
  chapterTitle: string;
  paragraphs: Paragraph[];
}) {
  const runs = groupBibleRuns(paragraphs);
  return (
    <>
      <p className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.16em] text-muted">
        {bookTitle}
      </p>
      <p className="mb-5 text-center font-display text-lg font-semibold">{chapterTitle}</p>
      <article className="reader-prose mx-auto max-w-xl">
        {runs.slice(0, 8).map((run) => {
          if (run.type === "heading") {
            return (
              <h3 key={run.paragraph.id} className="mb-3 mt-6 font-display text-lg font-semibold first:mt-0">
                {run.paragraph.text}
              </h3>
            );
          }
          return (
            <p key={run.verses[0]?.id} className="bible-para">
              {run.verses.map((p, i) => (
                <span key={p.id}>
                  <span className="verse-num">{toSuperscriptDigits(p.verse ?? p.label)}</span>
                  {p.text}
                  {i < run.verses.length - 1 ? " " : null}
                </span>
              ))}
            </p>
          );
        })}
      </article>
    </>
  );
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
