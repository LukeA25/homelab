import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import type { FinanceSummary, FinanceTrack } from "@/lib/types";
import { api } from "@/lib/api";
import { cn, money } from "@/lib/utils";

function Bar({ pct, color }: { pct: number; color: string }) {
  const fill = Math.min(Math.max(pct, 0), 1) * 100;
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-panel">
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.max(fill, pct > 0 ? 4 : 0)}%`, background: color }}
      />
    </div>
  );
}

function SubList({ track }: { track: FinanceTrack }) {
  if (!track.subcategories.length) return null;
  return (
    <ul className="space-y-1.5">
      {track.subcategories.map((sub) => {
        const subOver = sub.remaining < 0;
        return (
          <li key={sub.name} className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-ink-muted">{sub.name}</span>
            <span className={cn("tnum shrink-0", subOver ? "text-loss" : "text-ink-muted")}>
              {money(sub.spent, true)}
              <span className="text-ink-faint"> / {money(sub.budgeted, true)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function TrackColumn({ track, accent }: { track: FinanceTrack; accent: string }) {
  const over = track.remaining < 0;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-ink">{track.name}</h3>
        <span className={cn("tnum shrink-0 text-xs font-medium", over ? "text-loss" : "text-gain")}>
          {over
            ? `${money(Math.abs(track.remaining), true)} over`
            : `${money(track.remaining, true)} left`}
        </span>
      </div>
      <div>
        <div className="tnum font-display text-xl font-semibold leading-none">
          {money(track.spent, true)}
        </div>
        <div className="tnum mt-1 text-xs text-ink-faint">
          of {money(track.budgeted, true)} · {Math.round(track.pct_used * 100)}%
        </div>
      </div>
      <Bar pct={track.pct_used} color={over ? "#F07178" : accent} />
      <SubList track={track} />
    </div>
  );
}

function TrackRow({ track, accent }: { track: FinanceTrack; accent: string }) {
  const over = track.remaining < 0;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">{track.name}</h3>
        <span className={cn("tnum text-sm font-medium", over ? "text-loss" : "text-ink-muted")}>
          {money(track.spent, true)}
          <span className="text-ink-faint"> / {money(track.budgeted, true)}</span>
        </span>
      </div>
      <Bar pct={track.pct_used} color={over ? "#F07178" : accent} />
      <div className="flex justify-between text-[11px] text-ink-faint">
        <span className="tnum">{Math.round(track.pct_used * 100)}% used</span>
        <span className={cn("tnum", over ? "text-loss" : "text-gain")}>
          {over
            ? `${money(Math.abs(track.remaining), true)} over`
            : `${money(track.remaining, true)} left`}
        </span>
      </div>
      <div className="border-l border-hairline pl-3">
        <SubList track={track} />
      </div>
    </div>
  );
}

function formatUpdated(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function FinancePanel({
  summary,
  horizontal = false,
}: {
  summary: FinanceSummary | undefined;
  horizontal?: boolean;
}) {
  const qc = useQueryClient();
  const over = (summary?.remaining ?? 0) < 0;
  const focus = summary?.focus || [];
  const updated = formatUpdated(summary?.updated_at);

  const refresh = useMutation({
    mutationFn: () => api.finance(true),
    onSuccess: (data) => qc.setQueryData(["finance"], data),
  });

  const header = (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">Finance</h2>
        <p className="text-xs text-ink-faint">{summary?.month_label || "This month"}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-hairline bg-panel text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
          aria-label="Refresh finance"
          title="Refresh"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refresh.isPending && "animate-spin")} />
        </button>
        <a
          href={summary?.href || "http://finance.home.arpa"}
          className="inline-flex items-center gap-1 rounded-full border border-hairline bg-panel px-3 py-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          Open
          <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );

  const overallCard = (
    <div className="flex min-w-0 flex-1 flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Overall</h3>
        <span className={cn("tnum shrink-0 text-xs font-medium", over ? "text-loss" : "text-gain")}>
          {over
            ? `${money(Math.abs(summary?.remaining ?? 0), true)} over`
            : `${money(summary?.remaining ?? 0, true)} left`}
        </span>
      </div>
      <div>
        <div className="tnum font-display text-2xl font-semibold leading-none">
          {money(summary?.spent, true)}
        </div>
        <div className="tnum mt-1 text-xs text-ink-faint">
          of {money(summary?.budgeted, true)} · {Math.round((summary?.pct_used ?? 0) * 100)}%
        </div>
      </div>
      <Bar pct={summary?.pct_used ?? 0} color={over ? "#F07178" : "#5B8CFF"} />
      <div className="mt-auto space-y-1 pt-2">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="text-ink-faint">Cash</span>
          <span className="tnum font-medium text-ink">{money(summary?.cash_total, true)}</span>
        </div>
        {updated ? (
          <div className="flex items-baseline justify-between gap-2 text-[11px] text-ink-faint">
            <span>Updated</span>
            <span className="tnum">{updated}</span>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (horizontal) {
    return (
      <section className="flex h-full min-h-0 flex-col gap-2.5">
        {header}
        <div className="card min-h-0 flex-1 overflow-hidden p-4">
          {!summary?.connected && summary?.error ? (
            <p className="text-sm text-loss">Finance unavailable: {summary.error}</p>
          ) : (
            <div className="flex h-full min-h-0 items-stretch gap-4">
              {overallCard}
              {focus.map((track, i) => (
                <div key={track.name} className="flex min-w-0 flex-1 border-l border-hairline pl-4">
                  <TrackColumn track={track} accent={i === 0 ? "#F0B429" : "#3DDC97"} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-col gap-2.5">
      {header}
      <div className="card flex flex-col gap-4 p-4">
        {!summary?.connected && summary?.error ? (
          <p className="text-sm text-loss">Finance unavailable: {summary.error}</p>
        ) : null}

        <div className="rounded-xl border border-hairline bg-panel/50 px-3 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Overall
            </span>
            <span className={cn("tnum text-xs font-medium", over ? "text-loss" : "text-gain")}>
              {over
                ? `${money(Math.abs(summary?.remaining ?? 0), true)} over`
                : `${money(summary?.remaining ?? 0, true)} left`}
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="tnum font-display text-xl font-semibold">
              {money(summary?.spent, true)}
            </span>
            <span className="tnum text-sm text-ink-muted">
              of {money(summary?.budgeted, true)}
            </span>
          </div>
          <div className="mt-2">
            <Bar pct={summary?.pct_used ?? 0} color={over ? "#F07178" : "#5B8CFF"} />
          </div>
        </div>

        <div className="space-y-4">
          {focus.map((track, i) => (
            <TrackRow key={track.name} track={track} accent={i === 0 ? "#F0B429" : "#3DDC97"} />
          ))}
        </div>

        <div className="flex items-baseline justify-between border-t border-hairline pt-3 text-sm">
          <span className="text-ink-faint">Cash</span>
          <span className="tnum font-medium">{money(summary?.cash_total, true)}</span>
        </div>
      </div>
    </section>
  );
}
