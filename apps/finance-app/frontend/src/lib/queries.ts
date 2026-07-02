import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "./api";

export const keys = {
  snapshot: ["snapshot"] as const,
  overview: ["overview"] as const,
  monthly: ["monthly"] as const,
  months: ["months"] as const,
  categories: ["categories"] as const,
  transactions: (month?: string) => ["transactions", month ?? "all"] as const,
};

export function useSnapshot() {
  return useQuery({ queryKey: keys.snapshot, queryFn: api.snapshot });
}

export function useOverview() {
  return useQuery({ queryKey: keys.overview, queryFn: api.overview });
}

export function useMonthly() {
  return useQuery({ queryKey: keys.monthly, queryFn: api.monthly });
}

export function useMonths() {
  return useQuery({ queryKey: keys.months, queryFn: api.months });
}

export function useCategories() {
  return useQuery({ queryKey: keys.categories, queryFn: api.categories });
}

export function useTransactions(month?: string) {
  return useQuery({
    queryKey: keys.transactions(month),
    queryFn: () => api.transactions(month),
  });
}

export function useRefresh() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.refresh,
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });
}

export function useConnectBank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (publicToken: string) => {
      await api.exchangePublicToken(publicToken);
      return api.refresh();
    },
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });
}

export function useAssignTransaction(month?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      subcategoryId,
    }: {
      id: string;
      subcategoryId: number | null;
    }) => api.assignTransaction(id, subcategoryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.transactions(month) });
      qc.invalidateQueries({ queryKey: keys.overview });
      qc.invalidateQueries({ queryKey: keys.monthly });
    },
  });
}
