import "./global.css";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
} from "@expo-google-fonts/figtree";
import { Fraunces_600SemiBold } from "@expo-google-fonts/fraunces";
import {
  SourceSerif4_400Regular,
  SourceSerif4_400Regular_Italic,
  SourceSerif4_500Medium,
} from "@expo-google-fonts/source-serif-4";
import { useFonts } from "expo-font";
import * as SystemUI from "expo-system-ui";

import { AskScreen } from "./src/components/AskScreen";
import { BibleScreen } from "./src/components/BibleScreen";
import { LaunchScreen } from "./src/components/LaunchScreen";
import { LibraryScreen } from "./src/components/LibraryScreen";
import { NotesScreen } from "./src/components/NotesScreen";
import { ReaderScreen } from "./src/components/ReaderScreen";
import { TabBar, newTabId } from "./src/components/TabBar";
import { UI_CONTRACT_VERSION } from "./src/lib/contract";
import {
  BIBLE_ID,
  INITIAL_BOOKMARKS,
  INITIAL_HIGHLIGHTS,
  INITIAL_NOTES,
  INITIAL_TOPICS,
  PARAGRAPHS,
  findParagraphByLocus,
  mockAsk,
  sectionTitle,
} from "./src/lib/mockData";
import { readBibleSection, writeBibleSection } from "./src/lib/storage";
import type {
  AskMessage,
  Bookmark,
  Highlight,
  NoteDoc,
  NoteSection,
  Paragraph,
  TabKind,
  Topic,
  WorkspaceLayout,
  WorkspaceTab,
} from "./src/lib/types";
import { colors } from "./src/theme/colors";

function defaultTitle(kind: TabKind): string {
  if (kind === "bible") return "Bible";
  if (kind === "ask") return "Ask";
  if (kind === "library") return "Library";
  if (kind === "notes") return "Notes";
  return "Reader";
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Fraunces_600SemiBold,
    SourceSerif4_400Regular,
    SourceSerif4_400Regular_Italic,
    SourceSerif4_500Medium,
  });

  useEffect(() => {
    if (fontError) console.warn("[fonts]", fontError);
  }, [fontError]);

  const [ready, setReady] = useState(false);
  const [tabs, setTabs] = useState<WorkspaceTab[]>([]);
  const [layout, setLayout] = useState<WorkspaceLayout | null>(null);
  const [textSize] = useState(1.25);
  const [bibleSectionDefault, setBibleSectionDefault] = useState("ps.23");
  const [highlights, setHighlights] = useState<Highlight[]>(INITIAL_HIGHLIGHTS);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(INITIAL_BOOKMARKS);
  const [notes, setNotes] = useState<NoteDoc[]>(INITIAL_NOTES);
  const [topics] = useState<Topic[]>(INITIAL_TOPICS);
  const [askByTab, setAskByTab] = useState<Record<string, AskMessage[]>>({});
  const [notesFilter, setNotesFilter] = useState<NoteSection | "all">("all");
  const [clipboardHint, setClipboardHint] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.bg);
    void (async () => {
      setBibleSectionDefault(await readBibleSection());
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  const focusId =
    layout?.mode === "single"
      ? layout.focusId
      : layout?.mode === "split"
        ? layout.leftId
        : null;
  const rightId = layout?.mode === "split" ? layout.rightId : null;

  function updateTab(id: string, patch: Partial<WorkspaceTab>) {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function addTab(kind: Exclude<TabKind, "reader">, extras: Partial<WorkspaceTab> = {}) {
    const id = newTabId();
    const tab: WorkspaceTab = {
      id,
      kind,
      title: defaultTitle(kind),
      bibleSectionId: kind === "bible" ? bibleSectionDefault : undefined,
      libraryWorkId: kind === "library" ? null : undefined,
      notesDocId: kind === "notes" ? null : undefined,
      ...extras,
    };
    if (kind === "bible" && tab.bibleSectionId) {
      tab.title = sectionTitle(BIBLE_ID, tab.bibleSectionId);
    }
    setTabs((prev) => [...prev, tab]);
    setLayout({ mode: "single", focusId: id });
    return id;
  }

  function closeTab(id: string) {
    setTabs((prev) => {
      const remaining = prev.filter((t) => t.id !== id);
      setLayout((lay) => {
        if (!lay) return null;
        if (lay.mode === "single") {
          if (lay.focusId !== id) return lay;
          return remaining.length
            ? { mode: "single", focusId: remaining[remaining.length - 1].id }
            : null;
        }
        if (lay.leftId === id) return { mode: "single", focusId: lay.rightId };
        if (lay.rightId === id) return { mode: "single", focusId: lay.leftId };
        return lay;
      });
      return remaining;
    });
  }

  function focusTab(id: string) {
    setLayout((prev) => {
      if (prev?.mode === "split") {
        if (id === prev.leftId || id === prev.rightId) return prev;
        return { mode: "split", leftId: id, rightId: prev.rightId, ratio: prev.ratio };
      }
      return { mode: "single", focusId: id };
    });
  }

  function splitRight(rightTabId: string) {
    const left =
      layout?.mode === "single"
        ? layout.focusId
        : layout?.mode === "split"
          ? layout.leftId
          : tabs[0]?.id;
    if (!left || left === rightTabId) {
      setLayout({ mode: "single", focusId: rightTabId });
      return;
    }
    setLayout({ mode: "split", leftId: left, rightId: rightTabId, ratio: 0.55 });
  }

  function splitWithNew(leftId: string, kind: Exclude<TabKind, "reader">) {
    const id = newTabId();
    const tab: WorkspaceTab = {
      id,
      kind,
      title: defaultTitle(kind),
      bibleSectionId: kind === "bible" ? bibleSectionDefault : undefined,
      libraryWorkId: kind === "library" ? null : undefined,
      notesDocId: kind === "notes" ? null : undefined,
    };
    if (kind === "bible" && tab.bibleSectionId) {
      tab.title = sectionTitle(BIBLE_ID, tab.bibleSectionId);
    }
    setTabs((prev) => [...prev, tab]);
    setLayout({ mode: "split", leftId, rightId: id, ratio: 0.55 });
  }

  function openLocus(workId: string, locusId: string) {
    const hit = findParagraphByLocus(locusId);
    if (!hit) return;
    if (hit.workId === BIBLE_ID || workId === BIBLE_ID) {
      const existing = tabs.find((t) => t.kind === "bible");
      if (existing) {
        updateTab(existing.id, {
          bibleSectionId: hit.sectionId,
          title: sectionTitle(BIBLE_ID, hit.sectionId),
        });
        focusTab(existing.id);
        void writeBibleSection(hit.sectionId);
      } else {
        addTab("bible", {
          bibleSectionId: hit.sectionId,
          title: sectionTitle(BIBLE_ID, hit.sectionId),
        });
      }
      return;
    }
    const id = newTabId();
    const tab: WorkspaceTab = {
      id,
      kind: "reader",
      title: sectionTitle(hit.workId, hit.sectionId),
      readerWorkId: hit.workId,
      readerSectionId: hit.sectionId,
    };
    setTabs((prev) => [...prev, tab]);
    setLayout({ mode: "single", focusId: id });
  }

  function toggleHighlight(workId: string, paragraph: Paragraph) {
    setHighlights((prev) => {
      if (prev.some((h) => h.paragraphId === paragraph.id)) {
        return prev.filter((h) => h.paragraphId !== paragraph.id);
      }
      return [
        {
          id: `hl-${Date.now()}`,
          workId,
          paragraphId: paragraph.id,
          locusId: paragraph.locusId,
          color: "amber",
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ];
    });
  }

  function bookmarkParas(workId: string, paragraphs: Paragraph[]) {
    const now = new Date().toISOString();
    setBookmarks((prev) => {
      let next = [...prev];
      for (const para of paragraphs) {
        if (next.some((b) => b.paragraphId === para.id)) continue;
        next = [
          {
            id: `bm-${now}-${para.id}`,
            workId,
            paragraphId: para.id,
            locusId: para.locusId,
            label: para.locusId,
            createdAt: now,
          },
          ...next,
        ];
      }
      return next;
    });
    setToast("Bookmarked");
  }

  function copyToNotes(paragraphs: Paragraph[]) {
    const ref = paragraphs.map((p) => p.locusId).join("; ");
    setClipboardHint(ref);
    setToast("Reference copied");

    const notesTab = tabs.find((t) => t.kind === "notes");
    if (notesTab) {
      updateTab(notesTab.id, { notesDocId: null });
      if (layout?.mode === "split") {
        setLayout({
          mode: "split",
          leftId: layout.leftId,
          rightId: notesTab.id,
          ratio: layout.ratio,
        });
      } else {
        focusTab(notesTab.id);
      }
    } else {
      addTab("notes");
    }
  }

  function askSplit(fromTabId: string, paragraphs: Paragraph[]) {
    const seed = paragraphs.map((p) => `${p.locusId}: ${p.text}`).join("\n");
    const response = mockAsk(seed);
    const stamp = new Date().toISOString();
    const askId = newTabId();
    const askTab: WorkspaceTab = {
      id: askId,
      kind: "ask",
      title: "Ask",
      askSeed: seed.slice(0, 180),
    };
    setTabs((prev) => [...prev, askTab]);
    setAskByTab((prev) => ({
      ...prev,
      [askId]: [
        { id: `u-${stamp}`, role: "user", content: seed.slice(0, 240), createdAt: stamp },
        {
          id: `a-${stamp}`,
          role: "assistant",
          content: response.answer,
          response,
          createdAt: stamp,
        },
      ],
    }));
    setLayout({ mode: "split", leftId: fromTabId, rightId: askId, ratio: 0.55 });
  }

  function renderPane(tabId: string) {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return null;

    if (tab.kind === "bible") {
      const sectionId = tab.bibleSectionId ?? bibleSectionDefault;
      return (
        <BibleScreen
          sectionId={sectionId}
          highlights={highlights}
          bookmarks={bookmarks}
          textSize={textSize}
          onSectionChange={(id) => {
            updateTab(tab.id, { bibleSectionId: id, title: sectionTitle(BIBLE_ID, id) });
            void writeBibleSection(id);
          }}
          onToggleHighlight={(paragraphId) => {
            const para = (PARAGRAPHS[sectionId] ?? []).find((p) => p.id === paragraphId);
            if (para) toggleHighlight(BIBLE_ID, para);
          }}
          onBookmark={(paras) => bookmarkParas(BIBLE_ID, paras)}
          onAskSplit={(paras) => askSplit(tab.id, paras)}
          onCopyToNotes={copyToNotes}
        />
      );
    }

    if (tab.kind === "ask") {
      return (
        <AskScreen
          messages={askByTab[tab.id] ?? []}
          seed={tab.askSeed}
          onSend={(m) =>
            setAskByTab((prev) => ({
              ...prev,
              [tab.id]: [...(prev[tab.id] ?? []), m],
            }))
          }
          onOpenLocus={openLocus}
        />
      );
    }

    if (tab.kind === "library") {
      return (
        <LibraryScreen
          selectedWorkId={tab.libraryWorkId ?? null}
          onOpenWork={(id) => updateTab(tab.id, { libraryWorkId: id })}
          onOpenSection={(workId, sectionId) => {
            if (workId === BIBLE_ID) {
              addTab("bible", {
                bibleSectionId: sectionId,
                title: sectionTitle(BIBLE_ID, sectionId),
              });
              return;
            }
            const id = newTabId();
            setTabs((prev) => [
              ...prev,
              {
                id,
                kind: "reader",
                title: sectionTitle(workId, sectionId),
                readerWorkId: workId,
                readerSectionId: sectionId,
              },
            ]);
            setLayout({ mode: "single", focusId: id });
          }}
        />
      );
    }

    if (tab.kind === "notes") {
      return (
        <NotesScreen
          docs={notes}
          openDocId={tab.notesDocId ?? null}
          sectionFilter={notesFilter}
          clipboardHint={clipboardHint}
          onSectionFilter={setNotesFilter}
          onOpenDoc={(id) => updateTab(tab.id, { notesDocId: id, title: id ? "Note" : "Notes" })}
          onCreateDoc={(section) => {
            const now = new Date().toISOString();
            const doc: NoteDoc = {
              id: `n-${now}`,
              title: "Untitled",
              section,
              body: "",
              createdAt: now,
              updatedAt: now,
            };
            setNotes((prev) => [doc, ...prev]);
            updateTab(tab.id, { notesDocId: doc.id, title: doc.title });
          }}
          onUpdateDoc={(doc) => {
            setNotes((prev) => prev.map((d) => (d.id === doc.id ? doc : d)));
            updateTab(tab.id, { title: doc.title || "Note" });
          }}
          onOpenLocus={openLocus}
        />
      );
    }

    if (tab.kind === "reader" && tab.readerWorkId && tab.readerSectionId) {
      const workId = tab.readerWorkId;
      const sectionId = tab.readerSectionId;
      return (
        <ReaderScreen
          workId={workId}
          sectionId={sectionId}
          highlights={highlights}
          bookmarks={bookmarks}
          textSize={textSize}
          onBack={() => {
            closeTab(tab.id);
            addTab("library", { libraryWorkId: workId });
          }}
          onToggleHighlight={(paragraphId) => {
            const para = (PARAGRAPHS[sectionId] ?? []).find((p) => p.id === paragraphId);
            if (para) toggleHighlight(workId, para);
          }}
          onBookmark={(paras) => bookmarkParas(workId, paras)}
          onAskSplit={(paras) => askSplit(tab.id, paras)}
          onCopyToNotes={copyToNotes}
        />
      );
    }

    return null;
  }

  void topics;
  void UI_CONTRACT_VERSION;

  if (!fontsLoaded || !ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <StatusBar style="light" />
          {tabs.length === 0 || !layout ? (
            <LaunchScreen onOpen={(kind) => addTab(kind)} />
          ) : (
            <>
              <TabBar
                tabs={tabs}
                focusId={focusId}
                splitRightId={rightId}
                onFocus={focusTab}
                onClose={closeTab}
                onAdd={(kind) => addTab(kind as Exclude<TabKind, "reader">)}
                onSplitRight={(rid) => {
                  if (focusId && focusId !== rid) {
                    setLayout({ mode: "split", leftId: focusId, rightId: rid, ratio: 0.55 });
                  } else {
                    splitRight(rid);
                  }
                }}
                onSplitWithNew={splitWithNew}
                onClearSplit={() => {
                  if (layout.mode === "split") {
                    setLayout({ mode: "single", focusId: layout.leftId });
                  }
                }}
              />

              <View style={{ flex: 1, minHeight: 0 }}>
                {layout.mode === "single" && (
                  <View style={{ flex: 1 }}>{renderPane(layout.focusId)}</View>
                )}
                {layout.mode === "split" && (
                  <View style={{ flex: 1, flexDirection: "row" }}>
                    <View
                      style={{
                        flex: layout.ratio,
                        borderRightWidth: 1,
                        borderRightColor: colors.border,
                      }}
                    >
                      {renderPane(layout.leftId)}
                    </View>
                    <View style={{ flex: 1 - layout.ratio, minWidth: 0 }}>
                      {renderPane(layout.rightId)}
                    </View>
                  </View>
                )}
              </View>
            </>
          )}

          {toast ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 64,
                left: 0,
                right: 0,
                alignItems: "center",
                paddingHorizontal: 16,
              }}
            >
              <View
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.bgElevated,
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 14, fontFamily: "Figtree_500Medium" }}>
                  {toast}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
