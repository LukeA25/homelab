import type { Monthly, MonthlyCategory } from "./types";
import {
  computeBudgetStatus,
  type BudgetStatus,
} from "./budgetStatus";

export type TrackingScope = "month" | "ytd" | "year";
export type TrackingKind = "overall" | "income" | "expense";

export interface TrackingNode {
  id: string;
  kind: TrackingKind;
  name: string;
  categoryName?: string;
  /** Subcategory or category id when applicable. */
  entityId?: number;
  projected: number[];
  actual: number[];
  cumulativeProjected: number[];
  cumulativeActual: (number | null)[];
  /** Sum of projected through currentMonthIdx inclusive. */
  ytdProjected: number;
  /** Sum of actual through currentMonthIdx inclusive. */
  ytdActual: number;
  /** Full-year projected total. */
  yearProjected: number;
  /** Full-year actual total (future months are zero). */
  yearActual: number;
  /** Year-to-date variance: favorable is positive. */
  ytdVariance: number;
  /** actualYtd + remaining projected months. */
  landing: number;
  status: BudgetStatus;
  children: TrackingNode[];
}

function cumulative(values: number[]): number[] {
  const out: number[] = [];
  let running = 0;
  for (const v of values) {
    running += v;
    out.push(Math.round(running * 100) / 100);
  }
  return out;
}

function cumulativeActual(
  values: number[],
  currentMonthIdx: number,
): (number | null)[] {
  const out: (number | null)[] = [];
  let running = 0;
  for (let i = 0; i < values.length; i++) {
    if (i > currentMonthIdx) {
      out.push(null);
      continue;
    }
    running += values[i] ?? 0;
    out.push(Math.round(running * 100) / 100);
  }
  return out;
}

function sumThrough(values: number[], endIdx: number): number {
  let total = 0;
  for (let i = 0; i <= endIdx && i < values.length; i++) {
    total += values[i] ?? 0;
  }
  return Math.round(total * 100) / 100;
}

function sumAll(values: number[]): number {
  return Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;
}

function sumRemainingProjected(
  projected: number[],
  currentMonthIdx: number,
): number {
  let total = 0;
  for (let i = currentMonthIdx + 1; i < projected.length; i++) {
    total += projected[i] ?? 0;
  }
  return Math.round(total * 100) / 100;
}

function makeNode(
  id: string,
  kind: TrackingKind,
  name: string,
  projected: number[],
  actual: number[],
  currentMonthIdx: number,
  dayOfMonth: number,
  daysInMonth: number,
  extras: Partial<TrackingNode> = {},
): TrackingNode {
  const ytdProjected = sumThrough(projected, currentMonthIdx);
  const ytdActual = sumThrough(actual, currentMonthIdx);
  const yearProjected = sumAll(projected);
  const yearActual = sumAll(actual);
  const ytdVariance =
    kind === "income"
      ? ytdActual - ytdProjected
      : ytdProjected - ytdActual;
  const landing =
    Math.round((ytdActual + sumRemainingProjected(projected, currentMonthIdx)) * 100) /
    100;

  // Status against year-to-date projected for recurring budgets; unbudgeted
  // when there's activity with no plan.
  const status = computeBudgetStatus(
    ytdProjected,
    ytdActual,
    dayOfMonth,
    daysInMonth,
  );

  return {
    id,
    kind,
    name,
    projected,
    actual,
    cumulativeProjected: cumulative(projected),
    cumulativeActual: cumulativeActual(actual, currentMonthIdx),
    ytdProjected,
    ytdActual,
    yearProjected,
    yearActual,
    ytdVariance,
    landing,
    status,
    children: [],
    ...extras,
  };
}

function sumSeries(nodes: TrackingNode[], key: "projected" | "actual"): number[] {
  if (nodes.length === 0) return [];
  const len = nodes[0][key].length;
  const out = new Array(len).fill(0);
  for (const n of nodes) {
    for (let i = 0; i < len; i++) out[i] += n[key][i] ?? 0;
  }
  return out.map((v) => Math.round(v * 100) / 100);
}

function buildSection(
  cats: MonthlyCategory[],
  kind: "income" | "expense",
  currentMonthIdx: number,
  dayOfMonth: number,
  daysInMonth: number,
): TrackingNode[] {
  return cats.map((cat) => {
    const children = cat.subcategories.map((sub) =>
      makeNode(
        `${kind}-sub-${sub.id}`,
        kind,
        sub.name,
        sub.projected,
        sub.actual,
        currentMonthIdx,
        dayOfMonth,
        daysInMonth,
        { categoryName: cat.name, entityId: sub.id },
      ),
    );
    return makeNode(
      `${kind}-cat-${cat.id}`,
      kind,
      cat.name,
      sumSeries(children, "projected"),
      sumSeries(children, "actual"),
      currentMonthIdx,
      dayOfMonth,
      daysInMonth,
      { entityId: cat.id, children },
    );
  });
}

export interface TrackingTree {
  overall: TrackingNode;
  income: TrackingNode[];
  expense: TrackingNode[];
  months: string[];
  monthLabels: string[];
  currentMonthIdx: number;
}

export function buildTrackingTree(
  monthly: Monthly,
  currentMonthIdx: number,
): TrackingTree {
  const now = new Date();
  const day = now.getDate();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();

  const income = buildSection(
    monthly.income,
    "income",
    currentMonthIdx,
    day,
    daysInMonth,
  );
  const expense = buildSection(
    monthly.expense,
    "expense",
    currentMonthIdx,
    day,
    daysInMonth,
  );

  // Overall tracks net (income - expense) as two parallel series.
  const incomeProj = sumSeries(income, "projected");
  const incomeAct = sumSeries(income, "actual");
  const expenseProj = sumSeries(expense, "projected");
  const expenseAct = sumSeries(expense, "actual");
  const netProj = incomeProj.map((v, i) =>
    Math.round((v - (expenseProj[i] ?? 0)) * 100) / 100,
  );
  const netAct = incomeAct.map((v, i) =>
    Math.round((v - (expenseAct[i] ?? 0)) * 100) / 100,
  );

  const overall = makeNode(
    "overall",
    "overall",
    "Overall",
    netProj,
    netAct,
    currentMonthIdx,
    day,
    daysInMonth,
  );
  // Net variance: actual net vs projected net (favorable = ahead of plan).
  overall.ytdVariance = overall.ytdActual - overall.ytdProjected;
  overall.status =
    overall.ytdProjected === 0 && overall.ytdActual === 0
      ? "none"
      : overall.ytdVariance >= 0
        ? "ok"
        : "over";

  return {
    overall,
    income,
    expense,
    months: monthly.months,
    monthLabels: monthly.month_labels,
    currentMonthIdx,
  };
}

export function scopedAmounts(
  node: TrackingNode,
  scope: TrackingScope,
  monthIdx: number,
): { projected: number; actual: number; variance: number } {
  if (scope === "month") {
    const projected = node.projected[monthIdx] ?? 0;
    const actual = node.actual[monthIdx] ?? 0;
    const variance =
      node.kind === "income" || node.kind === "overall"
        ? actual - projected
        : projected - actual;
    return { projected, actual, variance };
  }
  if (scope === "ytd") {
    return {
      projected: node.ytdProjected,
      actual: node.ytdActual,
      variance: node.ytdVariance,
    };
  }
  const variance =
    node.kind === "income" || node.kind === "overall"
      ? node.yearActual - node.yearProjected
      : node.yearProjected - node.yearActual;
  return {
    projected: node.yearProjected,
    actual: node.yearActual,
    variance,
  };
}

export function findTrackingNode(
  tree: TrackingTree,
  id: string,
): TrackingNode | null {
  if (tree.overall.id === id) return tree.overall;
  for (const section of [tree.income, tree.expense]) {
    for (const cat of section) {
      if (cat.id === id) return cat;
      for (const sub of cat.children) {
        if (sub.id === id) return sub;
      }
    }
  }
  return null;
}

export function trackingRead(node: TrackingNode): string {
  const { ytdActual, ytdVariance, yearProjected, landing, kind } = node;

  if (yearProjected <= 0 && ytdActual <= 0) {
    return "No budget and no activity yet.";
  }
  if (yearProjected <= 0 && ytdActual > 0) {
    return kind === "income"
      ? `Unbudgeted income of ${formatMoney(ytdActual)} so far.`
      : `Unbudgeted spending of ${formatMoney(ytdActual)} so far.`;
  }

  const absVar = Math.abs(ytdVariance);
  if (absVar < 1) {
    return "Right on plan year to date.";
  }

  if (kind === "income" || kind === "overall") {
    if (ytdVariance >= 0) {
      return `Ahead of plan by ${formatMoney(ytdVariance)} year to date. Landing near ${formatMoney(landing)} vs ${formatMoney(yearProjected)} budgeted.`;
    }
    return `Behind plan by ${formatMoney(absVar)} year to date. On pace for about ${formatMoney(landing)} vs ${formatMoney(yearProjected)} budgeted.`;
  }

  // Expense
  if (ytdVariance >= 0) {
    return `Under budget by ${formatMoney(ytdVariance)} year to date. On pace for about ${formatMoney(landing)} of ${formatMoney(yearProjected)}.`;
  }
  // Over YTD — distinguish lump-sum timing from a real overspend via landing.
  if (landing <= yearProjected + 1) {
    return `Over year-to-date plan by ${formatMoney(absVar)}, but the full-year total still lines up (likely a timing difference).`;
  }
  return `Over budget by ${formatMoney(absVar)} year to date. Heading for about ${formatMoney(landing)} vs ${formatMoney(yearProjected)} budgeted.`;
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}
