import { useEffect, useMemo, useRef, useState } from "react";
import { Heading, Link2, MessageSquare, Plus, Quote, Type } from "lucide-react";
import type { NoteDoc, NoteSection } from "../lib/types";

type LineFormat = "text" | "header" | "quote" | "comment" | "link";

type EditorLine = {
  id: string;
  format: LineFormat;
  text: string;
  /** For link lines */
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
        clipboardHint={clipboardHint}
      />
    );
  }

  return (
    <div className="pane-scroll pane-fill overscroll-contain px-5 pb-8 pt-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Notes</h1>
          <p className="mt-1 text-sm text-muted">Live-formatted text notes.</p>
        </div>
        <button
          type="button"
          onClick={() => onCreateDoc(sectionFilter === "apologetics" ? "apologetics" : "personal")}
          className="btn-accent rounded-pill px-3 py-2 text-sm font-semibold"
        >
          New
        </button>
      </div>

      {clipboardHint && (
        <div className="mt-4 rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm">
          <p className="font-medium text-accent">Copied reference</p>
          <p className="mt-1 text-muted">{clipboardHint}</p>
          <p className="mt-2 text-xs text-muted">Open a note, select a line, tap Link.</p>
        </div>
      )}

      <div className="mt-5 flex gap-1 rounded-pill border border-border bg-bg-elevated p-1">
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
            className={`flex-1 rounded-pill px-3 py-1.5 text-sm font-semibold ${
              sectionFilter === id ? "btn-accent" : "text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="mt-5 space-y-2">
        {filtered.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => onOpenDoc(d.id)}
              className="w-full rounded-2xl border border-border bg-surface px-4 py-4 text-left"
            >
              <p className="font-display text-lg font-semibold">{d.title}</p>
              <p className="mt-1 text-sm text-muted line-clamp-2">
                {previewPlain(d.body) || "Empty note"}
              </p>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {d.section}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NoteEditor({
  doc,
  onBack,
  onUpdate,
  onOpenLocus,
  clipboardHint,
}: {
  doc: NoteDoc;
  onBack: () => void;
  onUpdate: (doc: NoteDoc) => void;
  onOpenLocus: (workId: string, locusId: string) => void;
  clipboardHint?: string | null;
}) {
  const [lines, setLines] = useState<EditorLine[]>(() => parseBody(doc.body));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [keyboardPad, setKeyboardPad] = useState(0);
  const skipSync = useRef(false);
  const inputRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  // Sync from parent when switching docs
  useEffect(() => {
    setLines(parseBody(doc.body));
    setActiveId(null);
  }, [doc.id]);

  // Push local edits to parent as markdown body
  useEffect(() => {
    if (skipSync.current) {
      skipSync.current = false;
      return;
    }
    const body = serializeBody(lines);
    if (body === doc.body) return;
    onUpdate({ ...doc, body, updatedAt: new Date().toISOString() });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional local→parent sync
  }, [lines]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function sync() {
      if (!window.visualViewport) return;
      const inset =
        window.innerHeight -
        window.visualViewport.height -
        window.visualViewport.offsetTop;
      setKeyboardPad(Math.max(0, inset));
    }
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

  const active = useMemo(
    () => lines.find((l) => l.id === activeId) ?? null,
    [lines, activeId],
  );

  function patchTitle(title: string) {
    onUpdate({ ...doc, title, updatedAt: new Date().toISOString() });
  }

  function updateLine(id: string, partial: Partial<EditorLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...partial } : l)));
  }

  function applyFormat(format: LineFormat) {
    const id = activeId ?? lines[lines.length - 1]?.id;
    if (!id) return;
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        if (format === "link") {
          const label =
            clipboardHint?.split(";")[0]?.trim() ||
            l.href ||
            l.text ||
            window.prompt("Reference (e.g. Ps.23.1)", "") ||
            "";
          if (!label.trim()) return l;
          return {
            ...l,
            format: "link",
            text: label.trim(),
            href: label.trim(),
          };
        }
        return {
          ...l,
          format,
          href: undefined,
          text: l.format === "link" ? l.text : l.text,
        };
      }),
    );
    requestAnimationFrame(() => inputRefs.current[id]?.focus());
  }

  function addLineAfter(id: string) {
    const neu: EditorLine = { id: newLineId(), format: "text", text: "" };
    setLines((prev) => {
      const i = prev.findIndex((l) => l.id === id);
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

  const showToolbar = focused || keyboardPad > 40 || !!activeId;

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <button type="button" onClick={onBack} className="text-sm font-medium text-accent">
          ← Notes
        </button>
        <input
          value={doc.title}
          onChange={(e) => patchTitle(e.target.value)}
          className="min-w-0 flex-1 bg-transparent font-display text-lg font-semibold outline-none"
        />
      </div>

      <div
        className="pane-scroll min-h-0 flex-1 space-y-1 overflow-y-scroll overscroll-contain px-4 py-4"
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
            }}
            onBlur={() => {
              window.setTimeout(() => setFocused(false), 180);
            }}
            onChangeText={(text) => updateLine(line.id, { text })}
            onEnter={() => addLineAfter(line.id)}
            onBackspaceEmpty={() => {
              removeLine(line.id);
              const idx = lines.findIndex((l) => l.id === line.id);
              const prev = lines[idx - 1];
              if (prev) {
                setActiveId(prev.id);
                requestAnimationFrame(() => inputRefs.current[prev.id]?.focus());
              }
            }}
            onOpenLink={() => {
              if (line.href) onOpenLocus("bible-rsvce", line.href);
            }}
          />
        ))}
        <button
          type="button"
          onClick={() => {
            const neu: EditorLine = { id: newLineId(), format: "text", text: "" };
            setLines((prev) => [...prev, neu]);
            setActiveId(neu.id);
            requestAnimationFrame(() => inputRefs.current[neu.id]?.focus());
          }}
          className="flex items-center gap-2 py-2 text-sm text-muted"
        >
          <Plus className="h-4 w-4" /> New line
        </button>
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
            <ToolBtn
              icon={Type}
              label="Text"
              active={active?.format === "text"}
              onClick={() => applyFormat("text")}
            />
            <ToolBtn
              icon={Heading}
              label="Header"
              active={active?.format === "header"}
              onClick={() => applyFormat("header")}
            />
            <ToolBtn
              icon={Quote}
              label="Quote"
              active={active?.format === "quote"}
              onClick={() => applyFormat("quote")}
            />
            <ToolBtn
              icon={MessageSquare}
              label="Comment"
              active={active?.format === "comment"}
              onClick={() => applyFormat("comment")}
            />
            <ToolBtn
              icon={Link2}
              label="Link"
              active={active?.format === "link"}
              onClick={() => applyFormat("link")}
            />
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
  onEnter,
  onBackspaceEmpty,
  onOpenLink,
}: {
  line: EditorLine;
  active: boolean;
  inputRef: (el: HTMLTextAreaElement | null) => void;
  onFocus: () => void;
  onBlur: () => void;
  onChangeText: (text: string) => void;
  onEnter: () => void;
  onBackspaceEmpty: () => void;
  onOpenLink: () => void;
}) {
  const shell =
    line.format === "header"
      ? "font-display text-2xl font-semibold leading-snug"
      : line.format === "quote"
        ? "border-l-2 border-accent pl-3 font-reader italic text-muted"
        : line.format === "comment"
          ? "rounded-xl bg-bg-elevated px-3 py-2 text-sm text-muted"
          : line.format === "link"
            ? "font-semibold text-accent"
            : "font-reader text-base leading-relaxed";

  return (
    <div
      className={`rounded-xl px-1 py-0.5 transition ${active ? "ring-1 ring-accent/40" : ""}`}
    >
      {line.format === "link" ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenLink}
            className="shrink-0 text-xs font-semibold text-accent underline-offset-2 hover:underline"
          >
            Open
          </button>
          <textarea
            ref={inputRef}
            value={line.text}
            rows={1}
            onFocus={onFocus}
            onBlur={onBlur}
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
            placeholder="Reference label…"
            className={`min-h-[1.75rem] w-full resize-none bg-transparent outline-none ${shell}`}
          />
        </div>
      ) : (
        <textarea
          ref={inputRef}
          value={line.text}
          rows={1}
          onFocus={onFocus}
          onBlur={onBlur}
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
              : line.format === "quote"
                ? "Quote"
                : line.format === "comment"
                  ? "Comment"
                  : "Write…"
          }
          className={`min-h-[1.75rem] w-full resize-none bg-transparent outline-none ${shell}`}
        />
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
  label: string;
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
  // drop trailing empty from final newline
  if (parts.length > 1 && parts[parts.length - 1] === "") parts.pop();
  if (parts.length === 0) parts.push("");
  return parts.map((line) => {
    const link = line.match(/^\[([^\]]+)\]\(studydesk:\/\/([^)]+)\)$/);
    if (link) {
      return { id: newLineId(), format: "link" as const, text: link[1], href: link[2] };
    }
    if (/^#\s+/.test(line)) {
      return { id: newLineId(), format: "header" as const, text: line.replace(/^#\s+/, "") };
    }
    if (/^>\s+/.test(line)) {
      return { id: newLineId(), format: "quote" as const, text: line.replace(/^>\s+/, "") };
    }
    if (/^\/\/\s+/.test(line)) {
      return { id: newLineId(), format: "comment" as const, text: line.replace(/^\/\/\s+/, "") };
    }
    return { id: newLineId(), format: "text" as const, text: line };
  });
}

function serializeBody(lines: EditorLine[]): string {
  return lines
    .map((l) => {
      if (l.format === "header") return `# ${l.text}`;
      if (l.format === "quote") return `> ${l.text}`;
      if (l.format === "comment") return `// ${l.text}`;
      if (l.format === "link") {
        const href = l.href || l.text;
        return `[${l.text || href}](studydesk://${href})`;
      }
      return l.text;
    })
    .join("\n");
}

function previewPlain(body: string): string {
  return parseBody(body)
    .map((l) => l.text)
    .filter(Boolean)
    .join(" · ");
}
