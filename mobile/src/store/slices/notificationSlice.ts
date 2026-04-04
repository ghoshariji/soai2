import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { notificationService } from '../../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationType =
  | 'announcement'
  | 'complaint_update'
  | 'new_post'
  | 'new_message'
  | 'member_request'
  | 'member_approved'
  | 'member_rejected'
  | 'subscription'
  | 'system'
  | string;

export interface Notification {
  _id: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  /** Arbitrary metadata (e.g. targetId, route information). */
  data?: Record<string, unknown>;
}

export interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  /** Pagination cursor – last fetched page number. */
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normaliseNotification(raw: Record<string, unknown>): Notification {
  return {
    _id: (raw._id ?? raw.id ?? '') as string,
    type: (raw.type ?? 'system') as NotificationType,
    title: (raw.title ?? '') as string,
    body: (raw.body ?? raw.message ?? '') as string,
    isRead: Boolean(raw.isRead ?? raw.read ?? false),
    createdAt: (raw.createdAt ?? new Date().toISOString()) as string,
    data: (raw.data ?? undefined) as Record<string, unknown> | undefined,
  };
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const axiosMessage = (
      error as { response?: { data?: { message?: string } } }
    ).response?.data?.message;
    return axiosMessage ?? error.message;
  }
  return typeof error === 'string' ? error : 'An unexpected error occurred.';
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: NotificationState = {
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
  currentPage: 0,
  totalPages: 1,
  hasMore: true,
};

// ---------------------------------------------------------------------------
// Async thunks
// ---------------------------------------------------------------------------

/**
 * Fetch a page of notifications.
 * Pass { page, limit, replace } where replace=true resets the list.
 */
export const fetchNotifications = createAsyncThunk<
  {
    notifications: Notification[];
    page: number;
    totalPages: number;
    replace: boolean;
  },
  { page?: number; limit?: number; replace?: boolean },
  { rejectValue: string }
>('notifications/fetchAll', async ({ page = 1, limit = 20, replace = false }, { rejectWithValue }) => {
  try {
    const { data } = await notificationService.getAll({ page, limit });
    const notifications = (data.data as Record<string, unknown>[]).map(
      normaliseNotification,
    );
    return {
      notifications,
      page,
      totalPages: data.totalPages ?? 1,
      replace,
    };
  } catch (error) {
    return rejectWithValue(extractErrorMessage(error));
  }
});

/**
 * Fetch just the unread notification count for the badge.
 */
export const fetchUnreadCount = createAsyncThunk<
  number,
  void,
  { rejectValue: string }
>('notifications/fetchUnreadCount', async (_, { rejectWithValue }) => {
  try {
    const { data } = await notificationService.getUnreadCount();
    return data.data.count;
  } catch (error) {
    return rejectWithValue(extractErrorMessage(error));
  }
});

/**
 * Mark a single notification as read.
 */
export const markAsRead = createAsyncThunk<
  string,
  string,
  { rejectValue: string }
>('notifications/markAsRead', async (id, { rejectWithValue }) => {
  try {
    await notificationService.markAsRead(id);
    return id;
  } catch (error) {
    return rejectWithValue(extractErrorMessage(error));
  }
});

/**
 * Mark all notifications as read.
 */
export const markAllAsRead = createAsyncThunk<
  void,
  void,
  { rejectValue: string }
>('notifications/markAllAsRead', async (_, { rejectWithValue }) => {
  try {
    await notificationService.markAllAsRead();
  } catch (error) {
    return rejectWithValue(extractErrorMessage(error));
  }
});

/**
 * Delete a single notification.
 */
export const deleteNotification = createAsyncThunk<
  string,
  string,
  { rejectValue: string }
>('notifications/delete', async (id, { rejectWithValue }) => {
  try {
    await notificationService.delete(id);
    return id;
  } catch (error) {
    return rejectWithValue(extractErrorMessage(error));
  }
});

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    /**
     * Prepend a real-time notification (from Socket.IO) to the list
     * and increment the unread counter.
     */
    addNotification(state, action: PayloadAction<Notification | Record<string, unknown>>) {
      const notification =
        '_id' in action.payload && typeof action.payload._id === 'string'
          ? (action.payload as Notification)
          : normaliseNotification(action.payload as Record<string, unknown>);

      // Avoid duplicates
      const exists = state.notifications.some((n) => n._id === notification._id);
      if (!exists) {
        state.notifications.unshift(notification);
        if (!notification.isRead) {
          state.unreadCount = Math.max(0, state.unreadCount + 1);
        }
      }
    },

    /**
     * Reset the unread count to zero (call after opening the notification
     * screen if you want a quick local update before the server responds).
     */
    resetUnreadCount(state) {
      state.unreadCount = 0;
    },

    /**
     * Clear all notifications from the list (e.g. on logout).
     */
    clearNotifications(state) {
      state.notifications = [];
      state.unreadCount = 0;
      state.currentPage = 0;
      state.totalPages = 1;
      state.hasMore = true;
      state.error = null;
    },

    /**
     * Set the error string manually (e.g. from a permission-denied handler).
     */
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
  },

  extraReducers: (builder) => {
    // ------------------------------------------------------------------
    // fetchNotifications
    // ------------------------------------------------------------------
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.isLoading = false;
        const { notifications, page, totalPages, replace } = action.payload;

        if (replace) {
          state.notifications = notifications;
        } else {
          // Merge, avoiding duplicates by _id
          const existingIds = new Set(state.notifications.map((n) => n._id));
          const fresh = notifications.filter((n) => !existingIds.has(n._id));
          state.notifications = [...state.notifications, ...fresh];
        }

        state.currentPage = page;
        state.totalPages = totalPages;
        state.hasMore = page < totalPages;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Failed to load notifications';
      });

    // ------------------------------------------------------------------
    // fetchUnreadCount
    // ------------------------------------------------------------------
    builder
      .addCase(fetchUnreadCount.fulfilled, (state, action) => {
        state.unreadCount = action.payload;
      })
      .addCase(fetchUnreadCount.rejected, (state, action) => {
        state.error = action.payload ?? null;
      });

    // ------------------------------------------------------------------
    // markAsRead
    // ------------------------------------------------------------------
    builder
      .addCase(markAsRead.fulfilled, (state, action) => {
        const id = action.payload;
        const notification = state.notifications.find((n) => n._id === id);
        if (notification && !notification.isRead) {
          notification.isRead = true;
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      })
      .addCase(markAsRead.rejected, (state, action) => {
        state.error = action.payload ?? null;
      });

    // ------------------------------------------------------------------
    // markAllAsRead
    // ------------------------------------------------------------------
    builder
      .addCase(markAllAsRead.fulfilled, (state) => {
        state.notifications.forEach((n) => {
          n.isRead = true;
        });
        state.unreadCount = 0;
      })
      .addCase(markAllAsRead.rejected, (state, action) => {
        state.error = action.payload ?? null;
      });

    // ------------------------------------------------------------------
    // deleteNotification
    // ------------------------------------------------------------------
    builder
      .addCase(deleteNotification.fulfilled, (state, action) => {
        const id = action.payload;
        const index = state.notifications.findIndex((n) => n._id === id);
        if (index !== -1) {
          const wasUnread = !state.notifications[index].isRead;
          state.notifications.splice(index, 1);
          if (wasUnread) {
            state.unreadCount = Math.max(0, state.unreadCount - 1);
          }
        }
      })
      .addCase(deleteNotification.rejected, (state, action) => {
        state.error = action.payload ?? null;
      });
  },
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const {
  addNotification,
  resetUnreadCount,
  clearNotifications,
  setError,
} = notificationSlice.actions;

export default notificationSlice.reducer;
