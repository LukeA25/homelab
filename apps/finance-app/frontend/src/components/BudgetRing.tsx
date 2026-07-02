import { cn, money } from "@/lib/utils";
import type { SubBudgetRow } from "@/lib/budgetStatus";

export function BudgetRing({
  row,
  size = 76,
}: {
  row: SubBudgetRow;
  size?: number;
}) {
  const { projected, actual, pctUsed, color, name, status } = row;
  const over = projected > 0 && actual > projected;
  const ringColor =
    status === "over" || status === "unbudgeted"
      ? "#D64545"
      : status === "hot" || status === "close"
        ? "#F26B3A"
        : color;

  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fill = projected > 0 ? Math.min(pctUsed, 1) : actual > 0 ? 1 : 0;
  const dash = c * fill;

  const centerLabel =
    projected > 0 ? `${Math.round(pctUsed * 100)}%` : actual > 0 ? "!" : "—";

  const caption =
    status === "over"
      ? `${money(actual - projected)} over`
      : status === "unbudgeted"
        ? "No budget"
        : projected > 0
          ? `${money(Math.max(projected - actual, 0))} left`
          : "";

  return (
    <div className="flex w-[88px] shrink-0 flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgba(0,0,0,0.06)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={ringColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
          />
          {over && projected > 0 ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="#D64545"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${c * Math.min(pctUsed - 1, 0.25)} ${c}`}
              strokeDashoffset={-c}
              opacity={0.5}
            />
          ) : null}
        </svg>
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center text-xs font-semibold tnum",
            over ? "text-loss" : "text-ink",
          )}
        >
          {centerLabel}
        </div>
      </div>
      <span className="w-full truncate text-center text-xs font-medium leading-tight">
        {name}
      </span>
      {caption ? (
        <span
          className={cn(
            "tnum text-center text-[10px] leading-tight",
            over || status === "unbudgeted" ? "text-loss" : "text-ink-faint",
          )}
        >
          {caption}
        </span>
      ) : null}
    </div>
  );
}
