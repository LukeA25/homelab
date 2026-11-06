import { parseLine, splitInlineMarks } from "../lib/notesFormat";

type NotesBodyViewProps = {
  body: string;
  onOpenHref?: (href: string) => void;
  inverted?: boolean;
  /** `chat` = ChatGPT-like scannable layout; default keeps note-reader styling. */
  variant?: "note" | "chat";
};

/** Render notes-dialect body (headers, quotes, refs, bold/italic, links). */
export function NotesBodyView({
  body,
  onOpenHref,
  inverted,
  variant = "note",
}: NotesBodyViewProps) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const chat = variant === "chat";

  return (
    <div
      className={`text-sm leading-relaxed ${inverted ? "text-bg" : "text-text"} ${
        chat ? "" : "space-y-1.5"
      }`}
    >
      {lines.map((raw, idx) => {
        const parsed = parseLine(raw);
        if (parsed.format === "ref") {
          return (
            <div key={idx} className={chat ? "mt-1 text-right" : "text-right"}>
              <button
                type="button"
                onClick={() => parsed.href && onOpenHref?.(parsed.href)}
                className={`text-sm font-semibold underline underline-offset-2 ${
                  inverted ? "text-bg" : "text-accent"
                }`}
              >
                <span className={`mr-1 no-underline ${inverted ? "opacity-60" : "text-muted"}`}>
                  —
                </span>
                {parsed.content || parsed.href || "Reference"}
              </button>
            </div>
          );
        }

        const isQuote = parsed.format === "quote";
        const isHeader = parsed.format === "header";
        const isSubtitle = parsed.format === "subtitle";
        const isBullet = parsed.format === "bullet";
        const isCheck = parsed.format === "check" || parsed.format === "checkDone";
        const isDone = parsed.format === "checkDone";
        const prev = idx > 0 ? parseLine(lines[idx - 1]!) : null;
        const prevWasBullet =
          prev?.format === "bullet" ||
          prev?.format === "check" ||
          prev?.format === "checkDone";

        const textClass = [
          isHeader
            ? chat
              ? "font-display text-lg font-semibold tracking-tight"
              : "font-display text-lg font-semibold"
            : isSubtitle
              ? chat
                ? "font-display text-[15px] font-semibold tracking-tight"
                : "font-display text-base font-semibold"
              : chat
                ? "font-body text-[14px] leading-[1.55]"
                : "font-reader",
          isQuote ? (chat ? "italic font-reader" : "italic") : "",
          isDone ? "text-muted line-through" : "",
        ]
          .filter(Boolean)
          .join(" ");

        const blockClass = chat
          ? [
              isHeader ? "mt-1 mb-1" : "",
              isSubtitle ? (idx === 0 ? "mb-1.5" : "mt-3.5 mb-1.5") : "",
              !isHeader && !isSubtitle && !isBullet && !isCheck && !isQuote
                ? idx === 0
                  ? "mb-1.5"
                  : "mt-1.5 mb-1.5"
                : "",
              isBullet || isCheck ? (prevWasBullet ? "mt-0.5" : "mt-1.5") : "",
            ]
              .filter(Boolean)
              .join(" ")
          : "";

        const inline = splitInlineMarks(parsed.content).map((part, i) => {
          if (part.kind === "text") return <span key={i}>{part.text}</span>;
          if (part.kind === "bold")
            return (
              <strong key={i} className="font-semibold">
                {part.text}
              </strong>
            );
          if (part.kind === "italic")
            return (
              <em key={i} className="italic">
                {part.text}
              </em>
            );
          return (
            <button
              key={i}
              type="button"
              onClick={() => onOpenHref?.(part.href)}
              className={`font-semibold underline underline-offset-2 ${
                inverted ? "text-bg" : "text-accent"
              }`}
            >
              {part.text}
            </button>
          );
        });

        if (isQuote) {
          return (
            <blockquote
              key={idx}
              className={`rounded-r-lg border-l-4 py-2 pl-3 pr-2 ${
                chat ? "mt-2 mb-1" : ""
              } ${
                inverted
                  ? "border-bg/50 bg-bg/10"
                  : "border-accent bg-accent-soft/80"
              }`}
            >
              <div className={textClass}>{inline}</div>
            </blockquote>
          );
        }

        return (
          <div key={idx} className={`flex items-start gap-2 ${blockClass}`}>
            {isBullet ? (
              <span
                className={`shrink-0 font-semibold ${chat ? "mt-[2px] text-[14px]" : ""} ${
                  inverted ? "text-bg" : "text-accent"
                }`}
              >
                •
              </span>
            ) : null}
            {isCheck ? (
              <span className={`shrink-0 ${inverted ? "text-bg" : "text-accent"}`}>
                {isDone ? "☑" : "☐"}
              </span>
            ) : null}
            <div className={`min-w-0 flex-1 ${textClass}`}>{inline}</div>
          </div>
        );
      })}
    </div>
  );
}
