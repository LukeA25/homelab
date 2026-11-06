import { Text, View } from "react-native";
import { parseLine, splitInlineMarks } from "../lib/notesFormat";
import { colors } from "../theme/colors";

type NotesBodyViewProps = {
  body: string;
  onOpenHref?: (href: string) => void;
  /** When true, use accent-on-dark text (user bubble). */
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
  const textColor = inverted ? colors.bg : colors.text;
  const mutedColor = inverted ? "rgba(11,13,16,0.65)" : colors.muted;
  const chat = variant === "chat";

  return (
    <View style={chat ? undefined : { gap: 6 }}>
      {lines.map((raw, idx) => {
        const parsed = parseLine(raw);
        if (parsed.format === "ref") {
          return (
            <View
              key={idx}
              style={{
                alignItems: "flex-end",
                paddingTop: chat ? 4 : 2,
                paddingBottom: chat ? 2 : 2,
              }}
            >
              <Text
                onPress={() => parsed.href && onOpenHref?.(parsed.href)}
                style={{
                  color: inverted ? colors.bg : colors.accent,
                  fontSize: 13,
                  fontFamily: "Figtree_600SemiBold",
                  textDecorationLine: "underline",
                  textAlign: "right",
                }}
              >
                <Text style={{ color: mutedColor, textDecorationLine: "none" }}>— </Text>
                {parsed.content || parsed.href || "Reference"}
              </Text>
            </View>
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

        const marginTop = !chat
          ? 0
          : isSubtitle
            ? idx === 0
              ? 0
              : 14
            : isHeader
              ? idx === 0
                ? 0
                : 8
              : isBullet || isCheck
                ? prevWasBullet
                  ? 2
                  : 8
                : isQuote
                  ? 8
                  : idx === 0
                    ? 0
                    : 6;

        const baseStyle = {
          color: isDone ? mutedColor : textColor,
          fontSize: isHeader ? 18 : isSubtitle ? (chat ? 15 : 16) : chat ? 14 : 15,
          lineHeight: isHeader ? 24 : isSubtitle ? (chat ? 21 : 22) : chat ? 22 : 22,
          fontFamily: isHeader || isSubtitle
            ? ("Fraunces_600SemiBold" as const)
            : isQuote
              ? ("SourceSerif4_400Regular_Italic" as const)
              : chat
                ? ("Figtree_400Regular" as const)
                : ("SourceSerif4_400Regular" as const),
          textDecorationLine: (isDone ? "line-through" : "none") as "line-through" | "none",
        };

        const content = (
          <Text style={baseStyle}>
            {splitInlineMarks(parsed.content).map((part, i) => {
              if (part.kind === "text") return <Text key={i}>{part.text}</Text>;
              if (part.kind === "bold")
                return (
                  <Text key={i} style={{ fontFamily: "Figtree_600SemiBold" }}>
                    {part.text}
                  </Text>
                );
              if (part.kind === "italic")
                return (
                  <Text key={i} style={{ fontFamily: "SourceSerif4_400Regular_Italic" }}>
                    {part.text}
                  </Text>
                );
              return (
                <Text
                  key={i}
                  onPress={() => onOpenHref?.(part.href)}
                  style={{
                    color: inverted ? colors.bg : colors.accent,
                    fontFamily: "Figtree_600SemiBold",
                    textDecorationLine: "underline",
                  }}
                >
                  {part.text}
                </Text>
              );
            })}
          </Text>
        );

        if (isQuote) {
          return (
            <View
              key={idx}
              style={{
                marginTop: chat ? marginTop : undefined,
                flexDirection: "row",
                borderLeftWidth: 3,
                borderLeftColor: inverted ? colors.bg : colors.accent,
                backgroundColor: inverted ? "rgba(11,13,16,0.08)" : colors.accentSoft,
                borderRadius: 6,
                paddingVertical: 6,
                paddingHorizontal: 10,
              }}
            >
              <View style={{ flex: 1 }}>{content}</View>
            </View>
          );
        }

        return (
          <View
            key={idx}
            style={{
              marginTop: chat ? marginTop : undefined,
              flexDirection: "row",
              gap: chat ? 8 : 6,
              alignItems: "flex-start",
            }}
          >
            {isBullet ? (
              <Text
                style={{
                  color: inverted ? colors.bg : colors.accent,
                  fontSize: chat ? 14 : 15,
                  lineHeight: chat ? 22 : undefined,
                  fontFamily: chat ? "Figtree_600SemiBold" : undefined,
                }}
              >
                •
              </Text>
            ) : null}
            {isCheck ? (
              <Text
                style={{
                  color: inverted ? colors.bg : colors.accent,
                  fontSize: 14,
                  lineHeight: chat ? 22 : undefined,
                }}
              >
                {isDone ? "☑" : "☐"}
              </Text>
            ) : null}
            <View style={{ flex: 1 }}>{content}</View>
          </View>
        );
      })}
    </View>
  );
}
