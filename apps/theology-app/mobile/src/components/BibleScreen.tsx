import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react-native";
import {
  FlatList,
  Pressable,
  Text,
  View,
  type ListRenderItemInfo,
} from "react-native";
import PagerView from "react-native-pager-view";
import {
  BIBLE_ID,
  PARAGRAPHS,
  SECTIONS,
  adjacentChapter,
  bibleChapters,
} from "../lib/mockData";
import type { Bookmark, Highlight, Paragraph } from "../lib/types";
import { colors } from "../theme/colors";
import { Sheet } from "./Sheet";

type BibleScreenProps = {
  sectionId: string;
  highlights: Highlight[];
  bookmarks: Bookmark[];
  onSectionChange: (sectionId: string) => void;
  onToggleHighlight: (paragraphId: string) => void;
  onBookmark: (paragraphs: Paragraph[]) => void;
  onAskSplit: (paragraphs: Paragraph[]) => void;
  onCopyToNotes: (paragraphs: Paragraph[]) => void;
  textSize: number;
};

export function BibleScreen({
  sectionId,
  highlights,
  bookmarks,
  onSectionChange,
  onToggleHighlight,
  onBookmark,
  onAskSplit,
  onCopyToNotes,
  textSize,
}: BibleScreenProps) {
  const chapters = useMemo(() => bibleChapters(), []);
  const pagerRef = useRef<PagerView>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const initialPage = Math.max(
    0,
    chapters.findIndex((c) => c.sectionId === sectionId),
  );

  useEffect(() => {
    const idx = chapters.findIndex((c) => c.sectionId === sectionId);
    if (idx >= 0) pagerRef.current?.setPageWithoutAnimation(idx);
  }, [sectionId, chapters]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={initialPage}
        onPageSelected={(e) => {
          const ch = chapters[e.nativeEvent.position];
          if (ch && ch.sectionId !== sectionId) onSectionChange(ch.sectionId);
        }}
      >
        {chapters.map((ch) => (
          <View key={ch.sectionId} style={{ flex: 1 }}>
            <ChapterPage
              sectionId={ch.sectionId}
              bookTitle={ch.bookTitle}
              chapterTitle={ch.chapterTitle}
              highlights={highlights}
              bookmarks={bookmarks}
              textSize={textSize}
              onOpenPicker={() => setPickerOpen(true)}
              onToggleHighlight={onToggleHighlight}
              onBookmark={onBookmark}
              onAskSplit={onAskSplit}
              onCopyToNotes={onCopyToNotes}
            />
          </View>
        ))}
      </PagerView>

      <BookPicker
        open={pickerOpen}
        currentSectionId={sectionId}
        onClose={() => setPickerOpen(false)}
        onPick={(id) => {
          onSectionChange(id);
          setPickerOpen(false);
        }}
      />
    </View>
  );
}

function ChapterPage({
  sectionId,
  bookTitle,
  chapterTitle,
  highlights,
  bookmarks,
  textSize,
  onOpenPicker,
  onToggleHighlight,
  onBookmark,
  onAskSplit,
  onCopyToNotes,
}: {
  sectionId: string;
  bookTitle: string;
  chapterTitle: string;
  highlights: Highlight[];
  bookmarks: Bookmark[];
  textSize: number;
  onOpenPicker: () => void;
  onToggleHighlight: (paragraphId: string) => void;
  onBookmark: (paragraphs: Paragraph[]) => void;
  onAskSplit: (paragraphs: Paragraph[]) => void;
  onCopyToNotes: (paragraphs: Paragraph[]) => void;
}) {
  const paragraphs = PARAGRAPHS[sectionId] ?? [];
  const hlSet = new Set(
    highlights.filter((h) => h.workId === BIBLE_ID).map((h) => h.paragraphId),
  );
  const bmSet = new Set(
    bookmarks.filter((b) => b.workId === BIBLE_ID).map((b) => b.paragraphId),
  );
  const selectedParas = paragraphs.filter((p) => hlSet.has(p.id));
  const prev = adjacentChapter(sectionId, -1);
  const next = adjacentChapter(sectionId, 1);

  function renderItem({ item: p }: ListRenderItemInfo<Paragraph>) {
    const highlighted = hlSet.has(p.id);
    const bookmarked = bmSet.has(p.id);
    return (
      <Pressable
        onPress={() => onToggleHighlight(p.id)}
        style={{
          marginBottom: 4,
          borderRadius: 8,
          paddingHorizontal: 8,
          paddingVertical: 6,
          backgroundColor: highlighted ? colors.accentSoft : "transparent",
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
          <Text style={{ color: colors.muted, fontSize: 12 * textSize, fontFamily: "Figtree_600SemiBold" }}>
            {p.verse ?? p.label}{" "}
          </Text>
          <Text
            style={
              bookmarked
                ? {
                    textDecorationLine: "underline",
                    textDecorationColor: colors.accent,
                  }
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
    <View style={{ flex: 1 }}>
      <View style={{ alignItems: "center", paddingVertical: 8, paddingHorizontal: 12 }}>
        <Pressable
          onPress={onOpenPicker}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            paddingHorizontal: 16,
            paddingVertical: 8,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 14, fontFamily: "Figtree_600SemiBold" }}>
            {chapterTitle}
          </Text>
          <ChevronDown color={colors.muted} size={16} />
        </Pressable>
      </View>

      <FlatList
        data={paragraphs}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120, paddingTop: 8 }}
        ListHeaderComponent={
          <Text
            style={{
              color: colors.muted,
              fontSize: 12,
              fontFamily: "Figtree_600SemiBold",
              letterSpacing: 2,
              textTransform: "uppercase",
              textAlign: "center",
              marginBottom: 20,
            }}
          >
            {bookTitle}
          </Text>
        }
        ListFooterComponent={
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 24 }}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {prev ? `← ${shortChapterLabel(prev.chapterTitle)}` : ""}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {next ? `${shortChapterLabel(next.chapterTitle)} →` : ""}
            </Text>
          </View>
        }
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
              alignItems: "center",
              gap: 4,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.bgElevated,
              paddingHorizontal: 8,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: colors.muted, fontSize: 12, paddingHorizontal: 8 }}>
              {selectedParas.length}
            </Text>
            <Action label="Add note" onPress={() => onCopyToNotes(selectedParas)} />
            <Action label="Ask AI" onPress={() => onAskSplit(selectedParas)} />
            <Action label="Bookmark" onPress={() => onBookmark(selectedParas)} />
          </View>
        </View>
      )}
    </View>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
      <Text style={{ color: colors.text, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

function shortChapterLabel(title: string) {
  return title.replace(/^(Psalm|John|Romans)\s+/, "");
}

function BookPicker({
  open,
  currentSectionId,
  onClose,
  onPick,
}: {
  open: boolean;
  currentSectionId: string;
  onClose: () => void;
  onPick: (sectionId: string) => void;
}) {
  const [bookId, setBookId] = useState<string | null>(null);
  const books = SECTIONS[BIBLE_ID] ?? [];

  useEffect(() => {
    if (!open) setBookId(null);
  }, [open]);

  return (
    <Sheet open={open} title="Choose chapter" onClose={onClose}>
      {!bookId ? (
        <View>
          {books.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => setBookId(b.id)}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 16 }}>{b.title}</Text>
              <Text style={{ color: colors.muted, fontSize: 14 }}>{b.children?.length ?? 0}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View>
          <Pressable onPress={() => setBookId(null)} style={{ marginBottom: 8 }}>
            <Text style={{ color: colors.accent, fontSize: 14 }}>← Books</Text>
          </Pressable>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(books.find((b) => b.id === bookId)?.children ?? []).map((ch) => {
              const on = ch.id === currentSectionId;
              return (
                <Pressable
                  key={ch.id}
                  onPress={() => onPick(ch.id)}
                  style={{
                    width: "22%",
                    borderRadius: 16,
                    paddingVertical: 12,
                    alignItems: "center",
                    backgroundColor: on ? colors.accent : colors.surface,
                    borderWidth: on ? 0 : 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text
                    style={{
                      color: on ? colors.bg : colors.text,
                      fontSize: 14,
                      fontFamily: "Figtree_600SemiBold",
                    }}
                  >
                    {shortChapterLabel(ch.title)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </Sheet>
  );
}
