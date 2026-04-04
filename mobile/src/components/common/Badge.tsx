import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'default';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
}

// ---------------------------------------------------------------------------
// Variant config
// ---------------------------------------------------------------------------

interface VariantConfig {
  bg: string;
  text: string;
  border: string;
}

const VARIANT_CONFIG: Record<BadgeVariant, VariantConfig> = {
  success: {
    bg: 'rgba(16, 185, 129, 0.15)',
    text: Colors.success,
    border: 'rgba(16, 185, 129, 0.3)',
  },
  warning: {
    bg: 'rgba(245, 158, 11, 0.15)',
    text: Colors.warning,
    border: 'rgba(245, 158, 11, 0.3)',
  },
  error: {
    bg: 'rgba(239, 68, 68, 0.15)',
    text: Colors.error,
    border: 'rgba(239, 68, 68, 0.3)',
  },
  info: {
    bg: 'rgba(59, 130, 246, 0.15)',
    text: Colors.info,
    border: 'rgba(59, 130, 246, 0.3)',
  },
  default: {
    bg: 'rgba(156, 163, 175, 0.15)',
    text: Colors.textSecondary,
    border: 'rgba(156, 163, 175, 0.25)',
  },
};

const SIZE_CONFIG: Record<BadgeSize, { px: number; py: number; fontSize: number }> = {
  sm: { px: 8, py: 3, fontSize: 10 },
  md: { px: 10, py: 4, fontSize: 11 },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const Badge: React.FC<BadgeProps> = ({
  label,
  variant = 'default',
  size = 'md',
}) => {
  const config = VARIANT_CONFIG[variant];
  const sz = SIZE_CONFIG[size];

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: config.bg,
          borderColor: config.border,
          paddingHorizontal: sz.px,
          paddingVertical: sz.py,
        },
      ]}
    >
      <Text
        style={[styles.label, { color: config.text, fontSize: sz.fontSize }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  label: {
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'capitalize',
  },
});

export default Badge;
