// Shapes mirror the FastAPI JSON responses in app/main.py and app/budget.py.

export interface AccountSnapshot {
  id: string;
  name: string | null;
  official_name: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  current_balance: number | null;
  available_balance: number | null;
}

export function isInvestmentAccount(a: AccountSnapshot): boolean {
  return (a.type || "").toLowerCase() === "investment";
}

export interface InvestmentAccount {
  id: string;
  name: string | null;
  official_name: string | null;
  mask: string | null;
  subtype: string | null;
  current_balance: number | null;
  available_balance: number | null;
}

export interface HoldingRow {
  id: number | null;
  account_id: string;
  account_name: string | null;
  account_mask: string | null;
  security_id: string;
  ticker: string | null;
  name: string;
  security_type: string | null;
  quantity: number;
  price: number | null;
  value: number;
  cost_basis: number | null;
  gain: number | null;
}

export interface AllocationRow {
  ticker: string | null;
  name: string;
  value: number;
  cost_basis: number;
  has_cost: boolean;
  gain: number | null;
  weight: number;
}

export interface InvestmentActivity {
  id: string;
  date: string;
  name: string | null;
  amount: number;
  quantity: number | null;
  price: number | null;
  type: string | null;
  subtype: string | null;
  ticker: string | null;
  security_name: string | null;
  account_name: string | null;
}

export interface InvestmentsResponse {
  connected: boolean;
  total_value: number;
  total_cost_basis: number | null;
  total_gain: number | null;
  accounts: InvestmentAccount[];
  holdings: HoldingRow[];
  allocation: AllocationRow[];
  activity: InvestmentActivity[];
}

export interface Snapshot {
  connected: boolean;
  last_refreshed: string | null;
  accounts: AccountSnapshot[];
}

/** How much of an expense has been paid back. */
export type RepaymentStatus = "none" | "partial" | "full";

export interface RepaymentAllocation {
  expense_id: string;
  amount: number;
  expense_name: string | null;
  expense_date: string | null;
  expense_amount: number | null;
}

export interface Transaction {
  id: string;
  date: string;
  name: string | null;
  merchant_name: string | null;
  amount: number; // positive = spending, negative = income
  effective_amount: number; // signed amount after allocations
  pfc_primary: string | null;
  pfc_detailed: string | null;
  pending: boolean;
  source: string;
  resolved_subcategory_id: number | null;
  resolved_name: string | null;
  resolved_category_name: string | null;
  is_override: boolean;
  // Set when this money-in transaction has one or more allocations.
  is_repayment: boolean;
  allocations: RepaymentAllocation[];
  allocated_amount: number;
  unallocated_amount: number;
  // Set on the expense being paid back.
  repaid_amount: number;
  repayment_status: RepaymentStatus;
}

export interface TransactionsResponse {
  transactions: Transaction[];
}

/** An expense that still has something left to repay. */
export interface RepayableTransaction {
  id: string;
  date: string;
  name: string | null;
  merchant_name: string | null;
  amount: number;
  repaid_amount: number;
  remaining_amount: number;
  resolved_name: string | null;
  resolved_category_name: string | null;
}

export interface RepayableResponse {
  transactions: RepayableTransaction[];
}

export interface OverviewRow {
  id: number;
  name: string;
  projected: number;
  actual: number;
  difference: number;
}

export interface OverviewCategory extends OverviewRow {
  kind: string;
  subcategories: OverviewRow[];
}

export interface OverviewSection {
  categories: OverviewCategory[];
  projected: number;
  actual: number;
  difference: number;
}

export interface Overview {
  months: string[];
  income: OverviewSection;
  expense: OverviewSection;
  net: { projected: number; actual: number; difference: number };
  unassigned: { income_actual: number; expense_actual: number; count: number };
}

export interface MonthlySubcategory {
  id: number;
  name: string;
  actual: number[];
  projected: number[];
  total_actual: number;
  total_projected: number;
}

export interface MonthlyCategory {
  id: number;
  name: string;
  subcategories: MonthlySubcategory[];
}

export interface Monthly {
  months: string[];
  month_labels: string[];
  income: MonthlyCategory[];
  expense: MonthlyCategory[];
}

export interface MonthsResponse {
  months: string[];
  labels: string[];
}

export interface Subcategory {
  id: number;
  name: string;
  sort_order: number;
  projections: Record<string, number>;
  annual: number;
}

export interface Category {
  id: number;
  name: string;
  kind: "income" | "expense";
  sort_order: number;
  subcategories: Subcategory[];
}

export interface CategoriesResponse {
  months: string[];
  labels: string[];
  categories: Category[];
}

export interface Settings {
  budget_year_start_month: number;
}

export interface MappingRule {
  id: number;
  match_type: "pfc_primary" | "pfc_detailed" | "name_contains";
  match_value: string;
  subcategory_id: number;
  subcategory_name: string | null;
  category_name: string | null;
  priority: number;
}

export interface RulesResponse {
  rules: MappingRule[];
}
