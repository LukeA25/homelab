import { useEffect, useRef, useState } from "react";
import {
  Check,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { streamConsultantChat } from "@/lib/api";
import { api } from "@/lib/api";
import {
  keys,
  useApplyConsultantProposals,
  useConsultantConversations,
} from "@/lib/queries";
import type { ConsultantProposal } from "@/lib/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Markdown } from "@/components/Markdown";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposals?: ConsultantProposal[];
  tool_trace?: string[];
}

interface LiveStep {
  id: string;
  label: string;
  done: boolean;
}

const STARTERS = [
  "Where am I over budget year to date?",
  "What's unassigned?",
  "Find holes in my projections",
];

export function Consultant() {
  const apply = useApplyConsultantProposals();
  const { data: convData } = useConsultantConversations();
  const qc = useQueryClient();
  const { show: toast } = useToast();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveSteps, setLiveSteps] = useState<LiveStep[]>([]);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversations = convData?.conversations ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, liveSteps, busy]);

  const refreshList = () =>
    qc.invalidateQueries({ queryKey: keys.conversations });

  const startNew = () => {
    if (busy) return;
    setThreadId(null);
    setMessages([]);
    setSelected({});
    setLiveSteps([]);
  };

  const openThread = async (id: string) => {
    if (busy) return;
    try {
      const detail = await api.consultantConversation(id);
      setThreadId(detail.id);
      setMessages(
        detail.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          proposals: m.proposals ?? [],
          tool_trace: m.tool_trace ?? [],
        })),
      );
      const next: Record<string, Set<string>> = {};
      for (const m of detail.messages) {
        if (m.proposals?.length) {
          next[m.id] = new Set(m.proposals.map((p) => p.id));
        }
      }
      setSelected(next);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not open chat", "error");
    }
  };

  const removeThread = async (id: string) => {
    if (busy) return;
    if (!window.confirm("Delete this chat?")) return;
    try {
      await api.deleteConsultantConversation(id);
      if (threadId === id) startNew();
      await refreshList();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not delete chat", "error");
    }
  };

  const pushStep = (label: string) => {
    setLiveSteps((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.label === label) return prev;
      const done = prev.map((s) => ({ ...s, done: true }));
      return [
        ...done,
        { id: `${Date.now()}-${done.length}`, label, done: false },
      ];
    });
  };

  const send = async (textIn?: string) => {
    const text = (textIn ?? draft).trim();
    if (!text || busy) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setDraft("");
    setBusy(true);
    setLiveSteps([
      { id: `s-${Date.now()}`, label: "Thinking about your question…", done: false },
    ]);

    try {
      await streamConsultantChat(
        { message: text, conversation_id: threadId },
        (event) => {
          if (event.type === "session" && event.conversation_id) {
            setThreadId(event.conversation_id);
            return;
          }
          if (event.type === "status" || event.type === "tool") {
            if (event.label) pushStep(event.label);
            return;
          }
          if (event.type === "error") {
            toast(event.message || "Consultant failed", "error");
            return;
          }
          if (event.type === "done") {
            const id = event.message_id || `a-${Date.now()}`;
            setMessages((prev) => [
              ...prev,
              {
                id,
                role: "assistant",
                content: event.reply || "",
                proposals: event.proposals,
                tool_trace: event.tool_trace,
              },
            ]);
            if (event.proposals?.length) {
              setSelected((prev) => ({
                ...prev,
                [id]: new Set(event.proposals!.map((p) => p.id)),
              }));
            }
          }
        },
      );
      await refreshList();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Consultant failed", "error");
    } finally {
      setBusy(false);
      setLiveSteps([]);
    }
  };

  const toggleProposal = (msgId: string, propId: string) => {
    setSelected((prev) => {
      const cur = new Set(prev[msgId] ?? []);
      if (cur.has(propId)) cur.delete(propId);
      else cur.add(propId);
      return { ...prev, [msgId]: cur };
    });
  };

  const applySelected = (msg: ChatMessage) => {
    const ids = selected[msg.id] ?? new Set();
    const proposals = (msg.proposals ?? []).filter((p) => ids.has(p.id));
    if (!proposals.length) {
      toast("Select at least one change to apply", "error");
      return;
    }
    apply.mutate(
      { proposals },
      {
        onSuccess: (res) => {
          const failed = res.results.filter((r) => !r.ok);
          if (failed.length) {
            toast(
              failed.map((f) => f.error || f.summary).join("; "),
              "error",
            );
          } else {
            toast(
              proposals.length === 1
                ? "Change applied"
                : `${proposals.length} changes applied`,
            );
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msg.id ? { ...m, proposals: [] } : m,
            ),
          );
          if (/^\d+$/.test(msg.id)) {
            void api.clearConsultantProposals(msg.id).catch(() => undefined);
          }
        },
        onError: (e: Error) => toast(e.message, "error"),
      },
    );
  };

  const discardProposals = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, proposals: [] } : m)),
    );
    if (/^\d+$/.test(msgId)) {
      void api.clearConsultantProposals(msgId).catch(() => undefined);
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4 lg:h-[calc(100vh-7rem)]">
      <aside className="hidden w-56 shrink-0 flex-col rounded-xl border border-hairline bg-card lg:flex">
        <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Chats
          </span>
          <Button size="sm" variant="ghost" onClick={startNew} disabled={busy}>
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {conversations.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-ink-faint">
              Saved chats show up here.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {conversations.map((c) => (
                <li key={c.id}>
                  <div
                    className={cn(
                      "group flex items-start gap-1 rounded-lg px-2 py-2",
                      threadId === c.id
                        ? "bg-accent-soft/70"
                        : "hover:bg-black/[0.03]",
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => void openThread(c.id)}
                      disabled={busy}
                    >
                      <span className="block truncate text-sm font-medium text-ink">
                        {c.title}
                      </span>
                      {c.preview ? (
                        <span className="mt-0.5 block truncate text-[11px] text-ink-faint">
                          {c.preview}
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      aria-label="Delete chat"
                      className="shrink-0 rounded p-1 text-ink-faint opacity-0 transition-opacity hover:bg-loss/10 hover:text-loss group-hover:opacity-100"
                      onClick={() => void removeThread(c.id)}
                      disabled={busy}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <div className="mx-auto flex min-w-0 max-w-3xl flex-1 flex-col gap-4">
        <Card className="shrink-0">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" />
                Consultant
              </span>
            }
            subtitle="Asks about your live budget. Writes only after you Apply."
            action={
              <Button
                size="sm"
                variant="ghost"
                className="lg:hidden"
                onClick={startNew}
                disabled={busy}
              >
                <Plus className="h-3.5 w-3.5" />
                New
              </Button>
            }
          />
          <div className="mb-3 lg:hidden">
            {conversations.length > 0 ? (
              <select
                className="w-full rounded-lg border border-hairline bg-card px-3 py-2 text-sm"
                value={threadId ?? ""}
                disabled={busy}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) startNew();
                  else void openThread(v);
                }}
              >
                <option value="">New chat</option>
                {conversations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          {messages.length === 0 ? (
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-hairline bg-black/[0.02] px-3 py-1.5 text-left text-sm text-ink-muted transition-colors hover:border-accent/40 hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
        </Card>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl border border-hairline bg-card p-4">
          {messages.length === 0 && !busy ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-ink-muted">
              <MessageSquare className="h-8 w-8 text-ink-faint" />
              <p className="text-sm">
                Ask about spending trends, budget holes, or propose fixes.
              </p>
            </div>
          ) : null}

          {messages.map((m) => (
            <div key={m.id} className="space-y-2">
              {m.role === "user" ? (
                <div className="ml-auto max-w-[90%] rounded-2xl bg-accent px-3.5 py-2.5 text-sm text-white whitespace-pre-wrap">
                  {m.content}
                </div>
              ) : (
                <div className="mr-auto max-w-[90%] rounded-2xl border border-hairline bg-canvas px-3.5 py-2.5">
                  <Markdown>{m.content}</Markdown>
                </div>
              )}

              {m.role === "assistant" && m.tool_trace && m.tool_trace.length > 0 ? (
                <details className="ml-1 text-xs text-ink-faint">
                  <summary className="cursor-pointer hover:text-ink-muted">
                    Looked at {m.tool_trace.length} tool
                    {m.tool_trace.length === 1 ? "" : "s"}
                  </summary>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 pl-1">
                    {m.tool_trace.map((t, i) => (
                      <li key={`${m.id}-t-${i}`}>{t}</li>
                    ))}
                  </ul>
                </details>
              ) : null}

              {m.proposals && m.proposals.length > 0 ? (
                <Card className="ml-0 border border-accent/30 bg-accent-soft/30 p-4">
                  <CardHeader
                    title="Proposed changes"
                    subtitle="Nothing is saved until you Apply."
                  />
                  <ul className="space-y-2">
                    {m.proposals.map((p) => {
                      const checked = selected[m.id]?.has(p.id) ?? false;
                      return (
                        <li key={p.id}>
                          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={checked}
                              onChange={() => toggleProposal(m.id, p.id)}
                            />
                            <span>
                              <span className="font-medium text-ink">
                                {p.summary}
                              </span>
                              <span className="mt-0.5 block text-xs text-ink-faint">
                                {p.kind}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={apply.isPending}
                      onClick={() => applySelected(m)}
                    >
                      {apply.isPending ? "Applying…" : "Apply selected"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={apply.isPending}
                      onClick={() => discardProposals(m.id)}
                    >
                      Discard
                    </Button>
                  </div>
                </Card>
              ) : null}
            </div>
          ))}

          {busy ? (
            <div className="mr-auto max-w-[90%] rounded-2xl border border-hairline bg-canvas px-3.5 py-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
                <span className="inline-flex gap-0.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
                </span>
                Working
              </div>
              <ul className="space-y-1.5">
                {liveSteps.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-start gap-2 text-sm text-ink-muted"
                  >
                    {s.done ? (
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gain" />
                    ) : (
                      <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
                    )}
                    <span className={s.done ? "text-ink-faint" : "text-ink"}>
                      {s.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <form
          className="flex shrink-0 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about your budget…"
            disabled={busy}
            className="min-w-0 flex-1 rounded-lg border border-hairline bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
          <Button type="submit" disabled={busy || !draft.trim()}>
            <Send className="h-4 w-4" />
            Send
          </Button>
        </form>
      </div>
    </div>
  );
}
