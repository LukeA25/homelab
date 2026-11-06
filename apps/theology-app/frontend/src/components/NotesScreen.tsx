import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import {
  Bold,
  CheckSquare,
  Heading,
  Heading2,
  Italic,
  Link2,
  List,
  MessageSquare,
  Quote,
  Square,
  Trash2,
  Type,
} from "lucide-react";
import {
  applyMarker,
  isHttpUrl,
  isLocusRef,
  normalizeHref,
  parseLine,
  previewPlain,
  serializeRef,
  splitInlineMarks,
  wrapAsInlineLink,
  wrapBold,
  wrapItalic,
  type LineFormat,
  WIKI_LINK_RE,
  MD_LINK_RE,
} from "../lib/notesFormat";
import { workIdForLocus } from "../lib/selectionClipboard";
import type { NoteDoc, NoteSection } from "../lib/types";

type EditorLine = {
  id: string;
  format: LineFormat;
  text: string;
  href?: string;
};

type NotesScreenProps = {
  docs: NoteDoc[];
  openDocId: string | null;
  sectionFilter: NoteSection | "all";
  clipboardHint?: string | null;
  onSectionFilter: (s: NoteSection | "all") => void;
  onOpenDoc: (id: string | null) => void;
  onCreateDoc: (section: NoteSection) => void;
  onUpdateDoc: (doc: NoteDoc) => void;
  onDeleteDoc?: (id: string) => void;
  onOpenLocus: (workId: string, locusId: string) => void;
};

export function NotesScreen({
  docs,
  openDocId,
  sectionFilter,
  clipboardHint,
  onSectionFilter,
  onOpenDoc,
  onCreateDoc,
  onUpdateDoc,
  onDeleteDoc,
  onOpenLocus,
}: NotesScreenProps) {
  const open = docs.find((d) => d.id === openDocId) ?? null;
  const filtered =
    sectionFilter === "all" ? docs : docs.filter((d) => d.section === sectionFilter);

  if (open) {
    return (
      <NoteEditor
        doc={open}
        onBack={() => onOpenDoc(null)}
        onUpdate={onUpdateDoc}
        onOpenLocus={onOpenLocus}
      />
    );
  }

  return (
    <div className="pane-scroll pane-fill overscroll-contain px-5 pb-8 pt-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold">Notes</h1>
        <button
          type="button"
          onClick={() => onCreateDoc(sectionFilter === "apologetics" ? "apologetics" : "personal")}
          className="btn-accent rounded-pill px-3 py-2 text-sm font-semibold"
        >
          New
        </button>
      </div>

      {clipboardHint ? (
        <p className="mt-3 text-sm text-muted">
          Copied {clipboardHint} — open a note and paste.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["all", "All"],
            ["personal", "Personal"],
            ["apologetics", "Apologetics"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onSectionFilter(id)}
            className={`rounded-pill border px-3 py-1.5 text-sm font-semibold ${
              sectionFilter === id
                ? "border-accent bg-accent-soft text-accent"
                : "border-border text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="mt-4 divide-y divide-border">
        {filtered.map((d) => (
          <NoteListRow
            key={d.id}
            doc={d}
            onOpen={() => onOpenDoc(d.id)}
            onDelete={
              onDeleteDoc
                ? () => {
                    if (
                      window.confirm(`Delete “${d.title || "Untitled"}”? This cannot be undone.`)
                    ) {
                      onDeleteDoc(d.id);
                    }
                  }
                : undefined
            }
          />
        ))}
      </ul>
    </div>
  );
}

function NoteListRow({
  doc,
  onOpen,
  onDelete,
}: {
  doc: NoteDoc;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const startX = useRef<number | null>(null);
  const startOffset = useRef(0);

  return (
    <li className="relative overflow-hidden">
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          className="absolute inset-y-0 right-0 flex w-20 flex-col items-center justify-center bg-red-700 text-xs font-semibold text-white"
        >
          Delete
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => {
          if (offset < -40) {
            setOffset(-80);
            return;
          }
          setOffset(0);
          onOpen();
        }}
        onTouchStart={(e) => {
          if (!onDelete) return;
          startX.current = e.touches[0]?.clientX ?? null;
          startOffset.current = offset;
        }}
        onTouchMove={(e) => {
          if (startX.current == null || !onDelete) return;
          const x = e.touches[0]?.clientX ?? startX.current;
          const delta = x - startX.current;
          const next = Math.min(0, Math.max(-80, startOffset.current + delta));
          setOffset(next);
        }}
        onTouchEnd={() => {
          startX.current = null;
          setOffset((v) => (v < -40 ? -80 : 0));
        }}
        className="relative z-10 w-full bg-bg py-3.5 text-left transition-transform"
        style={{ transform: `translateX(${offset}px)` }}
      >
        <p className="font-display text-lg font-semibold">{doc.title}</p>
        <p className="mt-1 line-clamp-2 text-sm text-muted">
          {previewPlain(doc.body) || "Empty note"}
        </p>
      </button>
    </li>
  );
}

function NoteEditor({
  doc,
  onBack,
  onUpdate,
  onOpenLocus,
}: {
  doc: NoteDoc;
  onBack: () => void;
  onUpdate: (doc: NoteDoc) => void;
  onOpenLocus: (workId: string, locusId: string) => void;
}) {
  const [lines, setLines] = useState<EditorLine[]>(() => parseBody(doc.body));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [keyboardPad, setKeyboardPad] = useState(0);
  const skipSync = useRef(false);
  const inputRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const selectionRefs = useRef<Record<string, { start: number; end: number }>>({});
  const linesRef = useRef(lines);
  const focusedRef = useRef(false);
  const lastInsetRef = useRef(0);
  linesRef.current = lines;

  useEffect(() => {
    setLines(parseBody(doc.body));
    setActiveId(null);
  }, [doc.id]);

  useEffect(() => {
    if (skipSync.current) {
      skipSync.current = false;
      return;
    }
    const body = serializeBody(lines);
    if (body === doc.body) return;
    onUpdate({ ...doc, body, updatedAt: new Date().toISOString() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function sync() {
      if (!window.visualViewport) return;
      const inset =
        window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop;
      const next = Math.max(0, inset);
      // Only dock toolbar / pad when this note editor owns focus.
      setKeyboardPad(focusedRef.current ? next : 0);
      lastInsetRef.current = next;
    }
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

  const active = useMemo(() => lines.find((l) => l.id === activeId) ?? null, [lines, activeId]);

  function patchTitle(title: string) {
    onUpdate({ ...doc, title, updatedAt: new Date().toISOString() });
  }

  function updateLine(id: string, partial: Partial<EditorLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...partial } : l)));
  }

  function openHref(href: string) {
    const h = href.trim();
    if (isHttpUrl(h)) {
      window.open(h, "_blank", "noopener,noreferrer");
      return;
    }
    if (h.startsWith("studydesk://")) {
      const rest = h.replace(/^studydesk:\/\//, "");
      onOpenLocus(workIdForLocus(rest), rest);
      return;
    }
    onOpenLocus(workIdForLocus(h), h);
  }

  function applyFormat(format: Exclude<LineFormat, "ref">) {
    const id = activeId ?? lines[lines.length - 1]?.id;
    if (!id) return;
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.id === id);
      if (idx < 0) return prev;
      const cur = prev[idx]!;
      if (cur.format === "ref") return prev;
      const target = cur.format === format ? "text" : format;
      let next = prev.map((l) =>
        l.id === id ? { ...l, format: target, href: undefined } : l,
      );
      if (cur.format === "quote" && target !== "quote" && next[idx + 1]?.format === "ref") {
        next = next.filter((_, i) => i !== idx + 1);
      }
      return next;
    });
    requestAnimationFrame(() => inputRefs.current[id]?.focus());
  }

  async function applyLink() {
    const id = activeId ?? lines[lines.length - 1]?.id;
    if (!id) return;
    const line = lines.find((l) => l.id === id);
    if (!line || line.format === "ref") return;

    let raw = "";
    try {
      raw = (await navigator.clipboard.readText()).trim();
    } catch {
      raw = "";
    }
    if (!isHttpUrl(raw) && !isLocusRef(raw)) {
      raw = (window.prompt("Paste a URL or reference") ?? "").trim();
    }
    if (!raw) return;

    const norm = normalizeHref(raw);
    const href = norm.href;
    const sel = selectionRefs.current[id] ?? { start: 0, end: 0 };
    const hasSel = sel.end > sel.start;
    const selected = hasSel ? line.text.slice(sel.start, sel.end) : "";

    if (!hasSel && !line.text.trim() && !isHttpUrl(href)) {
      updateLine(id, {
        format: "ref",
        text: norm.label || href,
        href,
      });
      return;
    }

    const label = selected.trim() || line.text.trim() || norm.label || href;
    const wrapped = wrapAsInlineLink(label, href);

    if (hasSel) {
      const next =
        line.text.slice(0, sel.start) + wrapped + line.text.slice(sel.end);
      updateLine(id, { text: next });
      return;
    }

    updateLine(id, { text: wrapped });
  }

  function wrapSelection(kind: "bold" | "italic") {
    const id = activeId ?? lines[lines.length - 1]?.id;
    if (!id) return;
    const line = lines.find((l) => l.id === id);
    if (!line || line.format === "ref") return;
    const sel = selectionRefs.current[id] ?? { start: 0, end: 0 };
    const hasSel = sel.end > sel.start;
    const selected = hasSel ? line.text.slice(sel.start, sel.end) : line.text;
    const wrapped = kind === "bold" ? wrapBold(selected) : wrapItalic(selected);
    if (hasSel) {
      updateLine(id, {
        text: line.text.slice(0, sel.start) + wrapped + line.text.slice(sel.end),
      });
      return;
    }
    updateLine(id, { text: wrapped });
  }

  function addLineAfter(id: string) {
    const curLines = linesRef.current;
    const idx = curLines.findIndex((l) => l.id === id);
    const cur = idx >= 0 ? curLines[idx] : undefined;
    let neu: EditorLine = { id: newLineId(), format: "text", text: "" };
    if (cur?.format === "bullet") neu = { ...neu, format: "bullet" };
    if (cur?.format === "check" || cur?.format === "checkDone") {
      neu = { ...neu, format: "check" };
    }
    // Quotes exit to a blank text line below the citation, if any.
    const insertAfterId =
      cur?.format === "quote" && curLines[idx + 1]?.format === "ref"
        ? curLines[idx + 1]!.id
        : id;
    setLines((prev) => {
      const i = prev.findIndex((l) => l.id === insertAfterId);
      if (i < 0) return [...prev, neu];
      const next = [...prev];
      next.splice(i + 1, 0, neu);
      return next;
    });
    setActiveId(neu.id);
    requestAnimationFrame(() => inputRefs.current[neu.id]?.focus());
  }

  function removeLine(id: string) {
    setLines((prev) => {
      if (prev.length <= 1) return [{ id: newLineId(), format: "text", text: "" }];
      return prev.filter((l) => l.id !== id);
    });
  }

  /** Quote + following citation are a pair — delete them together. */
  function quoteRefIdsToRemove(id: string): string[] {
    const curLines = linesRef.current;
    const idx = curLines.findIndex((l) => l.id === id);
    if (idx < 0) return [];
    const cur = curLines[idx]!;
    if (cur.format === "quote" && curLines[idx + 1]?.format === "ref") {
      return [cur.id, curLines[idx + 1]!.id];
    }
    if (cur.format === "ref" && curLines[idx - 1]?.format === "quote") {
      return [curLines[idx - 1]!.id, cur.id];
    }
    return [cur.id];
  }

  function removeQuoteRefBlock(id: string) {
    const curLines = linesRef.current;
    const removeIds = new Set(quoteRefIdsToRemove(id));
    if (!removeIds.size) return;

    const firstIdx = Math.min(
      ...[...removeIds]
        .map((rid) => curLines.findIndex((l) => l.id === rid))
        .filter((i) => i >= 0),
    );

    let focusId: string | null = null;
    for (let i = firstIdx - 1; i >= 0; i--) {
      const cand = curLines[i];
      if (cand && !removeIds.has(cand.id) && cand.format !== "ref") {
        focusId = cand.id;
        break;
      }
    }

    setLines((prev) => {
      const next = prev.filter((l) => !removeIds.has(l.id));
      return next.length ? next : [{ id: newLineId(), format: "text", text: "" }];
    });

    if (focusId) {
      setActiveId(focusId);
      requestAnimationFrame(() => inputRefs.current[focusId!]?.focus());
    } else {
      setActiveId(null);
    }
  }

  function handleBackspaceEmpty(id: string) {
    const curLines = linesRef.current;
    const idx = curLines.findIndex((l) => l.id === id);
    const cur = curLines[idx];
    if (!cur) return;

    if (cur.format === "bullet" || cur.format === "check" || cur.format === "checkDone") {
      updateLine(id, { format: "text" });
      return;
    }

    if (cur.format === "quote" || cur.format === "ref") {
      removeQuoteRefBlock(id);
      return;
    }

    removeLine(id);
    const prev = curLines[idx - 1];
    if (prev && prev.format !== "ref") {
      setActiveId(prev.id);
      requestAnimationFrame(() => inputRefs.current[prev.id]?.focus());
    } else if (prev?.format === "ref" && curLines[idx - 2]) {
      const before = curLines[idx - 2]!;
      setActiveId(before.id);
      requestAnimationFrame(() => inputRefs.current[before.id]?.focus());
    }
  }

  function pasteAtLine(id: string, raw: string) {
    const incoming = parseBody(raw);
    if (incoming.length <= 1 && incoming[0]?.format === "text") {
      const cur = lines.find((l) => l.id === id);
      updateLine(id, { text: (cur?.text ?? "") + (incoming[0]?.text ?? raw) });
      return;
    }
    setLines((prev) => {
      const i = prev.findIndex((l) => l.id === id);
      if (i < 0) return [...prev, ...incoming];
      const cur = prev[i]!;
      const head = [...prev.slice(0, i)];
      const tail = prev.slice(i + 1);
      if (!cur.text.trim() && cur.format === "text") {
        return [...head, ...incoming, ...tail];
      }
      return [...head, cur, ...incoming, ...tail];
    });
  }

  const showToolbar = focused;

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <button type="button" onClick={onBack} className="text-sm font-medium text-accent">
          ← Notes
        </button>
        <input
          value={doc.title}
          data-note-title="1"
          onChange={(e) => patchTitle(e.target.value)}
          onFocus={() => {
            focusedRef.current = true;
            setFocused(true);
            if (lastInsetRef.current > 0) setKeyboardPad(lastInsetRef.current);
          }}
          onBlur={() => {
            window.setTimeout(() => {
              const still = Object.values(inputRefs.current).some(
                (el) => el === document.activeElement,
              );
              if (still) return;
              focusedRef.current = false;
              setFocused(false);
              setKeyboardPad(0);
            }, 180);
          }}
          className="min-w-0 flex-1 bg-transparent font-display text-lg font-semibold outline-none"
          placeholder="Untitled"
        />
      </div>

      <div
        className="pane-scroll min-h-0 flex-1 space-y-2 overflow-y-scroll overscroll-contain px-4 py-4"
        style={{ paddingBottom: showToolbar ? 72 : 16, WebkitOverflowScrolling: "touch" }}
      >
        {lines.map((line) => (
          <LineRow
            key={line.id}
            line={line}
            active={activeId === line.id}
            inputRef={(el) => {
              inputRefs.current[line.id] = el;
            }}
            onFocus={() => {
              setActiveId(line.id);
              setFocused(true);
              focusedRef.current = true;
              if (lastInsetRef.current > 0) setKeyboardPad(lastInsetRef.current);
            }}
            onBlur={() => {
              window.setTimeout(() => {
                const still =
                  Object.values(inputRefs.current).some((el) => el === document.activeElement) ||
                  document.activeElement?.getAttribute("data-note-title") === "1";
                if (still) return;
                focusedRef.current = false;
                setFocused(false);
                setKeyboardPad(0);
              }, 180);
            }}
            onChangeText={(text) => updateLine(line.id, { text })}
            onSelectionChange={(start, end) => {
              selectionRefs.current[line.id] = { start, end };
            }}
            onEnter={() => addLineAfter(line.id)}
            onBackspaceEmpty={() => handleBackspaceEmpty(line.id)}
            onOpenHref={openHref}
            onToggleCheck={() => {
              if (line.format === "check") updateLine(line.id, { format: "checkDone" });
              else if (line.format === "checkDone") updateLine(line.id, { format: "check" });
            }}
            onPasteText={(raw) => pasteAtLine(line.id, raw)}
            onRemove={() => {
              if (line.format === "quote" || line.format === "ref") {
                removeQuoteRefBlock(line.id);
              } else {
                removeLine(line.id);
              }
            }}
          />
        ))}
      </div>

      {showToolbar && (
        <div
          className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-2"
          style={{ bottom: keyboardPad > 0 ? keyboardPad : 0 }}
        >
          <div
            className="pointer-events-auto mb-1 flex max-w-lg gap-1 overflow-x-auto rounded-pill border border-border bg-bg-elevated/95 px-1.5 py-1.5 shadow-panel backdrop-blur"
            onMouseDown={(e) => e.preventDefault()}
          >
            <ToolBtn icon={Type} active={active?.format === "text"} onClick={() => applyFormat("text")} />
            <ToolBtn
              icon={Heading}
              active={active?.format === "header"}
              onClick={() => applyFormat("header")}
            />
            <ToolBtn
              icon={Heading2}
              active={active?.format === "subtitle"}
              onClick={() => applyFormat("subtitle")}
            />
            <ToolBtn
              icon={Quote}
              active={active?.format === "quote"}
              onClick={() => applyFormat("quote")}
            />
            <ToolBtn
              icon={List}
              active={active?.format === "bullet"}
              onClick={() => applyFormat("bullet")}
            />
            <ToolBtn
              icon={active?.format === "checkDone" ? CheckSquare : Square}
              active={active?.format === "check" || active?.format === "checkDone"}
              onClick={() => {
                if (active?.format === "check") applyFormat("checkDone");
                else if (active?.format === "checkDone") applyFormat("check");
                else applyFormat("check");
              }}
            />
            <ToolBtn
              icon={MessageSquare}
              active={active?.format === "comment"}
              onClick={() => applyFormat("comment")}
            />
            <ToolBtn icon={Bold} onClick={() => wrapSelection("bold")} />
            <ToolBtn icon={Italic} onClick={() => wrapSelection("italic")} />
            <ToolBtn icon={Link2} label="Link" onClick={() => void applyLink()} />
            {active?.format === "quote" || active?.format === "ref" ? (
              <ToolBtn
                icon={Trash2}
                label="Delete"
                onClick={() => {
                  if (activeId) removeQuoteRefBlock(activeId);
                }}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function LineRow({
  line,
  active,
  inputRef,
  onFocus,
  onBlur,
  onChangeText,
  onSelectionChange,
  onEnter,
  onBackspaceEmpty,
  onOpenHref,
  onToggleCheck,
  onPasteText,
  onRemove,
}: {
  line: EditorLine;
  active: boolean;
  inputRef: (el: HTMLTextAreaElement | null) => void;
  onFocus: () => void;
  onBlur: () => void;
  onChangeText: (text: string) => void;
  onSelectionChange: (start: number, end: number) => void;
  onEnter: () => void;
  onBackspaceEmpty: () => void;
  onOpenHref: (href: string) => void;
  onToggleCheck: () => void;
  onPasteText: (raw: string) => void;
  onRemove: () => void;
}) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const showRich = !active && splitInlineMarks(line.text).some((p) => p.kind !== "text");

  useEffect(() => {
    if (active && !showRich) localRef.current?.focus();
  }, [active, showRich]);

  function setRefs(el: HTMLTextAreaElement | null) {
    localRef.current = el;
    inputRef(el);
  }
  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const raw = e.clipboardData.getData("text");
    if (
      !raw.includes("\n") &&
      !WIKI_LINK_RE.test(raw.trim()) &&
      !MD_LINK_RE.test(raw.trim()) &&
      !raw.trim().startsWith("— ")
    ) {
      return;
    }
    e.preventDefault();
    onPasteText(raw);
  }

  if (line.format === "ref") {
    return (
      <div className={`flex justify-end px-1 py-0.5 ${active ? "ring-1 ring-accent/30 rounded-lg" : ""}`}>
        <button
          type="button"
          title="Click to open · Delete/Backspace removes quote + link"
          onClick={() => {
            onFocus();
            if (line.href) onOpenHref(line.href);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            onRemove();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" || e.key === "Delete") {
              e.preventDefault();
              onRemove();
            }
            if (e.key === "Enter") {
              e.preventDefault();
              onEnter();
            }
          }}
          className="text-right text-sm font-semibold text-accent underline underline-offset-2 outline-none"
        >
          <span className="mr-1 font-medium text-muted no-underline">—</span>
          {line.text || line.href || "Reference"}
        </button>
      </div>
    );
  }

  const textClass =
    line.format === "header"
      ? "font-display text-2xl font-semibold leading-snug"
      : line.format === "subtitle"
        ? "font-display text-xl font-semibold leading-snug text-text"
      : line.format === "quote"
        ? "font-reader text-[17px] italic leading-relaxed text-text"
        : line.format === "comment"
          ? "text-sm text-muted"
          : line.format === "checkDone"
            ? "font-reader text-base leading-relaxed text-muted line-through"
            : "font-reader text-base leading-relaxed";

  const shell =
    line.format === "quote"
      ? "rounded-r-lg border-l-4 border-accent bg-accent-soft/80 py-2.5 pl-3 pr-2"
      : line.format === "comment"
        ? "rounded-lg bg-bg-elevated px-3 py-2"
        : "";

  return (
    <div
      className={`flex items-start gap-2 px-1 py-0.5 ${active ? "rounded-lg ring-1 ring-accent/30" : ""} ${shell}`}
    >
      {line.format === "bullet" ? (
        <span className="mt-1.5 w-4 shrink-0 text-center font-semibold text-accent">•</span>
      ) : null}
      {line.format === "check" || line.format === "checkDone" ? (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onToggleCheck}
          className="mt-1.5 shrink-0 text-accent"
          aria-label="Toggle checklist item"
        >
          {line.format === "checkDone" ? (
            <CheckSquare className="h-4 w-4" />
          ) : (
            <Square className="h-4 w-4" />
          )}
        </button>
      ) : null}

      {active || !splitInlineMarks(line.text).some((p) => p.kind !== "text") ? (
        <textarea
          ref={setRefs}
          value={line.text}
          rows={1}
          onFocus={onFocus}
          onBlur={onBlur}
          onPaste={handlePaste}
          onSelect={(e) => {
            const t = e.currentTarget;
            onSelectionChange(t.selectionStart, t.selectionEnd);
          }}
          onChange={(e) => {
            onChangeText(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onEnter();
            }
            if (e.key === "Backspace" && line.text === "") {
              e.preventDefault();
              onBackspaceEmpty();
            }
          }}
          placeholder={
            line.format === "header"
              ? "Heading"
              : line.format === "subtitle"
                ? "Subtitle"
              : line.format === "quote"
                ? "Quote"
                : line.format === "comment"
                  ? "Comment"
                  : line.format === "bullet"
                    ? "List item"
                    : line.format === "check" || line.format === "checkDone"
                      ? "To-do"
                      : "Write…"
          }
          className={`min-h-[1.75rem] w-full resize-none bg-transparent outline-none ${textClass}`}
        />
      ) : (
        <button
          type="button"
          onClick={onFocus}
          className={`min-h-[1.75rem] w-full text-left ${textClass}`}
        >
          {splitInlineMarks(line.text).map((part, i) => {
            if (part.kind === "text") return <span key={i}>{part.text}</span>;
            if (part.kind === "bold")
              return (
                <strong key={i} className="font-semibold">
                  {part.text}
                </strong>
              );
            if (part.kind === "italic")
              return (
                <em key={i} className="italic">
                  {part.text}
                </em>
              );
            return (
              <span
                key={i}
                role="link"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenHref(part.href);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenHref(part.href);
                  }
                }}
                className="font-semibold text-accent underline underline-offset-2"
              >
                {part.text}
              </span>
            );
          })}
        </button>
      )}
    </div>
  );
}

function ToolBtn({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: typeof Type;
  label?: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1 rounded-pill px-2.5 py-2 text-xs font-semibold ${
        active ? "bg-accent text-bg" : "hover:bg-surface"
      }`}
    >
      <Icon className={`h-3.5 w-3.5 ${active ? "" : "text-accent"}`} />
      {label}
    </button>
  );
}

function newLineId() {
  return `ln-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function parseBody(body: string): EditorLine[] {
  const raw = body.replace(/\r\n/g, "\n");
  const parts = raw.length ? raw.split("\n") : [""];
  if (parts.length > 1 && parts[parts.length - 1] === "") parts.pop();
  if (parts.length === 0) parts.push("");
  return parts.map((line) => {
    const parsed = parseLine(line);
    return {
      id: newLineId(),
      format: parsed.format,
      text: parsed.content,
      href: parsed.href,
    };
  });
}

function serializeBody(lines: EditorLine[]): string {
  return lines
    .map((l) => {
      if (l.format === "ref") return serializeRef(l.href || l.text, l.text || l.href || "");
      return applyMarker(l.format, l.text);
    })
    .join("\n");
}
