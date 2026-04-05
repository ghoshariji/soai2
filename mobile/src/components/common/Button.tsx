import React, { useCallback, useEffect } from 'react';
import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
  View,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Colors, Spacing } from '@/theme';

const AnimatedView = Animated.createAnimatedComponent(View);

type Variant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: ViewStyle;
}

const HEIGHT: Record<Size, number> = { sm: 40, md: 50, lg: 52 };
const PADDING_H: Record<Size, number> = { sm: Spacing.md, md: Spacing.lg, lg: Spacing.xl };
const FONT_SIZE: Record<Size, number> = { sm: 13, md: 15, lg: 16 };
const RADIUS = 12;

function getVariantStyles(variant: Variant): {
  container: ViewStyle;
  text: TextStyle;
  indicatorColor: string;
  shadow?: ViewStyle;
} {
  switch (variant) {
    case 'primary':
      return {
        container: { backgroundColor: Colors.primary },
        text: { color: Colors.white },
        indicatorColor: Colors.white,
        shadow: Platform.select({
          ios: {
            shadowColor: Colors.primary,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.35,
            shadowRadius: 10,
          },
          android: { elevation: 4 },
          default: {},
        }) as ViewStyle,
      };
    case 'secondary':
      return {
        container: {
          backgroundColor: Colors.bgCard,
          borderWidth: 1,
          borderColor: Colors.border,
        },
        text: { color: Colors.textPrimary },
        indicatorColor: Colors.textPrimary,
      };
    case 'outline':
      return {
        container: {
          backgroundColor: Colors.transparent,
          borderWidth: 1.5,
          borderColor: Colors.primary,
        },
        text: { color: Colors.primary },
        indicatorColor: Colors.primary,
      };
    case 'danger':
      return {
        container: { backgroundColor: Colors.error },
        text: { color: Colors.white },
        indicatorColor: Colors.white,
      };
    case 'ghost':
      return {
        container: { backgroundColor: Colors.transparent },
        text: { color: Colors.primary },
        indicatorColor: Colors.primary,
      };
  }
}

const spring = { damping: 18, stiffness: 260 };

const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  leftIcon,
  rightIcon,
  style,
}) => {
  const variantStyles = getVariantStyles(variant);
  const isDisabled = disabled || loading;
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPressIn = useCallback(() => {
    if (!isDisabled) {
      scale.value = withSpring(0.96, spring);
    }
  }, [isDisabled, scale]);

  const onPressOut = useCallback(() => {
    scale.value = withSpring(1, spring);
  }, [scale]);

  useEffect(() => {
    if (isDisabled) {
      scale.value = 1;
    }
  }, [isDisabled, scale]);

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
    >
      <AnimatedView
        style={[
          styles.base,
          {
            height: HEIGHT[size],
            paddingHorizontal: PADDING_H[size],
            borderRadius: RADIUS,
          },
          variantStyles.container,
          variant === 'primary' && variantStyles.shadow,
          isDisabled && styles.disabled,
          animatedStyle,
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={variantStyles.indicatorColor} />
        ) : (
          <View style={styles.inner}>
            {leftIcon ? <View style={styles.iconLeft}>{leftIcon}</View> : null}
            <Text
              style={[
                styles.label,
                { fontSize: FONT_SIZE[size] },
                variantStyles.text,
              ]}
              numberOfLines={1}
            >
              {title}
            </Text>
            {rightIcon ? <View style={styles.iconRight}>{rightIcon}</View> : null}
          </View>
        )}
      </AnimatedView>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  iconLeft: {
    marginRight: Spacing.sm,
  },
  iconRight: {
    marginLeft: Spacing.sm,
  },
  disabled: {
    opacity: 0.48,
  },
});

export default React.memo(Button);
