import { useState } from "react";
import { Columns2, Plus, X } from "lucide-react-native";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { TabKind, WorkspaceTab } from "../lib/types";
import { colors } from "../theme/colors";
import { Touchable } from "./ui/Touchable";

const KIND_LABEL: Record<TabKind, string> = {
  bible: "Bible",
  library: "Library",
  ask: "Ask",
  notes: "Notes",
  reader: "Reader",
};

type TabBarProps = {
  tabs: WorkspaceTab[];
  focusId: string | null;
  splitRightId: string | null;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: (kind: TabKind) => void;
  onSplitRight: (rightTabId: string) => void;
  onSplitWithNew: (leftTabId: string, kind: Exclude<TabKind, "reader">) => void;
  onClearSplit: () => void;
};

export function TabBar({
  tabs,
  focusId,
  splitRightId,
  onFocus,
  onClose,
  onAdd,
  onSplitRight,
  onSplitWithNew,
  onClearSplit,
}: TabBarProps) {
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [splitPickerFor, setSplitPickerFor] = useState<string | null>(null);

  return (
    <View
      style={{
        paddingTop: Math.max(insets.top, 8),
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.bgElevated,
        paddingHorizontal: 8,
        paddingBottom: 8,
      }}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {tabs.map((tab) => {
            const active = tab.id === focusId || tab.id === splitRightId;
            return (
              <View
                key={tab.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? colors.accent : colors.border,
                  backgroundColor: active ? colors.accentSoft : colors.surface,
                  paddingHorizontal: 4,
                  paddingVertical: 2,
                }}
              >
                <Touchable
                  variant="chip"
                  onPress={() => onFocus(tab.id)}
                  style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 6 }}
                >
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 13,
                      fontFamily: "Figtree_500Medium",
                      maxWidth: 120,
                    }}
                    numberOfLines={1}
                  >
                    {tab.title || KIND_LABEL[tab.kind]}
                  </Text>
                </Touchable>
                <Touchable
                  variant="chip"
                  onPress={() => setSplitPickerFor(tab.id)}
                  hitSlop={8}
                  style={{ borderRadius: 999, padding: 4 }}
                  accessibilityLabel="Split"
                >
                  <Columns2 color={colors.muted} size={14} />
                </Touchable>
                <Touchable
                  variant="chip"
                  onPress={() => onClose(tab.id)}
                  hitSlop={8}
                  style={{ borderRadius: 999, padding: 4 }}
                  accessibilityLabel="Close tab"
                >
                  <X color={colors.muted} size={14} />
                </Touchable>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={{ position: "relative" }}>
        <Touchable
          variant="card"
          onPress={() => setMenuOpen((v) => !v)}
          accessibilityLabel="New tab"
          style={{
            borderRadius: 999,
            borderWidth: 1,
            borderColor: menuOpen ? colors.accent : colors.border,
            backgroundColor: colors.surface,
            padding: 8,
          }}
        >
          <Plus color={menuOpen ? colors.accent : colors.text} size={16} />
        </Touchable>
        {menuOpen && (
          <View
            style={{
              position: "absolute",
              top: 40,
              right: 0,
              zIndex: 50,
              width: 140,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.bgElevated,
              padding: 4,
            }}
          >
            {(
              [
                ["bible", "Bible"],
                ["ask", "Ask"],
                ["library", "Library"],
                ["notes", "Notes"],
              ] as const
            ).map(([kind, label]) => (
              <Touchable
                key={kind}
                variant="chip"
                onPress={() => {
                  onAdd(kind);
                  setMenuOpen(false);
                }}
                style={{ borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 }}
              >
                <Text style={{ color: colors.text, fontSize: 14 }}>{label}</Text>
              </Touchable>
            ))}
          </View>
        )}
      </View>

      {splitRightId ? (
        <Touchable
          variant="chip"
          onPress={onClearSplit}
          style={{
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: 10,
            paddingVertical: 6,
          }}
        >
          <Text style={{ color: colors.muted, fontSize: 10, fontFamily: "Figtree_600SemiBold" }}>
            Unsplit
          </Text>
        </Touchable>
      ) : null}

      <Modal
        visible={!!splitPickerFor}
        transparent
        animationType="fade"
        onRequestClose={() => setSplitPickerFor(null)}
      >
        <View style={{ flex: 1, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)", padding: 16 }}>
          <Pressable style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} onPress={() => setSplitPickerFor(null)} />
          <View
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.bgElevated,
              padding: 16,
              maxWidth: 400,
              width: "100%",
              alignSelf: "center",
            }}
          >
            <Text style={{ color: colors.text, fontSize: 18, fontFamily: "Fraunces_600SemiBold" }}>
              Split screen
            </Text>
            <Text style={{ color: colors.muted, fontSize: 14, marginTop: 4 }}>
              Keep this tab on the left. Choose what opens on the right.
            </Text>

            {tabs.filter((t) => t.id !== splitPickerFor).length > 0 && (
              <View style={{ marginTop: 16 }}>
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 11,
                    fontFamily: "Figtree_600SemiBold",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                  }}
                >
                  Existing tab
                </Text>
                {tabs
                  .filter((t) => t.id !== splitPickerFor)
                  .map((t) => (
                    <Touchable
                      key={t.id}
                      variant="card"
                      onPress={() => {
                        if (splitPickerFor) {
                          onFocus(splitPickerFor);
                          onSplitRight(t.id);
                        }
                        setSplitPickerFor(null);
                      }}
                      style={{
                        marginTop: 8,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 14 }}>
                        {t.title || KIND_LABEL[t.kind]}
                      </Text>
                    </Touchable>
                  ))}
              </View>
            )}

            <View style={{ marginTop: 16 }}>
              <Text
                style={{
                  color: colors.muted,
                  fontSize: 11,
                  fontFamily: "Figtree_600SemiBold",
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
              >
                New tab on the right
              </Text>
              <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {(
                  [
                    ["bible", "Bible"],
                    ["ask", "Ask"],
                    ["library", "Library"],
                    ["notes", "Notes"],
                  ] as const
                ).map(([kind, label]) => (
                  <Touchable
                    key={kind}
                    variant="card"
                    onPress={() => {
                      if (splitPickerFor) onSplitWithNew(splitPickerFor, kind);
                      setSplitPickerFor(null);
                    }}
                    style={{
                      width: "47%",
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      paddingHorizontal: 12,
                      paddingVertical: 12,
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 14, fontFamily: "Figtree_600SemiBold" }}>
                      {label}
                    </Text>
                  </Touchable>
                ))}
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export function newTabId() {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
