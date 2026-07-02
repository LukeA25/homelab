import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function MonthPicker({
  months,
  labels,
  value,
  onChange,
  className,
}: {
  months: string[];
  labels: string[];
  value: string;
  onChange: (month: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedIdx = months.indexOf(value);
  const selectedLabel = labels[selectedIdx] ?? value;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline bg-card px-3 text-sm font-medium text-ink transition-colors hover:bg-black/[0.02]"
      >
        {selectedLabel}
        <ChevronDown
          className={cn(
            "h-4 w-4 text-ink-faint transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1.5 max-h-64 w-44 overflow-y-auto rounded-xl border border-hairline bg-card py-1 shadow-pop">
          {months.map((m, i) => {
            const active = m === value;
            return (
              <button
                key={m}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(m);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full px-3 py-2 text-left text-sm transition-colors hover:bg-black/[0.04]",
                  active ? "bg-accent-soft font-medium text-accent" : "text-ink",
                )}
              >
                {labels[i] ?? m}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
