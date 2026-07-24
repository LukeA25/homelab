import { useState } from "react";
import { STATUS_LABELS } from "../data/songs";
import type { Status } from "../lib/types";

const STATUS_ORDER: Status[] = ["want", "rusty", "learning", "know"];

/** Want = gray, learning = orange, rusty = red, know = green */
export const STATUS_TAG_CLASS: Record<Status, string> = {
  want: "border-border bg-surface text-muted",
  learning: "border-orange-400/35 bg-orange-400/15 text-orange-200",
  rusty: "border-red-400/35 bg-red-400/15 text-red-200",
  know: "border-emerald-400/35 bg-emerald-400/15 text-emerald-200",
};

export function MetaTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-pill border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted">
      {children}
    </span>
  );
}

export function StatusTag({
  status,
  editable = false,
  onChange,
}: {
  status: Status;
  editable?: boolean;
  onChange?: (status: Status) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!editable || !onChange) {
    return (
      <span
        className={`rounded-pill border px-2.5 py-1 text-xs font-medium ${STATUS_TAG_CLASS[status]}`}
      >
        {STATUS_LABELS[status]}
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`rounded-pill border px-2.5 py-1 text-xs font-medium transition hover:brightness-110 ${STATUS_TAG_CLASS[status]}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {STATUS_LABELS[status]}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close status menu"
            onClick={() => setOpen(false)}
          />
          <div className="panel absolute left-0 top-full z-50 mt-2 min-w-[10rem] overflow-hidden rounded-2xl py-1 shadow-panel">
            {STATUS_ORDER.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={`flex w-full items-center px-3 py-2 text-left text-sm transition hover:bg-surface ${
                  option === status ? "bg-accent-soft" : ""
                }`}
              >
                <span
                  className={`mr-2 inline-block h-2 w-2 rounded-full border ${STATUS_TAG_CLASS[option]}`}
                />
                {STATUS_LABELS[option]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
