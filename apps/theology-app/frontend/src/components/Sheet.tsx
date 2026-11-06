import type { ReactNode } from "react";

type SheetProps = {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
};

export function Sheet({ open, title, onClose, children }: SheetProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        className="anim-backdrop absolute inset-0 bg-black/55"
        onClick={onClose}
      />
      <div className="anim-sheet relative flex max-h-[85%] min-h-0 flex-col overflow-hidden rounded-t-[1.75rem] border border-border bg-bg-elevated safe-bottom">
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-border" />
        {title && (
          <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-4">
            <h2 className="font-display text-lg font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="text-sm font-medium text-accent">
              Done
            </button>
          </div>
        )}
        <div className="max-h-[min(70vh,70%)] touch-pan-y overflow-y-auto overscroll-contain px-5 pb-6 pt-2 [&_button]:touch-pan-y">
          {children}
        </div>
      </div>
    </div>
  );
}
