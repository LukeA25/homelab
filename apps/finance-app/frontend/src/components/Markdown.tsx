import {
  Children,
  cloneElement,
  isValidElement,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

const MONEY = /([+-])\s*(\$[\d,]+(?:\.\d{1,2})?)/g;

function colorMoney(node: ReactNode): ReactNode {
  if (node == null || typeof node === "boolean") return node;
  if (typeof node === "number") return colorMoney(String(node));
  if (typeof node === "string") {
    const parts: ReactNode[] = [];
    let last = 0;
    let i = 0;
    for (const match of node.matchAll(MONEY)) {
      const idx = match.index ?? 0;
      if (idx > last) parts.push(node.slice(last, idx));
      const sign = match[1];
      parts.push(
        <span
          key={`m-${i++}`}
          className={cn(
            "tnum font-semibold",
            sign === "+" ? "text-gain" : "text-loss",
          )}
        >
          {sign}
          {match[2]}
        </span>,
      );
      last = idx + match[0].length;
    }
    if (parts.length === 0) return node;
    if (last < node.length) parts.push(node.slice(last));
    return parts;
  }
  if (Array.isArray(node)) {
    return Children.map(node, (child) => colorMoney(child));
  }
  if (isValidElement<{ children?: ReactNode }>(node) && node.props.children != null) {
    return cloneElement(node, {
      ...node.props,
      children: colorMoney(node.props.children),
    });
  }
  return node;
}

export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn("consultant-md text-sm text-ink", className)}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className="mb-2 mt-4 text-lg font-semibold tracking-tight text-ink first:mt-0">
              {colorMoney(children)}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-1.5 mt-4 border-l-2 border-accent pl-2.5 text-[0.95rem] font-semibold text-accent first:mt-0">
              {colorMoney(children)}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-accent/80 first:mt-0">
              {colorMoney(children)}
            </h3>
          ),
          p: ({ children }) => (
            <p className="my-2 leading-relaxed">{colorMoney(children)}</p>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed">{colorMoney(children)}</li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold">{colorMoney(children)}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-ink-muted">{colorMoney(children)}</em>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 rounded-lg border border-accent/20 bg-accent-soft/40 px-3 py-2 text-ink">
              {colorMoney(children)}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-hairline" />,
          a: ({ href, children }) => (
            <a href={href} className="font-medium text-accent underline">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
