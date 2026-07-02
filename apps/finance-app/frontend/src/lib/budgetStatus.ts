import type { Monthly } from "./types";
import { colorForIndex } from "./utils";

export type BudgetStatus = "over" | "hot" | "close" | "ok" | "unbudgeted" | "none";

export interface SubBudgetRow {
  id: number;
  name: string;
  categoryName: string;
  projected: number;
  actual: number;
  remaining: number;
  pctUsed: number;
  status: BudgetStatus;
  color: string;
}

export function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function monthIndex(monthly: Monthly, ym: string): number {
  let i = monthly.months.indexOf(ym);
  if (i === -1) i = monthly.months.length - 1;
  return i;
}

export function computeBudgetStatus(
  projected: number,
  actual: number,
  dayOfMonth: number,
  daysInMonth: number,
): BudgetStatus {
  if (projected <= 0) {
    return actual > 0 ? "unbudgeted" : "none";
  }
  if (actual > projected) return "over";
  const expectedShare = dayOfMonth / daysInMonth;
  const actualShare = actual / projected;
  // Spending faster than pace by 12+ points (e.g. 62% spent at 50% of month).
  if (actualShare > expectedShare + 0.12 && actualShare < 1) return "hot";
  if (actualShare >= 0.85) return "close";
  return "ok";
}

export function statusLabel(status: BudgetStatus): string {
  switch (status) {
    case "over":
      return "Over";
    case "hot":
      return "Running hot";
    case "close":
      return "Close";
    case "unbudgeted":
      return "Unbudgeted";
    case "ok":
      return "On track";
    default:
      return "—";
  }
}

export function statusTone(
  status: BudgetStatus,
): "loss" | "accent" | "neutral" | "gain" {
  switch (status) {
    case "over":
    case "unbudgeted":
      return "loss";
    case "hot":
    case "close":
      return "accent";
    case "ok":
      return "gain";
    default:
      return "neutral";
  }
}

/** Expense subcategories with budget activity for one month index. */
export function buildSubBudgetRows(
  monthly: Monthly,
  index: number,
): SubBudgetRow[] {
  const now = new Date();
  const day = now.getDate();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();

  const rows: SubBudgetRow[] = [];
  let colorIdx = 0;

  for (const cat of monthly.expense) {
    for (const sub of cat.subcategories) {
      const projected = sub.projected[index] ?? 0;
      const actual = sub.actual[index] ?? 0;
      if (projected <= 0 && actual <= 0) continue;

      rows.push({
        id: sub.id,
        name: sub.name,
        categoryName: cat.name,
        projected,
        actual,
        remaining: projected - actual,
        pctUsed: projected > 0 ? actual / projected : 1,
        status: computeBudgetStatus(projected, actual, day, daysInMonth),
        color: colorForIndex(colorIdx++),
      });
    }
  }

  return rows.sort((a, b) => b.pctUsed - a.pctUsed);
}

export type SubBudgetLookup = Map<
  string,
  { id: number; projected: number; actual: number; remaining: number; pctUsed: number }
>;

/** Key: `${categoryName}::${subName}` */
export function buildSubBudgetLookup(
  monthly: Monthly,
  period: string,
): SubBudgetLookup {
  const map: SubBudgetLookup = new Map();
  const allYear = period === "all";

  for (const cat of monthly.expense) {
    for (const sub of cat.subcategories) {
      let projected: number;
      let actual: number;
      if (allYear) {
        projected = sub.total_projected;
        actual = sub.total_actual;
      } else {
        const i = monthIndex(monthly, period);
        projected = sub.projected[i] ?? 0;
        actual = sub.actual[i] ?? 0;
      }
      if (projected <= 0 && actual <= 0) continue;
      map.set(`${cat.name}::${sub.name}`, {
        id: sub.id,
        projected,
        actual,
        remaining: projected - actual,
        pctUsed: projected > 0 ? actual / projected : 1,
      });
    }
  }
  return map;
}

/** Stable colors keyed by subcategory id (expense subs only). */
export function buildSubcategoryColorMap(monthly: Monthly): Map<number, string> {
  const map = new Map<number, string>();
  let i = 0;
  for (const cat of monthly.expense) {
    for (const sub of cat.subcategories) {
      map.set(sub.id, colorForIndex(i++));
    }
  }
  return map;
}

export function budgetLegendText(
  lookup: SubBudgetLookup,
  categoryName: string,
  subName: string,
): string | null {
  const row = lookup.get(`${categoryName}::${subName}`);
  if (!row || row.projected <= 0) return null;
  const pct = Math.round(row.pctUsed * 100);
  if (row.remaining >= 0) {
    return `${pct}% used · ${formatCompact(row.remaining)} left`;
  }
  return `${pct}% used · ${formatCompact(Math.abs(row.remaining))} over`;
}

function formatCompact(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}
