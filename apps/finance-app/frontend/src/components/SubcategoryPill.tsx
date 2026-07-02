import { cn } from "@/lib/utils";

export function SubcategoryPill({
  name,
  color,
  className,
  onClick,
}: {
  name: string;
  color?: string;
  className?: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex max-w-[140px] truncate rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white",
        onClick && "cursor-pointer transition-opacity hover:opacity-90",
        className,
      )}
      style={{ backgroundColor: color ?? "#6C7A89" }}
      title={name}
    >
      {name}
    </Tag>
  );
}
