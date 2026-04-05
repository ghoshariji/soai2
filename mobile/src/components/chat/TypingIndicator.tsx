import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { Colors, Spacing, Typography } from '@/theme';

function TypingDot({ delay }: { delay: number }) {
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 320, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.3, { duration: 320, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[styles.dot, style]} />;
}

interface TypingIndicatorProps {
  /** Shown next to the dots */
  label?: string;
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  label = 'Typing…',
}) => (
  <View style={styles.row} accessibilityLabel={label}>
    <View style={styles.dots}>
      <TypingDot delay={0} />
      <TypingDot delay={140} />
      <TypingDot delay={280} />
    </View>
    <Text style={[styles.caption, styles.captionPad]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
    marginRight: 4,
  },
  caption: {
    ...Typography.caption,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  captionPad: {
    marginLeft: Spacing.sm,
  },
});

export default React.memo(TypingIndicator);
