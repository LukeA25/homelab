import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card } from "./Card";

export function StatCard({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: "neutral" | "gain" | "loss";
  hint?: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="text-sm text-ink-muted">{label}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tnum",
          tone === "gain" && "text-gain",
          tone === "loss" && "text-loss",
          tone === "neutral" && "text-ink",
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-ink-faint">{hint}</div> : null}
    </Card>
  );
}
