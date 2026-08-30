import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import {
  useCategories,
  useMonthly,
  usePutProjections,
  useCategoryMutations,
} from "@/lib/queries";
import {
  currentMonthKey,
  monthIndex,
  statusLabel,
  statusTone,
} from "@/lib/budgetStatus";
import {
  buildTrackingTree,
  findTrackingNode,
  scopedAmounts,
  trackingRead,
  type TrackingNode,
  type TrackingScope,
} from "@/lib/budgetTracking";
import type { Category } from "@/lib/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatCard } from "@/components/ui/StatCard";
import { Modal } from "@/components/ui/Modal";
import { Input, Select, Label } from "@/components/ui/Field";
import { BudgetTrackChart } from "@/components/charts/BudgetTrackChart";
import { useToast } from "@/components/ui/Toast";
import { cn, money } from "@/lib/utils";

type EditMap = Record<string, number>;

const key = (subId: number, month: string) => `${subId}:${month}`;

function spreadEven(annual: number, months: string[]): Record<string, number> {
  const n = months.length;
  const cents = Math.round(annual * 100);
  const base = Math.floor(cents / n);
  const rem = cents - base * n;
  const out: Record<string, number> = {};
  months.forEach((m, i) => {
    out[m] = (base + (i < rem ? 1 : 0)) / 100;
  });
  return out;
}

function EditableName({
  value,
  onSave,
  className,
}: {
  value: string;
  onSave: (next: string) => void;
  className?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      className={cn(
        "rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-medium hover:border-hairline focus:border-accent focus:outline-none",
        className,
      )}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const trimmed = text.trim();
        if (trimmed && trimmed !== value) onSave(trimmed);
        else setText(value);
      }}
    />
  );
}

function AddCategoryModal({ onClose }: { onClose: () => void }) {
  const { createCategory } = useCategoryMutations();
  const { show: toast } = useToast();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"income" | "expense">("expense");

  const submit = () => {
    if (!name.trim()) {
      toast("Enter a category name", "error");
      return;
    }
    createCategory.mutate(
      { name: name.trim(), kind },
      {
        onSuccess: () => {
          toast("Category added");
          onClose();
        },
        onError: (e: Error) => toast(e.message, "error"),
      },
    );
  };

  return (
    <Modal
      title="Add category"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={createCategory.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Type</Label>
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as "income" | "expense")}
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </Select>
        </div>
      </div>
    </Modal>
  );
}

function TrackingRow({
  node,
  scope,
  monthIdx,
  depth,
  selected,
  expanded,
  onSelect,
  onToggle,
}: {
  node: TrackingNode;
  scope: TrackingScope;
  monthIdx: number;
  depth: number;
  selected: boolean;
  expanded: boolean;
  onSelect: () => void;
  onToggle?: () => void;
}) {
  const amounts = scopedAmounts(node, scope, monthIdx);
  const hasChildren = node.children.length > 0;
  const pct =
    amounts.projected > 0
      ? Math.min(amounts.actual / amounts.projected, 1.5)
      : amounts.actual > 0
        ? 1
        : 0;

  return (
    <div
      className={cn(
        "border-b border-hairline last:border-0",
        selected && "bg-accent-soft/40",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-black/[0.03]"
        style={{ paddingLeft: 12 + depth * 16 }}
      >
        {hasChildren && onToggle ? (
          <span
            role="button"
            tabIndex={0}
            className="shrink-0 text-ink-faint"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onToggle();
              }
            }}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </span>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{node.name}</span>
          {node.categoryName ? (
            <span className="text-xs text-ink-faint">{node.categoryName}</span>
          ) : null}
        </span>
        <span className="hidden w-20 shrink-0 text-right tnum text-sm text-ink-muted sm:block">
          {amounts.projected > 0 ? money(amounts.projected) : "—"}
        </span>
        <span className="w-20 shrink-0 text-right tnum text-sm">
          {money(amounts.actual)}
        </span>
        <span
          className={cn(
            "hidden w-20 shrink-0 text-right tnum text-sm sm:block",
            amounts.variance < 0 ? "text-loss" : "text-gain",
          )}
        >
          {money(amounts.variance)}
        </span>
        <span className="hidden w-24 shrink-0 sm:block">
          <ProgressBar
            value={amounts.actual}
            max={Math.max(amounts.projected, amounts.actual, 1)}
            color={amounts.variance < 0 ? "#D64545" : undefined}
          />
          <span className="mt-0.5 block text-right text-[10px] text-ink-faint">
            {amounts.projected > 0 ? `${Math.round(pct * 100)}%` : "—"}
          </span>
        </span>
        <span className="w-24 shrink-0 text-right">
          <Pill tone={statusTone(node.status)}>{statusLabel(node.status)}</Pill>
        </span>
      </button>
    </div>
  );
}

function TrackingPanel({
  tree,
  selected,
  selectedId,
  onSelect,
  scope,
  setScope,
  expanded,
  toggleExpand,
  incomeYtd,
  expenseYtd,
}: {
  tree: NonNullable<ReturnType<typeof buildTrackingTree>>;
  selected: TrackingNode;
  selectedId: string;
  onSelect: (id: string) => void;
  scope: TrackingScope;
  setScope: (s: TrackingScope) => void;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  incomeYtd: { projected: number; actual: number; variance: number };
  expenseYtd: { projected: number; actual: number; variance: number };
}) {
  const netYtd = {
    actual: Math.round((incomeYtd.actual - expenseYtd.actual) * 100) / 100,
    projected:
      Math.round((incomeYtd.projected - expenseYtd.projected) * 100) / 100,
  };
  const netVar = Math.round((netYtd.actual - netYtd.projected) * 100) / 100;

  const renderSection = (title: string, nodes: TrackingNode[]) => (
    <Card className="overflow-hidden p-0" key={title}>
      <div className="border-b border-hairline px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="hidden border-b border-hairline px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-faint sm:flex sm:items-center sm:gap-2">
        <span className="w-3.5" />
        <span className="min-w-0 flex-1">Category</span>
        <span className="w-20 text-right">Projected</span>
        <span className="w-20 text-right">Actual</span>
        <span className="w-20 text-right">Diff</span>
        <span className="w-24 text-right">Used</span>
        <span className="w-24 text-right">Status</span>
      </div>
      {nodes.map((cat) => (
        <div key={cat.id}>
          <TrackingRow
            node={cat}
            scope={scope}
            monthIdx={tree.currentMonthIdx}
            depth={0}
            selected={selectedId === cat.id}
            expanded={expanded.has(cat.id)}
            onSelect={() => onSelect(cat.id)}
            onToggle={() => toggleExpand(cat.id)}
          />
          {expanded.has(cat.id)
            ? cat.children.map((sub) => (
                <TrackingRow
                  key={sub.id}
                  node={sub}
                  scope={scope}
                  monthIdx={tree.currentMonthIdx}
                  depth={1}
                  selected={selectedId === sub.id}
                  expanded={false}
                  onSelect={() => onSelect(sub.id)}
                />
              ))
            : null}
        </div>
      ))}
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Income YTD"
          value={money(incomeYtd.actual)}
          tone="gain"
          hint={`${money(incomeYtd.variance)} vs plan`}
        />
        <StatCard
          label="Expenses YTD"
          value={money(expenseYtd.actual)}
          tone="loss"
          hint={`${money(expenseYtd.variance)} vs plan`}
        />
        <StatCard
          label="Net YTD"
          value={money(netYtd.actual)}
          tone={netYtd.actual >= 0 ? "gain" : "loss"}
          hint={`${money(netVar)} vs plan`}
        />
        <StatCard
          label="Adherence"
          value={netVar >= 0 ? "On track" : "Behind"}
          tone={netVar >= 0 ? "gain" : "loss"}
          hint="Year to date vs projected"
        />
      </div>

      <Card>
        <CardHeader
          title={
            selected.categoryName
              ? `${selected.categoryName} / ${selected.name}`
              : selected.name
          }
          subtitle={trackingRead(selected)}
          action={
            <button
              type="button"
              className="text-xs font-medium text-accent hover:underline"
              onClick={() => onSelect("overall")}
            >
              Overall
            </button>
          }
        />
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <div className="text-xs text-ink-faint">Projected YTD</div>
            <div className="tnum text-sm font-semibold">
              {money(selected.ytdProjected)}
            </div>
          </div>
          <div>
            <div className="text-xs text-ink-faint">Actual YTD</div>
            <div className="tnum text-sm font-semibold">
              {money(selected.ytdActual)}
            </div>
          </div>
          <div>
            <div className="text-xs text-ink-faint">Variance</div>
            <div
              className={cn(
                "tnum text-sm font-semibold",
                selected.ytdVariance < 0 ? "text-loss" : "text-gain",
              )}
            >
              {money(selected.ytdVariance)}
            </div>
          </div>
          <div>
            <div className="text-xs text-ink-faint">Full-year plan</div>
            <div className="tnum text-sm font-semibold">
              {money(selected.yearProjected)}
            </div>
          </div>
        </div>
        <BudgetTrackChart
          node={selected}
          labels={tree.monthLabels}
          currentMonthIdx={tree.currentMonthIdx}
        />
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-hairline p-0.5">
          {(
            [
              ["month", "This month"],
              ["ytd", "Year to date"],
              ["year", "Full year"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setScope(v)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                scope === v
                  ? "bg-accent-soft text-accent"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-ink-faint">
          Click a row to chart it. Expand categories for subcategories.
        </p>
      </div>

      {renderSection("Income", tree.income)}
      {renderSection("Expenses", tree.expense)}
    </div>
  );
}

export function Budget() {
  const { data: cats } = useCategories();
  const { data: monthly } = useMonthly();
  const putProjections = usePutProjections();
  const mutations = useCategoryMutations();
  const { show: toast } = useToast();

  const [tab, setTab] = useState<"targets" | "tracking">("tracking");
  const [edits, setEdits] = useState<EditMap>({});
  const [dirty, setDirty] = useState(false);
  const [showAddCat, setShowAddCat] = useState(false);
  const [selectedId, setSelectedId] = useState("overall");
  const [scope, setScope] = useState<TrackingScope>("ytd");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const months = cats?.months ?? [];
  const labels = cats?.labels ?? [];

  // Seed the editable projection map whenever fresh category data arrives.
  useEffect(() => {
    if (!cats) return;
    const map: EditMap = {};
    for (const c of cats.categories) {
      for (const s of c.subcategories) {
        for (const m of cats.months) {
          map[key(s.id, m)] = s.projections[m] ?? 0;
        }
      }
    }
    setEdits(map);
    setDirty(false);
  }, [cats]);

  const annualOf = (subId: number) =>
    months.reduce((sum, m) => sum + (edits[key(subId, m)] || 0), 0);

  const setMonth = (subId: number, month: string, value: number) => {
    setEdits((prev) => ({ ...prev, [key(subId, month)]: value }));
    setDirty(true);
  };

  const setAnnual = (subId: number, annual: number) => {
    const spread = spreadEven(annual, months);
    setEdits((prev) => {
      const next = { ...prev };
      for (const m of months) next[key(subId, m)] = spread[m];
      return next;
    });
    setDirty(true);
  };

  const save = () => {
    const projections = Object.entries(edits).map(([k, amount]) => {
      const [subId, month] = k.split(":");
      return { subcategory_id: Number(subId), month, amount };
    });
    putProjections.mutate(projections, {
      onSuccess: () => {
        toast("Projections saved");
        setDirty(false);
      },
      onError: (e: Error) => toast(e.message, "error"),
    });
  };

  const addSubcategory = (categoryId: number) => {
    const name = window.prompt("New subcategory name");
    if (!name || !name.trim()) return;
    mutations.createSubcategory.mutate(
      { category_id: categoryId, name: name.trim() },
      {
        onSuccess: () => toast("Subcategory added"),
        onError: (e: Error) => toast(e.message, "error"),
      },
    );
  };

  const confirmDelete = (label: string, run: () => void) => {
    if (window.confirm(`Delete "${label}"? This cannot be undone.`)) run();
  };

  const switchTab = (next: "targets" | "tracking") => {
    if (tab === "targets" && dirty && next === "tracking") {
      if (
        !window.confirm(
          "You have unsaved projection changes. Switch tabs without saving?",
        )
      ) {
        return;
      }
    }
    setTab(next);
  };

  const statusMonth = currentMonthKey();
  const statusIdx = monthly ? monthIndex(monthly, statusMonth) : 0;

  const tree = useMemo(
    () => (monthly ? buildTrackingTree(monthly, statusIdx) : null),
    [monthly, statusIdx],
  );

  const selected = tree
    ? findTrackingNode(tree, selectedId) ?? tree.overall
    : null;

  const incomeYtd = useMemo(() => {
    if (!tree) return { projected: 0, actual: 0, variance: 0 };
    const projected = tree.income.reduce((s, n) => s + n.ytdProjected, 0);
    const actual = tree.income.reduce((s, n) => s + n.ytdActual, 0);
    return {
      projected: Math.round(projected * 100) / 100,
      actual: Math.round(actual * 100) / 100,
      variance: Math.round((actual - projected) * 100) / 100,
    };
  }, [tree]);

  const expenseYtd = useMemo(() => {
    if (!tree) return { projected: 0, actual: 0, variance: 0 };
    const projected = tree.expense.reduce((s, n) => s + n.ytdProjected, 0);
    const actual = tree.expense.reduce((s, n) => s + n.ytdActual, 0);
    return {
      projected: Math.round(projected * 100) / 100,
      actual: Math.round(actual * 100) / 100,
      variance: Math.round((projected - actual) * 100) / 100,
    };
  }, [tree]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="inline-flex w-full rounded-lg border border-hairline p-0.5 sm:w-auto">
          {(
            [
              ["tracking", "Track budget"],
              ["targets", "Set targets"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => switchTab(v)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                tab === v
                  ? "bg-accent-soft text-accent"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "targets" ? (
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={() => setShowAddCat(true)}>
              <Plus className="h-4 w-4" /> Add category
            </Button>
            <Button
              onClick={save}
              disabled={!dirty || putProjections.isPending}
            >
              {putProjections.isPending ? "Saving\u2026" : "Save projections"}
            </Button>
          </div>
        ) : null}
      </div>

      {tab === "tracking" ? (
        tree && selected ? (
          <TrackingPanel
            tree={tree}
            selected={selected}
            selectedId={selectedId}
            onSelect={setSelectedId}
            scope={scope}
            setScope={setScope}
            expanded={expanded}
            toggleExpand={toggleExpand}
            incomeYtd={incomeYtd}
            expenseYtd={expenseYtd}
          />
        ) : (
          <Card>
            <p className="text-sm text-ink-muted">Loading budget…</p>
          </Card>
        )
      ) : (
        <div className="space-y-6">
          {(cats?.categories ?? []).map((c: Category) => (
        <Card key={c.id} className="p-0">
          <div className="flex flex-col gap-2 border-b border-hairline px-4 py-3 sm:flex-row sm:items-center">
            <EditableName
              value={c.name}
              onSave={(name) =>
                mutations.updateCategory.mutate(
                  { id: c.id, name },
                  { onError: (e: Error) => toast(e.message, "error") },
                )
              }
              className="text-base font-semibold"
            />
            <Pill tone={c.kind === "income" ? "gain" : "neutral"}>{c.kind}</Pill>
            <div className="flex flex-wrap items-center gap-1 sm:ml-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => addSubcategory(c.id)}
              >
                <Plus className="h-4 w-4" /> Subcategory
              </Button>
              <button
                type="button"
                aria-label="Delete category"
                className="p-2 text-ink-faint transition-colors hover:text-loss"
                onClick={() =>
                  confirmDelete(c.name, () =>
                    mutations.deleteCategory.mutate(c.id, {
                      onSuccess: () => toast("Category deleted"),
                      onError: (e: Error) => toast(e.message, "error"),
                    }),
                  )
                }
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="sticky left-0 bg-card px-4 py-2 font-medium">
                    Subcategory
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Annual</th>
                  {labels.map((l) => (
                    <th
                      key={l}
                      className="whitespace-nowrap px-3 py-2 text-right font-medium"
                    >
                      {l}
                    </th>
                  ))}
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {c.subcategories.length === 0 ? (
                  <tr>
                    <td
                      colSpan={months.length + 3}
                      className="px-4 py-4 text-ink-muted"
                    >
                      No subcategories yet.
                    </td>
                  </tr>
                ) : (
                  c.subcategories.map((s) => (
                    <tr key={s.id} className="border-t border-hairline">
                      <td className="sticky left-0 bg-card px-4 py-1.5">
                        <EditableName
                          value={s.name}
                          onSave={(name) =>
                            mutations.updateSubcategory.mutate(
                              { id: s.id, name },
                              {
                                onError: (e: Error) =>
                                  toast(e.message, "error"),
                              },
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <input
                          type="number"
                          step="0.01"
                          className="w-24 rounded-md border border-hairline px-2 py-1 text-right text-sm tnum focus:border-accent focus:outline-none"
                          value={Number(annualOf(s.id).toFixed(2))}
                          onChange={(e) =>
                            setAnnual(s.id, Number(e.target.value) || 0)
                          }
                        />
                      </td>
                      {months.map((m) => (
                        <td key={m} className="px-3 py-1.5 text-right">
                          <input
                            type="number"
                            step="0.01"
                            className="w-20 rounded-md border border-hairline px-2 py-1 text-right text-sm tnum focus:border-accent focus:outline-none"
                            value={Number((edits[key(s.id, m)] || 0).toFixed(2))}
                            onChange={(e) =>
                              setMonth(s.id, m, Number(e.target.value) || 0)
                            }
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          aria-label="Delete subcategory"
                          className="text-ink-faint transition-colors hover:text-loss"
                          onClick={() =>
                            confirmDelete(s.name, () =>
                              mutations.deleteSubcategory.mutate(s.id, {
                                onSuccess: () => toast("Subcategory deleted"),
                                onError: (e: Error) => toast(e.message, "error"),
                              }),
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
          ))}
        </div>
      )}

      {showAddCat ? (
        <AddCategoryModal onClose={() => setShowAddCat(false)} />
      ) : null}
    </div>
  );
}
