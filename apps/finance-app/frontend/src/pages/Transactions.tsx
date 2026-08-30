import { useMemo, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import {
  useMonths,
  useMonthly,
  useRepayable,
  useSetRepayment,
  useTransactions,
  useAssignTransaction,
  useCreateManualTransaction,
  useDeleteTransaction,
} from "@/lib/queries";
import { buildSubcategoryColorMap } from "@/lib/budgetStatus";
import {
  rankRepayCandidate,
  remainingHint,
  repaidLabel,
  repayableTitle,
  repaymentLabel,
  repaymentSubtitle,
} from "@/lib/repayments";
import type { RepayableTransaction, Transaction } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { Modal } from "@/components/ui/Modal";
import { Input, Select, Label } from "@/components/ui/Field";
import { SubcategorySelect } from "@/components/SubcategorySelect";
import { SubcategoryPillPicker } from "@/components/SubcategoryPillPicker";
import { SubcategoryPill } from "@/components/SubcategoryPill";
import { useToast } from "@/components/ui/Toast";
import { cn, money } from "@/lib/utils";

function canDeleteTransaction(txn: Transaction): boolean {
  return txn.source === "manual" || txn.pending;
}

function prettyPfc(pfc: string | null): string {
  if (!pfc) return "\u2014";
  return pfc.replace(/_/g, " ").toLowerCase();
}

function AmountText({
  txn,
  size = "md",
}: {
  txn: Transaction;
  size?: "md" | "lg";
}) {
  const base = cn(
    "tnum shrink-0 font-semibold",
    size === "lg" ? "text-base" : "text-sm",
  );

  // A fully allocated repayment is an offset; a leftover still looks like income.
  if (txn.is_repayment) {
    const leftover = txn.unallocated_amount > 0.005;
    return (
      <span
        className={cn(
          base,
          "flex shrink-0 flex-col items-end leading-tight",
          leftover ? "text-gain" : "text-ink-muted",
        )}
      >
        <span>+{money(Math.abs(txn.amount))}</span>
        {leftover ? (
          <span className="text-xs font-normal text-ink-faint">
            {money(txn.unallocated_amount)} left as income
          </span>
        ) : null}
      </span>
    );
  }

  // A repaid expense shows what it ended up costing, with the original struck.
  if (txn.amount > 0 && txn.repaid_amount > 0) {
    return (
      <span className={cn(base, "flex shrink-0 flex-col items-end leading-tight")}>
        <span className="text-xs font-normal text-ink-faint line-through">
          {money(txn.amount)}
        </span>
        <span className={txn.effective_amount > 0 ? "text-loss" : "text-ink-muted"}>
          -{money(txn.effective_amount)}
        </span>
      </span>
    );
  }

  const spending = txn.amount > 0;
  return (
    <span className={cn(base, spending ? "text-loss" : "text-gain")}>
      {spending ? `-${money(txn.amount)}` : `+${money(Math.abs(txn.amount))}`}
    </span>
  );
}

function dateGroupLabel(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${dateStr}T12:00:00`);
  d.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
}

function groupByDate(txns: Transaction[]) {
  const sorted = [...txns].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const map = new Map<string, Transaction[]>();
  for (const t of sorted) {
    const d = t.date || "Unknown";
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(t);
  }
  return [...map.entries()].map(([date, items]) => ({
    date,
    label: dateGroupLabel(date),
    items,
  }));
}

function RepaymentPicker({
  txn,
  onClose,
}: {
  txn: Transaction;
  onClose: () => void;
}) {
  const { data, isLoading } = useRepayable();
  const setRepayment = useSetRepayment();
  const { show: toast } = useToast();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const a of txn.allocations ?? []) {
      init[a.expense_id] = String(a.amount);
    }
    return init;
  });

  const total = Math.abs(txn.amount);
  const allocated = useMemo(
    () =>
      Object.values(draft).reduce((sum, v) => {
        const n = parseFloat(v);
        return sum + (Number.isFinite(n) && n > 0 ? n : 0);
      }, 0),
    [draft],
  );
  const left = Math.round((total - allocated) * 100) / 100;

  // Include expenses already allocated to this repayment even if fully covered,
  // so the user can edit or clear them.
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromApi = data?.transactions ?? [];
    const byId = new Map(fromApi.map((c) => [c.id, c]));
    for (const a of txn.allocations ?? []) {
      if (byId.has(a.expense_id)) continue;
      byId.set(a.expense_id, {
        id: a.expense_id,
        date: a.expense_date || "",
        name: a.expense_name,
        merchant_name: a.expense_name,
        amount: a.expense_amount ?? 0,
        repaid_amount: Math.max(0, (a.expense_amount ?? 0) - a.amount),
        remaining_amount: a.amount,
        resolved_name: null,
        resolved_category_name: null,
      });
    }
    let list = [...byId.values()];
    if (q) {
      list = list.filter((c) =>
        `${c.merchant_name ?? ""} ${c.name ?? ""} ${c.resolved_name ?? ""} ${
          c.resolved_category_name ?? ""
        }`
          .toLowerCase()
          .includes(q),
      );
    }
    return list.sort(
      (a, b) =>
        rankRepayCandidate(a, Math.max(left, 0)) -
        rankRepayCandidate(b, Math.max(left, 0)),
    );
  }, [data, search, left, txn.allocations]);

  const setAmount = (expenseId: string, value: string) => {
    setDraft((prev) => {
      const next = { ...prev };
      if (!value) delete next[expenseId];
      else next[expenseId] = value;
      return next;
    });
  };

  const addDefault = (c: RepayableTransaction) => {
    if (draft[c.id]) return;
    const room = Math.max(left, 0);
    if (room <= 0.005) {
      toast("Nothing left to allocate", "error");
      return;
    }
    const fill = Math.min(c.remaining_amount, room);
    setAmount(c.id, fill.toFixed(2));
  };

  const save = (allocations: { expense_id: string; amount: number }[]) => {
    setRepayment.mutate(
      { id: txn.id, allocations },
      {
        onSuccess: () => {
          toast(
            allocations.length
              ? "Repayment allocations saved"
              : "No longer a repayment",
          );
          onClose();
        },
        onError: (e: Error) => toast(e.message, "error"),
      },
    );
  };

  const submit = () => {
    const allocations = Object.entries(draft)
      .map(([expense_id, raw]) => ({
        expense_id,
        amount: Math.round((parseFloat(raw) || 0) * 100) / 100,
      }))
      .filter((a) => a.amount > 0);
    if (allocated > total + 0.005) {
      toast(
        `Allocations total ${money(allocated)} but only ${money(total)} came in`,
        "error",
      );
      return;
    }
    save(allocations);
  };

  return (
    <Modal
      title="Allocate this repayment"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {txn.is_repayment ? (
            <Button
              variant="subtle"
              onClick={() => save([])}
              disabled={setRepayment.isPending}
            >
              Not a repayment
            </Button>
          ) : null}
          <Button onClick={submit} disabled={setRepayment.isPending}>
            {setRepayment.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">
          {money(total)} came in on {txn.date}. Split it across one or more
          expenses — leftovers still count as income.
        </p>

        <div
          className={cn(
            "flex items-center justify-between rounded-lg px-3 py-2 text-sm",
            left < -0.005
              ? "bg-loss/10 text-loss"
              : left <= 0.005
                ? "bg-gain/10 text-gain"
                : "bg-accent-soft/50 text-ink",
          )}
        >
          <span className="font-medium">Left to allocate</span>
          <span className="tnum font-semibold">{money(left)}</span>
        </div>

        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search expenses…"
        />

        {isLoading ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>
        ) : candidates.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            No expenses left to repay.
          </p>
        ) : (
          <ul className="max-h-72 divide-y divide-hairline overflow-y-auto rounded-lg border border-hairline">
            {candidates.map((c) => {
              const value = draft[c.id] ?? "";
              const selected = Boolean(value);
              return (
                <li
                  key={c.id}
                  className={cn(
                    "flex items-start gap-3 px-3 py-2.5",
                    selected && "bg-accent-soft/30",
                  )}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() =>
                      selected ? setAmount(c.id, "") : addDefault(c)
                    }
                  >
                    <span className="block truncate text-sm font-medium">
                      {repayableTitle(c)}
                    </span>
                    <span className="text-xs text-ink-faint">
                      {c.date}
                      {c.resolved_name ? ` · ${c.resolved_name}` : ""}
                      {` · ${remainingHint(c)}`}
                    </span>
                  </button>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className="h-8 w-24 shrink-0 text-right"
                    placeholder="0.00"
                    value={value}
                    onChange={(e) => setAmount(c.id, e.target.value)}
                    onFocus={() => {
                      if (!value) addDefault(c);
                    }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-hairline py-3 last:border-0 sm:grid-cols-3 sm:gap-3 sm:py-2">
      <dt className="text-sm font-medium text-ink-muted sm:font-normal">{label}</dt>
      <dd className="text-sm text-ink sm:col-span-2">{children}</dd>
    </div>
  );
}

function TransactionDetail({
  txn,
  subColor,
  onClose,
  onDelete,
}: {
  txn: Transaction;
  subColor?: string;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const deletable = canDeleteTransaction(txn);
  return (
    <Modal
      title="Transaction details"
      onClose={onClose}
      footer={
        <>
          {deletable && onDelete ? (
            <Button
              variant="ghost"
              className="text-loss hover:bg-loss/10 sm:mr-auto"
              onClick={onDelete}
            >
              Delete
            </Button>
          ) : null}
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <dl>
        <DetailRow label="Date">{txn.date}</DetailRow>
        <DetailRow label="Name">{txn.name || "\u2014"}</DetailRow>
        <DetailRow label="Merchant">{txn.merchant_name || "\u2014"}</DetailRow>
        <DetailRow label="Amount">
          <AmountText txn={txn} />{" "}
          <span className="text-ink-muted">
            (
            {txn.is_repayment
              ? "repayment"
              : txn.amount > 0
                ? "spending"
                : "income"}
            )
          </span>
        </DetailRow>
        {txn.is_repayment ? (
          <DetailRow label="Repays">
            <ul className="space-y-1">
              {(txn.allocations ?? []).map((a) => (
                <li key={a.expense_id}>
                  <span className="font-medium">
                    {a.expense_name || "\u2014"}
                  </span>{" "}
                  <span className="text-ink-muted">
                    ({a.expense_date} · {money(a.amount)} of{" "}
                    {money(a.expense_amount ?? 0)})
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-1">
              <Pill tone="accent">{repaymentLabel(txn)}</Pill>
              {txn.unallocated_amount > 0.005 ? (
                <span className="ml-2 text-ink-muted">
                  {money(txn.unallocated_amount)} left as income
                </span>
              ) : null}
            </div>
          </DetailRow>
        ) : null}
        {txn.repayment_status !== "none" ? (
          <DetailRow label="Repaid">
            {money(txn.repaid_amount)} of {money(txn.amount)} paid back, so this
            counts as {money(txn.effective_amount)}
          </DetailRow>
        ) : null}
        <DetailRow label="Plaid category (primary)">
          <code className="rounded bg-black/[0.05] px-1.5 py-0.5 text-xs">
            {txn.pfc_primary || "\u2014"}
          </code>
          {txn.pfc_primary ? (
            <span className="ml-2 capitalize text-ink-muted">
              {prettyPfc(txn.pfc_primary)}
            </span>
          ) : null}
        </DetailRow>
        <DetailRow label="Plaid category (detailed)">
          <code className="rounded bg-black/[0.05] px-1.5 py-0.5 text-xs">
            {txn.pfc_detailed || "\u2014"}
          </code>
        </DetailRow>
        <DetailRow label="Budget category">
          {txn.resolved_subcategory_id != null && txn.resolved_name ? (
            <SubcategoryPill name={txn.resolved_name} color={subColor} />
          ) : (
            "Unassigned"
          )}
          {txn.resolved_category_name ? (
            <span className="ml-2 text-ink-muted">({txn.resolved_category_name})</span>
          ) : null}
          {txn.is_override ? (
            <span className="ml-1 text-ink-faint">· manually set</span>
          ) : null}
        </DetailRow>
        <DetailRow label="Status">{txn.pending ? "Pending" : "Posted"}</DetailRow>
        <DetailRow label="Source">
          {txn.source === "manual" ? "Manual entry" : "Plaid"}
        </DetailRow>
        <DetailRow label="Transaction ID">
          <code className="break-all rounded bg-black/[0.05] px-1.5 py-0.5 text-xs">
            {txn.id}
          </code>
        </DetailRow>
      </dl>
    </Modal>
  );
}

function TransactionRow({
  txn,
  color,
  onOpen,
  onAssign,
  onRepayment,
  onDelete,
}: {
  txn: Transaction;
  color?: string;
  onOpen: () => void;
  onAssign: (subId: number | null) => void;
  onRepayment: () => void;
  onDelete: () => void;
}) {
  const title = txn.merchant_name || txn.name || "Transaction";
  const stripe = color ?? "#ECEBE7";
  const deletable = canDeleteTransaction(txn);

  return (
    <div
      className="group flex cursor-pointer items-stretch border-b border-hairline last:border-0 hover:bg-black/[0.02]"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div
        className="w-1 shrink-0"
        style={{ backgroundColor: stripe }}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 items-start justify-between gap-4 px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="font-medium text-ink">{title}</span>
            <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <SubcategoryPillPicker
                subcategoryId={txn.resolved_subcategory_id}
                subcategoryName={txn.resolved_name}
                color={color}
                onChange={onAssign}
                kind={txn.amount > 0 ? "expense" : "income"}
                isRepayment={txn.is_repayment}
                onRepayment={txn.amount < 0 ? onRepayment : undefined}
              />
            </span>
            {txn.repayment_status !== "none" ? (
              <Pill tone="gain">{repaidLabel(txn)}</Pill>
            ) : null}
            {txn.pending ? <Pill tone="accent">Pending</Pill> : null}
            {txn.source === "manual" ? <Pill tone="neutral">Manual</Pill> : null}
          </div>
          {txn.is_repayment ? (
            <p className="mt-0.5 text-xs text-ink-faint">
              {repaymentLabel(txn)} · {repaymentSubtitle(txn)}
              {txn.unallocated_amount > 0.005
                ? ` · ${money(txn.unallocated_amount)} left as income`
                : ""}
            </p>
          ) : txn.resolved_category_name ? (
            <p className="mt-0.5 text-xs text-ink-faint">{txn.resolved_category_name}</p>
          ) : null}
        </div>
        <AmountText txn={txn} size="lg" />
      </div>
      {deletable ? (
        <button
          type="button"
          aria-label="Delete transaction"
          className="flex shrink-0 items-center px-3 text-ink-faint hover:text-loss"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

type ManualKind = "spending" | "income" | "repayment";

function ManualAdd({ onClose }: { onClose: () => void }) {
  const create = useCreateManualTransaction();
  const { data: repayable } = useRepayable();
  const { show: toast } = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ManualKind>("spending");
  const [amount, setAmount] = useState("");
  const [subId, setSubId] = useState<number | null>(null);
  const [repayFor, setRepayFor] = useState("");

  const isRepayment = kind === "repayment";

  const submit = () => {
    const amt = Math.abs(parseFloat(amount) || 0);
    if (!name || amt === 0) {
      toast("Enter a description and a non-zero amount", "error");
      return;
    }
    if (isRepayment && !repayFor) {
      toast("Choose the expense this pays back", "error");
      return;
    }
    create.mutate(
      {
        date,
        name,
        amount: kind === "spending" ? amt : -amt,
        subcategory_id: isRepayment ? null : subId,
        allocations:
          isRepayment && repayFor
            ? [{ expense_id: repayFor, amount: amt }]
            : null,
      },
      {
        onSuccess: () => {
          toast(isRepayment ? "Repayment added" : "Manual transaction added");
          onClose();
        },
        onError: (e: Error) => toast(e.message, "error"),
      },
    );
  };

  return (
    <Modal
      title="Add manual transaction"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Saving\u2026" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <Label>Date</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <Label>Description</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Farmers market"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Type</Label>
            <Select
              value={kind}
              onChange={(e) => setKind(e.target.value as ManualKind)}
            >
              <option value="spending">Spending</option>
              <option value="income">Income</option>
              <option value="repayment">Repayment</option>
            </Select>
          </div>
          <div>
            <Label>Amount</Label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
        {isRepayment ? (
          <div>
            <Label>Pays back</Label>
            <Select
              value={repayFor}
              onChange={(e) => setRepayFor(e.target.value)}
            >
              <option value="">— Choose an expense —</option>
              {(repayable?.transactions ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.date} · {repayableTitle(c)} · {remainingHint(c)}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-ink-faint">
              That expense drops by this amount instead of this counting as
              income.
            </p>
          </div>
        ) : (
          <div>
            <Label>Budget category</Label>
            <SubcategorySelect
              value={subId}
              onChange={setSubId}
              kind={kind === "income" ? "income" : "expense"}
              placeholder="— Unassigned —"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

export function Transactions() {
  const [month, setMonth] = useState("all");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<Transaction | null>(null);
  const [repaying, setRepaying] = useState<Transaction | null>(null);
  const [showManual, setShowManual] = useState(false);

  const { data: monthsData } = useMonths();
  const { data: monthly } = useMonthly();
  const { data: txResp, isLoading } = useTransactions(month);
  const assign = useAssignTransaction();
  const del = useDeleteTransaction();
  const { show: toast } = useToast();

  const colorMap = useMemo(
    () => (monthly ? buildSubcategoryColorMap(monthly) : new Map<number, string>()),
    [monthly],
  );

  const monthOptions = useMemo(() => {
    const ms = monthsData?.months ?? [];
    const labels = monthsData?.labels ?? [];
    return ms.map((m, i) => ({ value: m, label: labels[i] ?? m }));
  }, [monthsData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = txResp?.transactions ?? [];
    if (!q) return list;
    return list.filter((t) => {
      const hay = `${t.merchant_name ?? ""} ${t.name ?? ""} ${
        t.resolved_name ?? ""
      } ${t.resolved_category_name ?? ""} ${t.pfc_primary ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [txResp, search]);

  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          className="w-full sm:w-44"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        >
          <option value="all">All months</option>
          {monthOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Input
          className="max-w-xs flex-1"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search transactions…"
        />
        <div className="ml-auto">
          <Button variant="ghost" onClick={() => setShowManual(true)}>
            Add manual
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <p className="px-4 py-10 text-center text-sm text-ink-muted">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-muted">
            No transactions. Connect a bank and refresh, or add one manually.
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.date}>
              <h3 className="border-b border-hairline bg-canvas/80 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-faint backdrop-blur">
                {group.label}
              </h3>
              {group.items.map((t) => (
                <TransactionRow
                  key={t.id}
                  txn={t}
                  color={
                    t.resolved_subcategory_id != null
                      ? colorMap.get(t.resolved_subcategory_id)
                      : undefined
                  }
                  onOpen={() => setDetail(t)}
                  onRepayment={() => setRepaying(t)}
                  onAssign={(subId) =>
                    assign.mutate(
                      { id: t.id, subcategoryId: subId },
                      {
                        onSuccess: () => toast("Category updated"),
                        onError: (e: Error) => toast(e.message, "error"),
                      },
                    )
                  }
                  onDelete={() =>
                    del.mutate(t.id, {
                      onSuccess: () => {
                        toast("Transaction deleted");
                        setDetail((open) => (open?.id === t.id ? null : open));
                      },
                      onError: (e: Error) => toast(e.message, "error"),
                    })
                  }
                />
              ))}
            </section>
          ))
        )}
      </Card>

      {detail ? (
        <TransactionDetail
          txn={detail}
          subColor={
            detail.resolved_subcategory_id != null
              ? colorMap.get(detail.resolved_subcategory_id)
              : undefined
          }
          onClose={() => setDetail(null)}
          onDelete={
            canDeleteTransaction(detail)
              ? () =>
                  del.mutate(detail.id, {
                    onSuccess: () => {
                      toast("Transaction deleted");
                      setDetail(null);
                    },
                    onError: (e: Error) => toast(e.message, "error"),
                  })
              : undefined
          }
        />
      ) : null}
      {repaying ? (
        <RepaymentPicker txn={repaying} onClose={() => setRepaying(null)} />
      ) : null}
      {showManual ? <ManualAdd onClose={() => setShowManual(false)} /> : null}
    </div>
  );
}
