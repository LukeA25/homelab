import type { RepayableTransaction, Transaction } from "./types";
import { money } from "./utils";

/** What a transaction actually cost for spending charts.
 *
 * Fully allocated repayments contribute nothing. A leftover still counts as
 * income (negative amount), so it never shows up as spending either. */
export function spendAmount(t: Transaction): number {
  return t.effective_amount > 0 ? t.effective_amount : 0;
}

export function isSpending(t: Transaction): boolean {
  return spendAmount(t) > 0;
}

/** Label for a money-in transaction that has allocations. */
export function repaymentLabel(t: Transaction): string {
  const n = t.allocations?.length ?? 0;
  if (n === 0) return "Repayment";
  if (n === 1) {
    const a = t.allocations[0];
    const full =
      Math.abs(t.amount) >= (a.expense_amount ?? 0) - 0.005 &&
      t.unallocated_amount <= 0.005;
    return full ? "Full repayment" : "Partial repayment";
  }
  return `Repayment · ${n} charges`;
}

/** Short subtitle under a repayment row. */
export function repaymentSubtitle(t: Transaction): string {
  const n = t.allocations?.length ?? 0;
  if (n === 0) return "expense";
  if (n === 1) return t.allocations[0].expense_name || "expense";
  return `${n} charges`;
}

/** "Repaid" / "Partly repaid" for the expense on the receiving end. */
export function repaidLabel(t: Transaction): string {
  return t.repayment_status === "full" ? "Repaid" : "Partly repaid";
}

export function repayableTitle(t: RepayableTransaction): string {
  return t.merchant_name || t.name || "Transaction";
}

export function remainingHint(t: RepayableTransaction): string {
  if (t.repaid_amount <= 0) return money(t.amount);
  return `${money(t.remaining_amount)} left of ${money(t.amount)}`;
}

/** Prefer expenses whose remaining matches the amount still to allocate. */
export function rankRepayCandidate(
  candidate: RepayableTransaction,
  leftToAllocate: number,
): number {
  if (leftToAllocate <= 0.005) return 1;
  if (Math.abs(candidate.remaining_amount - leftToAllocate) < 0.005) return 0;
  return 1;
}
