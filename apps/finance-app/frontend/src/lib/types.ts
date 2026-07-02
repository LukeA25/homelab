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

export interface Snapshot {
  connected: boolean;
  last_refreshed: string | null;
  accounts: AccountSnapshot[];
}

export interface Transaction {
  id: string;
  date: string;
  name: string | null;
  merchant_name: string | null;
  amount: number; // positive = spending, negative = income
  pfc_primary: string | null;
  pfc_detailed: string | null;
  pending: boolean;
  source: string;
  resolved_subcategory_id: number | null;
  resolved_name: string | null;
  resolved_category_name: string | null;
  is_override: boolean;
}

export interface TransactionsResponse {
  transactions: Transaction[];
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
