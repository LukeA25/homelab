import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "gain" | "loss" | "accent";

const tones: Record<Tone, string> = {
  neutral: "bg-black/[0.05] text-ink-muted",
  gain: "bg-gain/10 text-gain",
  loss: "bg-loss/10 text-loss",
  accent: "bg-accent-soft text-accent",
};

export function Pill({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
