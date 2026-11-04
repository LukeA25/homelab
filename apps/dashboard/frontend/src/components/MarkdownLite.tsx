import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

function inline(text: string): ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code key={i} className="rounded bg-panel px-1 py-0.5 font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function MarkdownLite({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let list: string[] = [];
  let code: string[] | null = null;

  const flushList = () => {
    if (!list.length) return;
    nodes.push(
      <ul key={`ul-${nodes.length}`} className="my-2 list-disc space-y-1 pl-5">
        {list.map((item, i) => (
          <li key={i} className="leading-relaxed">
            {inline(item)}
          </li>
        ))}
      </ul>,
    );
    list = [];
  };

  const flushCode = () => {
    if (!code) return;
    nodes.push(
      <pre
        key={`pre-${nodes.length}`}
        className="my-3 overflow-x-auto rounded-xl border border-hairline bg-panel px-3 py-2 font-mono text-sm leading-relaxed"
      >
        <code>{code.join("\n")}</code>
      </pre>,
    );
    code = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (line.startsWith("```")) {
      if (code) flushCode();
      else {
        flushList();
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(raw);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      list.push(line.replace(/^\s*[-*]\s+/, ""));
      continue;
    }
    flushList();
    if (!line.trim()) {
      continue;
    }
    if (line.startsWith("### ")) {
      nodes.push(
        <h3 key={nodes.length} className="mb-1 mt-4 text-sm font-semibold uppercase tracking-wide text-accent first:mt-0">
          {inline(line.slice(4))}
        </h3>,
      );
    } else if (line.startsWith("## ")) {
      nodes.push(
        <h2 key={nodes.length} className="mb-1.5 mt-4 text-lg font-semibold text-ink first:mt-0">
          {inline(line.slice(3))}
        </h2>,
      );
    } else if (line.startsWith("# ")) {
      nodes.push(
        <h1 key={nodes.length} className="mb-2 mt-2 text-xl font-semibold tracking-tight first:mt-0">
          {inline(line.slice(2))}
        </h1>,
      );
    } else {
      nodes.push(
        <p key={nodes.length} className="my-2 leading-relaxed">
          {inline(line)}
        </p>,
      );
    }
  }
  flushList();
  flushCode();

  return <div className={cn("text-base text-ink", className)}>{nodes}</div>;
}
