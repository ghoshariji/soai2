import { io, Socket } from 'socket.io-client';
import { getSocketBaseUrl } from '@/config/apiBase';

const SOCKET_URL = getSocketBaseUrl();

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

let socket: Socket | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Establish a socket connection authenticated with the provided JWT token.
 * Calling connect() when a socket is already connected is a no-op.
 */
export function connect(token: string): void {
  if (socket?.connected) {
    return;
  }

  // Clean up any stale disconnected socket before creating a new one
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    autoConnect: true,
  });

  socket.on('connect', () => {
    if (__DEV__) {
      console.log('[Socket] Connected:', socket?.id);
    }
  });

  socket.on('disconnect', (reason: string) => {
    if (__DEV__) {
      console.log('[Socket] Disconnected:', reason);
    }
  });

  socket.on('connect_error', (err: Error) => {
    if (__DEV__) {
      console.warn('[Socket] Connection error:', err.message);
    }
  });
}

/**
 * Disconnect and destroy the socket instance.
 */
export function disconnect(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

/**
 * Emit an event with optional data. Silently skips if not connected.
 */
export function emit(event: string, data?: unknown): void {
  if (!socket?.connected) {
    if (__DEV__) {
      console.warn(`[Socket] Cannot emit "${event}" – not connected`);
    }
    return;
  }
  socket.emit(event, data);
}

/**
 * Subscribe to a socket event.
 */
export function on(event: string, callback: (...args: unknown[]) => void): void {
  if (!socket) {
    if (__DEV__) {
      console.warn(`[Socket] Cannot subscribe to "${event}" – socket not initialised`);
    }
    return;
  }
  socket.on(event, callback);
}

/**
 * Unsubscribe from a socket event. If no callback is provided, all
 * listeners for that event are removed.
 */
export function off(
  event: string,
  callback?: (...args: unknown[]) => void,
): void {
  if (!socket) {
    return;
  }
  if (callback) {
    socket.off(event, callback);
  } else {
    socket.off(event);
  }
}

/**
 * Return the raw Socket.IO instance (null if not yet connected).
 */
export function getSocket(): Socket | null {
  return socket;
}

/**
 * Check whether the socket is currently connected.
 */
export function isConnected(): boolean {
  return socket?.connected ?? false;
}

// ---------------------------------------------------------------------------
// Named event helpers (strongly typed wrappers for common events)
// ---------------------------------------------------------------------------

export const SocketEvents = {
  // Chat
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  SEND_MESSAGE: 'send_message',
  NEW_MESSAGE: 'new_message',
  MESSAGE_READ: 'message_read',
  TYPING_START: 'typing_start',
  TYPING_STOP: 'typing_stop',
  USER_TYPING: 'user_typing',
  USER_STOPPED_TYPING: 'user_stopped_typing',

  // Notifications
  NEW_NOTIFICATION: 'new_notification',
  NOTIFICATION_READ: 'notification_read',

  // Presence
  USER_ONLINE: 'user_online',
  USER_OFFLINE: 'user_offline',

  // Announcements / posts
  NEW_ANNOUNCEMENT: 'new_announcement',
  NEW_POST: 'new_post',
  LIKE_UPDATED: 'like_updated',
  NEW_COMMENT: 'new_comment',
  COMMENT_DELETED: 'comment_deleted',
  POST_DELETED: 'post_deleted',

  // Complaints
  COMPLAINT_UPDATED: 'complaint_updated',
} as const;

export type SocketEvent = (typeof SocketEvents)[keyof typeof SocketEvents];

export const socketService = {
  connect,
  disconnect,
  emit,
  on,
  off,
  getSocket,
  isConnected,
  SocketEvents,
};

export default socketService;
