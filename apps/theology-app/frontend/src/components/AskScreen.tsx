import { useCallback, useEffect, useRef, useState } from "react";
import {
  askLibrary,
  createAskThread,
  deleteAskThread,
  listAskMessages,
  listAskThreads,
  listNotes,
} from "../lib/api";
import { getAskJob, isAskJobRunning, runAskJob, subscribeAskJobs } from "../lib/askJobs";
import { isHttpUrl } from "../lib/notesFormat";
import { workIdForLocus } from "../lib/selectionClipboard";
import type {
  AskMessage,
  AskPendingAction,
  AskResponse,
  AskThread,
} from "../lib/types";
import { NotesBodyView } from "./NotesBodyView";
import { parseStudydeskHref } from "./StudyMarkdown";

type AskScreenProps = {
  seed?: string;
  threadId?: string | null;
  onThreadIdChange?: (threadId: string | null) => void;
  onOpenLocus: (workId: string, locusId: string) => void;
  onOpenWork?: (workId: string) => void;
  onOpenSection?: (workId: string, sectionId: string, title?: string) => void;
  onNotesChanged?: () => void;
  /** Fired when an Ask finishes while this screen is not mounted (e.g. user switched tabs). */
  onBackgroundComplete?: (summary: string) => void;
};

function emptyResponse(answer: string): AskResponse {
  return { answer, resources: [], citations: [], bullets: [] };
}

function SuggestedReadingPanel({
  messageId,
  recommendations,
  resources,
  onOpenWork,
  onOpenSection,
  onOpenLocus,
}: {
  messageId: string;
  recommendations: NonNullable<AskResponse["recommendations"]>;
  resources: AskResponse["resources"];
  onOpenWork?: (workId: string) => void;
  onOpenSection?: (workId: string, sectionId: string, title?: string) => void;
  onOpenLocus: (workId: string, locusId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = recommendations.length + resources.length;
  if (!count) return null;
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-0.5 text-left"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Suggested reading ({count})
        </span>
        <span className="text-xs text-muted">{open ? "▴" : "▾"}</span>
      </button>
      {open ? (
        <div className="space-y-2">
          {recommendations.map((r) => {
            const canOpenChapter = Boolean(r.inLibrary && r.workId && r.sectionId);
            const canOpenWork = Boolean(r.inLibrary && r.workId);
            return (
              <button
                key={`${messageId}-${r.catalogId}-${r.sectionId ?? "work"}`}
                type="button"
                disabled={!canOpenChapter && !canOpenWork}
                onClick={() => {
                  if (canOpenChapter && r.workId && r.sectionId) {
                    onOpenSection?.(r.workId, r.sectionId, r.sectionTitle ?? r.title);
                    return;
                  }
                  if (r.workId) onOpenWork?.(r.workId);
                }}
                className="block w-full rounded-xl border border-border bg-bg px-3 py-2 text-left disabled:opacity-60"
              >
                <div className="font-semibold text-accent">{r.title}</div>
                {r.sectionTitle ? (
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
                    Chapter / question
                  </div>
                ) : null}
                <div className="text-xs text-muted">{r.author}</div>
                <div className="mt-1 text-xs text-muted">{r.reason}</div>
                {!r.inLibrary ? (
                  <div className="mt-1 text-[11px] text-muted">Not in library yet</div>
                ) : null}
              </button>
            );
          })}
          {resources.map((r) => (
            <button
              key={`${messageId}-${r.locus.workId}:${r.locus.locusId}`}
              type="button"
              onClick={() => onOpenLocus(r.locus.workId, r.locus.locusId)}
              className="block w-full rounded-xl border border-border bg-bg px-3 py-2 text-left"
            >
              <div className="font-semibold text-accent">{r.locus.label}</div>
              <div className="mt-1 line-clamp-3 text-xs text-muted">{r.reason}</div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AskScreen({
  seed,
  threadId: threadIdProp,
  onThreadIdChange,
  onOpenLocus,
  onOpenWork,
  onOpenSection,
  onNotesChanged,
  onBackgroundComplete,
}: AskScreenProps) {
  const [draft, setDraft] = useState(seed ?? "");
  const [busy, setBusy] = useState(false);
  const [keyboardPad, setKeyboardPad] = useState(0);
  const [threads, setThreads] = useState<AskThread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(threadIdProp ?? null);
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState<AskPendingAction[]>([]);
  const [consentedNoteIds, setConsentedNoteIds] = useState<string[]>([]);
  const inputFocusedRef = useRef(false);
  const lastInsetRef = useRef(0);
  const lastUserQRef = useRef("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);
  const threadIdRef = useRef<string | null>(threadIdProp ?? null);
  const consentedRef = useRef<string[]>([]);
  const onNotesChangedRef = useRef(onNotesChanged);
  const onBackgroundCompleteRef = useRef(onBackgroundComplete);
  onNotesChangedRef.current = onNotesChanged;
  onBackgroundCompleteRef.current = onBackgroundComplete;
  consentedRef.current = consentedNoteIds;
  threadIdRef.current = threadId;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const bindThread = useCallback(
    (id: string | null) => {
      setThreadId(id);
      threadIdRef.current = id;
      onThreadIdChange?.(id);
    },
    [onThreadIdChange],
  );

  const refreshThreads = useCallback(async () => {
    try {
      const rows = await listAskThreads();
      setThreads(rows);
      return rows;
    } catch {
      return [] as AskThread[];
    }
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    try {
      const rows = await listAskMessages(id);
      setMessages(
        rows.map((m) => ({
          id: m.id,
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
          response: m.response ?? undefined,
          createdAt: m.createdAt,
        })),
      );
      const lastAsst = [...rows].reverse().find((m) => m.role === "assistant");
      setPending(lastAsst?.response?.pendingActions ?? []);
      const lastUser = [...rows].reverse().find((m) => m.role === "user");
      if (lastUser) lastUserQRef.current = lastUser.content;
    } catch {
      setMessages([]);
      setPending([]);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const rows = await refreshThreads();
      const preferred =
        threadIdProp && rows.some((t) => t.id === threadIdProp) ? threadIdProp : null;
      const next = preferred ?? rows[0]?.id ?? null;
      if (next) {
        bindThread(next);
        await loadMessages(next);
      } else {
        bindThread(null);
        setMessages([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (seed) setDraft(seed);
  }, [seed]);

  /** Reattach to in-flight Ask jobs after tab switches (screen remount). */
  useEffect(() => {
    let cancelled = false;

    async function reattach(tid: string | null) {
      const job = getAskJob(tid);
      if (!job || !tid) return;
      setBusy(true);
      setMessages((prev) => {
        const hasQ = prev.some((m) => m.role === "user" && m.content === job.question);
        if (hasQ) return prev;
        const now = new Date().toISOString();
        return [
          ...prev,
          { id: `local-u-bg-${now}`, role: "user", content: job.question, createdAt: now },
        ];
      });
      try {
        await job.promise;
      } catch {
        /* surfaced inside job work */
      }
      if (cancelled || !mountedRef.current || threadIdRef.current !== tid) return;
      await loadMessages(tid);
      await refreshThreads();
      setBusy(false);
    }

    void reattach(threadId);

    const unsub = subscribeAskJobs((changedId) => {
      if (changedId !== threadIdRef.current) return;
      if (isAskJobRunning(changedId)) {
        setBusy(true);
        return;
      }
      void (async () => {
        if (!mountedRef.current || threadIdRef.current !== changedId) return;
        await loadMessages(changedId);
        await refreshThreads();
        setBusy(false);
      })();
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [threadId, loadMessages, refreshThreads]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy, pending]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function sync() {
      if (!window.visualViewport) return;
      const inset =
        window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop;
      const next = Math.max(0, inset);
      lastInsetRef.current = next;
      if (inputFocusedRef.current) setKeyboardPad(next);
    }
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

  function openHref(href: string) {
    const h = href.trim();
    if (isHttpUrl(h)) {
      window.open(h, "_blank", "noopener,noreferrer");
      return;
    }
    if (h.startsWith("studydesk://")) {
      const target = parseStudydeskHref(h);
      if (target.kind === "locus") {
        onOpenLocus(target.workId, target.locusId);
        return;
      }
      if (target.kind === "work") {
        onOpenWork?.(target.catalogOrWorkId);
        return;
      }
    }
    onOpenLocus(workIdForLocus(h), h);
  }

  async function ensureThread(): Promise<string> {
    if (threadId) return threadId;
    const t = await createAskThread("New chat");
    bindThread(t.id);
    setThreads((prev) => [t, ...prev.filter((x) => x.id !== t.id)]);
    return t.id;
  }

  async function runAsk(
    question: string,
    opts?: {
      noteIds?: string[];
      confirmedActions?: Array<Record<string, unknown>>;
      optimisticUser?: boolean;
    },
  ) {
    const text = question.trim();
    if (!text || busy) return;
    if (threadId && isAskJobRunning(threadId)) return;
    setBusy(true);
    setPending([]);
    lastUserQRef.current = text;
    const now = new Date().toISOString();
    if (opts?.optimisticUser !== false) {
      setMessages((prev) => [
        ...prev,
        { id: `local-u-${now}`, role: "user", content: text, createdAt: now },
      ]);
    }
    let tid = threadId;
    try {
      tid = await ensureThread();
      const noteIds = opts?.noteIds ?? consentedRef.current;
      const confirmedActions = opts?.confirmedActions ?? [];
      await runAskJob(tid, text, async () => {
        try {
          const response = await askLibrary(text, {
            seed,
            limit: 8,
            allowActions: true,
            threadId: tid!,
            noteIds,
            confirmedActions,
          });
          if (response.actionsTaken?.length) onNotesChangedRef.current?.();
          if (!mountedRef.current) {
            onBackgroundCompleteRef.current?.("Ask reply ready");
            return;
          }
          if (response.threadId && response.threadId !== tid) bindThread(response.threadId);
          const activeId = response.threadId ?? tid!;
          if (threadIdRef.current === tid || threadIdRef.current === activeId) {
            await loadMessages(activeId);
            await refreshThreads();
            setPending(response.pendingActions ?? []);
          }
        } catch (err) {
          if (!mountedRef.current) {
            onBackgroundCompleteRef.current?.(
              `Ask failed: ${err instanceof Error ? err.message : String(err)}`,
            );
            return;
          }
          const stamp = new Date().toISOString();
          const fail = emptyResponse(
            `Could not reach Ask: ${err instanceof Error ? err.message : String(err)}`,
          );
          if (threadIdRef.current === tid) {
            setMessages((prev) => [
              ...prev,
              {
                id: `local-a-${stamp}`,
                role: "assistant",
                content: fail.answer,
                response: fail,
                createdAt: stamp,
              },
            ]);
          }
        }
      });
    } catch (err) {
      if (mountedRef.current) {
        const stamp = new Date().toISOString();
        const fail = emptyResponse(
          `Could not reach Ask: ${err instanceof Error ? err.message : String(err)}`,
        );
        setMessages((prev) => [
          ...prev,
          {
            id: `local-a-${stamp}`,
            role: "assistant",
            content: fail.answer,
            response: fail,
            createdAt: stamp,
          },
        ]);
      }
    } finally {
      if (mountedRef.current && (!tid || threadIdRef.current === tid)) {
        setBusy(false);
      }
    }
  }

  async function submit(textIn?: string) {
    const text = (textIn ?? draft).trim();
    if (!text || busy) return;
    setDraft("");
    await runAsk(text);
  }

  async function newChat() {
    if (busy) return;
    try {
      const t = await createAskThread("New chat");
      bindThread(t.id);
      setThreads((prev) => [t, ...prev]);
      setMessages([]);
      setPending([]);
      setConsentedNoteIds([]);
      setPickerOpen(false);
    } catch {
      /* ignore */
    }
  }

  async function selectThread(id: string) {
    if (busy || id === threadId) {
      setPickerOpen(false);
      return;
    }
    bindThread(id);
    setConsentedNoteIds([]);
    setPickerOpen(false);
    await loadMessages(id);
  }

  async function removeThread(id: string) {
    try {
      await deleteAskThread(id);
      const rows = await refreshThreads();
      if (threadId === id) {
        const next = rows[0]?.id ?? null;
        bindThread(next);
        setConsentedNoteIds([]);
        if (next) await loadMessages(next);
        else {
          setMessages([]);
          setPending([]);
        }
      }
    } catch {
      /* ignore */
    }
  }

  async function approvePending(action: AskPendingAction) {
    if (busy) return;
    if (action.type === "request_note_context") {
      const ids = [...consentedNoteIds];
      let noteId = action.noteId ?? null;
      if (!noteId && action.title) {
        try {
          const notes = await listNotes();
          const match = notes.find(
            (n) => n.title.trim().toLowerCase() === action.title!.trim().toLowerCase(),
          );
          noteId = match?.id ?? null;
        } catch {
          /* ignore */
        }
      }
      if (noteId && !ids.includes(noteId)) ids.push(noteId);
      setConsentedNoteIds(ids);
      const q = lastUserQRef.current || "Please continue with the note I approved.";
      await runAsk(q, { noteIds: ids, optimisticUser: true });
      return;
    }
    if (action.type === "delete_note") {
      await runAsk("Please proceed with the confirmed note deletion.", {
        confirmedActions: [
          {
            type: "delete_note",
            noteId: action.noteId ?? undefined,
            title: action.title ?? undefined,
          },
        ],
        optimisticUser: true,
      });
    }
  }

  const activeTitle = threads.find((t) => t.id === threadId)?.title ?? "Ask";

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-bg">
      <div className="absolute inset-x-0 top-0 z-10 border-b border-border bg-bg px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-semibold">Ask</h1>
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="mt-0.5 max-w-full truncate text-left text-xs text-muted"
            >
              {activeTitle} ▾
            </button>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void newChat()}
            className="rounded-pill border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-accent disabled:opacity-50"
          >
            New
          </button>
        </div>
        {pickerOpen ? (
          <div className="absolute left-3 right-3 top-full z-20 mt-1 max-h-64 overflow-auto rounded-xl border border-border bg-bg shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-sm font-semibold">Chats</span>
              <button
                type="button"
                className="text-sm font-semibold text-accent"
                onClick={() => void newChat()}
              >
                New chat
              </button>
            </div>
            {threads.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted">No chats yet</p>
            ) : (
              threads.map((t) => (
                <div
                  key={t.id}
                  className={`flex items-center gap-2 border-b border-border px-3 py-2 ${
                    t.id === threadId ? "bg-accent-soft" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-sm"
                    onClick={() => void selectThread(t.id)}
                  >
                    {t.title || "New chat"}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-muted"
                    onClick={() => void removeThread(t.id)}
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>

      <div
        className="pane-scroll absolute inset-x-0 overscroll-contain px-4 py-3"
        style={{
          top: "4.25rem",
          bottom: keyboardPad > 0 ? `calc(4.25rem + ${keyboardPad}px)` : "4.25rem",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div className="mt-3 flex flex-col gap-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={m.role === "user" ? "flex justify-end" : undefined}
            >
              <div
                className={`rounded-2xl px-3 py-2.5 ${
                  m.role === "user"
                    ? "max-w-[85%] w-fit bg-accent text-bg"
                    : "mr-4 w-full border border-border bg-surface"
                }`}
              >
              {m.role === "user" ? (
                <p className="whitespace-pre-wrap text-sm font-medium">{m.content}</p>
              ) : (
                <div className="space-y-3 text-sm">
                  <NotesBodyView
                    body={m.response?.answer ?? m.content}
                    onOpenHref={openHref}
                    variant="chat"
                  />
                  {m.response?.bullets?.length ? (
                    <ul className="list-disc space-y-1 pl-5 text-muted">
                      {m.response.bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  ) : null}
                  {m.response?.actionsTaken?.length ? (
                    <div className="rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 text-xs text-accent">
                      {m.response.actionsTaken.map((a, i) => (
                        <div key={`${m.id}-action-${i}-${a.type}-${a.title ?? a.noteId ?? ""}`}>
                          {a.message}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {(m.response?.recommendations?.length || m.response?.resources?.length) ? (
                    <SuggestedReadingPanel
                      messageId={m.id}
                      recommendations={m.response?.recommendations ?? []}
                      resources={m.response?.resources ?? []}
                      onOpenWork={onOpenWork}
                      onOpenSection={onOpenSection}
                      onOpenLocus={onOpenLocus}
                    />
                  ) : null}
                </div>
              )}
              </div>
            </div>
          ))}

          {busy ? (
            <div className="flex w-fit items-center gap-2 rounded-2xl border border-border bg-surface px-3.5 py-2.5">
              <span className="ask-dot h-1.5 w-1.5 rounded-full bg-accent" />
              <span className="ask-dot ask-dot-2 h-1.5 w-1.5 rounded-full bg-accent" />
              <span className="ask-dot ask-dot-3 h-1.5 w-1.5 rounded-full bg-accent" />
              <span className="text-xs font-medium text-muted">Thinking…</span>
            </div>
          ) : null}

          {!busy && pending.length
            ? pending.map((p, i) => (
                <div
                  key={`${p.type}-${p.noteId ?? p.title ?? i}`}
                  className="rounded-xl border border-accent/30 bg-accent-soft px-3 py-2.5"
                >
                  <p className="text-sm">{p.message}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="btn-accent rounded-pill px-3 py-1.5 text-sm font-semibold"
                      onClick={() => void approvePending(p)}
                    >
                      {p.type === "delete_note" ? "Delete" : "Allow"}
                    </button>
                    <button
                      type="button"
                      className="rounded-pill border border-border px-3 py-1.5 text-sm text-muted"
                      onClick={() => setPending((prev) => prev.filter((x) => x !== p))}
                    >
                      Not now
                    </button>
                  </div>
                </div>
              ))
            : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <form
        className="absolute inset-x-0 z-10 flex items-center gap-2 border-t border-border bg-bg px-3 py-3"
        style={{ bottom: keyboardPad > 0 ? keyboardPad : 0 }}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => {
            inputFocusedRef.current = true;
            if (lastInsetRef.current > 0) setKeyboardPad(lastInsetRef.current);
          }}
          onBlur={() => {
            inputFocusedRef.current = false;
            setKeyboardPad(0);
          }}
          placeholder={busy ? "Thinking…" : "Ask your library…"}
          disabled={busy}
          className="min-w-0 flex-1 rounded-pill border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent"
        />
        {busy ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        ) : null}
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="btn-accent rounded-pill px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          Send
        </button>
      </form>

      <style>{`
        @keyframes ask-dot-pulse {
          0%, 80%, 100% { opacity: 0.35; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-2px); }
        }
        .ask-dot { animation: ask-dot-pulse 1.1s ease-in-out infinite; }
        .ask-dot-2 { animation-delay: 0.15s; }
        .ask-dot-3 { animation-delay: 0.3s; }
      `}</style>
    </div>
  );
}
