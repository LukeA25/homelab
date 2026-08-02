import { useEffect, useMemo, useRef, useState } from "react";
import { Heading, Link2, MessageSquare, Plus, Quote, Type } from "lucide-react-native";
import {
  FlatList,
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NoteDoc, NoteSection } from "../lib/types";
import { colors } from "../theme/colors";

type LineFormat = "text" | "header" | "quote" | "comment" | "link";

type EditorLine = {
  id: string;
  format: LineFormat;
  text: string;
  href?: string;
};

const ACCESSORY_ID = "study-desk-note-toolbar";

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
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
            <View>
              <Text style={{ color: colors.text, fontSize: 28, fontFamily: "Fraunces_600SemiBold" }}>
                Notes
              </Text>
              <Text style={{ color: colors.muted, fontSize: 14, marginTop: 4 }}>
                Live-formatted text notes.
              </Text>
            </View>
            <Pressable
              onPress={() =>
                onCreateDoc(sectionFilter === "apologetics" ? "apologetics" : "personal")
              }
              style={{
                borderRadius: 999,
                backgroundColor: colors.accent,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: colors.bg, fontFamily: "Figtree_600SemiBold", fontSize: 14 }}>
                New
              </Text>
            </Pressable>
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
                Open a note, select a line, tap Link.
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
              <Pressable
                key={id}
                onPress={() => onSectionFilter(id)}
                style={{
                  flex: 1,
                  borderRadius: 999,
                  paddingVertical: 8,
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
              </Pressable>
            ))}
          </View>
        </View>
      }
      renderItem={({ item: d }) => (
        <Pressable
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
        </Pressable>
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
  const [lines, setLines] = useState<EditorLine[]>(() => parseBody(doc.body));
  const [activeId, setActiveId] = useState<string | null>(null);
  const skipSync = useRef(false);

  useEffect(() => {
    setLines(parseBody(doc.body));
    setActiveId(null);
  }, [doc.id]);

  useEffect(() => {
    if (skipSync.current) {
      skipSync.current = false;
      return;
    }
    const body = serializeBody(lines);
    if (body === doc.body) return;
    onUpdate({ ...doc, body, updatedAt: new Date().toISOString() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines]);

  const active = useMemo(
    () => lines.find((l) => l.id === activeId) ?? null,
    [lines, activeId],
  );

  function patchTitle(title: string) {
    onUpdate({ ...doc, title, updatedAt: new Date().toISOString() });
  }

  function updateLine(id: string, partial: Partial<EditorLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...partial } : l)));
  }

  function applyFormat(format: LineFormat) {
    const id = activeId ?? lines[lines.length - 1]?.id;
    if (!id) return;
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        if (format === "link") {
          const label =
            clipboardHint?.split(";")[0]?.trim() || l.href || l.text || "";
          if (!label.trim()) return l;
          return { ...l, format: "link", text: label.trim(), href: label.trim() };
        }
        return { ...l, format, href: undefined };
      }),
    );
  }

  function addLineAfter(id: string) {
    const neu: EditorLine = { id: newLineId(), format: "text", text: "" };
    setLines((prev) => {
      const i = prev.findIndex((l) => l.id === id);
      if (i < 0) return [...prev, neu];
      const next = [...prev];
      next.splice(i + 1, 0, neu);
      return next;
    });
    setActiveId(neu.id);
  }

  function removeLine(id: string) {
    setLines((prev) => {
      if (prev.length <= 1) return [{ id: newLineId(), format: "text", text: "" }];
      return prev.filter((l) => l.id !== id);
    });
  }

  const toolbar = (
    <ScrollView
      horizontal
      keyboardShouldPersistTaps="always"
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 8,
        alignItems: "center",
      }}
      style={{
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.bgElevated,
      }}
    >
      {(
        [
          ["text", Type, "Text"],
          ["header", Heading, "Header"],
          ["quote", Quote, "Quote"],
          ["comment", MessageSquare, "Comment"],
          ["link", Link2, "Link"],
        ] as const
      ).map(([fmt, Icon, label]) => {
        const on = active?.format === fmt;
        return (
          <Pressable
            key={fmt}
            onPress={() => applyFormat(fmt)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              borderRadius: 999,
              paddingHorizontal: 10,
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
          </Pressable>
        );
      })}
    </ScrollView>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <Pressable
          onPress={() => {
            Keyboard.dismiss();
            onBack();
          }}
        >
          <Text style={{ color: colors.accent, fontSize: 14 }}>← Notes</Text>
        </Pressable>
        <TextInput
          value={doc.title}
          onChangeText={patchTitle}
          style={{
            flex: 1,
            color: colors.text,
            fontSize: 18,
            fontFamily: "Fraunces_600SemiBold",
          }}
          placeholder="Untitled"
          placeholderTextColor={colors.muted}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 4 }}
      >
        {lines.map((line) => (
          <LineRow
            key={line.id}
            line={line}
            active={activeId === line.id}
            onFocus={() => setActiveId(line.id)}
            onChangeText={(text) => updateLine(line.id, { text })}
            onEnter={() => addLineAfter(line.id)}
            onBackspaceEmpty={() => {
              removeLine(line.id);
              const idx = lines.findIndex((l) => l.id === line.id);
              const prev = lines[idx - 1];
              if (prev) setActiveId(prev.id);
            }}
            onOpenLink={() => {
              if (line.href) onOpenLocus("bible-rsvce", line.href);
            }}
          />
        ))}
        <Pressable
          onPress={() => {
            const neu: EditorLine = { id: newLineId(), format: "text", text: "" };
            setLines((prev) => [...prev, neu]);
            setActiveId(neu.id);
          }}
          style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}
        >
          <Plus color={colors.muted} size={16} />
          <Text style={{ color: colors.muted, fontSize: 14 }}>New line</Text>
        </Pressable>
      </ScrollView>

      {Platform.OS === "ios" ? (
        <InputAccessoryView nativeID={ACCESSORY_ID}>{toolbar}</InputAccessoryView>
      ) : (
        <View>{toolbar}</View>
      )}
    </View>
  );
}

function LineRow({
  line,
  active,
  onFocus,
  onChangeText,
  onEnter,
  onBackspaceEmpty,
  onOpenLink,
}: {
  line: EditorLine;
  active: boolean;
  onFocus: () => void;
  onChangeText: (text: string) => void;
  onEnter: () => void;
  onBackspaceEmpty: () => void;
  onOpenLink: () => void;
}) {
  const textStyle = (() => {
    if (line.format === "header") {
      return {
        color: colors.text,
        fontSize: 24,
        fontFamily: "Fraunces_600SemiBold" as const,
        lineHeight: 32,
      };
    }
    if (line.format === "quote") {
      return {
        color: colors.muted,
        fontSize: 16,
        fontFamily: "SourceSerif4_400Regular" as const,
        fontStyle: "italic" as const,
        borderLeftWidth: 2,
        borderLeftColor: colors.accent,
        paddingLeft: 12,
      };
    }
    if (line.format === "comment") {
      return {
        color: colors.muted,
        fontSize: 14,
        backgroundColor: colors.bgElevated,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
      };
    }
    if (line.format === "link") {
      return {
        color: colors.accent,
        fontSize: 16,
        fontFamily: "Figtree_600SemiBold" as const,
      };
    }
    return {
      color: colors.text,
      fontSize: 16,
      fontFamily: "SourceSerif4_400Regular" as const,
      lineHeight: 26,
    };
  })();

  return (
    <View
      style={{
        borderRadius: 12,
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderWidth: active ? 1 : 0,
        borderColor: colors.accent,
      }}
    >
      {line.format === "link" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable onPress={onOpenLink}>
            <Text style={{ color: colors.accent, fontSize: 12, fontFamily: "Figtree_600SemiBold" }}>
              Open
            </Text>
          </Pressable>
          <TextInput
            value={line.text}
            onFocus={onFocus}
            onChangeText={onChangeText}
            inputAccessoryViewID={Platform.OS === "ios" ? ACCESSORY_ID : undefined}
            onSubmitEditing={onEnter}
            blurOnSubmit={false}
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === "Backspace" && line.text === "") onBackspaceEmpty();
            }}
            placeholder="Reference label…"
            placeholderTextColor={colors.muted}
            style={[{ flex: 1, minHeight: 28, padding: 0 }, textStyle]}
          />
        </View>
      ) : (
        <TextInput
          value={line.text}
          onFocus={onFocus}
          onChangeText={onChangeText}
          inputAccessoryViewID={Platform.OS === "ios" ? ACCESSORY_ID : undefined}
          onSubmitEditing={onEnter}
          blurOnSubmit={false}
          multiline
          onKeyPress={({ nativeEvent }) => {
            if (nativeEvent.key === "Backspace" && line.text === "") onBackspaceEmpty();
          }}
          placeholder={
            line.format === "header"
              ? "Heading"
              : line.format === "quote"
                ? "Quote"
                : line.format === "comment"
                  ? "Comment"
                  : "Write…"
          }
          placeholderTextColor={colors.muted}
          style={[{ minHeight: 28, padding: 0 }, textStyle]}
        />
      )}
    </View>
  );
}

function newLineId() {
  return `ln-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function parseBody(body: string): EditorLine[] {
  const raw = body.replace(/\r\n/g, "\n");
  const parts = raw.length ? raw.split("\n") : [""];
  if (parts.length > 1 && parts[parts.length - 1] === "") parts.pop();
  if (parts.length === 0) parts.push("");
  return parts.map((line) => {
    const link = line.match(/^\[([^\]]+)\]\(studydesk:\/\/([^)]+)\)$/);
    if (link) {
      return { id: newLineId(), format: "link" as const, text: link[1], href: link[2] };
    }
    if (/^#\s+/.test(line)) {
      return { id: newLineId(), format: "header" as const, text: line.replace(/^#\s+/, "") };
    }
    if (/^>\s+/.test(line)) {
      return { id: newLineId(), format: "quote" as const, text: line.replace(/^>\s+/, "") };
    }
    if (/^\/\/\s+/.test(line)) {
      return { id: newLineId(), format: "comment" as const, text: line.replace(/^\/\/\s+/, "") };
    }
    return { id: newLineId(), format: "text" as const, text: line };
  });
}

function serializeBody(lines: EditorLine[]): string {
  return lines
    .map((l) => {
      if (l.format === "header") return `# ${l.text}`;
      if (l.format === "quote") return `> ${l.text}`;
      if (l.format === "comment") return `// ${l.text}`;
      if (l.format === "link") {
        const href = l.href || l.text;
        return `[${l.text || href}](studydesk://${href})`;
      }
      return l.text;
    })
    .join("\n");
}

function previewPlain(body: string): string {
  return parseBody(body)
    .map((l) => l.text)
    .filter(Boolean)
    .join(" · ");
}
