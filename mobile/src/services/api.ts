import axios, {
  AxiosInstance,
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';
import { getApiBaseUrl } from '@/config/apiBase';
import {
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
  clearAuth,
} from './storage';

// ---------------------------------------------------------------------------
// Navigation ref (set from the root navigator)
// ---------------------------------------------------------------------------

type NavigationRefType = {
  navigate: (screen: string, params?: Record<string, unknown>) => void;
  reset: (state: { index: number; routes: { name: string }[] }) => void;
} | null;

let _navigationRef: NavigationRefType = null;

export function setNavigationRef(ref: NavigationRefType): void {
  _navigationRef = ref;
}

function navigateToLogin(): void {
  _navigationRef?.reset({ index: 0, routes: [{ name: 'Login' }] });
}

// ---------------------------------------------------------------------------
// Base URL
// ---------------------------------------------------------------------------

const BASE_URL = getApiBaseUrl();

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

/** Backend wraps payloads as `{ success, data: T, message? }`. */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

type ApiErrorBody = {
  message?: string;
  errors?: Array<{ field?: string; message?: string }>;
};

/** Human-readable message from axios/network errors (uses backend `message` when present). */
export function getApiErrorMessage(err: unknown, fallback = 'Request failed'): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data as ApiErrorBody | undefined;
    if (d?.message && typeof d.message === 'string') {
      const first = d.errors?.find((e) => e?.message || e?.field);
      if (first) {
        const detail = first.message ?? first.field ?? '';
        return detail ? `${d.message} — ${detail}` : d.message;
      }
      return d.message;
    }
    if (err.code === 'ECONNABORTED') return 'Request timed out. Check your connection.';
    if (err.message === 'Network Error') {
      return 'Cannot reach the server. Use the same Wi‑Fi as your dev machine or check the API URL.';
    }
    if (err.message) return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

// ---------------------------------------------------------------------------
// Request interceptor – attach access token
// ---------------------------------------------------------------------------

api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

// ---------------------------------------------------------------------------
// Response interceptor – 401 → refresh → retry
// ---------------------------------------------------------------------------

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null = null): void {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else if (token) {
      promise.resolve(token);
    }
  });
  failedQueue = [];
}

/** Do not try to refresh session for these routes (401 is expected, e.g. wrong password). */
function shouldSkipRefreshRetry(config: InternalAxiosRequestConfig): boolean {
  const u = (config.url || '').toLowerCase();
  return (
    u.includes('/auth/login') ||
    u.includes('/auth/register') ||
    u.includes('/auth/forgot-password') ||
    u.includes('/auth/reset-password') ||
    u.includes('/auth/refresh-token')
  );
}

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (!originalRequest) {
      return Promise.reject(error);
    }

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !shouldSkipRefreshRetry(originalRequest)
    ) {
      if (isRefreshing) {
        return new Promise<AxiosResponse>((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              resolve(api(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const storedRefresh = await getRefreshToken();
        if (!storedRefresh) {
          await clearAuth();
          navigateToLogin();
          return Promise.reject(error);
        }

        const { data: body } = await axios.post<
          ApiResponse<{ accessToken: string; refreshToken: string }>
        >(`${BASE_URL}/auth/refresh-token`, { refreshToken: storedRefresh });

        const tokens = body?.data;
        if (!tokens?.accessToken || !tokens?.refreshToken) {
          throw new Error('Invalid refresh response');
        }

        await setAccessToken(tokens.accessToken);
        await setRefreshToken(tokens.refreshToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`;
        }

        processQueue(null, tokens.accessToken);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        await clearAuth();
        navigateToLogin();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

// ---------------------------------------------------------------------------
// Typed response helpers
// ---------------------------------------------------------------------------

/** Pagination as returned by the backend (`paginateMeta`). */
export interface PaginationMeta {
  totalDocs: number;
  totalPages: number;
  currentPage: number;
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface PaginatedResponse<T> {
  success: boolean;
  message?: string;
  data: T[];
  meta?: PaginationMeta;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// Auth service
// ---------------------------------------------------------------------------

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: Record<string, unknown>;
  accessToken: string;
  refreshToken: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  societyCode?: string;
  flatNumber?: string;
}

export const authService = {
  login: (payload: LoginPayload) =>
    api.post<ApiResponse<LoginResponse>>('/auth/login', payload),

  register: (payload: RegisterPayload) =>
    api.post<ApiResponse<LoginResponse>>('/auth/register', payload),

  logout: () => api.post<ApiResponse<null>>('/auth/logout'),

  refreshToken: (refreshToken: string) =>
    api.post<ApiResponse<{ accessToken: string; refreshToken: string }>>(
      '/auth/refresh-token',
      { refreshToken },
    ),

  getMe: () => api.get<ApiResponse<Record<string, unknown>>>('/auth/me'),

  forgotPassword: (email: string) =>
    api.post<ApiResponse<null>>('/auth/forgot-password', { email }),

  resetPassword: (token: string, newPassword: string, confirmNewPassword: string) =>
    api.post<ApiResponse<null>>('/auth/reset-password', {
      token,
      newPassword,
      confirmNewPassword,
    }),

  changePassword: (
    currentPassword: string,
    newPassword: string,
    confirmNewPassword: string,
  ) =>
    api.put<ApiResponse<null>>('/auth/change-password', {
      currentPassword,
      newPassword,
      confirmNewPassword,
    }),
};

// ---------------------------------------------------------------------------
// Society service
// ---------------------------------------------------------------------------

export const societyService = {
  getAll: (params?: PaginationParams) =>
    api.get<PaginatedResponse<Record<string, unknown>>>('/societies', {
      params,
    }),

  getOne: (id: string) =>
    api.get<ApiResponse<Record<string, unknown>>>(`/societies/${id}`),

  create: (data: Record<string, unknown>) =>
    api.post<ApiResponse<Record<string, unknown>>>('/societies', data),

  update: (id: string, data: Record<string, unknown>) =>
    api.put<ApiResponse<Record<string, unknown>>>(`/societies/${id}`, data),

  delete: (id: string) =>
    api.delete<ApiResponse<null>>(`/societies/${id}`),

  toggleStatus: (id: string) =>
    api.patch<ApiResponse<Record<string, unknown>>>(
      `/societies/${id}/toggle-status`,
    ),

  getMembers: (id: string, params?: PaginationParams) =>
    api.get<PaginatedResponse<Record<string, unknown>>>(
      `/societies/${id}/members`,
      { params },
    ),

  approveMember: (societyId: string, userId: string) =>
    api.post<ApiResponse<null>>(
      `/societies/${societyId}/members/${userId}/approve`,
    ),

  rejectMember: (societyId: string, userId: string) =>
    api.post<ApiResponse<null>>(
      `/societies/${societyId}/members/${userId}/reject`,
    ),

  getStats: (id: string) =>
    api.get<ApiResponse<Record<string, unknown>>>(`/societies/${id}/stats`),
};

// ---------------------------------------------------------------------------
// User service
// ---------------------------------------------------------------------------

export const userService = {
  getAll: (
    params?: PaginationParams & {
      societyId?: string;
      status?: 'active' | 'inactive' | 'blocked';
    },
  ) =>
    api.get<PaginatedResponse<Record<string, unknown>>>('/users', { params }),

  getOne: (id: string) =>
    api.get<ApiResponse<Record<string, unknown>>>(`/users/${id}`),

  update: (id: string, data: Record<string, unknown>) =>
    api.put<ApiResponse<Record<string, unknown>>>(`/users/${id}`, data),

  delete: (id: string) =>
    api.delete<ApiResponse<null>>(`/users/${id}`),

  /** Multipart: fields `name`, `phone`; file field `profilePhoto` (optional). */
  updateProfile: (data: FormData) =>
    api.put<ApiResponse<Record<string, unknown>>>('/users/me', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  getMyProfile: () =>
    api.get<ApiResponse<Record<string, unknown>>>('/users/me'),

  updateRole: (id: string, role: string) =>
    api.patch<ApiResponse<Record<string, unknown>>>(`/users/${id}/role`, {
      role,
    }),

  toggleStatus: (id: string) =>
    api.patch<ApiResponse<Record<string, unknown>>>(
      `/users/${id}/toggle-status`,
    ),
};

// ---------------------------------------------------------------------------
// Subscription service
// ---------------------------------------------------------------------------

export const subscriptionService = {
  getAll: (params?: PaginationParams) =>
    api.get<PaginatedResponse<Record<string, unknown>>>('/subscriptions', {
      params,
    }),

  getOne: (id: string) =>
    api.get<ApiResponse<Record<string, unknown>>>(`/subscriptions/${id}`),

  create: (data: Record<string, unknown>) =>
    api.post<ApiResponse<Record<string, unknown>>>('/subscriptions', data),

  update: (id: string, data: Record<string, unknown>) =>
    api.put<ApiResponse<Record<string, unknown>>>(
      `/subscriptions/${id}`,
      data,
    ),

  cancel: (id: string) =>
    api.post<ApiResponse<null>>(`/subscriptions/${id}/cancel`),

  getPlans: () =>
    api.get<ApiResponse<Record<string, unknown>[]>>('/subscriptions/plans'),

  getCurrentPlan: (societyId: string) =>
    api.get<ApiResponse<Record<string, unknown>>>(
      `/subscriptions/society/${societyId}/current`,
    ),

  getInvoices: (societyId: string) =>
    api.get<PaginatedResponse<Record<string, unknown>>>(
      `/subscriptions/society/${societyId}/invoices`,
    ),
};

// ---------------------------------------------------------------------------
// Post service
// ---------------------------------------------------------------------------

export const postService = {
  getAll: (params?: PaginationParams & { societyId?: string }) =>
    api.get<PaginatedResponse<Record<string, unknown>>>('/posts', { params }),

  getOne: (id: string) =>
    api.get<ApiResponse<Record<string, unknown>>>(`/posts/${id}`),

  create: (data: FormData | Record<string, unknown>) =>
    api.post<ApiResponse<Record<string, unknown>>>('/posts', data, {
      ...(data instanceof FormData
        ? {
            transformRequest: (body: unknown, headers: { delete?: (k: string) => void }) => {
              if (body instanceof FormData && headers?.delete) {
                headers.delete('Content-Type');
              }
              return body;
            },
          }
        : {}),
    }),

  update: (id: string, data: Record<string, unknown>) =>
    api.put<ApiResponse<Record<string, unknown>>>(`/posts/${id}`, data),

  delete: (id: string) =>
    api.delete<ApiResponse<null>>(`/posts/${id}`),

  /** Toggle like — same endpoint adds or removes current user’s like. */
  like: (id: string) =>
    api.post<
      ApiResponse<{ liked: boolean; likesCount: number; likes: string[] }>
    >(`/posts/${id}/like`),

  patch: (id: string, data: Record<string, unknown>) =>
    api.patch<ApiResponse<Record<string, unknown>>>(`/posts/${id}`, data),

  addComment: (id: string, content: string) =>
    api.post<ApiResponse<Record<string, unknown>>>(`/posts/${id}/comments`, {
      content,
    }),

  getComments: (id: string, params?: PaginationParams) =>
    api.get<PaginatedResponse<Record<string, unknown>>>(
      `/posts/${id}/comments`,
      { params },
    ),

  deleteComment: (postId: string, commentId: string) =>
    api.delete<ApiResponse<null>>(`/posts/${postId}/comments/${commentId}`),
};

// ---------------------------------------------------------------------------
// Complaint service
// ---------------------------------------------------------------------------

export const complaintService = {
  getAll: (
    params?: PaginationParams & { status?: string; societyId?: string },
  ) =>
    api.get<PaginatedResponse<Record<string, unknown>>>('/complaints', {
      params,
    }),

  getOne: (id: string) =>
    api.get<ApiResponse<Record<string, unknown>>>(`/complaints/${id}`),

  create: (data: FormData | Record<string, unknown>) =>
    api.post<ApiResponse<Record<string, unknown>>>('/complaints', data, {
      /** Photo uploads + Cloudinary need more time than default 15s. */
      timeout: data instanceof FormData ? 120_000 : 30_000,
      ...(data instanceof FormData
        ? {
            transformRequest: (body: unknown, headers: { delete?: (k: string) => void }) => {
              if (body instanceof FormData && headers?.delete) {
                headers.delete('Content-Type');
              }
              return body;
            },
          }
        : {}),
    }),

  update: (id: string, data: Record<string, unknown>) =>
    api.put<ApiResponse<Record<string, unknown>>>(`/complaints/${id}`, data),

  delete: (id: string) =>
    api.delete<ApiResponse<null>>(`/complaints/${id}`),

  updateStatus: (id: string, status: string, comment?: string) =>
    api.patch<ApiResponse<Record<string, unknown>>>(
      `/complaints/${id}/status`,
      { status, comment },
    ),
};

// ---------------------------------------------------------------------------
// Announcement service
// ---------------------------------------------------------------------------

export const announcementService = {
  getAll: (params?: PaginationParams & { societyId?: string }) =>
    api.get<ApiResponse<Record<string, unknown>>>('/announcements', {
      params,
    }),

  getOne: (id: string) =>
    api.get<ApiResponse<Record<string, unknown>>>(`/announcements/${id}`),

  /** Multipart when `FormData` (e.g. with image); JSON when a plain object (no image). */
  create: (data: FormData | Record<string, unknown>) =>
    data instanceof FormData
      ? api.post<ApiResponse<Record<string, unknown>>>('/announcements', data, {
          transformRequest: (body, headers) => {
            if (body instanceof FormData && headers && typeof headers.delete === 'function') {
              headers.delete('Content-Type');
            }
            return body;
          },
        })
      : api.post<ApiResponse<Record<string, unknown>>>('/announcements', data),

  update: (id: string, data: FormData | Record<string, unknown>) =>
    data instanceof FormData
      ? api.put<ApiResponse<Record<string, unknown>>>(`/announcements/${id}`, data, {
          transformRequest: (body, headers) => {
            if (body instanceof FormData && headers && typeof headers.delete === 'function') {
              headers.delete('Content-Type');
            }
            return body;
          },
        })
      : api.put<ApiResponse<Record<string, unknown>>>(`/announcements/${id}`, data),

  delete: (id: string) =>
    api.delete<ApiResponse<null>>(`/announcements/${id}`),

  markAsRead: (id: string) =>
    api.post<ApiResponse<null>>(`/announcements/${id}/read`),

  pin: (id: string) =>
    api.patch<ApiResponse<Record<string, unknown>>>(
      `/announcements/${id}/pin`,
    ),

  unpin: (id: string) =>
    api.patch<ApiResponse<Record<string, unknown>>>(
      `/announcements/${id}/unpin`,
    ),
};

// ---------------------------------------------------------------------------
// Group service
// ---------------------------------------------------------------------------

export const groupService = {
  getAll: (params?: PaginationParams & { societyId?: string }) =>
    api.get<PaginatedResponse<Record<string, unknown>>>('/groups', { params }),

  getOne: (id: string) =>
    api.get<ApiResponse<Record<string, unknown>>>(`/groups/${id}`),

  create: (data: FormData | Record<string, unknown>) =>
    api.post<ApiResponse<Record<string, unknown>>>('/groups', data, {
      headers:
        data instanceof FormData
          ? { 'Content-Type': 'multipart/form-data' }
          : {},
    }),

  update: (id: string, data: FormData | Record<string, unknown>) =>
    api.put<ApiResponse<Record<string, unknown>>>(`/groups/${id}`, data, {
      headers:
        data instanceof FormData
          ? { 'Content-Type': 'multipart/form-data' }
          : {},
    }),

  delete: (id: string) =>
    api.delete<ApiResponse<null>>(`/groups/${id}`),

  addMember: (groupId: string, userId: string) =>
    api.post<ApiResponse<Record<string, unknown>>>(`/groups/${groupId}/members`, {
      userIds: [userId],
    }),

  removeMember: (groupId: string, userId: string) =>
    api.delete<ApiResponse<null>>(`/groups/${groupId}/members/${userId}`),

  makeAdmin: (groupId: string, userId: string) =>
    api.patch<ApiResponse<null>>(`/groups/${groupId}/members/${userId}/admin`),

  /** Use GET /groups and filter `isMember` on the client (no /groups/my route). */
  getMyGroups: () =>
    api.get<PaginatedResponse<Record<string, unknown>>>('/groups', {
      params: { limit: 200, page: 1 },
    }),

  join: (groupId: string) =>
    api.post<ApiResponse<null>>(`/groups/${groupId}/join`),

  leave: (groupId: string) =>
    api.delete<ApiResponse<null>>(`/groups/${groupId}/leave`),
};

// ---------------------------------------------------------------------------
// Chat service
// ---------------------------------------------------------------------------

export const chatService = {
  /** Active society members except self — for starting a personal chat. */
  getDirectory: () =>
    api.get<ApiResponse<Record<string, unknown>[]>>('/chat/directory'),

  getPersonalMessages: (
    userId: string,
    params?: PaginationParams,
  ) =>
    api.get<PaginatedResponse<Record<string, unknown>>>(
      `/chat/personal/${userId}`,
      { params },
    ),

  getGroupMessages: (groupId: string, params?: PaginationParams) =>
    api.get<PaginatedResponse<Record<string, unknown>>>(
      `/chat/group/${groupId}`,
      { params },
    ),

  sendPersonalMessage: (
    otherUserId: string,
    data: Record<string, unknown>,
  ) =>
    api.post<ApiResponse<Record<string, unknown>>>(
      `/chat/personal/${otherUserId}`,
      data,
    ),

  sendGroupMessage: (groupId: string, data: Record<string, unknown>) =>
    api.post<ApiResponse<Record<string, unknown>>>(
      `/chat/group/${groupId}`,
      data,
    ),

  getConversations: () =>
    api.get<ApiResponse<Record<string, unknown>[]>>('/chat/conversations'),

  deleteMessage: (id: string) =>
    api.delete<ApiResponse<null>>(`/chat/messages/${id}`),

  markRead: (messageId: string) =>
    api.patch<ApiResponse<null>>(`/chat/messages/${messageId}/read`),
};

// ---------------------------------------------------------------------------
// Notification service
// ---------------------------------------------------------------------------

/** Backend GET /notifications wraps the list in `data`, not a bare array. */
export interface NotificationsListPayload {
  notifications: Record<string, unknown>[];
  total: number;
  page: number;
  pages: number;
}

export const notificationService = {
  getAll: (params?: PaginationParams) =>
    api.get<ApiResponse<NotificationsListPayload>>('/notifications', {
      params,
    }),

  getUnreadCount: () =>
    api.get<ApiResponse<{ count: number }>>('/notifications/unread-count'),

  markAsRead: (id: string) =>
    api.patch<ApiResponse<null>>(`/notifications/${id}/read`),

  markAllAsRead: () =>
    api.patch<ApiResponse<null>>('/notifications/read-all'),

  delete: (id: string) =>
    api.delete<ApiResponse<null>>(`/notifications/${id}`),

  deleteAll: () => api.delete<ApiResponse<null>>('/notifications/all'),

  registerPushToken: (token: string, platform: 'ios' | 'android') =>
    api.post<ApiResponse<null>>('/notifications/push-token', {
      token,
      platform,
    }),
};

// ---------------------------------------------------------------------------
// Upload service
// ---------------------------------------------------------------------------

export interface ExcelBulkImportResult {
  total: number;
  success: number;
  failed: Array<{
    row?: number;
    name?: string;
    email?: string;
    reason?: string;
  }>;
}

export const uploadService = {
  /** Society admin: .xlsx with columns Name, Email, Phone, FlatNumber (row 1 = headers). */
  uploadExcel: (formData: FormData) =>
    api.post<ApiResponse<ExcelBulkImportResult>>('/upload/excel', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  uploadImage: (formData: FormData) =>
    api.post<ApiResponse<{ url: string; publicId: string }>>(
      '/upload/image',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    ),

  uploadFile: (formData: FormData) =>
    api.post<ApiResponse<{ url: string; publicId: string; filename: string }>>(
      '/upload/file',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    ),

  uploadMultiple: (formData: FormData) =>
    api.post<ApiResponse<Array<{ url: string; publicId: string }>>>(
      '/upload/multiple',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    ),

  deleteFile: (publicId: string) =>
    api.delete<ApiResponse<null>>(`/upload/${encodeURIComponent(publicId)}`),
};

// ---------------------------------------------------------------------------
// Dashboard service
// ---------------------------------------------------------------------------

export const dashboardService = {
  getSuperAdminStats: () =>
    api.get<ApiResponse<Record<string, unknown>>>('/dashboard/super-admin'),

  /** Society admin dashboard (tenant-scoped; uses JWT societyId). */
  getSocietyAdminStats: () =>
    api.get<ApiResponse<Record<string, unknown>>>('/dashboard/society-admin'),

  getUserDashboard: () =>
    api.get<ApiResponse<Record<string, unknown>>>('/dashboard/user'),

  getRecentActivity: (societyId?: string) =>
    api.get<ApiResponse<Record<string, unknown>[]>>(
      '/dashboard/recent-activity',
      { params: societyId ? { societyId } : undefined },
    ),

  getAnalytics: (societyId: string, period?: '7d' | '30d' | '90d') =>
    api.get<ApiResponse<Record<string, unknown>>>(
      `/dashboard/analytics/${societyId}`,
      { params: { period } },
    ),
};

export default api;
