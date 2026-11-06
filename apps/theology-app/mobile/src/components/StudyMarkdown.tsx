import type { ReactNode } from "react";
import { Linking, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { Touchable } from "./ui/Touchable";

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
        <Text key={key} style={{ fontFamily: "Figtree_600SemiBold" }}>
          {token.slice(2, -2)}
        </Text>,
      );
    } else if (token.startsWith("*")) {
      nodes.push(
        <Text key={key} style={{ fontFamily: "SourceSerif4_400Regular_Italic" }}>
          {token.slice(1, -1)}
        </Text>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <Text
          key={key}
          style={{
            fontFamily: "Figtree_400Regular",
            backgroundColor: colors.bgElevated,
            fontSize: 13,
          }}
        >
          {token.slice(1, -1)}
        </Text>,
      );
    } else {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        nodes.push(<Text key={key}>{onLink(linkMatch[2], linkMatch[1])}</Text>);
      }
    }
    last = m.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function StudyMarkdown({ text, onOpenLocus, onOpenWork }: StudyMarkdownProps) {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());

  function linkNode(href: string, label: string) {
    const target = parseStudydeskHref(href);
    if (target.kind === "locus") {
      return (
        <Touchable
          variant="ghost"
          onPress={() => onOpenLocus(target.workId, target.locusId)}
          style={{ alignSelf: "flex-start" }}
        >
          <Text style={{ color: colors.accent, fontFamily: "Figtree_600SemiBold", textDecorationLine: "underline" }}>
            {label}
          </Text>
        </Touchable>
      );
    }
    if (target.kind === "work") {
      return (
        <Touchable
          variant="ghost"
          onPress={() => onOpenWork?.(target.catalogOrWorkId)}
          style={{ alignSelf: "flex-start" }}
        >
          <Text style={{ color: colors.accent, fontFamily: "Figtree_600SemiBold", textDecorationLine: "underline" }}>
            {label}
          </Text>
        </Touchable>
      );
    }
    return (
      <Touchable
        variant="ghost"
        onPress={() => void Linking.openURL(target.href).catch(() => undefined)}
        style={{ alignSelf: "flex-start" }}
      >
        <Text style={{ color: colors.accent, fontFamily: "Figtree_600SemiBold", textDecorationLine: "underline" }}>
          {label}
        </Text>
      </Touchable>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {paragraphs.map((block, bi) => {
        const lines = block.split("\n");
        const isList = lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l));
        if (isList) {
          return (
            <View key={bi} style={{ paddingLeft: 16, gap: 4 }}>
              {lines.map((line, li) => {
                const body = line.replace(/^\s*([-*]|\d+\.)\s+/, "");
                return (
                  <View key={li} style={{ flexDirection: "row", gap: 6 }}>
                    <Text style={{ color: colors.muted }}>•</Text>
                    <Text style={{ color: colors.text, flex: 1, fontSize: 14, lineHeight: 20 }}>
                      {renderInline(body, `${bi}-${li}`, linkNode)}
                    </Text>
                  </View>
                );
              })}
            </View>
          );
        }
        return (
          <Text key={bi} style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>
            {lines.map((line, li) => (
              <Text key={li}>
                {li > 0 ? "\n" : ""}
                {renderInline(line, `${bi}-${li}`, linkNode)}
              </Text>
            ))}
          </Text>
        );
      })}
    </View>
  );
}
