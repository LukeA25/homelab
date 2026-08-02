import { FlatList, Pressable, Text, View, type ListRenderItemInfo } from "react-native";
import { PARAGRAPHS, sectionTitle } from "../lib/mockData";
import type { Bookmark, Highlight, Paragraph } from "../lib/types";
import { colors } from "../theme/colors";

type ReaderScreenProps = {
  workId: string;
  sectionId: string;
  highlights: Highlight[];
  bookmarks: Bookmark[];
  onBack: () => void;
  onToggleHighlight: (paragraphId: string) => void;
  onBookmark: (paragraphs: Paragraph[]) => void;
  onAskSplit: (paragraphs: Paragraph[]) => void;
  onCopyToNotes: (paragraphs: Paragraph[]) => void;
  textSize: number;
};

export function ReaderScreen({
  workId,
  sectionId,
  highlights,
  bookmarks,
  onBack,
  onToggleHighlight,
  onBookmark,
  onAskSplit,
  onCopyToNotes,
  textSize,
}: ReaderScreenProps) {
  const paragraphs = PARAGRAPHS[sectionId] ?? [];
  const hlSet = new Set(
    highlights.filter((h) => h.workId === workId).map((h) => h.paragraphId),
  );
  const bmSet = new Set(
    bookmarks.filter((b) => b.workId === workId).map((b) => b.paragraphId),
  );
  const selectedParas = paragraphs.filter((p) => hlSet.has(p.id));

  function renderItem({ item: p }: ListRenderItemInfo<Paragraph>) {
    const highlighted = hlSet.has(p.id);
    const bookmarked = bmSet.has(p.id);
    return (
      <Pressable
        onPress={() => onToggleHighlight(p.id)}
        style={{
          borderRadius: 12,
          paddingHorizontal: 8,
          paddingVertical: 8,
          backgroundColor: highlighted ? colors.accentSoft : "transparent",
          marginBottom: 8,
        }}
      >
        <Text
          style={{
            color: colors.text,
            fontSize: 16 * textSize,
            lineHeight: 28 * textSize,
            fontFamily: "SourceSerif4_400Regular",
          }}
        >
          <Text style={{ color: colors.muted, fontSize: 12 * textSize }}>
            {p.label}{" "}
          </Text>
          <Text
            style={
              bookmarked
                ? { textDecorationLine: "underline", textDecorationColor: colors.accent }
                : undefined
            }
          >
            {p.text}
          </Text>
        </Text>
      </Pressable>
    );
  }

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
        <Pressable onPress={onBack}>
          <Text style={{ color: colors.accent, fontSize: 14 }}>← Back</Text>
        </Pressable>
        <Text
          style={{ color: colors.text, fontSize: 17, fontFamily: "Fraunces_600SemiBold", flex: 1 }}
          numberOfLines={1}
        >
          {sectionTitle(workId, sectionId)}
        </Text>
      </View>

      <FlatList
        data={paragraphs}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 120 }}
      />

      {selectedParas.length > 0 && (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: 12,
            alignItems: "center",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              gap: 4,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.bgElevated,
              paddingHorizontal: 8,
              paddingVertical: 8,
            }}
          >
            <Pressable onPress={() => onCopyToNotes(selectedParas)} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ color: colors.text, fontSize: 14 }}>Add note</Text>
            </Pressable>
            <Pressable onPress={() => onAskSplit(selectedParas)} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ color: colors.text, fontSize: 14 }}>Ask AI</Text>
            </Pressable>
            <Pressable onPress={() => onBookmark(selectedParas)} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ color: colors.text, fontSize: 14 }}>Bookmark</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
