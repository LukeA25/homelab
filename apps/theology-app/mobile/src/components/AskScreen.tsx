import { useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { mockAsk } from "../lib/mockData";
import type { AskMessage } from "../lib/types";
import { colors } from "../theme/colors";

type AskScreenProps = {
  messages: AskMessage[];
  seed?: string;
  onSend: (m: AskMessage) => void;
  onOpenLocus: (workId: string, locusId: string) => void;
};

export function AskScreen({ messages, seed, onSend, onOpenLocus }: AskScreenProps) {
  const [draft, setDraft] = useState(seed ?? "");

  function submit(textIn?: string) {
    const text = (textIn ?? draft).trim();
    if (!text) return;
    const now = new Date().toISOString();
    const response = mockAsk(text);
    onSend({ id: `u-${now}`, role: "user", content: text, createdAt: now });
    onSend({
      id: `a-${now}`,
      role: "assistant",
      content: response.answer,
      response,
      createdAt: now,
    });
    setDraft("");
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 16, paddingVertical: 12 }}>
        <Text style={{ color: colors.text, fontSize: 20, fontFamily: "Fraunces_600SemiBold" }}>Ask</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>Answers from your library</Text>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
        ListEmptyComponent={
          <View
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              padding: 16,
            }}
          >
            <Text style={{ color: colors.muted, fontSize: 14 }}>
              Ask about a passage or topic. Citations open on the left when split.
            </Text>
          </View>
        }
        renderItem={({ item: m }) => (
          <View
            style={{
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginLeft: m.role === "user" ? 24 : 0,
              marginRight: m.role === "user" ? 0 : 8,
              backgroundColor: m.role === "user" ? colors.accent : colors.surface,
              borderWidth: m.role === "user" ? 0 : 1,
              borderColor: colors.border,
            }}
          >
            {m.role === "user" ? (
              <Text style={{ color: colors.bg, fontFamily: "Figtree_500Medium" }}>{m.content}</Text>
            ) : (
              <View style={{ gap: 8 }}>
                <Text style={{ color: colors.text }}>{m.response?.answer ?? m.content}</Text>
                {m.response?.resources.map((r) => (
                  <Pressable
                    key={r.locus.locusId}
                    onPress={() => onOpenLocus(r.locus.workId, r.locus.locusId)}
                    style={{
                      borderRadius: 12,
                      backgroundColor: colors.bgElevated,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    }}
                  >
                    <Text style={{ color: colors.accent, fontFamily: "Figtree_600SemiBold" }}>
                      {r.locus.label}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{r.reason}</Text>
                  </Pressable>
                ))}
                {m.response?.bullets.map((b) => (
                  <Text key={b} style={{ color: colors.muted, paddingLeft: 8 }}>
                    • {b}
                  </Text>
                ))}
                {m.response?.citations.map((c) => (
                  <Pressable
                    key={c.locus.locusId}
                    onPress={() => onOpenLocus(c.locus.workId, c.locus.locusId)}
                    style={{
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    }}
                  >
                    <Text style={{ color: colors.accent, fontFamily: "Figtree_600SemiBold" }}>
                      {c.locus.label}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{c.snippet}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}
      />

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.bg,
          padding: 12,
          flexDirection: "row",
          gap: 8,
        }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => submit()}
          placeholder="Ask…"
          placeholderTextColor={colors.muted}
          style={{
            flex: 1,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            paddingHorizontal: 16,
            paddingVertical: 10,
            color: colors.text,
            fontSize: 14,
          }}
        />
        <Pressable
          onPress={() => submit()}
          style={{
            borderRadius: 999,
            backgroundColor: colors.accent,
            paddingHorizontal: 16,
            paddingVertical: 10,
            justifyContent: "center",
          }}
        >
          <Text style={{ color: colors.bg, fontFamily: "Figtree_600SemiBold", fontSize: 14 }}>Send</Text>
        </Pressable>
      </View>
    </View>
  );
}
