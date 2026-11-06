import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  adjacentChapter,
  flattenReadableChapters,
  getSectionBlocks,
  getWorkSections,
  toParagraph,
  toTitleCaseHeading,
  type ChapterRef,
} from "../lib/api";
import type { Bookmark, Highlight, Paragraph } from "../lib/types";

const MAX_DRAG = 52;
const COMMIT = 36;
const EDGE = 28;

type ReaderScreenProps = {
  workId: string;
  sectionId: string;
  title?: string;
  highlights: Highlight[];
  bookmarks: Bookmark[];
  focusLocusId?: string | null;
  focusNonce?: number;
  onFocusClear?: () => void;
  onBack: () => void;
  onSectionChange: (sectionId: string, title?: string) => void;
  onToggleHighlights: (paragraphs: Paragraph[]) => void;
  onBookmark: (paragraphs: Paragraph[]) => void;
  onAskSplit: (paragraphs: Paragraph[]) => void;
  onCopyToNotes: (paragraphs: Paragraph[]) => void;
  textSize: number;
};

export function ReaderScreen({
  workId,
  sectionId,
  title,
  highlights,
  bookmarks,
  focusLocusId,
  focusNonce,
  onFocusClear,
  onBack,
  onSectionChange,
  onToggleHighlights,
  onBookmark,
  onAskSplit,
  onCopyToNotes,
  textSize,
}: ReaderScreenProps) {
  const [roots, setRoots] = useState<Awaited<ReturnType<typeof getWorkSections>>>([]);
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [dragX, setDragX] = useState(0);
  const dragXRef = useRef(0);
  const rafRef = useRef(0);
  const startX = useRef(0);
  const tracking = useRef(false);

  const titleCase = workId === "ccc" || workId.includes("catechism");
  const chapters = useMemo(
    () => flattenReadableChapters(roots, workId, { titleCase }),
    [roots, workId, titleCase],
  );
  const chapter: ChapterRef = useMemo(() => {
    return (
      chapters.find((c) => c.sectionId === sectionId) ?? {
        workId,
        sectionId,
        bookTitle: "",
        chapterTitle: titleCase
          ? toTitleCaseHeading(title || sectionId.split("/").slice(-1)[0] || "Reader")
          : title || sectionId.split("/").slice(-1)[0] || "Reader",
      }
    );
  }, [chapters, sectionId, workId, title, titleCase]);
  const prev = adjacentChapter(chapters, sectionId, -1);
  const next = adjacentChapter(chapters, sectionId, 1);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const tree = await getWorkSections(workId);
        if (!cancelled) setRoots(tree);
      } catch {
        if (!cancelled) setRoots([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workId]);

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

  const hlSet = new Set(
    highlights.filter((h) => h.workId === workId).map((h) => h.paragraphId),
  );
  const bmSet = new Set(
    bookmarks.filter((b) => b.workId === workId).map((b) => b.paragraphId),
  );
  const selectedParas = paragraphs.filter((p) => selectedIds.has(p.id));
  const heading = chapter.chapterTitle;

  useEffect(() => {
    setSelectedIds(new Set());
    dragXRef.current = 0;
    setDragX(0);
    tracking.current = false;
  }, [sectionId]);

  useEffect(() => {
    if (!focusLocusId || !paragraphs.length) return;
    const el = document.getElementById(`reader-${focusLocusId}`);
    el?.scrollIntoView({ block: "center" });
  }, [focusLocusId, focusNonce, paragraphs]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(id)) nextSet.delete(id);
      else nextSet.add(id);
      return nextSet;
    });
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

  function finishEdgeDrag() {
    if (!tracking.current) return;
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

  const peekOpacity = Math.min(1, Math.abs(dragX) / COMMIT);
  const showPrevPeek = dragX > 8 && prev;
  const showNextPeek = dragX < -8 && next;

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <header className="absolute inset-x-0 top-0 z-20 flex items-center gap-3 border-b border-border bg-bg px-4 py-3">
        <button type="button" onClick={onBack} className="text-sm font-medium text-accent">
          ← Back
        </button>
        <h1 className="truncate font-display text-lg font-semibold">{heading}</h1>
      </header>

      {showPrevPeek && (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-14 items-center justify-center"
          style={{ opacity: peekOpacity }}
        >
          <span className="rounded-pill border border-border bg-bg-elevated/95 px-2 py-3 text-xs font-semibold writing-vertical">
            {shortLabel(prev.chapterTitle)}
          </span>
        </div>
      )}
      {showNextPeek && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 flex w-14 items-center justify-center"
          style={{ opacity: peekOpacity }}
        >
          <span className="rounded-pill border border-border bg-bg-elevated/95 px-2 py-3 text-xs font-semibold writing-vertical">
            {shortLabel(next.chapterTitle)}
          </span>
        </div>
      )}

      <div
        className="absolute inset-y-0 left-0 z-20"
        style={{ width: EDGE, touchAction: "none" }}
        onPointerDown={(e) => onEdgePointerDown(e, "left")}
        onPointerMove={onEdgePointerMove}
        onPointerUp={finishEdgeDrag}
        onPointerCancel={finishEdgeDrag}
      />
      <div
        className="absolute inset-y-0 right-0 z-20"
        style={{ width: EDGE, touchAction: "none" }}
        onPointerDown={(e) => onEdgePointerDown(e, "right")}
        onPointerMove={onEdgePointerMove}
        onPointerUp={finishEdgeDrag}
        onPointerCancel={finishEdgeDrag}
      />

      <div
        className="pane-scroll pane-fill reader-prose overscroll-contain px-5 pb-28 pt-16"
        style={{
          ["--reader-size" as string]: `${textSize}rem`,
          WebkitOverflowScrolling: "touch",
        }}
      >
        {error ? <p className="text-sm text-muted">{error}</p> : null}
        {loading ? <p className="text-sm text-muted">Loading…</p> : null}
        {!loading && !error && !paragraphs.length ? (
          <p className="text-sm text-muted">
            This section has no readable text (likely a cover or table-of-contents page).
          </p>
        ) : null}
        <div className="mx-auto max-w-xl space-y-3">
          {paragraphs.map((p) => {
            if (p.kind === "heading") {
              const text = titleCase ? toTitleCaseHeading(p.text) : p.text;
              return (
                <h3 key={p.id} className="font-display text-lg font-semibold">
                  {text}
                </h3>
              );
            }
            const highlighted = hlSet.has(p.id);
            const selected = selectedIds.has(p.id);
            const bookmarked = bmSet.has(p.id);
            const focused = focusLocusId != null && p.locusId === focusLocusId;
            const classes = [
              "reader-para w-full cursor-pointer rounded-xl px-2 py-2 text-left",
              highlighted ? "is-highlighted" : "",
              selected ? "is-selected" : "",
              focused ? "is-reading-focus" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div
                key={p.id}
                id={`reader-${p.locusId}`}
                role="button"
                tabIndex={0}
                data-locus-id={p.locusId}
                onClick={() => toggleSelect(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleSelect(p.id);
                  }
                }}
                className={classes}
              >
                {p.label ? (
                  <span className="mr-2 text-xs font-semibold text-muted">{p.label}</span>
                ) : null}
                <span className={bookmarked ? "verse-underline" : undefined}>{p.text}</span>
              </div>
            );
          })}
        </div>

        {(prev || next) && !loading ? (
          <div className="mx-auto mt-8 flex max-w-xl justify-between text-xs text-muted">
            <span>{prev ? `← ${shortLabel(prev.chapterTitle)}` : ""}</span>
            <span>{next ? `${shortLabel(next.chapterTitle)} →` : ""}</span>
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
                onFocusClear?.();
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
    </div>
  );
}

function shortLabel(title: string) {
  if (title.length <= 28) return title;
  return `${title.slice(0, 26)}…`;
}
