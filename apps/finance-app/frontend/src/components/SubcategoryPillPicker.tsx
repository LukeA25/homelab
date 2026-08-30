import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { SubcategoryPill } from "@/components/SubcategoryPill";
import { SubcategoryMenu } from "@/components/SubcategoryMenu";
import { cn } from "@/lib/utils";

export function SubcategoryPillPicker({
  subcategoryId,
  subcategoryName,
  color,
  onChange,
  kind,
  isRepayment = false,
  onRepayment,
  className,
}: {
  subcategoryId: number | null;
  subcategoryName: string | null;
  color?: string;
  onChange: (subcategoryId: number | null) => void;
  kind?: "income" | "expense";
  isRepayment?: boolean;
  /** When set, the menu offers "Repayment" as an alternative to a category. */
  onRepayment?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
    <div ref={ref} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-0.5 rounded-full transition-opacity hover:opacity-90"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {isRepayment ? (
          <span className="inline-flex rounded-full bg-accent-soft px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
            Repayment
          </span>
        ) : subcategoryId != null && subcategoryName ? (
          <SubcategoryPill name={subcategoryName} color={color} />
        ) : (
          <span className="inline-flex rounded-full border border-dashed border-ink-faint/50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
            Assign
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-3 w-3 text-ink-faint transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div
          className="absolute left-0 top-full z-30 mt-1.5 w-56 overflow-hidden rounded-xl border border-hairline bg-card shadow-pop"
          onClick={(e) => e.stopPropagation()}
        >
          <SubcategoryMenu
            value={subcategoryId}
            onChange={(id) => {
              onChange(id);
              setOpen(false);
            }}
            kind={kind}
            isRepayment={isRepayment}
            onRepayment={
              onRepayment
                ? () => {
                    onRepayment();
                    setOpen(false);
                  }
                : undefined
            }
          />
        </div>
      ) : null}
    </div>
  );
}
