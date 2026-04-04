export const Colors = {
  // Brand
  primary: '#6C63FF',
  primaryDark: '#4F46E5',
  primaryLight: '#A5B4FC',

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
  bg: '#F3F4F6',
  bgCard: '#FFFFFF',
  bgInput: '#F9FAFB',
  border: '#E5E7EB',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
} as const;

export type ColorKey = keyof typeof Colors;
export type LightColorKey = keyof typeof LightColors;
