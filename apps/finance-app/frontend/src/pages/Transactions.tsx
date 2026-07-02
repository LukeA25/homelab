import { useMemo, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import {
  useMonths,
  useMonthly,
  useTransactions,
  useAssignTransaction,
  useCreateManualTransaction,
  useDeleteTransaction,
} from "@/lib/queries";
import { buildSubcategoryColorMap } from "@/lib/budgetStatus";
import type { Transaction } from "@/lib/types";
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

function prettyPfc(pfc: string | null): string {
  if (!pfc) return "\u2014";
  return pfc.replace(/_/g, " ").toLowerCase();
}

function AmountText({
  amount,
  size = "md",
}: {
  amount: number;
  size?: "md" | "lg";
}) {
  const spending = amount > 0;
  return (
    <span
      className={cn(
        "tnum shrink-0 font-semibold",
        size === "lg" ? "text-base" : "text-sm",
        spending ? "text-loss" : "text-gain",
      )}
    >
      {spending ? `-${money(amount)}` : `+${money(Math.abs(amount))}`}
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
}: {
  txn: Transaction;
  subColor?: string;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Transaction details"
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <dl>
        <DetailRow label="Date">{txn.date}</DetailRow>
        <DetailRow label="Name">{txn.name || "\u2014"}</DetailRow>
        <DetailRow label="Merchant">{txn.merchant_name || "\u2014"}</DetailRow>
        <DetailRow label="Amount">
          <AmountText amount={txn.amount} />{" "}
          <span className="text-ink-muted">
            ({txn.amount > 0 ? "spending" : "income"})
          </span>
        </DetailRow>
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
  onDelete,
}: {
  txn: Transaction;
  color?: string;
  onOpen: () => void;
  onAssign: (subId: number | null) => void;
  onDelete: () => void;
}) {
  const title = txn.merchant_name || txn.name || "Transaction";
  const stripe = color ?? "#ECEBE7";

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
              />
            </span>
            {txn.pending ? <Pill tone="accent">Pending</Pill> : null}
            {txn.source === "manual" ? <Pill tone="neutral">Manual</Pill> : null}
          </div>
          {txn.resolved_category_name ? (
            <p className="mt-0.5 text-xs text-ink-faint">{txn.resolved_category_name}</p>
          ) : null}
        </div>
        <AmountText amount={txn.amount} size="lg" />
      </div>
      {txn.source === "manual" ? (
        <button
          type="button"
          aria-label="Delete transaction"
          className="flex shrink-0 items-center px-3 text-ink-faint opacity-0 transition-all hover:text-loss group-hover:opacity-100"
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

function ManualAdd({ onClose }: { onClose: () => void }) {
  const create = useCreateManualTransaction();
  const { show: toast } = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"spending" | "income">("spending");
  const [amount, setAmount] = useState("");
  const [subId, setSubId] = useState<number | null>(null);

  const submit = () => {
    const amt = Math.abs(parseFloat(amount) || 0);
    if (!name || amt === 0) {
      toast("Enter a description and a non-zero amount", "error");
      return;
    }
    create.mutate(
      {
        date,
        name,
        amount: kind === "income" ? -amt : amt,
        subcategory_id: subId,
      },
      {
        onSuccess: () => {
          toast("Manual transaction added");
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
              onChange={(e) => setKind(e.target.value as "spending" | "income")}
            >
              <option value="spending">Spending</option>
              <option value="income">Income</option>
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
        <div>
          <Label>Budget category</Label>
          <SubcategorySelect
            value={subId}
            onChange={setSubId}
            placeholder="— Unassigned —"
          />
        </div>
      </div>
    </Modal>
  );
}

export function Transactions() {
  const [month, setMonth] = useState("all");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<Transaction | null>(null);
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
                      onSuccess: () => toast("Transaction deleted"),
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
        />
      ) : null}
      {showManual ? <ManualAdd onClose={() => setShowManual(false)} /> : null}
    </div>
  );
}
