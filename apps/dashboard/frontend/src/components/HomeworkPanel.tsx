import { ArrowUpRight, GraduationCap } from "lucide-react";
import type { Assignment, HomeworkResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

function Row({ a }: { a: Assignment }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-hairline bg-panel px-2.5 py-2">
      <span
        className="h-7 w-1.5 shrink-0 rounded-full"
        style={{ background: a.color }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{a.title}</p>
        <p className="truncate text-xs text-ink-faint">{a.course_name}</p>
      </div>
      <div className="shrink-0 text-right">
        <div
          className={cn(
            "text-xs font-semibold",
            a.overdue ? "text-loss" : a.days_until === 0 ? "text-warm" : "text-ink-muted",
          )}
        >
          {a.day_label}
        </div>
        {a.time_label ? (
          <div className="tnum text-[11px] text-ink-faint">{a.time_label}</div>
        ) : null}
      </div>
    </div>
  );
}

export function HomeworkPanel({
  data,
  limit = 5,
}: {
  data: HomeworkResponse | undefined;
  limit?: number;
}) {
  const items = (data?.assignments ?? []).slice(0, limit);

  return (
    <section className="card flex min-h-0 flex-col gap-2.5 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-accent" />
          <div>
            <h2 className="font-display text-lg font-semibold leading-tight tracking-tight">
              Homework
            </h2>
            <p className="text-xs text-ink-faint">
              {data?.connected === false
                ? "Database unreachable"
                : `${data?.upcoming_count ?? 0} upcoming`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data?.overdue_count ? (
            <span className="rounded-full bg-loss/15 px-2.5 py-1 text-xs font-semibold text-loss">
              {data.overdue_count} overdue
            </span>
          ) : null}
          <a
            href={data?.href || "http://homework.home.arpa"}
            className="inline-flex items-center gap-1 rounded-full border border-hairline bg-panel px-3 py-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
          >
            Open
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {items.length ? (
        <div className="dash-scroll flex min-h-0 flex-col gap-1.5 overflow-y-auto pr-0.5">
          {items.map((a) => (
            <Row key={a.id} a={a} />
          ))}
        </div>
      ) : (
        <p className="py-3 text-sm text-ink-muted">
          {data?.connected === false
            ? "Homework database not reachable."
            : "Nothing due — you're all caught up."}
        </p>
      )}
    </section>
  );
}
