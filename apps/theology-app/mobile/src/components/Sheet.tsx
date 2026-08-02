import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { Touchable } from "./ui/Touchable";

type SheetProps = {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
};

export function Sheet({ open, title, onClose, children }: SheetProps) {
  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
        <View
          style={{
            maxHeight: "85%",
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgElevated,
            paddingBottom: 24,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              marginTop: 12,
              height: 4,
              width: 40,
              borderRadius: 999,
              backgroundColor: colors.border,
            }}
          />
          {title ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 20,
                paddingTop: 16,
                paddingBottom: 8,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 18, fontFamily: "Fraunces_600SemiBold" }}>
                {title}
              </Text>
              <Touchable
                variant="ghost"
                onPress={onClose}
                style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}
              >
                <Text style={{ color: colors.accent, fontSize: 14, fontFamily: "Figtree_500Medium" }}>
                  Done
                </Text>
              </Touchable>
            </View>
          ) : null}
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
