import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';
import { Colors } from '@/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Size maps
// ---------------------------------------------------------------------------

const HEIGHT: Record<Size, number> = { sm: 36, md: 48, lg: 56 };
const PADDING_H: Record<Size, number> = { sm: 12, md: 20, lg: 28 };
const FONT_SIZE: Record<Size, number> = { sm: 13, md: 15, lg: 16 };
const RADIUS: Record<Size, number> = { sm: 8, md: 12, lg: 14 };

// ---------------------------------------------------------------------------
// Variant styles
// ---------------------------------------------------------------------------

function getVariantStyles(variant: Variant): {
  container: ViewStyle;
  text: TextStyle;
  indicatorColor: string;
} {
  switch (variant) {
    case 'primary':
      return {
        container: { backgroundColor: Colors.primary },
        text: { color: Colors.white },
        indicatorColor: Colors.white,
      };
    case 'secondary':
      return {
        container: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      style={[
        styles.base,
        {
          height: HEIGHT[size],
          paddingHorizontal: PADDING_H[size],
          borderRadius: RADIUS[size],
        },
        variantStyles.container,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variantStyles.indicatorColor} />
      ) : (
        <View style={styles.inner}>
          {leftIcon && <View style={styles.iconLeft}>{leftIcon}</View>}
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
          {rightIcon && <View style={styles.iconRight}>{rightIcon}</View>}
        </View>
      )}
    </TouchableOpacity>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  base: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
  disabled: {
    opacity: 0.5,
  },
});

export default Button;
