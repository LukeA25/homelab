import { useCallback, useMemo, useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors } from "../../theme/colors";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type TouchableVariant =
  | "plain"
  | "card"
  | "elevated"
  | "primary"
  | "ghost"
  | "chip";

/**
 * Per-variant press feedback. `tint` is painted as an overlay rather than by
 * swapping backgroundColor, so it can animate on the native driver and needs no
 * knowledge of the caller's resting background.
 */
const VARIANTS: Record<TouchableVariant, { tint: string | null; scale: number; dim: number }> = {
  plain: { tint: null, scale: 0.95, dim: 0.55 },
  card: { tint: "rgba(255, 255, 255, 0.07)", scale: 0.985, dim: 0.92 },
  elevated: { tint: "rgba(255, 255, 255, 0.06)", scale: 0.98, dim: 0.92 },
  primary: { tint: "rgba(0, 0, 0, 0.14)", scale: 0.955, dim: 0.95 },
  ghost: { tint: colors.accentSoft, scale: 0.95, dim: 0.9 },
  chip: { tint: colors.accentSoft, scale: 0.94, dim: 0.92 },
};

export type TouchableProps = Omit<PressableProps, "style" | "children"> & {
  style?: StyleProp<ViewStyle>;
  variant?: TouchableVariant;
  /** Override how far the element scales down while held. */
  scaleTo?: number;
  /** Override how far the element fades while held (1 = no fade). */
  dimTo?: number;
  children?: React.ReactNode;
};

/**
 * Pressable with immediate physical feedback: the target sinks, dims and picks up
 * a tint while held.
 *
 * The style prop must stay a plain array — `Animated.createAnimatedComponent`
 * cannot process Pressable's function-style form and silently drops every style
 * if one is passed. Pressed appearance therefore comes from an animated overlay
 * instead of Pressable's `pressed` flag, which also avoids a setState per touch.
 */
export function Touchable({
  style,
  variant = "plain",
  scaleTo,
  dimTo,
  children,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: TouchableProps) {
  const preset = VARIANTS[variant];
  const progress = useRef(new Animated.Value(0)).current;

  const animate = useCallback(
    (to: number) => {
      Animated.timing(progress, {
        toValue: to,
        // Keep these tiny — on older iPads longer timings read as lag, not polish.
        duration: to === 1 ? 35 : 60,
        useNativeDriver: true,
      }).start();
    },
    [progress],
  );

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      animate(1);
      onPressIn?.(e);
    },
    [animate, onPressIn],
  );

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      animate(0);
      onPressOut?.(e);
    },
    [animate, onPressOut],
  );

  const animatedStyle = useMemo(
    () => ({
      transform: [
        {
          scale: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [1, scaleTo ?? preset.scale],
          }),
        },
      ],
      opacity: progress.interpolate({
        inputRange: [0, 1],
        outputRange: [1, dimTo ?? preset.dim],
      }),
    }),
    [progress, preset.dim, preset.scale, scaleTo, dimTo],
  );

  // Match the caller's corner radii so the tint cannot bleed past rounded edges.
  const overlayStyle = useMemo(() => {
    if (!preset.tint) return null;
    const flat = (StyleSheet.flatten(style) ?? {}) as ViewStyle;
    return {
      backgroundColor: preset.tint,
      borderRadius: flat.borderRadius,
      borderTopLeftRadius: flat.borderTopLeftRadius,
      borderTopRightRadius: flat.borderTopRightRadius,
      borderBottomLeftRadius: flat.borderBottomLeftRadius,
      borderBottomRightRadius: flat.borderBottomRightRadius,
    };
  }, [preset.tint, style]);

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      // Skip Pressable's internal press delay so the action fires immediately.
      unstable_pressDelay={0}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, animatedStyle, disabled ? { opacity: 0.4 } : null]}
    >
      {overlayStyle ? (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            overlayStyle,
            { opacity: progress },
          ]}
        />
      ) : null}
      {children}
    </AnimatedPressable>
  );
}
