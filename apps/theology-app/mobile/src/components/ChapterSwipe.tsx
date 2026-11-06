import { useEffect } from "react";
import { Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  clamp,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { colors } from "../theme/colors";

/** Max rubber-band distance while dragging (px). */
const MAX_PULL = 72;
/** Distance that locks / commits a chapter change (px). */
const COMMIT = 56;

type ChapterSwipeProps = {
  children: React.ReactNode;
  canGoPrev: boolean;
  canGoNext: boolean;
  onGoPrev: () => void;
  onGoNext: () => void;
};

/**
 * Horizontal edge-swipe for chapter navigation: the page only translates a
 * short distance, haptic-ticks when the commit threshold is crossed, then
 * snaps and jumps to the adjacent chapter (no full-page slide).
 */
export function ChapterSwipe({
  children,
  canGoPrev,
  canGoNext,
  onGoPrev,
  onGoNext,
}: ChapterSwipeProps) {
  const translateX = useSharedValue(0);
  const armed = useSharedValue(0);
  const canPrev = useSharedValue(canGoPrev);
  const canNext = useSharedValue(canGoNext);

  useEffect(() => {
    canPrev.value = canGoPrev;
    canNext.value = canGoNext;
  }, [canGoPrev, canGoNext, canPrev, canNext]);

  const tick = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const goPrev = () => onGoPrev();
  const goNext = () => onGoNext();

  const pan = Gesture.Pan()
    .activeOffsetX([-18, 18])
    .failOffsetY([-16, 16])
    .onUpdate((e) => {
      let x = e.translationX;
      if (x < 0 && !canNext.value) x = 0;
      if (x > 0 && !canPrev.value) x = 0;
      const locked = clamp(x, -MAX_PULL, MAX_PULL);
      translateX.value = locked;

      const past = Math.abs(locked) >= COMMIT;
      const allowed =
        (locked < 0 && canNext.value) || (locked > 0 && canPrev.value);
      if (past && allowed && armed.value === 0) {
        armed.value = 1;
        runOnJS(tick)();
      } else if (!past) {
        armed.value = 0;
      }
    })
    .onEnd(() => {
      const x = translateX.value;
      if (x <= -COMMIT && canNext.value) {
        runOnJS(goNext)();
      } else if (x >= COMMIT && canPrev.value) {
        runOnJS(goPrev)();
      }
      armed.value = 0;
      translateX.value = withSpring(0, { damping: 22, stiffness: 280, mass: 0.7 });
    });

  const pageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const prevHintStyle = useAnimatedStyle(() => ({
    opacity: canPrev.value ? clamp(translateX.value / COMMIT, 0, 1) : 0,
  }));

  const nextHintStyle = useAnimatedStyle(() => ({
    opacity: canNext.value ? clamp(-translateX.value / COMMIT, 0, 1) : 0,
  }));

  return (
    <View style={{ flex: 1, overflow: "hidden" }}>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            left: 12,
            top: 0,
            bottom: 0,
            justifyContent: "center",
            zIndex: 1,
            maxWidth: 96,
          },
          prevHintStyle,
        ]}
      >
        <Text style={{ color: colors.muted, fontSize: 18 }}>←</Text>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            right: 12,
            top: 0,
            bottom: 0,
            justifyContent: "center",
            zIndex: 1,
            maxWidth: 96,
            alignItems: "flex-end",
          },
          nextHintStyle,
        ]}
      >
        <Text style={{ color: colors.muted, fontSize: 18 }}>→</Text>
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={[{ flex: 1 }, pageStyle]}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

