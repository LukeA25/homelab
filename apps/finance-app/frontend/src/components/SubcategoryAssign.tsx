import { SubcategoryPillPicker } from "@/components/SubcategoryPillPicker";

/** Pill-trigger category picker (used on Dashboard review list). */
export function SubcategoryAssign({
  subcategoryId,
  subcategoryName,
  categoryName,
  color,
  onChange,
  kind,
  className,
}: {
  subcategoryId: number | null;
  subcategoryName: string | null;
  categoryName?: string | null;
  color?: string;
  onChange: (subcategoryId: number | null) => void;
  kind?: "income" | "expense";
  className?: string;
}) {
  return (
    <div className={className}>
      <SubcategoryPillPicker
        subcategoryId={subcategoryId}
        subcategoryName={subcategoryName}
        color={color}
        onChange={onChange}
        kind={kind}
      />
      {categoryName && subcategoryName ? (
        <p className="mt-1 text-xs text-ink-faint">{categoryName}</p>
      ) : null}
    </div>
  );
}
