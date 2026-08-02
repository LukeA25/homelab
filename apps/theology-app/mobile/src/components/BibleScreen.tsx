import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react-native";
import {
  FlatList,
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
import { useEvent } from "../lib/useEvent";
import { colors } from "../theme/colors";
import { Sheet } from "./Sheet";
import { HighlightBlock } from "./ui/HighlightBlock";
import { Touchable } from "./ui/Touchable";

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
  const [activePage, setActivePage] = useState(initialPage);

  useEffect(() => {
    const idx = chapters.findIndex((c) => c.sectionId === sectionId);
    if (idx >= 0) {
      pagerRef.current?.setPageWithoutAnimation(idx);
      setActivePage(idx);
    }
  }, [sectionId, chapters]);

  const hlSet = useMemo(
    () =>
      new Set(
        highlights.filter((h) => h.workId === BIBLE_ID).map((h) => h.paragraphId),
      ),
    [highlights],
  );
  const bmSet = useMemo(
    () =>
      new Set(
        bookmarks.filter((b) => b.workId === BIBLE_ID).map((b) => b.paragraphId),
      ),
    [bookmarks],
  );

  // The parent rebuilds these as inline closures every render; pinning them here
  // is what lets ChapterPage and its rows stay memoized.
  const openPicker = useCallback(() => setPickerOpen(true), []);
  const toggleHighlight = useEvent(onToggleHighlight);
  const bookmark = useEvent(onBookmark);
  const askSplit = useEvent(onAskSplit);
  const copyToNotes = useEvent(onCopyToNotes);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={initialPage}
        onPageSelected={(e) => {
          const position = e.nativeEvent.position;
          setActivePage(position);
          const ch = chapters[position];
          if (ch && ch.sectionId !== sectionId) onSectionChange(ch.sectionId);
        }}
      >
        {chapters.map((ch, i) => (
          <View key={ch.sectionId} style={{ flex: 1 }}>
            {/* PagerView keeps every child mounted, so build only the current
                chapter and its immediate neighbours. Neighbours stay real so a
                swipe never lands on an empty page. */}
            {Math.abs(i - activePage) <= 1 ? (
              <ChapterPage
                sectionId={ch.sectionId}
                bookTitle={ch.bookTitle}
                chapterTitle={ch.chapterTitle}
                hlSet={hlSet}
                bmSet={bmSet}
                textSize={textSize}
                onOpenPicker={openPicker}
                onToggleHighlight={toggleHighlight}
                onBookmark={bookmark}
                onAskSplit={askSplit}
                onCopyToNotes={copyToNotes}
              />
            ) : null}
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

const keyExtractor = (p: Paragraph) => p.id;

const VERSE_STYLE = {
  marginBottom: 4,
  paddingHorizontal: 8,
  paddingVertical: 6,
} as const;

const BOOKMARK_STYLE = {
  textDecorationLine: "underline",
  textDecorationColor: colors.accent,
} as const;

/**
 * Memoized so toggling one verse re-renders that verse alone rather than every
 * row on the page.
 */
const VerseRow = memo(function VerseRow({
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
    <HighlightBlock highlighted={highlighted} onPress={handlePress} radius={8} style={VERSE_STYLE}>
      <Text
        style={{
          color: colors.text,
          fontSize: 16 * textSize,
          lineHeight: 28 * textSize,
          fontFamily: "SourceSerif4_400Regular",
        }}
      >
        <Text style={{ color: colors.muted, fontSize: 12 * textSize, fontFamily: "Figtree_600SemiBold" }}>
          {paragraph.verse ?? paragraph.label}{" "}
        </Text>
        <Text style={bookmarked ? BOOKMARK_STYLE : undefined}>{paragraph.text}</Text>
      </Text>
    </HighlightBlock>
  );
});

const ChapterPage = memo(function ChapterPage({
  sectionId,
  bookTitle,
  chapterTitle,
  hlSet,
  bmSet,
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
  hlSet: Set<string>;
  bmSet: Set<string>;
  textSize: number;
  onOpenPicker: () => void;
  onToggleHighlight: (paragraphId: string) => void;
  onBookmark: (paragraphs: Paragraph[]) => void;
  onAskSplit: (paragraphs: Paragraph[]) => void;
  onCopyToNotes: (paragraphs: Paragraph[]) => void;
}) {
  const paragraphs = PARAGRAPHS[sectionId] ?? [];
  const selectedParas = paragraphs.filter((p) => hlSet.has(p.id));
  const prev = adjacentChapter(sectionId, -1);
  const next = adjacentChapter(sectionId, 1);

  const renderItem = useCallback(
    ({ item: p }: ListRenderItemInfo<Paragraph>) => (
      <VerseRow
        paragraph={p}
        highlighted={hlSet.has(p.id)}
        bookmarked={bmSet.has(p.id)}
        textSize={textSize}
        onToggle={onToggleHighlight}
      />
    ),
    [hlSet, bmSet, textSize, onToggleHighlight],
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={{ alignItems: "center", paddingVertical: 8, paddingHorizontal: 12 }}>
        <Touchable
          variant="card"
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
        </Touchable>
      </View>

      <FlatList
        data={paragraphs}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        extraData={renderItem}
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
});

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Touchable
      variant="chip"
      onPress={onPress}
      style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
    >
      <Text style={{ color: colors.text, fontSize: 14 }}>{label}</Text>
    </Touchable>
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
            <Touchable
              key={b.id}
              variant="chip"
              onPress={() => setBookId(b.id)}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                borderRadius: 10,
                paddingHorizontal: 8,
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 16 }}>{b.title}</Text>
              <Text style={{ color: colors.muted, fontSize: 14 }}>{b.children?.length ?? 0}</Text>
            </Touchable>
          ))}
        </View>
      ) : (
        <View>
          <Touchable
            variant="ghost"
            onPress={() => setBookId(null)}
            style={{
              alignSelf: "flex-start",
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 6,
              marginBottom: 8,
              marginLeft: -10,
            }}
          >
            <Text style={{ color: colors.accent, fontSize: 14 }}>← Books</Text>
          </Touchable>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(books.find((b) => b.id === bookId)?.children ?? []).map((ch) => {
              const on = ch.id === currentSectionId;
              return (
                <Touchable
                  key={ch.id}
                  variant={on ? "primary" : "card"}
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
                </Touchable>
              );
            })}
          </View>
        </View>
      )}
    </Sheet>
  );
}
