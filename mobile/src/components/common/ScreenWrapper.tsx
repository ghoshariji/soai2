import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import {
  SafeAreaView,
  type Edge,
} from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Colors } from '@/theme';

interface ScreenWrapperProps {
  children: React.ReactNode;
  /** Safe-area edges. Stack screens with `<Header />` should omit `top`. */
  edges?: Edge[];
  style?: ViewStyle;
  /** Subtle enter animation */
  animate?: 'fade' | 'slide' | 'none';
  backgroundColor?: string;
}

/**
 * Consistent safe-area + optional motion. Prefer `edges={['bottom','left','right']}` when the stack header handles the top inset.
 */
const ScreenWrapper: React.FC<ScreenWrapperProps> = ({
  children,
  edges = ['top', 'bottom', 'left', 'right'],
  style,
  animate = 'fade',
  backgroundColor = Colors.bg,
}) => {
  const entering =
    animate === 'slide'
      ? FadeInDown.duration(300).delay(40)
      : animate === 'fade'
        ? FadeIn.duration(240)
        : undefined;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor }]}
      edges={edges}
    >
      {animate !== 'none' && entering ? (
        <Animated.View entering={entering} style={[styles.flex, style]}>
          {children}
        </Animated.View>
      ) : (
        <View style={[styles.flex, style]}>{children}</View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1, paddingHorizontal: 0 },
});

export default React.memo(ScreenWrapper);
