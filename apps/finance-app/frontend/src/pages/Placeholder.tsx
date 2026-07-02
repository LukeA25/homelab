import { Card } from "@/components/ui/Card";

export function Placeholder({
  title,
  note,
}: {
  title: string;
  note: string;
}) {
  return (
    <Card className="flex min-h-[240px] flex-col items-center justify-center text-center">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-ink-muted">{note}</p>
    </Card>
  );
}

export const CashFlowPage = () => (
  <Placeholder
    title="Cash Flow"
    note="Coming in the next milestone: a Sankey of income into categories, plus income vs. expense bars across the budget year."
  />
);

export const BudgetPage = () => (
  <Placeholder
    title="Budget"
    note="Coming next: a single-month focus view with progress bars per category and an annual grid toggle, replacing the old Overview + Monthly + Projections screens."
  />
);

export const TransactionsPage = () => (
  <Placeholder
    title="Transactions"
    note="The full transactions table with search, categorization, and manual entry will be ported here next."
  />
);

export const AccountsPage = () => (
  <Placeholder
    title="Accounts"
    note="Account groups, balances, and a net-worth trend (once balance history is captured) will live here."
  />
);

export const SettingsPage = () => (
  <Placeholder
    title="Settings"
    note="Categories, subcategories, projections, and mapping rules will move here as part of the redesign."
  />
);
