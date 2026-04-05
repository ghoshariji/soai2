import { TextStyle } from 'react-native';

export const Typography: Record<string, TextStyle> = {
  /** Screen / section titles */
  h1: { fontSize: 24, fontWeight: '700', lineHeight: 32 },
  h2: { fontSize: 20, fontWeight: '700', lineHeight: 28 },
  /** Card titles, list headers */
  h3: { fontSize: 18, fontWeight: '600', lineHeight: 26 },
  h4: { fontSize: 16, fontWeight: '600', lineHeight: 24 },
  /** Subtitle / emphasis */
  subtitle: { fontSize: 17, fontWeight: '500', lineHeight: 24 },
  body1: { fontSize: 16, fontWeight: '400', lineHeight: 24 },
  body2: { fontSize: 14, fontWeight: '400', lineHeight: 21 },
  caption: { fontSize: 12, fontWeight: '400', lineHeight: 17 },
  button: { fontSize: 15, fontWeight: '600', lineHeight: 22 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
  },
};

export const Radius = {
  sm: 8,
  md: 12,
  /** Inputs / buttons */
  input: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

export type RadiusKey = keyof typeof Radius;
