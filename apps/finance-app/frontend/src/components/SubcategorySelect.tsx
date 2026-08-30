import { useMemo } from "react";
import { useCategories } from "@/lib/queries";
import { Select } from "./ui/Field";

// A category/subcategory picker grouped by top-level category. Value is the
// subcategory id as a string, or "" for unassigned.
export function SubcategorySelect({
  value,
  onChange,
  placeholder = "Assign\u2026",
  includeUnassigned = true,
  kind,
  className,
}: {
  value: number | null;
  onChange: (subcategoryId: number | null) => void;
  placeholder?: string;
  includeUnassigned?: boolean;
  /** When set, only categories of this kind are listed. */
  kind?: "income" | "expense";
  className?: string;
}) {
  const { data: cats } = useCategories();

  const filtered = useMemo(() => {
    const all = cats?.categories ?? [];
    if (!kind) return all;
    return all.filter((c) => c.kind === kind);
  }, [cats, kind]);

  // Keep an existing off-kind selection visible so it isn't silently dropped.
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
    <Select
      className={className}
      value={value == null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      {includeUnassigned ? (
        <option value="">{placeholder}</option>
      ) : (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {offKind ? (
        <optgroup label={`Current · ${offKind.category.kind}`}>
          <option value={offKind.subcategory.id}>
            {offKind.subcategory.name} (different type)
          </option>
        </optgroup>
      ) : null}
      {filtered.map((c) => (
        <optgroup key={c.id} label={`${c.name} (${c.kind})`}>
          {c.subcategories.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}
