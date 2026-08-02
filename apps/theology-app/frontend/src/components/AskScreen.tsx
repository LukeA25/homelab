import { useState } from "react";
import { mockAsk } from "../lib/mockData";
import type { AskMessage } from "../lib/types";

type AskScreenProps = {
  messages: AskMessage[];
  seed?: string;
  onSend: (m: AskMessage) => void;
  onOpenLocus: (workId: string, locusId: string) => void;
};

export function AskScreen({ messages, seed, onSend, onOpenLocus }: AskScreenProps) {
  const [draft, setDraft] = useState(seed ?? "");

  function submit(textIn?: string) {
    const text = (textIn ?? draft).trim();
    if (!text) return;
    const now = new Date().toISOString();
    const response = mockAsk(text);
    onSend({ id: `u-${now}`, role: "user", content: text, createdAt: now });
    onSend({
      id: `a-${now}`,
      role: "assistant",
      content: response.answer,
      response,
      createdAt: now,
    });
    setDraft("");
  }

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-bg">
      <div className="absolute inset-x-0 top-0 z-10 border-b border-border bg-bg px-4 py-3">
        <h1 className="font-display text-xl font-semibold">Ask</h1>
        <p className="text-xs text-muted">Answers from your library</p>
      </div>

      <div
        className="pane-scroll absolute inset-x-0 overscroll-contain px-4 py-3"
        style={{
          top: "4.25rem",
          bottom: "4.25rem",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {messages.length === 0 && (
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
            Ask about a passage or topic. Citations open on the left when split.
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`mb-3 rounded-2xl px-3 py-2.5 text-sm ${
              m.role === "user" ? "ml-6 bg-accent text-bg" : "mr-2 border border-border bg-surface"
            }`}
          >
            {m.role === "user" ? (
              <p className="font-medium">{m.content}</p>
            ) : (
              <div className="space-y-2">
                <p>{m.response?.answer ?? m.content}</p>
                {m.response?.resources.map((r) => (
                  <div
                    key={r.locus.locusId}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenLocus(r.locus.workId, r.locus.locusId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpenLocus(r.locus.workId, r.locus.locusId);
                      }
                    }}
                    className="block w-full cursor-pointer rounded-xl bg-bg-elevated px-3 py-2 text-left"
                  >
                    <span className="font-semibold text-accent">{r.locus.label}</span>
                    <span className="mt-0.5 block text-xs text-muted">{r.reason}</span>
                  </div>
                ))}
                {m.response?.bullets.map((b) => (
                  <p key={b} className="pl-2 text-muted before:content-['•_']">
                    {b}
                  </p>
                ))}
                {m.response?.citations.map((c) => (
                  <div
                    key={c.locus.locusId}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenLocus(c.locus.workId, c.locus.locusId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpenLocus(c.locus.workId, c.locus.locusId);
                      }
                    }}
                    className="block w-full cursor-pointer rounded-xl border border-border px-3 py-2 text-left"
                  >
                    <span className="font-semibold text-accent">{c.locus.label}</span>
                    <span className="mt-0.5 block text-xs text-muted">{c.snippet}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 border-t border-border bg-bg p-3">
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Ask…"
            className="min-w-0 flex-1 rounded-pill border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            type="button"
            onClick={() => submit()}
            className="btn-accent shrink-0 rounded-pill px-4 py-2.5 text-sm font-semibold"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
