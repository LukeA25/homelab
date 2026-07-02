import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  max,
  color,
  className,
}: {
  value: number;
  max: number;
  color?: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const over = max > 0 && value > max;
  return (
    <div
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-black/[0.06]",
        className,
      )}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${pct}%`,
          backgroundColor: over ? "#D64545" : (color ?? "#F26B3A"),
        }}
      />
    </div>
  );
}
