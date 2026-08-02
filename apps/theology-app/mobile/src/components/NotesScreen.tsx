import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Heading, Link2, MessageSquare, Quote, Type } from "lucide-react-native";
import {
  FlatList,
  InputAccessoryView,
  Keyboard,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextStyle,
} from "react-native";
import type { NoteDoc, NoteSection } from "../lib/types";
import { colors } from "../theme/colors";
import { Touchable } from "./ui/Touchable";

type LineFormat = "text" | "header" | "quote" | "comment" | "link";

const ACCESSORY_ID = "study-desk-note-toolbar";
const LINK_SCHEME = "studydesk://";
const LINK_WORK_ID = "bible-rsvce";

type NotesScreenProps = {
  docs: NoteDoc[];
  openDocId: string | null;
  sectionFilter: NoteSection | "all";
  clipboardHint?: string | null;
  onSectionFilter: (s: NoteSection | "all") => void;
  onOpenDoc: (id: string | null) => void;
  onCreateDoc: (section: NoteSection) => void;
  onUpdateDoc: (doc: NoteDoc) => void;
  onOpenLocus: (workId: string, locusId: string) => void;
};

export function NotesScreen({
  docs,
  openDocId,
  sectionFilter,
  clipboardHint,
  onSectionFilter,
  onOpenDoc,
  onCreateDoc,
  onUpdateDoc,
  onOpenLocus,
}: NotesScreenProps) {
  const open = docs.find((d) => d.id === openDocId) ?? null;
  const filtered =
    sectionFilter === "all" ? docs : docs.filter((d) => d.section === sectionFilter);

  if (open) {
    return (
      <NoteEditor
        doc={open}
        onBack={() => onOpenDoc(null)}
        onUpdate={onUpdateDoc}
        onOpenLocus={onOpenLocus}
        clipboardHint={clipboardHint}
      />
    );
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      data={filtered}
      keyExtractor={(d) => d.id}
      ListHeaderComponent={
        <View style={{ marginBottom: 16 }}>
          <View
            style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}
          >
            <View>
              <Text style={{ color: colors.text, fontSize: 28, fontFamily: "Fraunces_600SemiBold" }}>
                Notes
              </Text>
              <Text style={{ color: colors.muted, fontSize: 14, marginTop: 4 }}>
                Live-formatted text notes.
              </Text>
            </View>
            <Touchable
              variant="primary"
              onPress={() =>
                onCreateDoc(sectionFilter === "apologetics" ? "apologetics" : "personal")
              }
              style={{
                borderRadius: 999,
                backgroundColor: colors.accent,
                paddingHorizontal: 14,
                paddingVertical: 9,
              }}
            >
              <Text style={{ color: colors.bg, fontFamily: "Figtree_600SemiBold", fontSize: 14 }}>
                New
              </Text>
            </Touchable>
          </View>

          {clipboardHint ? (
            <View
              style={{
                marginTop: 16,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.accent,
                backgroundColor: colors.accentSoft,
                padding: 16,
              }}
            >
              <Text style={{ color: colors.accent, fontFamily: "Figtree_500Medium" }}>
                Copied reference
              </Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>{clipboardHint}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>
                Open a note, place the cursor on a line, tap Link.
              </Text>
            </View>
          ) : null}

          <View
            style={{
              marginTop: 20,
              flexDirection: "row",
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.bgElevated,
              padding: 4,
            }}
          >
            {(
              [
                ["all", "All"],
                ["personal", "Personal"],
                ["apologetics", "Apologetics"],
              ] as const
            ).map(([id, label]) => (
              <Touchable
                key={id}
                variant={sectionFilter === id ? "primary" : "chip"}
                onPress={() => onSectionFilter(id)}
                style={{
                  flex: 1,
                  borderRadius: 999,
                  paddingVertical: 9,
                  alignItems: "center",
                  backgroundColor: sectionFilter === id ? colors.accent : "transparent",
                }}
              >
                <Text
                  style={{
                    color: sectionFilter === id ? colors.bg : colors.muted,
                    fontSize: 13,
                    fontFamily: "Figtree_600SemiBold",
                  }}
                >
                  {label}
                </Text>
              </Touchable>
            ))}
          </View>
        </View>
      }
      renderItem={({ item: d }) => (
        <Touchable
          variant="card"
          onPress={() => onOpenDoc(d.id)}
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            padding: 16,
            marginBottom: 8,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 18, fontFamily: "Fraunces_600SemiBold" }}>
            {d.title}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 14, marginTop: 4 }} numberOfLines={2}>
            {previewPlain(d.body) || "Empty note"}
          </Text>
          <Text
            style={{
              color: colors.muted,
              fontSize: 11,
              fontFamily: "Figtree_600SemiBold",
              letterSpacing: 1,
              textTransform: "uppercase",
              marginTop: 8,
            }}
          >
            {d.section}
          </Text>
        </Touchable>
      )}
    />
  );
}

function NoteEditor({
  doc,
  onBack,
  onUpdate,
  onOpenLocus,
  clipboardHint,
}: {
  doc: NoteDoc;
  onBack: () => void;
  onUpdate: (doc: NoteDoc) => void;
  onOpenLocus: (workId: string, locusId: string) => void;
  clipboardHint?: string | null;
}) {
  const [text, setText] = useState(doc.body);
  const [caret, setCaret] = useState(0);
  // Applied for a single render after a programmatic edit, then released so the
  // user keeps free control of the caret while typing.
  const [pendingSelection, setPendingSelection] = useState<{ start: number; end: number } | null>(
    null,
  );
  const inputRef = useRef<TextInput>(null);
  const loadedDocId = useRef(doc.id);

  useEffect(() => {
    if (loadedDocId.current === doc.id) return;
    loadedDocId.current = doc.id;
    setText(doc.body);
    setCaret(0);
  }, [doc.id, doc.body]);

  useEffect(() => {
    if (text === doc.body) return;
    onUpdate({ ...doc, body: text, updatedAt: new Date().toISOString() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  useEffect(() => {
    if (!pendingSelection) return;
    const id = requestAnimationFrame(() => setPendingSelection(null));
    return () => cancelAnimationFrame(id);
  }, [pendingSelection]);

  const segments = useMemo(() => buildSegments(text), [text]);
  const currentLine = useMemo(() => readLine(text, caret), [text, caret]);

  const applyFormat = useCallback(
    (format: LineFormat) => {
      const { start, end, line } = lineRangeAt(text, caret);
      const parsed = parseLine(line);
      // Tapping the active format clears it back to plain body text.
      const target = parsed.format === format ? "text" : format;

      let replacement: string;
      if (target === "link") {
        const ref = (clipboardHint?.split(";")[0] ?? "").trim();
        const label = parsed.content.trim() || ref;
        if (!label) return;
        replacement = `[${label}](${LINK_SCHEME}${ref || label})`;
      } else {
        replacement = applyMarker(target, parsed.content);
      }

      const next = text.slice(0, start) + replacement + text.slice(end);
      const delta = replacement.length - line.length;
      const nextCaret = Math.max(start, Math.min(caret + delta, start + replacement.length));
      setText(next);
      setCaret(nextCaret);
      setPendingSelection({ start: nextCaret, end: nextCaret });
    },
    [text, caret, clipboardHint],
  );

  const toolbar = (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.bgElevated,
      }}
    >
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 8,
          alignItems: "center",
        }}
      >
        {(
          [
            ["text", Type, "Text"],
            ["header", Heading, "Heading"],
            ["quote", Quote, "Quote"],
            ["comment", MessageSquare, "Comment"],
            ["link", Link2, "Link"],
          ] as const
        ).map(([fmt, Icon, label]) => {
          const on = currentLine.format === fmt;
          return (
            <Touchable
              key={fmt}
              variant={on ? "primary" : "chip"}
              onPress={() => applyFormat(fmt)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: on ? colors.accent : colors.border,
                paddingHorizontal: 12,
                paddingVertical: 8,
                backgroundColor: on ? colors.accent : "transparent",
              }}
            >
              <Icon color={on ? colors.bg : colors.accent} size={14} />
              <Text
                style={{
                  color: on ? colors.bg : colors.text,
                  fontSize: 12,
                  fontFamily: "Figtree_600SemiBold",
                }}
              >
                {label}
              </Text>
            </Touchable>
          );
        })}

        {currentLine.format === "link" && currentLine.href ? (
          <Touchable
            variant="ghost"
            onPress={() => onOpenLocus(LINK_WORK_ID, currentLine.href as string)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.accent,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <ExternalLink color={colors.accent} size={14} />
            <Text
              style={{ color: colors.accent, fontSize: 12, fontFamily: "Figtree_600SemiBold" }}
            >
              Open
            </Text>
          </Touchable>
        ) : null}
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <Touchable
          variant="ghost"
          onPress={() => {
            Keyboard.dismiss();
            onBack();
          }}
          style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}
        >
          <Text style={{ color: colors.accent, fontSize: 14 }}>← Notes</Text>
        </Touchable>
        <TextInput
          value={doc.title}
          onChangeText={(title) => onUpdate({ ...doc, title, updatedAt: new Date().toISOString() })}
          style={{
            flex: 1,
            color: colors.text,
            fontSize: 18,
            fontFamily: "Fraunces_600SemiBold",
            paddingVertical: 4,
          }}
          placeholder="Untitled"
          placeholderTextColor={colors.muted}
        />
      </View>

      <TextInput
        ref={inputRef}
        multiline
        // Children carry the live styling, so `value` is intentionally omitted:
        // React Native treats nested <Text> as the input's content.
        onChangeText={setText}
        onSelectionChange={(e) => setCaret(e.nativeEvent.selection.start)}
        // Only attach selection when we programmatically move the caret.
        // Passing `selection={undefined}` every render can desync the native field.
        {...(pendingSelection ? { selection: pendingSelection } : null)}
        inputAccessoryViewID={Platform.OS === "ios" ? ACCESSORY_ID : undefined}
        keyboardAppearance="dark"
        scrollEnabled
        textAlignVertical="top"
        placeholder="Start writing…"
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        style={{
          flex: 1,
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 24,
          color: colors.text,
          fontSize: 17,
          lineHeight: 27,
          fontFamily: "SourceSerif4_400Regular",
        }}
      >
        {/* One parent Text — sibling Text children inside TextInput often
            drop custom fonts / styles on iOS and look like content "didn't load". */}
        <Text style={BODY}>
          {segments.length === 0
            ? ""
            : segments.map((seg) => (
                <Text key={seg.key} style={seg.style}>
                  {seg.text}
                </Text>
              ))}
        </Text>
      </TextInput>

      {Platform.OS === "ios" ? (
        <InputAccessoryView nativeID={ACCESSORY_ID}>{toolbar}</InputAccessoryView>
      ) : (
        toolbar
      )}
    </View>
  );
}

/* ---------- line parsing ---------- */

type ParsedLine = { format: LineFormat; content: string; href?: string };

const LINK_RE = /^\[([^\]]*)\]\(studydesk:\/\/([^)]*)\)$/;

function parseLine(line: string): ParsedLine {
  const link = line.match(LINK_RE);
  if (link) return { format: "link", content: link[1], href: link[2] };

  const header = line.match(/^#\s+(.*)$/);
  if (header) return { format: "header", content: header[1] };

  const quote = line.match(/^>\s+(.*)$/);
  if (quote) return { format: "quote", content: quote[1] };

  const comment = line.match(/^\/\/\s+(.*)$/);
  if (comment) return { format: "comment", content: comment[1] };

  return { format: "text", content: line };
}

function applyMarker(format: Exclude<LineFormat, "link">, content: string): string {
  if (format === "header") return `# ${content}`;
  if (format === "quote") return `> ${content}`;
  if (format === "comment") return `// ${content}`;
  return content;
}

function lineRangeAt(text: string, pos: number) {
  const clamped = Math.max(0, Math.min(pos, text.length));
  const start = text.lastIndexOf("\n", clamped - 1) + 1;
  const nl = text.indexOf("\n", clamped);
  const end = nl === -1 ? text.length : nl;
  return { start, end, line: text.slice(start, end) };
}

function readLine(text: string, pos: number): ParsedLine {
  return parseLine(lineRangeAt(text, pos).line);
}

/* ---------- live styling ---------- */

type Segment = { key: string; text: string; style: TextStyle };

const BODY: TextStyle = {
  color: colors.text,
  fontSize: 17,
  fontFamily: "SourceSerif4_400Regular",
};

const MARKER: TextStyle = { color: colors.syntax, fontSize: 14 };

const STYLES: Record<LineFormat, TextStyle> = {
  text: BODY,
  header: { color: colors.text, fontSize: 24, fontFamily: "Fraunces_600SemiBold" },
  quote: {
    color: colors.muted,
    fontSize: 17,
    fontFamily: "SourceSerif4_400Regular_Italic",
  },
  comment: { color: colors.muted, fontSize: 15, fontFamily: "Figtree_500Medium" },
  link: { color: colors.accent, fontSize: 17, fontFamily: "Figtree_600SemiBold" },
};

/**
 * Split the document into styled runs. The concatenation of every segment's text
 * must equal the raw document exactly, otherwise the input's value would drift
 * from what the user typed — so markers are dimmed rather than removed.
 */
function buildSegments(text: string): Segment[] {
  const out: Segment[] = [];
  const lines = text.split("\n");

  lines.forEach((line, i) => {
    if (i > 0) out.push({ key: `nl-${i}`, text: "\n", style: BODY });
    if (!line) return;

    const link = line.match(LINK_RE);
    if (link) {
      const label = link[1];
      const href = link[2];
      out.push({ key: `l${i}-o`, text: "[", style: MARKER });
      out.push({ key: `l${i}-t`, text: label, style: STYLES.link });
      out.push({ key: `l${i}-c`, text: `](${LINK_SCHEME}${href})`, style: MARKER });
      return;
    }

    const marked = line.match(/^(#\s+|>\s+|\/\/\s+)(.*)$/);
    if (marked) {
      const marker = marked[1];
      const rest = marked[2];
      const format: LineFormat = marker.startsWith("#")
        ? "header"
        : marker.startsWith(">")
          ? "quote"
          : "comment";
      out.push({ key: `l${i}-m`, text: marker, style: MARKER });
      out.push({ key: `l${i}-t`, text: rest, style: STYLES[format] });
      return;
    }

    out.push({ key: `l${i}-t`, text: line, style: BODY });
  });

  return out;
}

function previewPlain(body: string): string {
  return body
    .split("\n")
    .map((line) => parseLine(line).content)
    .filter(Boolean)
    .join(" · ");
}
