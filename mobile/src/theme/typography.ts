import { TextStyle } from 'react-native';

export const Typography: Record<string, TextStyle> = {
  h1: { fontSize: 28, fontWeight: '700', lineHeight: 36 },
  h2: { fontSize: 22, fontWeight: '700', lineHeight: 30 },
  h3: { fontSize: 18, fontWeight: '600', lineHeight: 26 },
  h4: { fontSize: 16, fontWeight: '600', lineHeight: 24 },
  body1: { fontSize: 15, fontWeight: '400', lineHeight: 22 },
  body2: { fontSize: 13, fontWeight: '400', lineHeight: 20 },
  caption: { fontSize: 11, fontWeight: '400', lineHeight: 16 },
  button: { fontSize: 15, fontWeight: '600', lineHeight: 22 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

export type SpacingKey = keyof typeof Spacing;
export type RadiusKey = keyof typeof Radius;
