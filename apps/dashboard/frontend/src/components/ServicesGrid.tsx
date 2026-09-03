import type { ServiceGroup } from "@/lib/types";
import { iconFor } from "@/lib/icons";
import { cn } from "@/lib/utils";

function StatusDot({ status }: { status: "up" | "down" | "unknown" }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full",
        status === "up" && "bg-gain shadow-[0_0_8px_rgba(61,220,151,0.55)]",
        status === "down" && "bg-loss",
        status === "unknown" && "bg-ink-faint",
      )}
      title={status}
    />
  );
}

/**
 * `compact` drops the descriptions so all services fit the iPad frame without
 * scrolling; the phone layout keeps them since it scrolls anyway.
 */
export function ServicesGrid({
  groups,
  compact = false,
}: {
  groups: ServiceGroup[] | undefined;
  compact?: boolean;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col gap-2.5 overflow-hidden">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">Apps</h2>
        <p className="text-xs text-ink-faint">Homelab services</p>
      </div>

      <div className="dash-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
        {(groups || []).map((group) => (
          <div key={group.group}>
            <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
              {group.group}
            </h3>
            <div className={cn("grid", compact ? "gap-1" : "gap-1.5")}>
              {group.services.map((svc) => {
                const Icon = iconFor(svc.icon);
                return (
                  <a
                    key={svc.name}
                    href={svc.href}
                    title={svc.description}
                    className={cn(
                      "card group flex items-center gap-2.5 transition-colors hover:border-accent/50 hover:bg-accent-soft/40",
                      compact ? "px-3 py-1.5" : "p-3",
                    )}
                  >
                    <div
                      className={cn(
                        "flex shrink-0 items-center justify-center rounded-lg bg-panel text-accent group-hover:bg-accent/20",
                        compact ? "h-7 w-7" : "h-9 w-9",
                      )}
                    >
                      <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-ink">{svc.name}</span>
                        <StatusDot status={svc.status} />
                      </div>
                      {!compact ? (
                        <p className="truncate text-xs text-ink-muted">{svc.description}</p>
                      ) : null}
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
