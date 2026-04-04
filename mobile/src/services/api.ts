import axios, {
  AxiosInstance,
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';
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

const BASE_URL = __DEV__
  ? 'http://10.0.2.2:5000/api'
  : (process.env.API_URL ?? 'https://api.soai.app/api');

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

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && !originalRequest._retry) {
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
        const refreshToken = await getRefreshToken();
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        const { data } = await axios.post<{
          accessToken: string;
          refreshToken: string;
        }>(`${BASE_URL}/auth/refresh-token`, { refreshToken });

        await setAccessToken(data.accessToken);
        await setRefreshToken(data.refreshToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        }

        processQueue(null, data.accessToken);
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

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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

  resetPassword: (token: string, password: string) =>
    api.post<ApiResponse<null>>('/auth/reset-password', { token, password }),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<ApiResponse<null>>('/auth/change-password', {
      currentPassword,
      newPassword,
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
  getAll: (params?: PaginationParams & { societyId?: string }) =>
    api.get<PaginatedResponse<Record<string, unknown>>>('/users', { params }),

  getOne: (id: string) =>
    api.get<ApiResponse<Record<string, unknown>>>(`/users/${id}`),

  update: (id: string, data: Record<string, unknown>) =>
    api.put<ApiResponse<Record<string, unknown>>>(`/users/${id}`, data),

  delete: (id: string) =>
    api.delete<ApiResponse<null>>(`/users/${id}`),

  updateProfile: (data: FormData) =>
    api.put<ApiResponse<Record<string, unknown>>>('/users/profile', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

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
      headers:
        data instanceof FormData
          ? { 'Content-Type': 'multipart/form-data' }
          : {},
    }),

  update: (id: string, data: Record<string, unknown>) =>
    api.put<ApiResponse<Record<string, unknown>>>(`/posts/${id}`, data),

  delete: (id: string) =>
    api.delete<ApiResponse<null>>(`/posts/${id}`),

  like: (id: string) =>
    api.post<ApiResponse<{ likes: number }>>(`/posts/${id}/like`),

  unlike: (id: string) =>
    api.post<ApiResponse<{ likes: number }>>(`/posts/${id}/unlike`),

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
      headers:
        data instanceof FormData
          ? { 'Content-Type': 'multipart/form-data' }
          : {},
    }),

  update: (id: string, data: Record<string, unknown>) =>
    api.put<ApiResponse<Record<string, unknown>>>(`/complaints/${id}`, data),

  delete: (id: string) =>
    api.delete<ApiResponse<null>>(`/complaints/${id}`),

  updateStatus: (id: string, status: string, resolution?: string) =>
    api.patch<ApiResponse<Record<string, unknown>>>(
      `/complaints/${id}/status`,
      { status, resolution },
    ),

  addComment: (id: string, content: string) =>
    api.post<ApiResponse<Record<string, unknown>>>(
      `/complaints/${id}/comments`,
      { content },
    ),

  getMyComplaints: (params?: PaginationParams) =>
    api.get<PaginatedResponse<Record<string, unknown>>>('/complaints/my', {
      params,
    }),
};

// ---------------------------------------------------------------------------
// Announcement service
// ---------------------------------------------------------------------------

export const announcementService = {
  getAll: (params?: PaginationParams & { societyId?: string }) =>
    api.get<PaginatedResponse<Record<string, unknown>>>('/announcements', {
      params,
    }),

  getOne: (id: string) =>
    api.get<ApiResponse<Record<string, unknown>>>(`/announcements/${id}`),

  create: (data: Record<string, unknown>) =>
    api.post<ApiResponse<Record<string, unknown>>>('/announcements', data),

  update: (id: string, data: Record<string, unknown>) =>
    api.put<ApiResponse<Record<string, unknown>>>(
      `/announcements/${id}`,
      data,
    ),

  delete: (id: string) =>
    api.delete<ApiResponse<null>>(`/announcements/${id}`),

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
    api.post<ApiResponse<null>>(`/groups/${groupId}/members`, { userId }),

  removeMember: (groupId: string, userId: string) =>
    api.delete<ApiResponse<null>>(`/groups/${groupId}/members/${userId}`),

  makeAdmin: (groupId: string, userId: string) =>
    api.patch<ApiResponse<null>>(`/groups/${groupId}/members/${userId}/admin`),

  getMyGroups: () =>
    api.get<ApiResponse<Record<string, unknown>[]>>('/groups/my'),
};

// ---------------------------------------------------------------------------
// Chat service
// ---------------------------------------------------------------------------

export const chatService = {
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

  sendPersonalMessage: (data: FormData | Record<string, unknown>) =>
    api.post<ApiResponse<Record<string, unknown>>>('/chat/personal', data, {
      headers:
        data instanceof FormData
          ? { 'Content-Type': 'multipart/form-data' }
          : {},
    }),

  sendGroupMessage: (data: FormData | Record<string, unknown>) =>
    api.post<ApiResponse<Record<string, unknown>>>('/chat/group', data, {
      headers:
        data instanceof FormData
          ? { 'Content-Type': 'multipart/form-data' }
          : {},
    }),

  getConversations: () =>
    api.get<ApiResponse<Record<string, unknown>[]>>('/chat/conversations'),

  deleteMessage: (id: string) =>
    api.delete<ApiResponse<null>>(`/chat/messages/${id}`),

  markRead: (messageId: string) =>
    api.patch<ApiResponse<null>>(`/chat/messages/${messageId}/read`),

  markConversationRead: (userId: string) =>
    api.patch<ApiResponse<null>>(`/chat/personal/${userId}/read`),
};

// ---------------------------------------------------------------------------
// Notification service
// ---------------------------------------------------------------------------

export const notificationService = {
  getAll: (params?: PaginationParams) =>
    api.get<PaginatedResponse<Record<string, unknown>>>('/notifications', {
      params,
    }),

  getUnreadCount: () =>
    api.get<ApiResponse<{ count: number }>>('/notifications/unread-count'),

  markAsRead: (id: string) =>
    api.patch<ApiResponse<null>>(`/notifications/${id}/read`),

  markAllAsRead: () =>
    api.patch<ApiResponse<null>>('/notifications/mark-all-read'),

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

export const uploadService = {
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

  getSocietyAdminStats: (societyId: string) =>
    api.get<ApiResponse<Record<string, unknown>>>(
      `/dashboard/society/${societyId}`,
    ),

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
