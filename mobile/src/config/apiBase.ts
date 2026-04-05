import { NativeModules, Platform } from 'react-native';

const DEFAULT_API_PORT = 5000;

/**
 * In dev, derive the API host from the Metro bundle URL so a physical device
 * uses the same LAN IP as the packager (avoids hardcoded IPs).
 */
function devApiHost(): string {
  const scriptURL = NativeModules.SourceCode?.scriptURL as string | undefined;
  if (scriptURL) {
    const m = scriptURL.match(/:\/\/([^/:?#]+)/);
    if (m?.[1]) {
      const h = m[1].toLowerCase();
      if (h && h !== 'localhost' && h !== '127.0.0.1') {
        return m[1];
      }
    }
  }
  return Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
}

export function getApiBaseUrl(): string {
  if (!__DEV__) {
    return process.env.API_URL ?? 'https://api.soai.app/api';
  }
  return `http://${devApiHost()}:${DEFAULT_API_PORT}/api`;
}

/** Socket.IO origin (no /api suffix). */
export function getSocketBaseUrl(): string {
  if (!__DEV__) {
    return (
      process.env.SOCKET_URL ??
      (process.env.API_URL?.replace(/\/api\/?$/, '') ?? 'https://api.soai.app')
    );
  }
  return `http://${devApiHost()}:${DEFAULT_API_PORT}`;
}
