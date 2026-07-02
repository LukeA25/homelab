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

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Blend a hex color toward white. strength 1 = original, 0 = white. */
export function shadeHex(hex: string, strength: number): string {
  const [r, g, b] = parseHex(hex);
  const mix = (c: number) => Math.round(c * strength + 255 * (1 - strength));
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

/** Darkest shade for the largest subcategory, lighter for smaller ones. */
export function subcategoryShades(base: string, count: number): string[] {
  if (count <= 1) return [base];
  const min = 0.42;
  const max = 1;
  return Array.from({ length: count }, (_, i) => {
    const t = max - (i / (count - 1)) * (max - min);
    return shadeHex(base, t);
  });
}

// Given a "YYYY-MM-DD" string, return the day of month (1-31).
export function dayOfMonth(dateStr: string): number {
  const parts = dateStr.split("-");
  return Number(parts[2]) || 1;
}
