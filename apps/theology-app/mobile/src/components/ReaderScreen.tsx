import { memo, useCallback, useMemo } from "react";
import { FlatList, Text, View, type ListRenderItemInfo } from "react-native";
import { PARAGRAPHS, sectionTitle } from "../lib/mockData";
import type { Bookmark, Highlight, Paragraph } from "../lib/types";
import { useEvent } from "../lib/useEvent";
import { colors } from "../theme/colors";
import { HighlightBlock } from "./ui/HighlightBlock";
import { Touchable } from "./ui/Touchable";

const keyExtractor = (p: Paragraph) => p.id;

const PARAGRAPH_STYLE = {
  paddingHorizontal: 8,
  paddingVertical: 8,
  marginBottom: 8,
} as const;

const BOOKMARK_STYLE = {
  textDecorationLine: "underline",
  textDecorationColor: colors.accent,
} as const;

/** Memoized so highlighting one paragraph does not re-render the whole section. */
const ParagraphRow = memo(function ParagraphRow({
  paragraph,
  highlighted,
  bookmarked,
  textSize,
  onToggle,
}: {
  paragraph: Paragraph;
  highlighted: boolean;
  bookmarked: boolean;
  textSize: number;
  onToggle: (paragraphId: string) => void;
}) {
  const handlePress = useCallback(
    () => onToggle(paragraph.id),
    [onToggle, paragraph.id],
  );

  return (
    <HighlightBlock
      highlighted={highlighted}
      onPress={handlePress}
      radius={12}
      style={PARAGRAPH_STYLE}
    >
      <Text
        style={{
          color: colors.text,
          fontSize: 16 * textSize,
          lineHeight: 28 * textSize,
          fontFamily: "SourceSerif4_400Regular",
        }}
      >
        <Text style={{ color: colors.muted, fontSize: 12 * textSize }}>{paragraph.label} </Text>
        <Text style={bookmarked ? BOOKMARK_STYLE : undefined}>{paragraph.text}</Text>
      </Text>
    </HighlightBlock>
  );
});

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
  const hlSet = useMemo(
    () => new Set(highlights.filter((h) => h.workId === workId).map((h) => h.paragraphId)),
    [highlights, workId],
  );
  const bmSet = useMemo(
    () => new Set(bookmarks.filter((b) => b.workId === workId).map((b) => b.paragraphId)),
    [bookmarks, workId],
  );
  const selectedParas = paragraphs.filter((p) => hlSet.has(p.id));

  const toggleHighlight = useEvent(onToggleHighlight);
  const renderItem = useCallback(
    ({ item: p }: ListRenderItemInfo<Paragraph>) => (
      <ParagraphRow
        paragraph={p}
        highlighted={hlSet.has(p.id)}
        bookmarked={bmSet.has(p.id)}
        textSize={textSize}
        onToggle={toggleHighlight}
      />
    ),
    [hlSet, bmSet, textSize, toggleHighlight],
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
        <Touchable
          variant="ghost"
          onPress={onBack}
          style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginLeft: -6 }}
        >
          <Text style={{ color: colors.accent, fontSize: 14 }}>← Back</Text>
        </Touchable>
        <Text
          style={{ color: colors.text, fontSize: 17, fontFamily: "Fraunces_600SemiBold", flex: 1 }}
          numberOfLines={1}
        >
          {sectionTitle(workId, sectionId)}
        </Text>
      </View>

      <FlatList
        data={paragraphs}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        extraData={renderItem}
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
            <Touchable
              variant="chip"
              onPress={() => onCopyToNotes(selectedParas)}
              style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
            >
              <Text style={{ color: colors.text, fontSize: 14 }}>Add note</Text>
            </Touchable>
            <Touchable
              variant="chip"
              onPress={() => onAskSplit(selectedParas)}
              style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
            >
              <Text style={{ color: colors.text, fontSize: 14 }}>Ask AI</Text>
            </Touchable>
            <Touchable
              variant="chip"
              onPress={() => onBookmark(selectedParas)}
              style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
            >
              <Text style={{ color: colors.text, fontSize: 14 }}>Bookmark</Text>
            </Touchable>
          </View>
        </View>
      )}
    </View>
  );
}
