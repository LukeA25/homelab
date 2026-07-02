import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function money(n: number | null | undefined): string {
  return currency.format(n || 0);
}

export function percent(n: number | null | undefined, digits = 0): string {
  return `${((n || 0) * 100).toFixed(digits)}%`;
}

// Consistent category color palette reused across charts, pills, and bars.
export const CATEGORY_COLORS = [
  "#F26B3A",
  "#3A86F2",
  "#1E9E6A",
  "#9B5DE5",
  "#F2B705",
  "#E5578A",
  "#2CB1BC",
  "#E8703A",
  "#6C7A89",
  "#8AC926",
  "#FF7B9C",
  "#4D908E",
];

export function colorForIndex(i: number): string {
  return CATEGORY_COLORS[i % CATEGORY_COLORS.length];
}

// Given a "YYYY-MM-DD" string, return the day of month (1-31).
export function dayOfMonth(dateStr: string): number {
  const parts = dateStr.split("-");
  return Number(parts[2]) || 1;
}
