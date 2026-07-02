import type {
  CategoriesResponse,
  Monthly,
  MonthsResponse,
  Overview,
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

export const api = {
  snapshot: () => request<Snapshot>("/data"),
  overview: () => request<Overview>("/budget?view=overview"),
  monthly: () => request<Monthly>("/budget?view=monthly"),
  months: () => request<MonthsResponse>("/months"),
  categories: () => request<CategoriesResponse>("/categories"),
  transactions: (month?: string) =>
    request<TransactionsResponse>(
      month && month !== "all" ? `/transactions?month=${month}` : "/transactions",
    ),

  refresh: () => post<Snapshot>("/refresh"),
  createLinkToken: () => post<{ link_token: string }>("/create_link_token"),
  exchangePublicToken: (publicToken: string) =>
    post<{ item_id: string }>("/exchange_public_token", {
      public_token: publicToken,
    }),

  assignTransaction: (id: string, subcategoryId: number | null) =>
    put<{ ok: boolean }>(`/transactions/${encodeURIComponent(id)}/assign`, {
      subcategory_id: subcategoryId,
    }),
};
