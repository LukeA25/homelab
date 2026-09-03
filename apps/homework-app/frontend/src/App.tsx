import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Loader2, Plus } from "lucide-react";
import { AssignmentRow } from "@/components/AssignmentRow";
import { AssignmentSheet } from "@/components/AssignmentSheet";
import { api } from "@/lib/api";
import type { Assignment, AssignmentInput } from "@/lib/types";
import { BUCKET_LABELS, cn, groupByBucket } from "@/lib/utils";

type Filter = "open" | "done" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "open", label: "To do" },
  { key: "done", label: "Done" },
  { key: "all", label: "All" },
];

export default function App() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("open");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const coursesQ = useQuery({ queryKey: ["courses"], queryFn: api.courses, staleTime: Infinity });
  const assignmentsQ = useQuery({
    queryKey: ["assignments"],
    queryFn: api.assignments,
    refetchInterval: 60_000,
  });

  const courses = coursesQ.data?.courses ?? [];
  const data = assignmentsQ.data;

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ["assignments"] });
  }

  const toggleMut = useMutation({
    mutationFn: (a: Assignment) => api.update(a.id, { done: !a.done }),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });

  const saveMut = useMutation({
    mutationFn: (values: AssignmentInput) =>
      editing ? api.update(editing.id, values) : api.create(values),
    onSuccess: () => {
      invalidate();
      closeSheet();
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (a: Assignment) => api.remove(a.id),
    onSuccess: () => {
      invalidate();
      closeSheet();
    },
    onError: (e: Error) => setError(e.message),
  });

  function openNew() {
    setEditing(null);
    setError(null);
    setSheetOpen(true);
  }

  function openEdit(a: Assignment) {
    setEditing(a);
    setError(null);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditing(null);
    setError(null);
  }

  const visible = useMemo(() => {
    const all = data?.assignments ?? [];
    return all.filter((a) => {
      if (filter === "open" && a.done) return false;
      if (filter === "done" && !a.done) return false;
      if (courseFilter !== "all" && a.courseCode !== courseFilter) return false;
      return true;
    });
  }, [data, filter, courseFilter]);

  // Done items read best newest-first; open items stay in due order.
  const groups = useMemo(() => {
    if (filter === "done") {
      const sorted = [...visible].sort((a, b) => b.due.localeCompare(a.due));
      return [["done", sorted]] as [string, Assignment[]][];
    }
    return groupByBucket(visible).map(([k, items]) => [BUCKET_LABELS[k], items]) as [
      string,
      Assignment[],
    ][];
  }, [visible, filter]);

  return (
    <div className="min-h-full">
      <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-4 px-4 py-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <header className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-accent" />
              <h1 className="font-display text-2xl font-semibold tracking-tight">Homework</h1>
            </div>
            <p className="mt-0.5 text-xs text-ink-faint">
              {data
                ? `${data.openCount} to do · ${data.doneCount} done`
                : assignmentsQ.isLoading
                  ? "Loading…"
                  : "—"}
            </p>
          </div>
          <button type="button" className="btn-accent" onClick={openNew}>
            <Plus className="h-4 w-4" />
            Add
          </button>
        </header>

        {data && (data.overdueCount > 0 || data.dueTodayCount > 0) ? (
          <div className="flex flex-wrap gap-2">
            {data.overdueCount > 0 ? (
              <span className="rounded-full bg-loss/15 px-3 py-1 text-xs font-semibold text-loss">
                {data.overdueCount} overdue
              </span>
            ) : null}
            {data.dueTodayCount > 0 ? (
              <span className="rounded-full bg-warm-soft px-3 py-1 text-xs font-semibold text-warm">
                {data.dueTodayCount} due today
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-xl border border-hairline bg-panel p-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  filter === f.key
                    ? "bg-accent text-canvas"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <select
            className="field w-auto flex-1 py-1.5 text-xs"
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
          >
            <option value="all">All classes</option>
            {courses.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {assignmentsQ.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-faint">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading assignments…
          </div>
        ) : assignmentsQ.isError ? (
          <p className="card px-4 py-6 text-center text-sm text-loss">
            Couldn&apos;t load assignments. Is the homework database reachable?
          </p>
        ) : groups.length === 0 ? (
          <p className="card px-4 py-10 text-center text-sm text-ink-muted">
            {filter === "done" ? "Nothing finished yet." : "Nothing due — you're all caught up."}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map(([label, items]) => (
              <section key={label} className="flex flex-col gap-2">
                <h2
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-[0.16em]",
                    label === "Overdue" ? "text-loss" : "text-ink-faint",
                  )}
                >
                  {label === "done" ? "Completed" : label}
                  <span className="ml-2 text-ink-faint/70">{items.length}</span>
                </h2>
                {items.map((a) => (
                  <AssignmentRow
                    key={a.id}
                    assignment={a}
                    onToggle={(x) => toggleMut.mutate(x)}
                    onEdit={openEdit}
                  />
                ))}
              </section>
            ))}
          </div>
        )}

        {error && !sheetOpen ? (
          <p className="rounded-xl border border-loss/40 bg-loss/10 px-3 py-2 text-xs text-loss">
            {error}
          </p>
        ) : null}
      </div>

      {sheetOpen ? (
        <AssignmentSheet
          courses={courses}
          editing={editing}
          saving={saveMut.isPending || deleteMut.isPending}
          error={error}
          onClose={closeSheet}
          onSubmit={(values) => {
            setError(null);
            saveMut.mutate(values);
          }}
          onDelete={(a) => {
            setError(null);
            deleteMut.mutate(a);
          }}
        />
      ) : null}
    </div>
  );
}
