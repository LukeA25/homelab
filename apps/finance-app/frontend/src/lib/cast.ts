import type { QueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { buildSubcategoryColorMap } from "./budgetStatus";
import { keys } from "./queries";
import type { Transaction, TransactionsResponse } from "./types";

/**
 * Bridge to the homelab cast script (/__cast/cast.js). On the phone it gives
 * the remote Finance's pages and the "assign a transaction" action; on a
 * TV / kiosk / guest screen it refreshes data in place when the phone saves.
 */

declare global {
  interface Window {
    castApp?: unknown;
  }
}

const isCastScreen = (() => {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
})();

const PAGES = [
  { label: "Dashboard", path: "/" },
  { label: "Spending", path: "/spending" },
  { label: "Budget", path: "/budget" },
  { label: "Transactions", path: "/transactions" },
  { label: "Investments", path: "/investments" },
  { label: "Accounts", path: "/accounts" },
];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

async function findTransaction(qc: QueryClient, id: string): Promise<Transaction | null> {
  for (const [, data] of qc.getQueriesData<TransactionsResponse>({ queryKey: ["transactions"] })) {
    const hit = data?.transactions?.find((t) => t.id === id);
    if (hit) return hit;
  }
  const all = await qc.fetchQuery({
    queryKey: keys.transactions(),
    queryFn: () => api.transactions(),
  });
  return all.transactions.find((t) => t.id === id) ?? null;
}

export function setupCast(qc: QueryClient) {
  if (isCastScreen) {
    window.addEventListener("cast:refresh", (e) => {
      e.preventDefault();
      qc.invalidateQueries();
    });
    return;
  }

  window.castApp = {
    pages: () => PAGES,
    actions: {
      "finance.assign": {
        async load(id: string) {
          const [txn, cats, monthly] = await Promise.all([
            findTransaction(qc, id),
            qc.fetchQuery({ queryKey: keys.categories, queryFn: api.categories }),
            qc.fetchQuery({ queryKey: keys.monthly, queryFn: api.monthly }).catch(() => null),
          ]);
          if (!txn) throw new Error("Transaction not found");
          const colors = monthly ? buildSubcategoryColorMap(monthly) : new Map<number, string>();
          const kind = txn.amount > 0 ? "expense" : "income";
          const current = txn.resolved_subcategory_id;
          return {
            title: txn.merchant_name || txn.name || "Transaction",
            subtitle: [
              money.format(Math.abs(txn.amount)) + (txn.amount < 0 ? " in" : ""),
              txn.date,
              txn.resolved_name ? `Now: ${txn.resolved_name}` : "Unassigned",
            ].join(" · "),
            groups: [
              ...cats.categories
                .filter((c) => c.kind === kind)
                .map((c) => ({
                  label: c.name,
                  options: c.subcategories.map((s) => ({
                    id: String(s.id),
                    label: s.name,
                    color: colors.get(s.id),
                    selected: s.id === current,
                  })),
                })),
              { label: "", options: [{ id: "none", label: "Unassigned", selected: current == null }] },
            ],
          };
        },
        async run(id: string, option: string) {
          await api.assignTransaction(id, option === "none" ? null : Number(option));
          qc.invalidateQueries({ queryKey: ["transactions"] });
          qc.invalidateQueries({ queryKey: keys.repayable });
          qc.invalidateQueries({ queryKey: keys.overview });
          qc.invalidateQueries({ queryKey: keys.monthly });
        },
      },
    },
  };
}
