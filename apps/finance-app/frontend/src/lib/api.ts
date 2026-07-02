import type {
  CategoriesResponse,
  InvestmentsResponse,
  Monthly,
  MonthsResponse,
  Overview,
  RulesResponse,
  Settings,
  Snapshot,
  TransactionsResponse,
} from "./types";

const BASE = "/api";

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) message = body.detail;
    } catch {
      // no JSON body; keep the status text
    }
    throw new Error(message);
  }
  return res.status === 204 ? (null as T) : ((await res.json()) as T);
}

function jsonBody(method: string) {
  return <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
}

const post = jsonBody("POST");
const put = jsonBody("PUT");
const patch = jsonBody("PATCH");

export interface ManualTransactionInput {
  date: string;
  name: string;
  amount: number; // positive = spending, negative = income (Plaid convention)
  merchant_name?: string | null;
  subcategory_id?: number | null;
}

export interface ProjectionItem {
  subcategory_id: number;
  month: string;
  amount: number;
}

export const api = {
  snapshot: () => request<Snapshot>("/data"),
  investments: () => request<InvestmentsResponse>("/investments"),
  overview: () => request<Overview>("/budget?view=overview"),
  monthly: () => request<Monthly>("/budget?view=monthly"),
  months: () => request<MonthsResponse>("/months"),
  categories: () => request<CategoriesResponse>("/categories"),
  transactions: (month?: string) =>
    request<TransactionsResponse>(
      month && month !== "all" ? `/transactions?month=${month}` : "/transactions",
    ),

  refresh: () => post<Snapshot>("/refresh"),
  createLinkToken: (mode: "all" | "bank" | "investments" = "all") =>
    post<{ link_token: string }>(`/create_link_token?mode=${mode}`),
  exchangePublicToken: (publicToken: string) =>
    post<{ item_id: string }>("/exchange_public_token", {
      public_token: publicToken,
    }),

  assignTransaction: (id: string, subcategoryId: number | null) =>
    put<{ ok: boolean }>(`/transactions/${encodeURIComponent(id)}/assign`, {
      subcategory_id: subcategoryId,
    }),

  createManualTransaction: (body: ManualTransactionInput) =>
    post<{ id: string }>("/transactions", body),

  deleteTransaction: (id: string) =>
    request<{ ok: boolean }>(`/transactions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  putProjections: (projections: ProjectionItem[]) =>
    put<{ ok: boolean; count: number }>("/projections", { projections }),

  createCategory: (body: { name: string; kind: "income" | "expense" }) =>
    post<{ id: number }>("/categories", body),
  updateCategory: (
    id: number,
    body: { name?: string; kind?: "income" | "expense"; sort_order?: number },
  ) => patch<{ ok: boolean }>(`/categories/${id}`, body),
  deleteCategory: (id: number) =>
    request<{ ok: boolean }>(`/categories/${id}`, { method: "DELETE" }),

  createSubcategory: (body: { category_id: number; name: string }) =>
    post<{ id: number }>("/subcategories", body),
  updateSubcategory: (
    id: number,
    body: { name?: string; category_id?: number; sort_order?: number },
  ) => patch<{ ok: boolean }>(`/subcategories/${id}`, body),
  deleteSubcategory: (id: number) =>
    request<{ ok: boolean }>(`/subcategories/${id}`, { method: "DELETE" }),

  deleteAccount: (id: string) =>
    request<{ ok: boolean }>(`/accounts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  getSettings: () => request<Settings>("/settings"),
  putSettings: (body: { budget_year_start_month: number }) =>
    put<Settings>("/settings", body),

  rules: () => request<RulesResponse>("/rules"),
  createRule: (body: {
    match_type: string;
    match_value: string;
    subcategory_id: number;
    priority?: number;
  }) => post<{ id: number }>("/rules", body),
  updateRule: (
    id: number,
    body: {
      match_type?: string;
      match_value?: string;
      subcategory_id?: number;
      priority?: number;
    },
  ) => patch<{ ok: boolean }>(`/rules/${id}`, body),
  deleteRule: (id: number) =>
    request<{ ok: boolean }>(`/rules/${id}`, { method: "DELETE" }),
};
