import { ChevronRight } from "lucide-react-native";
import { FlatList, Text, View } from "react-native";
import { SECTIONS, WORKS } from "../lib/mockData";
import type { Work, WorkKind } from "../lib/types";
import { colors } from "../theme/colors";
import { Touchable } from "./ui/Touchable";

type LibraryScreenProps = {
  selectedWorkId: string | null;
  onOpenWork: (id: string | null) => void;
  onOpenSection: (workId: string, sectionId: string) => void;
};

const KIND_LABEL: Record<WorkKind, string> = {
  bible: "Scripture",
  catechism: "Church",
  summa: "Theology",
  book: "Books",
  fathers: "Fathers",
};

export function LibraryScreen({
  selectedWorkId,
  onOpenWork,
  onOpenSection,
}: LibraryScreenProps) {
  const work = WORKS.find((w) => w.id === selectedWorkId) ?? null;

  if (!work) {
    return (
      <FlatList
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        data={WORKS}
        keyExtractor={(w) => w.id}
        ListHeaderComponent={
          <View style={{ marginBottom: 24 }}>
            <Text style={{ color: colors.text, fontSize: 28, fontFamily: "Fraunces_600SemiBold" }}>
              Library
            </Text>
            <Text style={{ color: colors.muted, fontSize: 14, marginTop: 8 }}>Books and documents.</Text>
          </View>
        }
        renderItem={({ item: w }) => <WorkRow work={w} onClick={() => onOpenWork(w.id)} />}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />
    );
  }

  const sections = SECTIONS[work.id] ?? [];
  const rows: { id: string; title: string; parent?: string }[] = [];
  for (const s of sections) {
    if (s.children?.length) {
      for (const c of s.children) rows.push({ id: c.id, title: c.title, parent: s.title });
    } else {
      rows.push({ id: s.id, title: s.title });
    }
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      data={rows}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={
        <View style={{ marginBottom: 16 }}>
          <Touchable
            variant="ghost"
            onPress={() => onOpenWork(null)}
            style={{
              alignSelf: "flex-start",
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 6,
              marginBottom: 8,
              marginLeft: -10,
            }}
          >
            <Text style={{ color: colors.accent, fontSize: 14 }}>← Library</Text>
          </Touchable>
          <Text style={{ color: colors.text, fontSize: 24, fontFamily: "Fraunces_600SemiBold" }}>
            {work.title}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
            {KIND_LABEL[work.kind]} · {work.author}
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <Touchable
          variant="card"
          onPress={() => onOpenSection(work.id, item.id)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            paddingHorizontal: 14,
            paddingVertical: 14,
            marginBottom: 8,
          }}
        >
          <View>
            {item.parent ? (
              <Text style={{ color: colors.muted, fontSize: 11 }}>{item.parent}</Text>
            ) : null}
            <Text style={{ color: colors.text, fontSize: 15 }}>{item.title}</Text>
          </View>
          <ChevronRight color={colors.muted} size={18} />
        </Touchable>
      )}
    />
  );
}

function WorkRow({ work, onClick }: { work: Work; onClick: () => void }) {
  return (
    <Touchable
      variant="card"
      onPress={onClick}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: 16,
      }}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ color: colors.muted, fontSize: 11, fontFamily: "Figtree_600SemiBold" }}>
          {KIND_LABEL[work.kind]}
        </Text>
        <Text style={{ color: colors.text, fontSize: 17, fontFamily: "Figtree_600SemiBold", marginTop: 2 }}>
          {work.shortTitle}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4 }} numberOfLines={2}>
          {work.description}
        </Text>
      </View>
      <ChevronRight color={colors.muted} size={18} />
    </Touchable>
  );
}
