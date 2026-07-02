import { useMemo } from "react";
import {
  useSnapshot,
  useMonthly,
  useTransactions,
  useCategories,
  useAssignTransaction,
} from "@/lib/queries";
import type { Category, MonthlyCategory, Transaction } from "@/lib/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Pill } from "@/components/ui/Pill";
import { ConnectBankButton } from "@/components/PlaidConnect";
import { SpendingLineChart } from "@/components/charts/SpendingLineChart";
import { CategoryDonut } from "@/components/charts/CategoryDonut";
import { colorForIndex, money, percent, dayOfMonth } from "@/lib/utils";

const DAYS = 31;

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function previousMonthKey(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function sumAt(cats: MonthlyCategory[], index: number): number {
  let total = 0;
  for (const cat of cats) {
    for (const sub of cat.subcategories) total += sub.actual[index] || 0;
  }
  return total;
}

// Running cumulative spend per day-of-month for a given YYYY-MM. Returns an
// array of length DAYS; entries are null past the last day with data so the
// current (partial) month's line stops at today.
function cumulativeByDay(
  txns: Transaction[],
  ym: string,
  clampToday: boolean,
): (number | null)[] {
  const perDay = new Array(DAYS).fill(0);
  let sawAny = false;
  for (const t of txns) {
    if (t.amount <= 0) continue; // spending only
    if (!(t.date || "").startsWith(ym)) continue;
    const day = dayOfMonth(t.date);
    if (day >= 1 && day <= DAYS) {
      perDay[day - 1] += t.amount;
      sawAny = true;
    }
  }
  if (!sawAny && clampToday) {
    // no data yet this month
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

function ReviewList({ txns }: { txns: Transaction[] }) {
  const { data: cats } = useCategories();
  const assign = useAssignTransaction();
  const toReview = txns.filter((t) => t.resolved_subcategory_id == null);

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
          <li
            key={t.id}
            className="flex items-center justify-between gap-3 py-2.5"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {t.merchant_name || t.name || "Transaction"}
              </div>
              <div className="text-xs text-ink-faint">{t.date}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="tnum text-sm font-medium text-loss">
                -{money(Math.abs(t.amount))}
              </span>
              <select
                className="h-8 rounded-lg border border-hairline bg-card px-2 text-sm"
                defaultValue=""
                onChange={(e) =>
                  assign.mutate({
                    id: t.id,
                    subcategoryId: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              >
                <option value="" disabled>
                  Assign…
                </option>
                {(cats?.categories ?? []).map((c: Category) => (
                  <optgroup key={c.id} label={`${c.name} (${c.kind})`}>
                    {c.subcategories.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
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
  const { data: txResp } = useTransactions();

  const ym = currentMonthKey();
  const prevYm = previousMonthKey(ym);

  const stats = useMemo(() => {
    if (!monthly) return null;
    let index = monthly.months.indexOf(ym);
    if (index === -1) index = monthly.months.length - 1;
    const income = sumAt(monthly.income, index);
    const expense = sumAt(monthly.expense, index);
    const net = income - expense;
    return {
      index,
      income,
      expense,
      net,
      savingsRate: income > 0 ? net / income : 0,
    };
  }, [monthly, ym]);

  const budgetRows = useMemo(() => {
    if (!monthly || !stats) return [];
    return monthly.expense
      .map((cat, i) => {
        const actual = cat.subcategories.reduce(
          (s, sub) => s + (sub.actual[stats.index] || 0),
          0,
        );
        const projected = cat.subcategories.reduce(
          (s, sub) => s + (sub.projected[stats.index] || 0),
          0,
        );
        return { name: cat.name, actual, projected, color: colorForIndex(i) };
      })
      .filter((r) => r.actual > 0 || r.projected > 0)
      .sort((a, b) => b.actual - a.actual);
  }, [monthly, stats]);

  const donutItems = useMemo(
    () => budgetRows.filter((r) => r.actual > 0).map((r) => ({
      name: r.name,
      value: r.actual,
      color: r.color,
    })),
    [budgetRows],
  );

  const line = useMemo(() => {
    const txns = txResp?.transactions ?? [];
    return {
      days: Array.from({ length: DAYS }, (_, i) => i + 1),
      thisMonth: cumulativeByDay(txns, ym, true),
      lastMonth: cumulativeByDay(txns, prevYm, false),
    };
  }, [txResp, ym, prevYm]);

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Spending"
            subtitle="Cumulative, this month vs last"
          />
          <SpendingLineChart
            days={line.days}
            thisMonth={line.thisMonth}
            lastMonth={line.lastMonth}
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Budget progress" subtitle="This month" />
          {budgetRows.length ? (
            <ul className="space-y-4">
              {budgetRows.map((r) => {
                const over = r.projected > 0 && r.actual > r.projected;
                return (
                  <li key={r.name}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium">{r.name}</span>
                      <span className="tnum text-ink-muted">
                        {money(r.actual)}
                        {r.projected > 0 ? ` / ${money(r.projected)}` : ""}
                      </span>
                    </div>
                    <ProgressBar
                      value={r.actual}
                      max={r.projected || r.actual}
                      color={r.color}
                    />
                    {over ? (
                      <div className="mt-1">
                        <Pill tone="loss">
                          Over by {money(r.actual - r.projected)}
                        </Pill>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">
              No budget activity yet this month.
            </p>
          )}
        </Card>

        <ReviewList txns={txResp?.transactions ?? []} />
      </div>
    </div>
  );
}
