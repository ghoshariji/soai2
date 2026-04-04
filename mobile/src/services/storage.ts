import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const KEYS = {
  ACCESS_TOKEN: '@soai_access_token',
  REFRESH_TOKEN: '@soai_refresh_token',
  USER: '@soai_user',
  THEME: '@soai_theme',
} as const;

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

async function getItem(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // Silently fail – caller should not depend on storage for critical logic
  }
}

async function removeItem(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Silently fail
  }
}

// ---------------------------------------------------------------------------
// Access token
// ---------------------------------------------------------------------------

export async function getAccessToken(): Promise<string | null> {
  return getItem(KEYS.ACCESS_TOKEN);
}

export async function setAccessToken(token: string): Promise<void> {
  return setItem(KEYS.ACCESS_TOKEN, token);
}

// ---------------------------------------------------------------------------
// Refresh token
// ---------------------------------------------------------------------------

export async function getRefreshToken(): Promise<string | null> {
  return getItem(KEYS.REFRESH_TOKEN);
}

export async function setRefreshToken(token: string): Promise<void> {
  return setItem(KEYS.REFRESH_TOKEN, token);
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export async function getUser<T = unknown>(): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.USER);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setUser(user: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.USER, JSON.stringify(user));
  } catch {
    // Silently fail
  }
}

// ---------------------------------------------------------------------------
// Auth clear (tokens + user)
// ---------------------------------------------------------------------------

export async function clearAuth(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      KEYS.ACCESS_TOKEN,
      KEYS.REFRESH_TOKEN,
      KEYS.USER,
    ]);
  } catch {
    // Silently fail
  }
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export async function getTheme(): Promise<string | null> {
  return getItem(KEYS.THEME);
}

export async function setTheme(theme: string): Promise<void> {
  return setItem(KEYS.THEME, theme);
}

// ---------------------------------------------------------------------------
// Expose keys for advanced use cases
// ---------------------------------------------------------------------------

export { KEYS };
