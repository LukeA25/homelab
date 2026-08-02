import { useEffect, useRef } from "react";
import { Animated, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "../../theme/colors";
import { Touchable } from "./Touchable";

type HighlightBlockProps = {
  highlighted: boolean;
  onPress: () => void;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/**
 * A tappable passage whose highlight fades in and out instead of snapping.
 * The tint lives in an absolutely positioned layer behind the text so its
 * opacity can animate on the native driver (animating backgroundColor cannot).
 */
export function HighlightBlock({
  highlighted,
  onPress,
  radius = 10,
  style,
  children,
}: HighlightBlockProps) {
  const tint = useRef(new Animated.Value(highlighted ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(tint, {
      toValue: highlighted ? 1 : 0,
      duration: 60,
      useNativeDriver: true,
    }).start();
  }, [highlighted, tint]);

  return (
    <Touchable
      onPress={onPress}
      scaleTo={0.995}
      dimTo={0.9}
      style={[{ borderRadius: radius, overflow: "hidden" }, style]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: colors.accentSoft, borderRadius: radius, opacity: tint },
        ]}
      />
      {children}
    </Touchable>
  );
}
