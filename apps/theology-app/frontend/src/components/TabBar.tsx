import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import type { TabKind, WorkspaceTab } from "../lib/types";

const KIND_LABEL: Record<TabKind, string> = {
  prayers: "Prayers",
  bible: "Bible",
  library: "Library",
  ask: "Ask",
  notes: "Notes",
  reader: "Reader",
  "bible-year": "Bible Year",
};

const ADD_MENU = [
  ["bible-year", "Bible in a Year"],
  ["prayers", "Prayers"],
  ["ask", "Ask"],
  ["library", "Library"],
  ["notes", "Notes"],
] as const;

type TabBarProps = {
  tabs: WorkspaceTab[];
  split: boolean;
  leftIds: string[];
  rightIds: string[];
  leftFocusId: string | null;
  rightFocusId: string | null;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: (kind: TabKind) => void;
  onMoveToSide: (id: string, side: "left" | "right") => void;
};

export function TabBar({
  tabs,
  split,
  leftIds,
  rightIds,
  leftFocusId,
  rightFocusId,
  onFocus,
  onClose,
  onAdd,
  onMoveToSide,
}: TabBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const byId = useMemo(() => new Map(tabs.map((t) => [t.id, t])), [tabs]);

  const leftTabs = leftIds.map((id) => byId.get(id)).filter(Boolean) as WorkspaceTab[];
  const rightTabs = rightIds.map((id) => byId.get(id)).filter(Boolean) as WorkspaceTab[];

  function chip(tab: WorkspaceTab, active: boolean) {
    return (
      <div
        key={tab.id}
        draggable={split}
        onDragStart={(e: DragEvent) => {
          if (!split) return;
          e.dataTransfer.setData("text/tab-id", tab.id);
          e.dataTransfer.effectAllowed = "move";
          setDraggingId(tab.id);
        }}
        onDragEnd={() => setDraggingId(null)}
        className={`flex shrink-0 items-center border-b-2 px-2.5 py-2 ${
          active
            ? "border-accent bg-accent-soft"
            : "border-transparent bg-transparent hover:bg-surface/60"
        } ${draggingId === tab.id ? "opacity-40" : ""}`}
      >
        <button
          type="button"
          onClick={() => onFocus(tab.id)}
          className="max-w-[7rem] truncate text-xs font-semibold"
        >
          {tab.title || KIND_LABEL[tab.kind]}
        </button>
        <button
          type="button"
          aria-label="Close tab"
          onClick={() => onClose(tab.id)}
          className="ml-1 rounded p-1 text-muted hover:bg-bg hover:text-text"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  function dropZone(side: "left" | "right", children: ReactNode) {
    return (
      <div
        className="flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto"
        onDragOver={(e) => {
          if (!split) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          if (!split) return;
          e.preventDefault();
          const id = e.dataTransfer.getData("text/tab-id");
          if (id) onMoveToSide(id, side);
          setDraggingId(null);
        }}
      >
        {children}
      </div>
    );
  }

  const addButton = (
    <div className="relative mb-1.5 flex shrink-0 items-center">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="grid h-8 w-8 place-items-center rounded-md border border-border bg-surface text-accent"
        aria-label="New tab"
      >
        <Plus className="h-4 w-4" />
      </button>
      {menuOpen && (
        <div className="anim-sheet absolute right-0 top-10 z-40 w-52 overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-panel">
          {ADD_MENU.map(([kind, label]) => (
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
  );

  return (
    <div className="safe-top relative z-30 flex shrink-0 items-stretch gap-0 border-b border-border bg-bg-elevated px-1.5 pt-1">
      {split ? (
        <>
          {dropZone(
            "left",
            <>{leftTabs.map((tab) => chip(tab, tab.id === leftFocusId))}</>,
          )}
          <div className="mb-1.5 w-px shrink-0 self-stretch bg-border" />
          <div className="flex min-w-0 flex-1 items-stretch">
            {dropZone(
              "right",
              <>{rightTabs.map((tab) => chip(tab, tab.id === rightFocusId))}</>,
            )}
            {addButton}
          </div>
        </>
      ) : (
        <>
          <div className="flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto">
            {leftTabs.map((tab) => chip(tab, tab.id === leftFocusId))}
          </div>
          {addButton}
        </>
      )}
    </div>
  );
}

export function newTabId() {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
