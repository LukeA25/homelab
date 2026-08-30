import { useMemo } from "react";
import { ArrowLeftRight, Check } from "lucide-react";
import { useCategories, useMonthly } from "@/lib/queries";
import { buildSubcategoryColorMap } from "@/lib/budgetStatus";
import { cn } from "@/lib/utils";

export function SubcategoryMenu({
  value,
  onChange,
  includeUnassigned = true,
  kind,
  isRepayment = false,
  onRepayment,
  className,
}: {
  value: number | null;
  onChange: (subcategoryId: number | null) => void;
  includeUnassigned?: boolean;
  /** When set, only categories of this kind are listed. */
  kind?: "income" | "expense";
  isRepayment?: boolean;
  /** When set, the menu offers "Repayment" above the categories. */
  onRepayment?: () => void;
  className?: string;
}) {
  const { data: cats } = useCategories();
  const { data: monthly } = useMonthly();
  const colorMap = useMemo(
    () => (monthly ? buildSubcategoryColorMap(monthly) : new Map<number, string>()),
    [monthly],
  );

  const filtered = useMemo(() => {
    const all = cats?.categories ?? [];
    if (!kind) return all;
    return all.filter((c) => c.kind === kind);
  }, [cats, kind]);

  // An existing off-kind assignment (e.g. a refund overridden into an expense
  // subcategory) must still display, or the row looks silently unassigned.
  const offKind = useMemo(() => {
    if (value == null || !kind) return null;
    for (const c of cats?.categories ?? []) {
      if (c.kind === kind) continue;
      const sub = c.subcategories.find((s) => s.id === value);
      if (sub) return { category: c, subcategory: sub };
    }
    return null;
  }, [cats, kind, value]);

  return (
    <div
      className={cn("max-h-64 overflow-y-auto py-1", className)}
      role="listbox"
      aria-label="Choose subcategory"
    >
      {onRepayment ? (
        <div className="border-b border-hairline pb-1">
          <button
            type="button"
            role="option"
            aria-selected={isRepayment}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-black/[0.04]",
              isRepayment && "bg-accent-soft/50",
            )}
            onClick={onRepayment}
          >
            <ArrowLeftRight
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                isRepayment ? "text-accent" : "text-ink-faint",
              )}
            />
            <span className={cn("font-medium", isRepayment && "text-accent")}>
              Repayment
            </span>
            {isRepayment ? (
              <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-accent" />
            ) : (
              <span className="ml-auto text-xs text-ink-faint">Pick expense…</span>
            )}
          </button>
        </div>
      ) : null}

      {includeUnassigned ? (
        <button
          type="button"
          role="option"
          aria-selected={value == null && !isRepayment}
          className={cn(
            "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-black/[0.04]",
            value == null && !isRepayment && "bg-black/[0.04]",
          )}
          onClick={() => onChange(null)}
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-ink-faint/40" />
          <span className="text-ink-muted">Unassigned</span>
          {value == null && !isRepayment ? (
            <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-accent" />
          ) : null}
        </button>
      ) : null}

      {offKind ? (
        <div className="border-b border-hairline pb-1">
          <div className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
            Current · different type
          </div>
          <button
            type="button"
            role="option"
            aria-selected
            className="flex w-full items-center gap-2.5 bg-accent-soft/50 px-3 py-2 text-left text-sm"
            onClick={() => onChange(offKind.subcategory.id)}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{
                backgroundColor:
                  colorMap.get(offKind.subcategory.id) ?? "#9A9AA0",
              }}
            />
            <span className="font-medium text-accent">
              {offKind.subcategory.name}
            </span>
            <span className="text-xs text-ink-faint">
              · {offKind.category.kind}
            </span>
            <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-accent" />
          </button>
        </div>
      ) : null}

      {filtered.map((c) => (
        <div key={c.id}>
          <div className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
            {c.name}
            <span className="ml-1 font-normal normal-case text-ink-faint/80">
              · {c.kind}
            </span>
          </div>
          {c.subcategories.map((s) => {
            const selected = value === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-black/[0.04]",
                  selected && "bg-accent-soft/50",
                )}
                onClick={() => onChange(s.id)}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: colorMap.get(s.id) ?? "#9A9AA0" }}
                />
                <span className={cn("font-medium", selected && "text-accent")}>
                  {s.name}
                </span>
                {selected ? (
                  <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-accent" />
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
