import { BookOpen, Library, MessageSquareText, NotebookPen } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import type { TabKind } from "../lib/types";
import { colors } from "../theme/colors";

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
    <View className="flex-1 items-center justify-center bg-bg px-6">
      <View className="w-full max-w-md flex-row flex-wrap gap-3">
        {OPTIONS.map(({ id, label, hint, Icon }) => (
          <Pressable
            key={id}
            onPress={() => onOpen(id)}
            style={{
              width: "48%",
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
          </Pressable>
        ))}
      </View>
    </View>
  );
}
