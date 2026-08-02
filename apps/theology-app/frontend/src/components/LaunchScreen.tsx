import { BookOpen, Library, MessageSquareText, NotebookPen } from "lucide-react";
import type { TabKind } from "../lib/types";

type LaunchScreenProps = {
  onOpen: (kind: Exclude<TabKind, "reader">) => void;
};

const OPTIONS = [
  { id: "bible" as const, label: "Bible", hint: "Read Scripture", icon: BookOpen },
  { id: "ask" as const, label: "Ask", hint: "Find sources", icon: MessageSquareText },
  { id: "library" as const, label: "Library", hint: "Books & documents", icon: Library },
  { id: "notes" as const, label: "Notes", hint: "Personal & study", icon: NotebookPen },
];

export function LaunchScreen({ onOpen }: LaunchScreenProps) {
  return (
    <div className="flex h-full w-full items-center justify-center px-6">
      <div className="grid w-full max-w-md grid-cols-2 gap-3">
        {OPTIONS.map(({ id, label, hint, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onOpen(id)}
            className="flex aspect-square flex-col items-start justify-between rounded-[1.5rem] border border-border bg-surface p-5 text-left transition active:scale-[0.98]"
          >
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent-soft text-accent">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="font-display text-xl font-semibold">{label}</p>
              <p className="mt-1 text-sm text-muted">{hint}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
