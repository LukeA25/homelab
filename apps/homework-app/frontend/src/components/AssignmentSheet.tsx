import { useEffect, useState, type FormEvent } from "react";
import { Trash2, X } from "lucide-react";
import type { Assignment, AssignmentInput, Course } from "@/lib/types";
import { defaultDue, toInputValue } from "@/lib/utils";

export function AssignmentSheet({
  courses,
  editing,
  saving,
  error,
  onClose,
  onSubmit,
  onDelete,
}: {
  courses: Course[];
  /** `null` means "new assignment". */
  editing: Assignment | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: AssignmentInput) => void;
  onDelete: (a: Assignment) => void;
}) {
  const [courseCode, setCourseCode] = useState("");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setCourseCode(editing?.courseCode ?? courses[0]?.code ?? "");
    setTitle(editing?.title ?? "");
    setDue(editing ? toInputValue(editing.due) : defaultDue());
    setNotes(editing?.notes ?? "");
  }, [editing, courses]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!courseCode || !title.trim() || !due) return;
    onSubmit({ courseCode, title: title.trim(), due, notes });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm dash:items-center dash:p-6">
      <div className="card max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-b-none p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] dash:rounded-card dash:pb-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {editing ? "Edit assignment" : "New assignment"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-panel hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Class
            </span>
            <select
              className="field"
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
              required
            >
              {courses.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} · {c.code}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Assignment
            </span>
            <input
              className="field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="WebWork 1.5"
              required
              autoFocus={!editing}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Due
            </span>
            <input
              className="field"
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              required
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Notes
            </span>
            <textarea
              className="field min-h-[64px] resize-y"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </label>

          {error ? (
            <p className="rounded-xl border border-loss/40 bg-loss/10 px-3 py-2 text-xs text-loss">
              {error}
            </p>
          ) : null}

          <div className="mt-1 flex items-center gap-2">
            {editing ? (
              <button
                type="button"
                className="btn-danger"
                onClick={() => onDelete(editing)}
                disabled={saving}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            ) : null}
            <div className="flex-1" />
            <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-accent" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
