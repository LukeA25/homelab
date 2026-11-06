import type { ReactNode } from "react";

export type StudydeskTarget =
  | { kind: "locus"; workId: string; locusId: string }
  | { kind: "work"; catalogOrWorkId: string }
  | { kind: "external"; href: string };

/** Parse studydesk:// and ordinary http(s) links from markdown. */
export function parseStudydeskHref(href: string): StudydeskTarget {
  const raw = href.trim();
  if (raw.startsWith("studydesk://locus/")) {
    const rest = raw.slice("studydesk://locus/".length);
    const slash = rest.indexOf("/");
    if (slash > 0) {
      return {
        kind: "locus",
        workId: decodeURIComponent(rest.slice(0, slash)),
        locusId: decodeURIComponent(rest.slice(slash + 1)),
      };
    }
  }
  if (raw.startsWith("studydesk://work/")) {
    return {
      kind: "work",
      catalogOrWorkId: decodeURIComponent(raw.slice("studydesk://work/".length)),
    };
  }
  // Legacy: studydesk://CCC.2710 or studydesk://Mt.16.18
  if (raw.startsWith("studydesk://")) {
    const rest = raw.slice("studydesk://".length);
    if (rest && !rest.includes("/")) {
      const locusId = decodeURIComponent(rest);
      const workId = locusId.toUpperCase().startsWith("CCC") ? "ccc" : "bible-nabre";
      return { kind: "locus", workId, locusId };
    }
  }
  return { kind: "external", href: raw };
}

type StudyMarkdownProps = {
  text: string;
  className?: string;
  onOpenLocus: (workId: string, locusId: string) => void;
  onOpenWork?: (workId: string) => void;
};

function renderInline(
  text: string,
  keyPrefix: string,
  onLink: (href: string, label: string) => ReactNode,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) {
      nodes.push(text.slice(last, m.index));
    }
    const token = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="rounded bg-bg px-1 text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        nodes.push(<span key={key}>{onLink(linkMatch[2], linkMatch[1])}</span>);
      }
    }
    last = m.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function StudyMarkdown({
  text,
  className,
  onOpenLocus,
  onOpenWork,
}: StudyMarkdownProps) {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());

  function linkNode(href: string, label: string) {
    const target = parseStudydeskHref(href);
    if (target.kind === "locus") {
      return (
        <button
          type="button"
          className="font-semibold text-accent underline-offset-2 hover:underline"
          onClick={() => onOpenLocus(target.workId, target.locusId)}
        >
          {label}
        </button>
      );
    }
    if (target.kind === "work") {
      return (
        <button
          type="button"
          className="font-semibold text-accent underline-offset-2 hover:underline"
          onClick={() => onOpenWork?.(target.catalogOrWorkId)}
        >
          {label}
        </button>
      );
    }
    return (
      <a
        href={target.href}
        target="_blank"
        rel="noreferrer"
        className="font-semibold text-accent underline-offset-2 hover:underline"
      >
        {label}
      </a>
    );
  }

  return (
    <div className={className ?? "space-y-3 text-sm leading-relaxed"}>
      {paragraphs.map((block, bi) => {
        const lines = block.split("\n");
        const isList = lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l));
        if (isList) {
          return (
            <ul key={bi} className="list-disc space-y-1 pl-5 text-muted">
              {lines.map((line, li) => {
                const body = line.replace(/^\s*([-*]|\d+\.)\s+/, "");
                return (
                  <li key={li} className="text-text">
                    {renderInline(body, `${bi}-${li}`, linkNode)}
                  </li>
                );
              })}
            </ul>
          );
        }
        return (
          <p key={bi}>
            {lines.map((line, li) => (
              <span key={li}>
                {li > 0 ? <br /> : null}
                {renderInline(line, `${bi}-${li}`, linkNode)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
