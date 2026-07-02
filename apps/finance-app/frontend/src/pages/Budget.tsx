import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  useCategories,
  useMonthly,
  useOverview,
  usePutProjections,
  useCategoryMutations,
} from "@/lib/queries";
import {
  buildSubBudgetRows,
  currentMonthKey,
  monthIndex,
  statusLabel,
  statusTone,
} from "@/lib/budgetStatus";
import type { Category } from "@/lib/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { Modal } from "@/components/ui/Modal";
import { Input, Select, Label } from "@/components/ui/Field";
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

export function Budget() {
  const { data: cats } = useCategories();
  const { data: monthly } = useMonthly();
  const { data: overview } = useOverview();
  const putProjections = usePutProjections();
  const mutations = useCategoryMutations();
  const { show: toast } = useToast();

  const [mode, setMode] = useState<"projected" | "actual">("projected");
  const [edits, setEdits] = useState<EditMap>({});
  const [dirty, setDirty] = useState(false);
  const [showAddCat, setShowAddCat] = useState(false);

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

  // Actuals lookup keyed by subcategory:month, from the monthly view.
  const actuals = useMemo(() => {
    const map: Record<string, number> = {};
    if (!monthly) return map;
    const groups = [...monthly.income, ...monthly.expense];
    for (const c of groups) {
      for (const s of c.subcategories) {
        monthly.months.forEach((m, i) => {
          map[key(s.id, m)] = s.actual[i] ?? 0;
        });
      }
    }
    return map;
  }, [monthly]);

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

  const annualOf = (subId: number, source: "edit" | "actual") =>
    months.reduce(
      (sum, m) =>
        sum + ((source === "edit" ? edits : actuals)[key(subId, m)] || 0),
      0,
    );

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

  const cellValue = (subId: number, month: string) =>
    mode === "actual"
      ? actuals[key(subId, month)] || 0
      : edits[key(subId, month)] || 0;

  const statusMonth = currentMonthKey();
  const statusIdx = monthly ? monthIndex(monthly, statusMonth) : 0;
  const statusRows = useMemo(
    () => (monthly ? buildSubBudgetRows(monthly, statusIdx) : []),
    [monthly, statusIdx],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="inline-flex w-full rounded-lg border border-hairline p-0.5 sm:w-auto">
          {(["projected", "actual"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                mode === m
                  ? "bg-accent-soft text-accent"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" onClick={() => setShowAddCat(true)}>
            <Plus className="h-4 w-4" /> Add category
          </Button>
          {mode === "projected" ? (
            <Button
              onClick={save}
              disabled={!dirty || putProjections.isPending}
            >
              {putProjections.isPending ? "Saving\u2026" : "Save projections"}
            </Button>
          ) : null}
        </div>
      </div>

      {overview ? (
        <Card>
          <CardHeader title="Summary" subtitle="Projected vs. actual (full year)" />
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="py-2 font-medium">Section</th>
                <th className="py-2 text-right font-medium">Projected</th>
                <th className="py-2 text-right font-medium">Actual</th>
                <th className="py-2 text-right font-medium">Difference</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Income", d: overview.income },
                { label: "Expenses", d: overview.expense },
              ].map((row) => (
                <tr key={row.label} className="border-t border-hairline">
                  <td className="py-2 font-medium">{row.label}</td>
                  <td className="py-2 text-right tnum">
                    {money(row.d.projected)}
                  </td>
                  <td className="py-2 text-right tnum">{money(row.d.actual)}</td>
                  <td
                    className={cn(
                      "py-2 text-right tnum",
                      row.d.difference < 0 ? "text-loss" : "text-gain",
                    )}
                  >
                    {money(row.d.difference)}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-hairline font-semibold">
                <td className="py-2">Net</td>
                <td className="py-2 text-right tnum">
                  {money(overview.net.projected)}
                </td>
                <td className="py-2 text-right tnum">
                  {money(overview.net.actual)}
                </td>
                <td
                  className={cn(
                    "py-2 text-right tnum",
                    overview.net.difference < 0 ? "text-loss" : "text-gain",
                  )}
                >
                  {money(overview.net.difference)}
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
      ) : null}

      {statusRows.length > 0 ? (
        <Card>
          <CardHeader
            title="This month at a glance"
            subtitle={`Subcategory budget status · ${statusMonth}`}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-faint">
                  <th className="pb-2 font-medium">Subcategory</th>
                  <th className="pb-2 text-right font-medium">Budget</th>
                  <th className="pb-2 text-right font-medium">Spent</th>
                  <th className="pb-2 text-right font-medium">Left</th>
                  <th className="pb-2 text-right font-medium">Used</th>
                  <th className="pb-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {statusRows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5">
                      <span className="font-medium">{r.name}</span>
                      <span className="ml-1 text-xs text-ink-faint">
                        · {r.categoryName}
                      </span>
                    </td>
                    <td className="py-2.5 text-right tnum">
                      {r.projected > 0 ? money(r.projected) : "—"}
                    </td>
                    <td className="py-2.5 text-right tnum">{money(r.actual)}</td>
                    <td
                      className={cn(
                        "py-2.5 text-right tnum",
                        r.remaining < 0 ? "text-loss" : "",
                      )}
                    >
                      {r.projected > 0
                        ? money(r.remaining)
                        : r.actual > 0
                          ? "—"
                          : "—"}
                    </td>
                    <td className="py-2.5 text-right tnum">
                      {r.projected > 0
                        ? `${Math.round(r.pctUsed * 100)}%`
                        : "—"}
                    </td>
                    <td className="py-2.5 text-right">
                      <Pill tone={statusTone(r.status)}>
                        {statusLabel(r.status)}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

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
                        {mode === "projected" ? (
                          <input
                            type="number"
                            step="0.01"
                            className="w-24 rounded-md border border-hairline px-2 py-1 text-right text-sm tnum focus:border-accent focus:outline-none"
                            value={Number(annualOf(s.id, "edit").toFixed(2))}
                            onChange={(e) =>
                              setAnnual(s.id, Number(e.target.value) || 0)
                            }
                          />
                        ) : (
                          <span className="tnum text-ink-muted">
                            {money(annualOf(s.id, "actual"))}
                          </span>
                        )}
                      </td>
                      {months.map((m) => (
                        <td key={m} className="px-3 py-1.5 text-right">
                          {mode === "projected" ? (
                            <input
                              type="number"
                              step="0.01"
                              className="w-20 rounded-md border border-hairline px-2 py-1 text-right text-sm tnum focus:border-accent focus:outline-none"
                              value={Number(cellValue(s.id, m).toFixed(2))}
                              onChange={(e) =>
                                setMonth(s.id, m, Number(e.target.value) || 0)
                              }
                            />
                          ) : (
                            <span className="tnum text-ink-muted">
                              {cellValue(s.id, m)
                                ? money(cellValue(s.id, m))
                                : "\u2014"}
                            </span>
                          )}
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

      {showAddCat ? (
        <AddCategoryModal onClose={() => setShowAddCat(false)} />
      ) : null}
    </div>
  );
}
