import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useMonths, useMonthly, useTransactions } from "@/lib/queries";
import type { Transaction } from "@/lib/types";
import { buildSubBudgetLookup, budgetLegendText } from "@/lib/budgetStatus";
import { Card, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import {
  NestedCategoryDonut,
  type DonutSelection,
} from "@/components/charts/NestedCategoryDonut";
import { StackedBarChart } from "@/components/charts/StackedBarChart";
import { cn, money, colorForIndex, subcategoryShades } from "@/lib/utils";

const UNASSIGNED = "Unassigned";
const UNCATEGORIZED = "Uncategorized";

interface SubAgg {
  key: string;
  subName: string;
  amount: number;
  color: string;
  txns: Transaction[];
}

interface CatAgg {
  name: string;
  amount: number;
  color: string;
  subs: SubAgg[];
  txns: Transaction[];
}

function categoryColorMap(txns: Transaction[]): Map<string, string> {
  const totals = new Map<string, number>();
  for (const t of txns) {
    if (t.amount <= 0) continue;
    const c = t.resolved_category_name || UNASSIGNED;
    totals.set(c, (totals.get(c) || 0) + t.amount);
  }
  const map = new Map<string, string>();
  [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([name], i) => map.set(name, colorForIndex(i)));
  return map;
}

function aggregateHierarchical(
  txns: Transaction[],
  colorMap: Map<string, string>,
): { cats: CatAgg[]; total: number } {
  const byCat = new Map<
    string,
    { amount: number; txns: Transaction[]; subs: Map<string, SubAgg> }
  >();
  let total = 0;

  for (const t of txns) {
    if (t.amount <= 0) continue;
    total += t.amount;
    const catName = t.resolved_category_name || UNASSIGNED;
    const subName = t.resolved_name || UNCATEGORIZED;

    if (!byCat.has(catName)) {
      byCat.set(catName, { amount: 0, txns: [], subs: new Map() });
    }
    const cat = byCat.get(catName)!;
    cat.amount += t.amount;
    cat.txns.push(t);

    if (!cat.subs.has(subName)) {
      cat.subs.set(subName, {
        key: `${catName}::${subName}`,
        subName,
        amount: 0,
        color: "",
        txns: [],
      });
    }
    const sub = cat.subs.get(subName)!;
    sub.amount += t.amount;
    sub.txns.push(t);
  }

  const cats: CatAgg[] = [...byCat.entries()]
    .map(([name, data]) => {
      const color = colorMap.get(name) || "#9A9AA0";
      const subs = [...data.subs.values()].sort((a, b) => b.amount - a.amount);
      const shades = subcategoryShades(color, subs.length);
      subs.forEach((s, i) => {
        s.color = shades[i];
      });
      return {
        name,
        amount: data.amount,
        color,
        subs,
        txns: data.txns,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  return { cats, total };
}

function filteredTxns(cats: CatAgg[], selection: DonutSelection): Transaction[] {
  if (!selection) return [];
  const cat = cats.find((c) => c.name === selection.category);
  if (!cat) return [];
  if (selection.sub) {
    return cat.subs.find((s) => s.subName === selection.sub)?.txns ?? [];
  }
  return cat.txns;
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-hairline py-2.5 last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="tnum text-sm font-medium">{value}</span>
    </div>
  );
}

export function Spending() {
  const { data: monthsData } = useMonths();
  const { data: monthly } = useMonthly();
  const { data: txResp, isLoading } = useTransactions("all");
  const [period, setPeriod] = useState("all");
  const [view, setView] = useState<"category" | "time">("category");
  const [selection, setSelection] = useState<DonutSelection>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const allTxns = txResp?.transactions ?? [];
  const colorMap = useMemo(() => categoryColorMap(allTxns), [allTxns]);

  const monthOptions = useMemo(() => {
    const ms = monthsData?.months ?? [];
    const labels = monthsData?.labels ?? [];
    return ms.map((m, i) => ({ value: m, label: labels[i] ?? m }));
  }, [monthsData]);

  const periodTxns = useMemo(
    () =>
      period === "all"
        ? allTxns
        : allTxns.filter((t) => (t.date || "").startsWith(period)),
    [allTxns, period],
  );

  const { cats, total } = useMemo(
    () => aggregateHierarchical(periodTxns, colorMap),
    [periodTxns, colorMap],
  );

  const budgetLookup = useMemo(
    () => (monthly ? buildSubBudgetLookup(monthly, period) : new Map()),
    [monthly, period],
  );

  const stats = useMemo(() => {
    const spend = periodTxns.filter((t) => t.amount > 0);
    const amounts = spend.map((t) => t.amount);
    const sum = amounts.reduce((a, b) => a + b, 0);
    return {
      total: sum,
      count: spend.length,
      largest: amounts.length ? Math.max(...amounts) : 0,
      average: amounts.length ? sum / amounts.length : 0,
    };
  }, [periodTxns]);

  const overTime = useMemo(() => {
    const ms = monthsData?.months ?? [];
    const labels = monthsData?.labels ?? [];
    const names = [...colorMap.keys()];
    const idx = new Map(ms.map((m, i) => [m, i]));
    const data = new Map<string, number[]>(
      names.map((n) => [n, new Array(ms.length).fill(0)]),
    );
    for (const t of allTxns) {
      if (t.amount <= 0) continue;
      const m = (t.date || "").slice(0, 7);
      const i = idx.get(m);
      if (i === undefined) continue;
      const name = t.resolved_category_name || UNASSIGNED;
      const arr = data.get(name);
      if (arr) arr[i] += t.amount;
    }
    return {
      labels,
      series: names.map((n) => ({
        name: n,
        color: colorMap.get(n) || "#9A9AA0",
        data: (data.get(n) || []).map((v) => Math.round(v * 100) / 100),
      })),
    };
  }, [allTxns, monthsData, colorMap]);

  const donutCategories = cats.map((c) => ({
    name: c.name,
    value: c.amount,
    color: c.color,
  }));

  const donutSubcategories = cats.flatMap((c) =>
    c.subs.map((s) => ({
      key: s.key,
      categoryName: c.name,
      subName: s.subName,
      value: s.amount,
      color: s.color,
    })),
  );

  const selectedTxns = filteredTxns(cats, selection);

  const toggleExpand = (catName: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(catName)) next.delete(catName);
      else next.add(catName);
      return next;
    });
  };

  const pickCategory = (catName: string) => {
    toggleExpand(catName);
    if (selection?.category === catName && !selection.sub) setSelection(null);
    else setSelection({ category: catName });
  };

  const pickSub = (catName: string, subName: string) => {
    if (selection?.category === catName && selection.sub === subName) {
      setSelection(null);
    } else {
      setSelection({ category: catName, sub: subName });
      setExpanded((prev) => new Set(prev).add(catName));
    }
  };

  const txnTitle = selection
    ? selection.sub
      ? `${selection.category} / ${selection.sub}`
      : selection.category
    : "Transactions";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-hairline p-0.5">
          {(
            [
              ["category", "By category"],
              ["time", "Over time"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                view === v
                  ? "bg-accent-soft text-accent"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {view === "category" ? (
          <Select
            className="w-44"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setSelection(null);
            }}
          >
            <option value="all">All year</option>
            {monthOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ) : null}
      </div>

      {isLoading ? (
        <Card>
          <p className="text-sm text-ink-muted">Loading…</p>
        </Card>
      ) : view === "time" ? (
        <Card>
          <CardHeader
            title="Spending over time"
            subtitle="By category, across the budget year"
          />
          <StackedBarChart labels={overTime.labels} series={overTime.series} />
        </Card>
      ) : total === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">No spending in this period.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Where it went"
                subtitle="Subcategories grouped by color family"
              />
              <div className="flex flex-col items-center gap-4 lg:flex-row">
                <div className="w-full lg:w-1/2">
                  <NestedCategoryDonut
                    categories={donutCategories}
                    subcategories={donutSubcategories}
                    height={280}
                    selection={selection}
                    onSelect={setSelection}
                  />
                </div>
                <ul className="max-h-[280px] w-full space-y-0.5 overflow-y-auto lg:w-1/2">
                  {cats.map((c) => {
                    const pct = total > 0 ? (c.amount / total) * 100 : 0;
                    const catActive =
                      selection?.category === c.name && !selection.sub;
                    const isOpen = expanded.has(c.name);
                    return (
                      <li key={c.name}>
                        <button
                          type="button"
                          onClick={() => pickCategory(c.name)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-black/[0.03]",
                            catActive && "bg-black/[0.04]",
                          )}
                        >
                          {c.subs.length > 1 ? (
                            isOpen ? (
                              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                            )
                          ) : (
                            <span className="w-3.5 shrink-0" />
                          )}
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-sm"
                            style={{ backgroundColor: c.color }}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {c.name}
                          </span>
                          <span className="tnum text-sm font-medium">
                            {money(c.amount)}
                          </span>
                          <span className="w-10 shrink-0 text-right text-xs text-ink-faint">
                            {pct.toFixed(0)}%
                          </span>
                        </button>
                        {isOpen
                          ? c.subs.map((s) => {
                              const subPct =
                                c.amount > 0 ? (s.amount / c.amount) * 100 : 0;
                              const subActive =
                                selection?.category === c.name &&
                                selection.sub === s.subName;
                              const budgetHint = budgetLegendText(
                                budgetLookup,
                                c.name,
                                s.subName,
                              );
                              return (
                                <button
                                  key={s.key}
                                  type="button"
                                  onClick={() => pickSub(c.name, s.subName)}
                                  className={cn(
                                    "ml-6 flex w-[calc(100%-1.5rem)] flex-col rounded-lg px-2 py-1 text-left transition-colors hover:bg-black/[0.03]",
                                    subActive && "bg-black/[0.04]",
                                  )}
                                >
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="h-2 w-2 shrink-0 rounded-sm"
                                      style={{ backgroundColor: s.color }}
                                    />
                                    <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">
                                      {s.subName}
                                    </span>
                                    <span className="tnum text-sm">
                                      {money(s.amount)}
                                    </span>
                                    <span className="w-10 shrink-0 text-right text-xs text-ink-faint">
                                      {subPct.toFixed(0)}%
                                    </span>
                                  </div>
                                  {budgetHint ? (
                                    <span className="ml-4 text-[10px] text-ink-faint">
                                      {budgetHint}
                                    </span>
                                  ) : null}
                                </button>
                              );
                            })
                          : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </Card>

            <Card>
              <CardHeader title="Summary" />
              <StatBlock label="Total spending" value={money(stats.total)} />
              <StatBlock label="Transactions" value={String(stats.count)} />
              <StatBlock label="Largest" value={money(stats.largest)} />
              <StatBlock label="Average" value={money(stats.average)} />
            </Card>
          </div>

          <Card>
            <CardHeader
              title={selection ? `${txnTitle} transactions` : txnTitle}
              subtitle={
                selection
                  ? "Click the same slice or legend row to clear"
                  : "Click a category or subcategory to filter"
              }
            />
            <ul className="divide-y divide-hairline">
              {(selection
                ? selectedTxns
                : periodTxns.filter((t) => t.amount > 0)
              )
                .slice()
                .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
                .slice(0, selection ? undefined : 12)
                .map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      <span className="text-ink-faint">{t.date}</span>{" "}
                      {t.merchant_name || t.name || "—"}
                    </span>
                    <span className="tnum shrink-0 text-loss">
                      -{money(t.amount)}
                    </span>
                  </li>
                ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
