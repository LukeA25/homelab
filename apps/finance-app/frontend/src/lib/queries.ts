import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, type ManualTransactionInput } from "./api";

export const keys = {
  snapshot: ["snapshot"] as const,
  investments: ["investments"] as const,
  overview: ["overview"] as const,
  monthly: ["monthly"] as const,
  months: ["months"] as const,
  categories: ["categories"] as const,
  settings: ["settings"] as const,
  rules: ["rules"] as const,
  repayable: ["repayable"] as const,
  transactions: (month?: string) => ["transactions", month ?? "all"] as const,
};

export function useSnapshot() {
  return useQuery({ queryKey: keys.snapshot, queryFn: api.snapshot });
}

export function useInvestments() {
  return useQuery({ queryKey: keys.investments, queryFn: api.investments });
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

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteAccount(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.snapshot });
      qc.invalidateQueries({ queryKey: keys.investments });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: keys.overview });
      qc.invalidateQueries({ queryKey: keys.monthly });
    },
  });
}

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: api.getSettings });
}

export function usePutSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.putSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.settings });
      qc.invalidateQueries({ queryKey: keys.months });
      qc.invalidateQueries({ queryKey: keys.overview });
      qc.invalidateQueries({ queryKey: keys.monthly });
      qc.invalidateQueries({ queryKey: keys.categories });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function useRules() {
  return useQuery({ queryKey: keys.rules, queryFn: api.rules });
}

export function useRuleMutations() {
  const qc = useQueryClient();
  const onSuccess = () => {
    qc.invalidateQueries({ queryKey: keys.rules });
    invalidateTransactionViews(qc);
  };
  return {
    createRule: useMutation({ mutationFn: api.createRule, onSuccess }),
    deleteRule: useMutation({
      mutationFn: (id: number) => api.deleteRule(id),
      onSuccess,
    }),
  };
}

function invalidateTransactionViews(
  qc: ReturnType<typeof useQueryClient>,
) {
  qc.invalidateQueries({ queryKey: ["transactions"] });
  qc.invalidateQueries({ queryKey: keys.repayable });
  qc.invalidateQueries({ queryKey: keys.overview });
  qc.invalidateQueries({ queryKey: keys.monthly });
}

export function useAssignTransaction(_month?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      subcategoryId,
    }: {
      id: string;
      subcategoryId: number | null;
    }) => api.assignTransaction(id, subcategoryId),
    onSuccess: () => invalidateTransactionViews(qc),
  });
}

/** Expenses that still have something left to repay. */
export function useRepayable() {
  return useQuery({ queryKey: keys.repayable, queryFn: api.repayable });
}

export function useSetRepayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      allocations,
    }: {
      id: string;
      allocations: { expense_id: string; amount: number }[];
    }) => api.setRepayment(id, allocations),
    onSuccess: () => invalidateTransactionViews(qc),
  });
}

export function useCreateManualTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ManualTransactionInput) =>
      api.createManualTransaction(body),
    onSuccess: () => invalidateTransactionViews(qc),
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTransaction(id),
    onSuccess: () => invalidateTransactionViews(qc),
  });
}

function invalidateBudgetViews(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: keys.categories });
  qc.invalidateQueries({ queryKey: keys.overview });
  qc.invalidateQueries({ queryKey: keys.monthly });
}

export function usePutProjections() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.putProjections,
    onSuccess: () => invalidateBudgetViews(qc),
  });
}

export function useCategoryMutations() {
  const qc = useQueryClient();
  const onSuccess = () => invalidateBudgetViews(qc);
  return {
    createCategory: useMutation({ mutationFn: api.createCategory, onSuccess }),
    updateCategory: useMutation({
      mutationFn: ({
        id,
        ...body
      }: { id: number; name?: string; kind?: "income" | "expense" }) =>
        api.updateCategory(id, body),
      onSuccess,
    }),
    deleteCategory: useMutation({
      mutationFn: (id: number) => api.deleteCategory(id),
      onSuccess,
    }),
    createSubcategory: useMutation({
      mutationFn: api.createSubcategory,
      onSuccess,
    }),
    updateSubcategory: useMutation({
      mutationFn: ({ id, ...body }: { id: number; name?: string }) =>
        api.updateSubcategory(id, body),
      onSuccess,
    }),
    deleteSubcategory: useMutation({
      mutationFn: (id: number) => api.deleteSubcategory(id),
      onSuccess,
    }),
  };
}
