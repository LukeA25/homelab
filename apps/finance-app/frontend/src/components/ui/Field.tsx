import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

const base =
  "h-10 w-full rounded-lg border border-hairline bg-card px-3 text-sm text-ink outline-none transition-colors focus:border-accent";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(base, "pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <label className="mb-1 block text-sm font-medium text-ink-muted">
      {children}
    </label>
  );
}
