import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { MarkdownLite } from "@/components/MarkdownLite";
import type { CursorProposal } from "@/lib/assistantClient";
import { cn } from "@/lib/utils";

type Props = {
  proposal: CursorProposal;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onDismiss: () => void;
};

function statusLabel(status: string) {
  if (status === "pending") return "Needs confirm";
  if (status === "running") return "Working";
  if (status === "done") return "Done";
  if (status === "error") return "Failed";
  return status;
}

export function CursorOverlay({
  proposal,
  busy,
  onConfirm,
  onCancel,
  onDismiss,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const progress = proposal.progress?.length
    ? proposal.progress
    : proposal.status === "running"
      ? ["Starting Cursor…"]
      : [];

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [proposal.status, proposal.result, proposal.error, progress.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (proposal.status === "done" || proposal.status === "error") onDismiss();
      else if (proposal.status === "pending" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [proposal.status, busy, onCancel, onDismiss]);

  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col bg-canvas text-ink">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            Cursor
          </p>
          <p
            className={cn(
              "mt-0.5 text-lg font-semibold",
              proposal.status === "error" ? "text-loss" : "text-ink",
            )}
          >
            {statusLabel(proposal.status)}
          </p>
        </div>
        {(proposal.status === "done" || proposal.status === "error") && (
          <button
            type="button"
            className="rounded-xl border border-hairline bg-panel px-3 py-2 text-sm text-ink-muted"
            onClick={onDismiss}
          >
            Close
          </button>
        )}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          Request
        </p>
        <p className="mt-1 text-base leading-snug text-ink-muted">{proposal.prompt}</p>

        {proposal.status === "pending" ? (
          <p className="mt-6 text-base text-ink-muted">
            Confirm to let Cursor edit the homelab repo. Nothing runs until you tap Confirm.
          </p>
        ) : null}

        {progress.length ? (
          <div className="mt-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              Progress
            </p>
            <ol className="mt-2 space-y-1.5">
              {progress.map((line, i) => (
                <li
                  key={`${i}-${line}`}
                  className={cn(
                    "text-sm leading-snug",
                    i === progress.length - 1 && proposal.status === "running"
                      ? "text-accent"
                      : "text-ink-muted",
                  )}
                >
                  {line}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {proposal.status === "error" ? (
          <p className="mt-5 text-base text-loss">{proposal.error || "Cursor failed"}</p>
        ) : null}

        {proposal.result ? (
          <div className="mt-5 border-t border-hairline pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              Result
            </p>
            <MarkdownLite className="mt-2" text={proposal.result} />
          </div>
        ) : null}
      </div>

      <footer className="shrink-0 border-t border-hairline bg-card/90 px-4 py-3">
        {proposal.status === "pending" ? (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="rounded-xl border border-accent/40 bg-accent-soft px-3 py-3 text-base font-medium text-accent disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="rounded-xl border border-hairline bg-panel px-3 py-3 text-base font-medium text-ink-muted disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : proposal.status === "running" ? (
          <p className="py-1 text-center text-sm text-ink-muted">Working… this can take a minute.</p>
        ) : (
          <button
            type="button"
            onClick={onDismiss}
            className="w-full rounded-xl border border-hairline bg-panel px-3 py-3 text-base font-medium text-ink-muted"
          >
            Dismiss
          </button>
        )}
      </footer>
    </div>,
    document.body,
  );
}
