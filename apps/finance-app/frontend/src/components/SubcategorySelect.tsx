import { useCategories } from "@/lib/queries";
import { Select } from "./ui/Field";

// A category/subcategory picker grouped by top-level category. Value is the
// subcategory id as a string, or "" for unassigned.
export function SubcategorySelect({
  value,
  onChange,
  placeholder = "Assign\u2026",
  includeUnassigned = true,
  className,
}: {
  value: number | null;
  onChange: (subcategoryId: number | null) => void;
  placeholder?: string;
  includeUnassigned?: boolean;
  className?: string;
}) {
  const { data: cats } = useCategories();

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
      {(cats?.categories ?? []).map((c) => (
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
