import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { Colors, LightColors } from './colors';
import { Typography, Radius } from './typography';
import { Spacing } from './spacing';
import { getTheme, setTheme as persistTheme } from '../services/storage';

export { Colors, LightColors } from './colors';
export { Typography, Radius } from './typography';
export { Spacing } from './spacing';
export type { ColorKey, LightColorKey } from './colors';
export type { RadiusKey } from './typography';
export type { SpacingKey } from './spacing';

// ---------------------------------------------------------------------------
// Theme types
// ---------------------------------------------------------------------------

export type ThemeMode = 'dark' | 'light';

export interface Theme {
  mode: ThemeMode;
  isDark: boolean;
  colors: typeof Colors & typeof LightColors;
  typography: typeof Typography;
  spacing: typeof Spacing;
  radius: typeof Radius;
  toggleTheme: () => void;
  setMode: (mode: ThemeMode) => void;
}

// ---------------------------------------------------------------------------
// Build a merged color palette for the given mode
// ---------------------------------------------------------------------------

function buildColors(mode: ThemeMode): typeof Colors & typeof LightColors {
  if (mode === 'light') {
    return { ...Colors, ...LightColors };
  }
  return { ...Colors, ...LightColors, ...Colors }; // dark overrides light keys
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ThemeContext = createContext<Theme | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ThemeProviderProps {
  children: ReactNode;
  defaultMode?: ThemeMode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  defaultMode = 'dark',
}) => {
  const [mode, setModeState] = useState<ThemeMode>(defaultMode);

  // Hydrate persisted preference on mount
  useEffect(() => {
    getTheme().then((saved) => {
      if (saved === 'light' || saved === 'dark') {
        setModeState(saved);
      }
    });
  }, []);

  const toggleTheme = () => {
    setModeState((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      persistTheme(next);
      return next;
    });
  };

  const setMode = (newMode: ThemeMode) => {
    persistTheme(newMode);
    setModeState(newMode);
  };

  const theme: Theme = {
    mode,
    isDark: mode === 'dark',
    colors: buildColors(mode),
    typography: Typography,
    spacing: Spacing,
    radius: Radius,
    toggleTheme,
    setMode,
  };

  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useTheme = (): Theme => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Provide a safe default when used outside provider (e.g. in tests)
    return {
      mode: 'dark',
      isDark: true,
      colors: buildColors('dark'),
      typography: Typography,
      spacing: Spacing,
      radius: Radius,
      toggleTheme: () => {},
      setMode: () => {},
    };
  }
  return ctx;
};

export default ThemeProvider;
