import { BookOpen, Library, MessageSquareText, NotebookPen } from "lucide-react-native";
import { Text, View } from "react-native";
import type { TabKind } from "../lib/types";
import { colors } from "../theme/colors";
import { Touchable } from "./ui/Touchable";

type LaunchScreenProps = {
  onOpen: (kind: Exclude<TabKind, "reader">) => void;
};

const OPTIONS = [
  { id: "bible" as const, label: "Bible", hint: "Read Scripture", Icon: BookOpen },
  { id: "ask" as const, label: "Ask", hint: "Find sources", Icon: MessageSquareText },
  { id: "library" as const, label: "Library", hint: "Books & documents", Icon: Library },
  { id: "notes" as const, label: "Notes", hint: "Personal & study", Icon: NotebookPen },
];

export function LaunchScreen({ onOpen }: LaunchScreenProps) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.bg,
        paddingHorizontal: 24,
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 448,
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
        }}
      >
        {OPTIONS.map(({ id, label, hint, Icon }) => (
          <Touchable
            key={id}
            variant="card"
            onPress={() => onOpen(id)}
            style={{
              // Percentage widths (rather than gap) keep two cards per row even
              // on the narrowest phones.
              width: "48.5%",
              marginBottom: 12,
              aspectRatio: 1,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              padding: 20,
              justifyContent: "space-between",
            }}
          >
            <View
              style={{
                height: 44,
                width: 44,
                borderRadius: 16,
                backgroundColor: colors.accentSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon color={colors.accent} size={20} />
            </View>
            <View>
              <Text style={{ color: colors.text, fontSize: 20, fontFamily: "Fraunces_600SemiBold" }}>
                {label}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 14, marginTop: 4 }}>{hint}</Text>
            </View>
          </Touchable>
        ))}
      </View>
    </View>
  );
}
