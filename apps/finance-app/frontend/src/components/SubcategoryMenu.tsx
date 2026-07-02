import { useMemo } from "react";
import { Check } from "lucide-react";
import { useCategories, useMonthly } from "@/lib/queries";
import { buildSubcategoryColorMap } from "@/lib/budgetStatus";
import { cn } from "@/lib/utils";

export function SubcategoryMenu({
  value,
  onChange,
  includeUnassigned = true,
  className,
}: {
  value: number | null;
  onChange: (subcategoryId: number | null) => void;
  includeUnassigned?: boolean;
  className?: string;
}) {
  const { data: cats } = useCategories();
  const { data: monthly } = useMonthly();
  const colorMap = useMemo(
    () => (monthly ? buildSubcategoryColorMap(monthly) : new Map<number, string>()),
    [monthly],
  );

  return (
    <div
      className={cn("max-h-64 overflow-y-auto py-1", className)}
      role="listbox"
      aria-label="Choose subcategory"
    >
      {includeUnassigned ? (
        <button
          type="button"
          role="option"
          aria-selected={value == null}
          className={cn(
            "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-black/[0.04]",
            value == null && "bg-black/[0.04]",
          )}
          onClick={() => onChange(null)}
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-ink-faint/40" />
          <span className="text-ink-muted">Unassigned</span>
          {value == null ? (
            <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-accent" />
          ) : null}
        </button>
      ) : null}

      {(cats?.categories ?? []).map((c) => (
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
