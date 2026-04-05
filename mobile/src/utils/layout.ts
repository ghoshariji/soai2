import { useMemo } from 'react';
import { useWindowDimensions, Platform, ScaledSize } from 'react-native';
import { Spacing } from '@/theme';

export interface ResponsiveLayout {
  width: number;
  height: number;
  fontScale: number;
  /** True when width is under 360dp */
  isSmallPhone: boolean;
  /** Width ≥ 768dp */
  isTablet: boolean;
  /** Horizontal inset for screens (scales with width) */
  gutter: number;
  /** Max width for readable content on large phones / tablets */
  contentMaxWidth: number;
  /** Title font size */
  h1: number;
  h2: number;
  body: number;
  caption: number;
  /** Minimum touch target */
  minTouch: number;
}

function compute(dim: ScaledSize): Omit<ResponsiveLayout, 'width' | 'height' | 'fontScale'> {
  const { width } = dim;
  const isSmallPhone = width < 360;
  const isTablet = width >= 768;
  const gutter = Math.round(
    Math.min(Spacing.xxl, Math.max(Spacing.md, width * 0.042)),
  );
  const contentMaxWidth = isTablet
    ? Math.min(720, width - gutter * 2)
    : width - gutter * 2;

  return {
    isSmallPhone,
    isTablet,
    gutter,
    contentMaxWidth,
    h1: isTablet ? 30 : isSmallPhone ? 22 : 26,
    h2: isTablet ? 22 : isSmallPhone ? 17 : 19,
    body: isTablet ? 16 : isSmallPhone ? 14 : 15,
    caption: isTablet ? 13 : 12,
    minTouch: Platform.select({ ios: 44, android: 48, default: 44 }) ?? 44,
  };
}

/**
 * Hook for consistent spacing and type scale across phone / tablet and orientations.
 */
export function useResponsive(): ResponsiveLayout {
  const dim = useWindowDimensions();
  const extra = useMemo(() => compute(dim), [dim.width, dim.height, dim.fontScale]);
  return useMemo(
    () => ({
      width: dim.width,
      height: dim.height,
      fontScale: dim.fontScale,
      ...extra,
    }),
    [dim.width, dim.height, dim.fontScale, extra],
  );
}

/** Centered column: use as style for inner content on wide screens */
export function contentColumnStyle(r: ResponsiveLayout) {
  return {
    width: '100%' as const,
    maxWidth: r.contentMaxWidth,
    alignSelf: 'center' as const,
    paddingHorizontal: r.gutter,
  };
}
