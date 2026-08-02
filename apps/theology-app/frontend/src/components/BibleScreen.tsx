import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown } from "lucide-react";
import {
  BIBLE_ID,
  PARAGRAPHS,
  SECTIONS,
  adjacentChapter,
  sectionTitle,
} from "../lib/mockData";
import type { Bookmark, Highlight, Paragraph } from "../lib/types";
import { Sheet } from "./Sheet";

const MAX_DRAG = 52;
const COMMIT = 36;
const EDGE = 28;

type BibleScreenProps = {
  sectionId: string;
  highlights: Highlight[];
  bookmarks: Bookmark[];
  onSectionChange: (sectionId: string) => void;
  onToggleHighlight: (paragraphId: string) => void;
  onBookmark: (paragraphs: Paragraph[]) => void;
  onAskSplit: (paragraphs: Paragraph[]) => void;
  onCopyToNotes: (paragraphs: Paragraph[]) => void;
  textSize: number;
};

export function BibleScreen({
  sectionId,
  highlights,
  bookmarks,
  onSectionChange,
  onToggleHighlight,
  onBookmark,
  onAskSplit,
  onCopyToNotes,
  textSize,
}: BibleScreenProps) {
  const paragraphs = PARAGRAPHS[sectionId] ?? [];
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const dragXRef = useRef(0);
  const rafRef = useRef(0);
  const startX = useRef(0);
  const tracking = useRef(false);

  const chapter = adjacentChapter(sectionId, 0) ?? {
    bookTitle: "Bible",
    chapterTitle: sectionTitle(BIBLE_ID, sectionId),
    sectionId,
    workId: BIBLE_ID,
  };
  const prev = adjacentChapter(sectionId, -1);
  const next = adjacentChapter(sectionId, 1);

  const hlSet = new Set(
    highlights.filter((h) => h.workId === BIBLE_ID).map((h) => h.paragraphId),
  );
  const bmSet = new Set(
    bookmarks.filter((b) => b.workId === BIBLE_ID).map((b) => b.paragraphId),
  );
  const selectedParas = paragraphs.filter((p) => hlSet.has(p.id));

  useEffect(() => {
    dragXRef.current = 0;
    setDragX(0);
    tracking.current = false;
  }, [sectionId]);

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
      onSectionChange(next.sectionId);
      return;
    }
    if (dx >= COMMIT && prev) {
      onSectionChange(prev.sectionId);
      return;
    }
    dragXRef.current = 0;
    setDragX(0);
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

      {/* Edge chapter swipe only — leaves center free for vertical scroll */}
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
        className="pane-scroll pane-fill overscroll-contain px-5 pb-28 pt-14"
        style={{
          ["--reader-size" as string]: `${textSize}rem`,
          WebkitOverflowScrolling: "touch",
        }}
      >
        <p className="mb-5 text-center text-xs font-semibold uppercase tracking-[0.16em] text-muted">
          {chapter.bookTitle}
        </p>
        <article className="reader-prose mx-auto max-w-xl">
          {paragraphs.map((p) => {
            const highlighted = hlSet.has(p.id);
            const bookmarked = bmSet.has(p.id);
            return (
              // div not button: iOS blocks scroll gestures that start on <button>
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => onToggleHighlight(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onToggleHighlight(p.id);
                  }
                }}
                className={`mb-1 w-full cursor-pointer rounded-lg px-2 py-1.5 text-left ${
                  highlighted ? "bg-accent-soft" : ""
                }`}
              >
                <sup className="mr-1.5 align-super font-body text-[0.7em] font-semibold text-muted">
                  {p.verse ?? p.label}
                </sup>
                <span className={bookmarked ? "verse-underline" : undefined}>{p.text}</span>
              </div>
            );
          })}
        </article>
      </div>

      {selectedParas.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-40 flex justify-center px-3">
          <div className="pointer-events-auto flex items-center gap-1 rounded-pill border border-border bg-bg-elevated px-2 py-2 shadow-panel">
            <span className="px-2 text-xs font-semibold text-muted">{selectedParas.length}</span>
            <button
              type="button"
              onClick={() => onCopyToNotes(selectedParas)}
              className="rounded-pill px-3 py-2 text-sm font-medium hover:bg-surface"
            >
              Add note
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
              onClick={() => onBookmark(selectedParas)}
              className="rounded-pill px-3 py-2 text-sm font-medium hover:bg-surface"
            >
              Bookmark
            </button>
          </div>
        </div>
      )}

      <BookPicker
        open={pickerOpen}
        currentSectionId={sectionId}
        onClose={() => setPickerOpen(false)}
        onPick={(id) => {
          onSectionChange(id);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

function shortChapterLabel(title: string) {
  return title.replace(/^(Psalm|John|Romans)\s+/, "");
}

function BookPicker({
  open,
  currentSectionId,
  onClose,
  onPick,
}: {
  open: boolean;
  currentSectionId: string;
  onClose: () => void;
  onPick: (sectionId: string) => void;
}) {
  const [bookId, setBookId] = useState<string | null>(null);
  const books = SECTIONS[BIBLE_ID] ?? [];

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
                  onClick={() => onPick(ch.id)}
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
