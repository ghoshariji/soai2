export const Colors = {
  // Brand (SaaS-style indigo)
  primary: '#4F46E5',
  primaryDark: '#4338CA',
  primaryLight: '#818CF8',
  /** Accent / positive actions */
  secondary: '#22C55E',

  // Dark theme backgrounds
  bg: '#0F1117',
  bgCard: '#1A1D27',
  bgInput: '#12141E',
  bgModal: '#1E2130',

  // Borders
  border: '#2A2D3A',
  borderLight: '#3A3D4A',

  // Text
  textPrimary: '#F9FAFB',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',

  // Status
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // Misc
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
  overlay: 'rgba(0,0,0,0.5)',

  // Role badges
  superAdmin: '#EF4444',
  societyAdmin: '#F59E0B',
  user: '#10B981',
} as const;

export const LightColors = {
  bg: '#F9FAFB',
  bgCard: '#FFFFFF',
  bgInput: '#F3F4F6',
  border: '#E5E7EB',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
} as const;

export type ColorKey = keyof typeof Colors;
export type LightColorKey = keyof typeof LightColors;
