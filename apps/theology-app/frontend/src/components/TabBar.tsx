import { useState } from "react";
import { Columns2, Plus, X } from "lucide-react";
import type { TabKind, WorkspaceTab } from "../lib/types";

const KIND_LABEL: Record<TabKind, string> = {
  bible: "Bible",
  library: "Library",
  ask: "Ask",
  notes: "Notes",
  reader: "Reader",
};

type TabBarProps = {
  tabs: WorkspaceTab[];
  focusId: string | null;
  splitRightId: string | null;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: (kind: TabKind) => void;
  /** Split: keep focus on left, put this tab on the right */
  onSplitRight: (rightTabId: string) => void;
  /** Open a new tab kind on the right, keep leftTabId on the left */
  onSplitWithNew: (leftTabId: string, kind: Exclude<TabKind, "reader">) => void;
  onClearSplit: () => void;
};

export function TabBar({
  tabs,
  focusId,
  splitRightId,
  onFocus,
  onClose,
  onAdd,
  onSplitRight,
  onSplitWithNew,
  onClearSplit,
}: TabBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [splitPickerFor, setSplitPickerFor] = useState<string | null>(null);

  return (
    <div className="safe-top relative z-30 flex shrink-0 items-center gap-1 border-b border-border bg-bg-elevated px-2 pb-2 pt-1">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.id === focusId || tab.id === splitRightId;
          return (
            <div
              key={tab.id}
              className={`flex shrink-0 items-center gap-0.5 rounded-pill border px-1 py-0.5 ${
                active ? "border-accent bg-accent-soft" : "border-border bg-surface"
              }`}
            >
              <button
                type="button"
                onClick={() => onFocus(tab.id)}
                className="max-w-[7rem] truncate px-2 py-1.5 text-xs font-semibold"
              >
                {tab.title || KIND_LABEL[tab.kind]}
              </button>
              <button
                type="button"
                aria-label="Split"
                title="Split"
                onClick={() => setSplitPickerFor(tab.id)}
                className="rounded-full p-1 text-muted hover:bg-bg hover:text-accent"
              >
                <Columns2 className="h-3 w-3" />
              </button>
              <button
                type="button"
                aria-label="Close tab"
                onClick={() => onClose(tab.id)}
                className="rounded-full p-1 text-muted hover:bg-bg"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="grid h-8 w-8 place-items-center rounded-full border border-border bg-surface text-accent"
          aria-label="New tab"
        >
          <Plus className="h-4 w-4" />
        </button>
        {menuOpen && (
          <div className="anim-sheet absolute right-0 top-10 z-40 w-44 overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-panel">
            {(
              [
                ["bible", "Bible"],
                ["ask", "Ask"],
                ["library", "Library"],
                ["notes", "Notes"],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  onAdd(kind);
                  setMenuOpen(false);
                }}
                className="block w-full px-4 py-3 text-left text-sm font-medium hover:bg-surface"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {splitRightId && (
        <button
          type="button"
          onClick={onClearSplit}
          className="shrink-0 rounded-pill border border-border px-2.5 py-1.5 text-[10px] font-semibold text-muted"
        >
          Unsplit
        </button>
      )}

      {splitPickerFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 pb-8 sm:items-center">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close"
            onClick={() => setSplitPickerFor(null)}
          />
          <div className="anim-sheet relative w-full max-w-sm rounded-2xl border border-border bg-bg-elevated p-4 shadow-panel">
            <p className="font-display text-lg font-semibold">Split screen</p>
            <p className="mt-1 text-sm text-muted">
              Keep this tab on the left. Choose what opens on the right.
            </p>

            {tabs.filter((t) => t.id !== splitPickerFor).length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Existing tab
                </p>
                <div className="mt-2 flex flex-col gap-1">
                  {tabs
                    .filter((t) => t.id !== splitPickerFor)
                    .map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          onFocus(splitPickerFor);
                          onSplitRight(t.id);
                          setSplitPickerFor(null);
                        }}
                        className="rounded-xl border border-border bg-surface px-3 py-2.5 text-left text-sm font-medium"
                      >
                        {t.title || KIND_LABEL[t.kind]}
                      </button>
                    ))}
                </div>
              </div>
            )}

            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                New tab on the right
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(
                  [
                    ["bible", "Bible"],
                    ["ask", "Ask"],
                    ["library", "Library"],
                    ["notes", "Notes"],
                  ] as const
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => {
                      onSplitWithNew(splitPickerFor, kind);
                      setSplitPickerFor(null);
                    }}
                    className="rounded-2xl border border-border bg-surface px-3 py-3 text-sm font-semibold"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function newTabId() {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
