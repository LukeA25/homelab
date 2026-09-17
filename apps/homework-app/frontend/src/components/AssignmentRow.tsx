import { Check, Repeat, Sparkles } from "lucide-react";
import type { Assignment } from "@/lib/types";
import { cn } from "@/lib/utils";

function SourceBadge({ assignment }: { assignment: Assignment }) {
  if (assignment.recurring) {
    return (
      <span
        title="Repeats weekly — completing this adds the next one"
        className="inline-flex items-center gap-1 rounded-full bg-panel px-1.5 py-0.5 text-[10px] text-ink-faint"
      >
        <Repeat className="h-2.5 w-2.5" />
        weekly
      </span>
    );
  }
  if (assignment.source === "manual") return null;
  const Icon = assignment.source === "ingest" ? Sparkles : Repeat;
  const title =
    assignment.source === "ingest"
      ? "Added from a photo/file upload"
      : `Source: ${assignment.source}`;
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full bg-panel px-1.5 py-0.5 text-[10px] text-ink-faint"
    >
      <Icon className="h-2.5 w-2.5" />
      {assignment.source}
    </span>
  );
}

export function AssignmentRow({
  assignment,
  onToggle,
  onEdit,
}: {
  assignment: Assignment;
  onToggle: (a: Assignment) => void;
  onEdit: (a: Assignment) => void;
}) {
  const { done, overdue, daysUntil } = assignment;

  return (
    <div
      className={cn(
        "card flex items-center gap-3 px-3 py-2.5 transition-colors",
        done ? "opacity-55" : "hover:border-accent/40",
      )}
    >
      <button
        type="button"
        aria-label={done ? "Mark as not done" : "Mark as done"}
        onClick={() => onToggle(assignment)}
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors",
          done
            ? "border-gain bg-gain text-canvas"
            : "border-hairline text-transparent hover:border-gain hover:text-gain/60",
        )}
      >
        <Check className="h-4 w-4" strokeWidth={3} />
      </button>

      <span
        className="h-9 w-1.5 shrink-0 rounded-full"
        style={{ background: assignment.color }}
        aria-hidden
      />

      <button
        type="button"
        onClick={() => onEdit(assignment)}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex items-center gap-2">
          <p
            className={cn(
              "truncate text-sm font-semibold",
              done ? "text-ink-muted line-through" : "text-ink",
            )}
          >
            {assignment.title}
          </p>
          <SourceBadge assignment={assignment} />
        </div>
        <p className="truncate text-xs text-ink-faint">{assignment.courseName}</p>
      </button>

      <div className="shrink-0 text-right">
        <div
          className={cn(
            "text-xs font-semibold",
            done
              ? "text-ink-faint"
              : overdue
                ? "text-loss"
                : daysUntil === 0
                  ? "text-warm"
                  : "text-ink-muted",
          )}
        >
          {assignment.dayLabel}
        </div>
        {assignment.timeLabel ? (
          <div className="tnum text-[11px] text-ink-faint">{assignment.timeLabel}</div>
        ) : null}
      </div>
    </div>
  );
}
