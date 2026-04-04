import React from 'react';
import { View, Text, Image, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '@/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  uri?: string | null;
  name: string;
  size?: AvatarSize;
  style?: ViewStyle;
  showOnline?: boolean;
}

// ---------------------------------------------------------------------------
// Size dimensions
// ---------------------------------------------------------------------------

const DIMENSIONS: Record<AvatarSize, number> = {
  xs: 24,
  sm: 32,
  md: 44,
  lg: 56,
  xl: 80,
};

const FONT_SIZES: Record<AvatarSize, number> = {
  xs: 9,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
};

const ONLINE_DOT: Record<AvatarSize, number> = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 13,
  xl: 16,
};

// ---------------------------------------------------------------------------
// Initials helper
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// ---------------------------------------------------------------------------
// Deterministic background color from name
// ---------------------------------------------------------------------------

const PALETTE = [
  '#6C63FF', // primary purple
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#06B6D4', // cyan
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
];

function nameToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const Avatar: React.FC<AvatarProps> = ({
  uri,
  name,
  size = 'md',
  style,
  showOnline = false,
}) => {
  const dimension = DIMENSIONS[size];
  const radius = dimension / 2;
  const dotSize = ONLINE_DOT[size];

  return (
    <View style={[{ width: dimension, height: dimension }, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={[
            styles.image,
            { width: dimension, height: dimension, borderRadius: radius },
          ]}
          resizeMode="cover"
        />
      ) : (
        <View
          style={[
            styles.initialsContainer,
            {
              width: dimension,
              height: dimension,
              borderRadius: radius,
              backgroundColor: nameToColor(name),
            },
          ]}
        >
          <Text
            style={[
              styles.initialsText,
              { fontSize: FONT_SIZES[size] },
            ]}
          >
            {getInitials(name)}
          </Text>
        </View>
      )}

      {/* Online indicator */}
      {showOnline && (
        <View
          style={[
            styles.onlineDot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              bottom: 0,
              right: 0,
            },
          ]}
        />
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  image: {
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  initialsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    color: Colors.white,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  onlineDot: {
    position: 'absolute',
    backgroundColor: Colors.success,
    borderWidth: 2,
    borderColor: Colors.bgCard,
  },
});

export default Avatar;
