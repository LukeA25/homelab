import { useMemo, useState } from "react";
import {
  useSnapshot,
  useMonthly,
  useMonths,
  useTransactions,
  useAssignTransaction,
} from "@/lib/queries";
import type { MonthlyCategory, Transaction } from "@/lib/types";
import {
  buildSubBudgetRows,
  buildSubcategoryColorMap,
  currentMonthKey,
  monthIndex,
} from "@/lib/budgetStatus";
import { spendAmount } from "@/lib/repayments";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Pill } from "@/components/ui/Pill";
import { ConnectBankButton } from "@/components/PlaidConnect";
import { SpendingLineChart } from "@/components/charts/SpendingLineChart";
import { CategoryDonut } from "@/components/charts/CategoryDonut";
import { BudgetRing } from "@/components/BudgetRing";
import { SubcategoryAssign } from "@/components/SubcategoryAssign";
import { MonthPicker } from "@/components/MonthPicker";
import { colorForIndex, money, percent, dayOfMonth } from "@/lib/utils";

const DAYS = 31;

function sumAt(cats: MonthlyCategory[], index: number): number {
  let total = 0;
  for (const cat of cats) {
    for (const sub of cat.subcategories) total += sub.actual[index] || 0;
  }
  return total;
}

function cumulativeByDay(
  txns: Transaction[],
  ym: string,
  clampToday: boolean,
): (number | null)[] {
  const perDay = new Array(DAYS).fill(0);
  for (const t of txns) {
    const amount = spendAmount(t);
    if (amount <= 0) continue;
    if (!(t.date || "").startsWith(ym)) continue;
    const day = dayOfMonth(t.date);
    if (day >= 1 && day <= DAYS) perDay[day - 1] += amount;
  }
  const lastDay = clampToday ? new Date().getDate() : DAYS;
  const out: (number | null)[] = [];
  let running = 0;
  for (let i = 0; i < DAYS; i++) {
    running += perDay[i];
    out.push(i < lastDay ? Math.round(running * 100) / 100 : null);
  }
  return out;
}

function ConnectPrompt() {
  return (
    <Card className="flex min-h-[300px] flex-col items-center justify-center text-center">
      <h2 className="text-xl font-semibold">Connect your bank</h2>
      <p className="mt-2 max-w-md text-sm text-ink-muted">
        Link an account through Plaid to pull in balances and transactions. Your
        budget categories are ready to go.
      </p>
      <div className="mt-5">
        <ConnectBankButton />
      </div>
    </Card>
  );
}

function ReviewList({
  txns,
  colorMap,
}: {
  txns: Transaction[];
  colorMap: Map<number, string>;
}) {
  const assign = useAssignTransaction();
  // Repayments are deliberately uncategorized, so they're never "to review".
  const toReview = txns.filter(
    (t) => t.resolved_subcategory_id == null && !t.is_repayment,
  );

  if (toReview.length === 0) {
    return (
      <Card>
        <CardHeader title="Transactions to review" />
        <p className="text-sm text-ink-muted">
          Nothing to review. Every transaction is categorized.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Transactions to review"
        subtitle={`${toReview.length} uncategorized`}
      />
      <ul className="divide-y divide-hairline">
        {toReview.slice(0, 6).map((t) => (
          <li key={t.id} className="py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {t.merchant_name || t.name || "Transaction"}
                </div>
                <div className="text-xs text-ink-faint">{t.date}</div>
              </div>
              <span className="tnum shrink-0 text-sm font-medium text-loss">
                -{money(Math.abs(t.amount))}
              </span>
            </div>
            <div className="mt-2 max-w-xs">
              <SubcategoryAssign
                subcategoryId={t.resolved_subcategory_id}
                subcategoryName={t.resolved_name}
                categoryName={t.resolved_category_name}
                color={
                  t.resolved_subcategory_id != null
                    ? colorMap.get(t.resolved_subcategory_id)
                    : undefined
                }
                kind={t.amount > 0 ? "expense" : "income"}
                onChange={(subId) =>
                  assign.mutate({ id: t.id, subcategoryId: subId })
                }
              />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function Dashboard() {
  const { data: snapshot, isLoading: snapLoading } = useSnapshot();
  const { data: monthly } = useMonthly();
  const { data: monthsData } = useMonths();
  const { data: txResp } = useTransactions();

  const ym = currentMonthKey();
  const monthIdx = monthly ? monthIndex(monthly, ym) : 0;

  const budgetMonths = monthsData?.months ?? [];
  const budgetLabels = monthsData?.labels ?? [];

  const defaultChartMonth = useMemo(() => {
    if (budgetMonths.includes(ym)) return ym;
    return budgetMonths[budgetMonths.length - 1] ?? ym;
  }, [budgetMonths, ym]);

  const [chartMonth, setChartMonth] = useState<string | null>(null);
  const selectedMonth = chartMonth ?? defaultChartMonth;

  const chartMonthIdx = budgetMonths.indexOf(selectedMonth);
  const prevBudgetMonth =
    chartMonthIdx > 0 ? budgetMonths[chartMonthIdx - 1] : null;
  const clampToday = selectedMonth === ym;

  const stats = useMemo(() => {
    if (!monthly) return null;
    const income = sumAt(monthly.income, monthIdx);
    const expense = sumAt(monthly.expense, monthIdx);
    const net = income - expense;
    return {
      income,
      expense,
      net,
      savingsRate: income > 0 ? net / income : 0,
    };
  }, [monthly, monthIdx]);

  const subBudgetRows = useMemo(
    () => (monthly ? buildSubBudgetRows(monthly, monthIdx) : []),
    [monthly, monthIdx],
  );

  const colorMap = useMemo(
    () => (monthly ? buildSubcategoryColorMap(monthly) : new Map()),
    [monthly],
  );

  const overBudget = useMemo(
    () => subBudgetRows.filter((r) => r.status === "over"),
    [subBudgetRows],
  );

  const runningHot = useMemo(
    () => subBudgetRows.filter((r) => r.status === "hot"),
    [subBudgetRows],
  );

  const ringRows = useMemo(
    () =>
      subBudgetRows
        .filter((r) => r.projected > 0 || r.actual > 0)
        .slice(0, 12),
    [subBudgetRows],
  );

  const donutItems = useMemo(() => {
    const byCat = new Map<string, number>();
    for (const r of subBudgetRows) {
      if (r.actual <= 0) continue;
      byCat.set(r.categoryName, (byCat.get(r.categoryName) || 0) + r.actual);
    }
    return [...byCat.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({
        name,
        value,
        color: colorForIndex(i),
      }));
  }, [subBudgetRows]);

  const chartLabels = useMemo(() => {
    const selLabel = budgetLabels[chartMonthIdx] ?? selectedMonth;
    if (prevBudgetMonth == null) {
      return {
        thisMonthLabel: selLabel,
        lastMonthLabel: "",
        subtitle: `${selLabel} — cumulative spending`,
      };
    }
    const prevIdx = chartMonthIdx - 1;
    const prevLabel = budgetLabels[prevIdx] ?? prevBudgetMonth;
    return {
      thisMonthLabel: selLabel,
      lastMonthLabel: prevLabel,
      subtitle: `Cumulative, ${selLabel} vs ${prevLabel}`,
    };
  }, [
    budgetLabels,
    chartMonthIdx,
    prevBudgetMonth,
    selectedMonth,
  ]);

  const line = useMemo(() => {
    const txns = txResp?.transactions ?? [];
    return {
      days: Array.from({ length: DAYS }, (_, i) => i + 1),
      thisMonth: cumulativeByDay(txns, selectedMonth, clampToday),
      lastMonth: prevBudgetMonth
        ? cumulativeByDay(txns, prevBudgetMonth, false)
        : null,
    };
  }, [txResp, selectedMonth, prevBudgetMonth, clampToday]);

  if (snapLoading) {
    return <div className="text-sm text-ink-muted">Loading…</div>;
  }

  if (!snapshot?.connected) {
    return <ConnectPrompt />;
  }

  const totalBalance = (snapshot.accounts ?? []).reduce(
    (sum, a) => sum + (a.current_balance ?? a.available_balance ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Income (this month)" value={money(stats?.income)} tone="gain" />
        <StatCard
          label="Spending (this month)"
          value={money(stats?.expense)}
          tone="loss"
        />
        <StatCard
          label="Net (this month)"
          value={money(stats?.net)}
          tone={(stats?.net ?? 0) >= 0 ? "gain" : "loss"}
        />
        <StatCard
          label="Savings rate"
          value={percent(stats?.savingsRate)}
          hint={`Balance ${money(totalBalance)}`}
        />
      </div>

      {overBudget.length > 0 ? (
        <Card className="border-loss/20 bg-loss/[0.03]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Pill tone="loss">Over budget</Pill>
            {overBudget.map((r) => (
              <span key={r.id} className="text-sm">
                <span className="font-medium">{r.name}</span>
                <span className="tnum text-loss">
                  {" "}
                  +{money(r.actual - r.projected)}
                </span>
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      {runningHot.length > 0 ? (
        <Card className="border-accent/30 bg-accent-soft/40">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Pill tone="accent">Running hot</Pill>
            <span className="text-sm text-ink-muted">
              On pace to overspend this month:
            </span>
            {runningHot.map((r) => (
              <span key={r.id} className="text-sm">
                <span className="font-medium">{r.name}</span>
                <span className="tnum text-ink-muted">
                  {" "}
                  {Math.round(r.pctUsed * 100)}% of budget
                </span>
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      {ringRows.length > 0 ? (
        <Card>
          <CardHeader
            title="Subcategory budgets"
            subtitle="This month — tap a ring in Spending for details"
          />
          <div className="flex gap-4 overflow-x-auto pb-2">
            {ringRows.map((r) => (
              <BudgetRing key={r.id} row={r} />
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Spending"
            subtitle={chartLabels.subtitle}
            action={
              budgetMonths.length > 0 ? (
                <MonthPicker
                  months={budgetMonths}
                  labels={budgetLabels}
                  value={selectedMonth}
                  onChange={setChartMonth}
                />
              ) : null
            }
          />
          <SpendingLineChart
            days={line.days}
            thisMonth={line.thisMonth}
            lastMonth={line.lastMonth}
            thisMonthLabel={chartLabels.thisMonthLabel}
            lastMonthLabel={chartLabels.lastMonthLabel}
          />
        </Card>
        <Card>
          <CardHeader title="Top categories" subtitle="This month" />
          {donutItems.length ? (
            <CategoryDonut items={donutItems} />
          ) : (
            <p className="text-sm text-ink-muted">No spending yet this month.</p>
          )}
        </Card>
      </div>

      <ReviewList txns={txResp?.transactions ?? []} colorMap={colorMap} />
    </div>
  );
}
