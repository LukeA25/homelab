import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useInvestments } from "@/lib/queries";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Pill } from "@/components/ui/Pill";
import { ConnectBankButton } from "@/components/PlaidConnect";
import { CategoryDonut } from "@/components/charts/CategoryDonut";
import { colorForIndex, money, percent } from "@/lib/utils";

function activityLabel(type: string | null, subtype: string | null): string {
  const parts = [type, subtype].filter(Boolean);
  return parts.length ? parts.join(" · ").replace(/_/g, " ") : "Activity";
}

function EmptyInvestments() {
  return (
    <Card className="flex min-h-[320px] flex-col items-center justify-center text-center">
      <h2 className="text-xl font-semibold">Track your investments</h2>
      <p className="mt-2 max-w-md text-sm text-ink-muted">
        Connect a brokerage or retirement account through Plaid to see holdings,
        allocation, and recent activity. In Sandbox, use a test institution with
        investment accounts — real Fidelity requires Production once approved.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <ConnectBankButton mode="investments" label="Connect investment account" />
        <ConnectBankButton mode="all" variant="ghost" label="Connect all accounts" />
      </div>
    </Card>
  );
}

export function Investments() {
  const { data, isLoading } = useInvestments();

  const donutItems = useMemo(
    () =>
      (data?.allocation ?? []).slice(0, 8).map((a, i) => ({
        name: a.ticker || a.name,
        value: a.value,
        color: colorForIndex(i),
      })),
    [data?.allocation],
  );

  if (isLoading) {
    return <p className="text-sm text-ink-muted">Loading…</p>;
  }

  const hasAccounts = (data?.accounts?.length ?? 0) > 0;
  const hasHoldings = (data?.holdings?.length ?? 0) > 0;

  if (!hasAccounts && !hasHoldings) {
    return (
      <div className="space-y-6">
        <EmptyInvestments />
        {data?.connected ? (
          <Card>
            <CardHeader title="Already connected?" />
            <p className="text-sm text-ink-muted">
              Hit <strong>Refresh</strong> in the header after linking an investment
              account, or connect one with the Investments product enabled. Banking
              accounts appear on{" "}
              <Link to="/accounts" className="text-accent hover:underline">
                Accounts
              </Link>
              .
            </p>
          </Card>
        ) : null}
      </div>
    );
  }

  const gain = data?.total_gain;
  const gainTone = gain == null ? undefined : gain >= 0 ? "gain" : "loss";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Portfolio value" value={money(data?.total_value)} />
          <StatCard label="Accounts" value={String(data?.accounts.length ?? 0)} />
          <StatCard label="Holdings" value={String(data?.holdings.length ?? 0)} />
          <StatCard
            label="Unrealized gain"
            value={gain != null ? money(gain) : "—"}
            tone={gainTone}
            hint={
              data?.total_cost_basis != null
                ? `Cost ${money(data.total_cost_basis)}`
                : undefined
            }
          />
        </div>
        <ConnectBankButton mode="investments" label="Add investment account" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Holdings" subtitle="Positions across investment accounts" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-faint">
                  <th className="pb-2 font-medium">Security</th>
                  <th className="pb-2 font-medium">Account</th>
                  <th className="pb-2 text-right font-medium">Qty</th>
                  <th className="pb-2 text-right font-medium">Price</th>
                  <th className="pb-2 text-right font-medium">Value</th>
                  <th className="pb-2 text-right font-medium">Weight</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {data?.holdings.map((h) => {
                  const weight =
                    (data.total_value ?? 0) > 0
                      ? (h.value / (data.total_value ?? 1)) * 100
                      : 0;
                  return (
                    <tr key={`${h.account_id}-${h.security_id}`}>
                      <td className="py-2.5">
                        <div className="font-medium">
                          {h.ticker ? (
                            <span className="text-ink">{h.ticker}</span>
                          ) : (
                            h.name
                          )}
                        </div>
                        {h.ticker ? (
                          <div className="truncate text-xs text-ink-faint">{h.name}</div>
                        ) : null}
                        {h.security_type ? (
                          <Pill tone="neutral" className="mt-1 capitalize">
                            {h.security_type.replace(/_/g, " ")}
                          </Pill>
                        ) : null}
                      </td>
                      <td className="py-2.5 text-ink-muted">
                        {h.account_name ?? "—"}
                        {h.account_mask ? ` ·••${h.account_mask}` : ""}
                      </td>
                      <td className="py-2.5 text-right tnum">
                        {h.quantity.toLocaleString(undefined, {
                          maximumFractionDigits: 4,
                        })}
                      </td>
                      <td className="py-2.5 text-right tnum">
                        {h.price != null ? money(h.price) : "—"}
                      </td>
                      <td className="py-2.5 text-right tnum font-medium">
                        {money(h.value)}
                      </td>
                      <td className="py-2.5 text-right tnum text-ink-muted">
                        {weight.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Allocation" subtitle="By holding value" />
          {donutItems.length ? (
            <CategoryDonut items={donutItems} showLegend={false} height={240} />
          ) : (
            <p className="text-sm text-ink-muted">No holdings to chart yet.</p>
          )}
          <ul className="mt-3 space-y-1.5">
            {data?.allocation.slice(0, 6).map((a, i) => (
              <li
                key={a.ticker || a.name}
                className="flex items-center justify-between text-sm"
              >
                <span className="flex items-center gap-2 truncate">
                  <span
                    className="h-2 w-2 shrink-0 rounded-sm"
                    style={{ backgroundColor: colorForIndex(i) }}
                  />
                  {a.ticker || a.name}
                </span>
                <span className="tnum shrink-0 text-ink-muted">
                  {percent(a.weight, 0)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Investment accounts" />
          <ul className="divide-y divide-hairline">
            {data?.accounts.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {a.official_name || a.name || "Account"}
                  </p>
                  <p className="text-xs text-ink-faint">
                    {a.mask ? `•••• ${a.mask}` : ""}
                    {a.subtype ? ` · ${a.subtype.replace(/_/g, " ")}` : ""}
                  </p>
                </div>
                <span className="tnum font-semibold">
                  {money(a.current_balance ?? a.available_balance ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Recent activity" subtitle="Buys, sells, dividends, etc." />
          {(data?.activity.length ?? 0) === 0 ? (
            <p className="text-sm text-ink-muted">
              No investment transactions yet. Refresh after connecting an account.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {data?.activity.slice(0, 12).map((t) => (
                <li
                  key={t.id}
                  className="flex items-start justify-between gap-3 py-2.5 first:pt-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {t.name || t.security_name || t.ticker || "Activity"}
                    </p>
                    <p className="text-xs text-ink-faint">
                      {t.date}
                      {t.ticker ? ` · ${t.ticker}` : ""}
                      {" · "}
                      <span className="capitalize">{activityLabel(t.type, t.subtype)}</span>
                    </p>
                  </div>
                  <span className="tnum shrink-0 text-sm font-medium">
                    {money(Math.abs(t.amount))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
