/** Shared note line / link helpers (markdown-ish). */

export type LineFormat =
  | "text"
  | "header"
  | "subtitle"
  | "quote"
  | "comment"
  | "bullet"
  | "check"
  | "checkDone"
  | "ref";

export type ParsedLine = {
  format: LineFormat;
  content: string;
  href?: string;
};

export const WIKI_LINK_RE = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/;
export const MD_LINK_RE = /^\[([^\]]*)\]\(studydesk:\/\/([^)]*)\)$/;
export const INLINE_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

/** Locus-like token (Mt.16.24) or wiki paste. */
export function isLocusRef(value: string): boolean {
  const v = value.trim();
  if (WIKI_LINK_RE.test(v)) return true;
  if (MD_LINK_RE.test(v)) return true;
  return /^[A-Za-z][A-Za-z0-9]*(\.\d+){1,3}$/.test(v);
}

export function normalizeHref(raw: string): { href: string; label?: string } {
  const v = raw.trim();
  const wiki = v.match(WIKI_LINK_RE);
  if (wiki) return { href: wiki[1].trim(), label: (wiki[2] ?? wiki[1]).trim() };
  const md = v.match(MD_LINK_RE);
  if (md) return { href: md[2].trim(), label: md[1].trim() };
  return { href: v };
}

export function parseLine(line: string): ParsedLine {
  // Models often nest bullets/quotes with leading spaces; dialect markers are column-0.
  const raw = line ?? "";
  const trimmed = raw.trimStart();
  // Citation: "— [[href|label]]" or "— [[href]]"
  const citeWiki = trimmed.match(/^—\s+\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
  if (citeWiki) {
    const href = citeWiki[1].trim();
    const label = (citeWiki[2] ?? citeWiki[1]).trim();
    return { format: "ref", content: label, href };
  }

  const wiki = trimmed.match(WIKI_LINK_RE);
  if (wiki) {
    const href = wiki[1].trim();
    const label = (wiki[2] ?? wiki[1]).trim();
    return { format: "ref", content: label, href };
  }
  const md = trimmed.match(MD_LINK_RE);
  if (md) return { format: "ref", content: md[1], href: md[2] };

  // ## subtitle before # header. ###+ also treated as subtitle (dialect only has two levels).
  const subtitle = trimmed.match(/^#{2,}\s+(.*)$/);
  if (subtitle) return { format: "subtitle", content: subtitle[1] };

  const header = trimmed.match(/^#\s+(.*)$/);
  if (header) return { format: "header", content: header[1] };

  const quote = trimmed.match(/^>\s+(.*)$/);
  if (quote) return { format: "quote", content: quote[1] };

  const comment = trimmed.match(/^\/\/\s+(.*)$/);
  if (comment) return { format: "comment", content: comment[1] };

  const checkDone = trimmed.match(/^-\s+\[x\]\s+(.*)$/i);
  if (checkDone) return { format: "checkDone", content: checkDone[1] };

  const check = trimmed.match(/^-\s+\[ \]\s+(.*)$/);
  if (check) return { format: "check", content: check[1] };

  const bullet = trimmed.match(/^-\s+(.*)$/);
  if (bullet) return { format: "bullet", content: bullet[1] };

  const numbered = trimmed.match(/^\d+\.\s+(.*)$/);
  if (numbered) return { format: "bullet", content: numbered[1] };

  // Preserve intentional leading spaces only for plain text if no marker matched.
  return { format: "text", content: trimmed.length ? trimmed : raw };
}

export function applyMarker(format: Exclude<LineFormat, "ref">, content: string): string {
  if (format === "header") return `# ${content}`;
  if (format === "subtitle") return `## ${content}`;
  if (format === "quote") return `> ${content}`;
  if (format === "comment") return `// ${content}`;
  if (format === "bullet") return `- ${content}`;
  if (format === "check") return `- [ ] ${content}`;
  if (format === "checkDone") return `- [x] ${content}`;
  return content;
}

export function serializeRef(href: string, label: string): string {
  const h = href.trim();
  const l = label.trim() || h;
  const wiki = l === h ? `[[${h}]]` : `[[${h}|${l}]]`;
  return `— ${wiki}`;
}

export function wrapAsInlineLink(text: string, href: string): string {
  const label = text.trim() || href.trim();
  return `[${label}](${href.trim()})`;
}

export function wrapBold(text: string): string {
  const t = text.trim() || "bold";
  return `**${t}**`;
}

export function wrapItalic(text: string): string {
  const t = text.trim() || "italic";
  return `*${t}*`;
}

export type InlinePart =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string };

/** Split inline links, **bold**, and *italic* / _italic_. */
export function splitInlineMarks(text: string): InlinePart[] {
  const out: InlinePart[] = [];
  // Links first priority, then **bold**, then *italic* or _italic_
  const re = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    if (m[1] != null && m[2] != null) {
      out.push({ kind: "link", text: m[1], href: m[2] });
    } else if (m[3] != null) {
      out.push({ kind: "bold", text: m[3] });
    } else if (m[4] != null) {
      out.push({ kind: "italic", text: m[4] });
    } else if (m[5] != null) {
      out.push({ kind: "italic", text: m[5] });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  if (!out.length) out.push({ kind: "text", text });
  return out;
}

/** @deprecated use splitInlineMarks */
export function splitInlineLinks(text: string): InlinePart[] {
  return splitInlineMarks(text);
}

export function previewPlain(body: string): string {
  return body
    .split("\n")
    .map((line) => parseLine(line).content)
    .filter(Boolean)
    .join(" · ");
}
