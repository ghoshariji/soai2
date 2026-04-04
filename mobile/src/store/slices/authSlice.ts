import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  authService,
  LoginPayload,
} from '../../services/api';
import {
  clearAuth,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
  setUser,
} from '../../services/storage';
import { disconnect } from '../../services/socket';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UserRole = 'super_admin' | 'society_admin' | 'user';
export type UserStatus = 'active' | 'inactive' | 'pending';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  societyId: string | null;
  profilePhoto: string | null;
  status: UserStatus;
  flatNumber: string | null;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isLoading: false,
  error: null,
  isAuthenticated: false,
};

// ---------------------------------------------------------------------------
// Helper – normalise a raw user object returned by the API
// ---------------------------------------------------------------------------

function normaliseUser(raw: Record<string, unknown>): User {
  return {
    id: (raw._id ?? raw.id ?? '') as string,
    name: (raw.name ?? '') as string,
    email: (raw.email ?? '') as string,
    role: (raw.role ?? 'user') as UserRole,
    societyId: (raw.societyId ?? raw.society ?? null) as string | null,
    profilePhoto: (raw.profilePhoto ?? raw.avatar ?? null) as string | null,
    status: (raw.status ?? 'active') as UserStatus,
    flatNumber: (raw.flatNumber ?? null) as string | null,
  };
}

// ---------------------------------------------------------------------------
// Helper – extract a human-readable error message
// ---------------------------------------------------------------------------

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Axios wraps the server message in response.data
    const axiosData = (error as { response?: { data?: { message?: string } } })
      .response?.data;
    if (axiosData?.message) {
      return axiosData.message;
    }
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unexpected error occurred.';
}

// ---------------------------------------------------------------------------
// Async thunks
// ---------------------------------------------------------------------------

/**
 * Login with email + password.
 * Persists tokens and user to AsyncStorage on success.
 */
export const loginThunk = createAsyncThunk<
  { user: User; accessToken: string; refreshToken: string },
  LoginPayload,
  { rejectValue: string }
>('auth/login', async (payload, { rejectWithValue }) => {
  try {
    const { data } = await authService.login(payload);
    const { user: rawUser, accessToken, refreshToken } = data.data;

    const user = normaliseUser(rawUser as Record<string, unknown>);

    await Promise.all([
      setAccessToken(accessToken),
      setRefreshToken(refreshToken),
      setUser(user),
    ]);

    return { user, accessToken, refreshToken };
  } catch (error) {
    return rejectWithValue(extractErrorMessage(error));
  }
});

/**
 * Logout – calls API endpoint, clears storage, disconnects socket.
 */
export const logoutThunk = createAsyncThunk<void, void, { rejectValue: string }>(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      // Best-effort server call; don't block on failure
      await authService.logout().catch(() => undefined);
    } catch {
      // ignore
    } finally {
      await clearAuth();
      disconnect();
    }

    // resolve regardless of server error so the local state always clears
    return;
  },
);

/**
 * Silently refresh the access token using the stored refresh token.
 */
export const refreshTokenThunk = createAsyncThunk<
  { accessToken: string; refreshToken: string },
  void,
  { rejectValue: string }
>('auth/refreshToken', async (_, { rejectWithValue }) => {
  try {
    const storedRefresh = await getRefreshToken();
    if (!storedRefresh) {
      return rejectWithValue('No refresh token stored');
    }

    const { data } = await authService.refreshToken(storedRefresh);
    const { accessToken, refreshToken } = data.data;

    await Promise.all([
      setAccessToken(accessToken),
      setRefreshToken(refreshToken),
    ]);

    return { accessToken, refreshToken };
  } catch (error) {
    await clearAuth();
    disconnect();
    return rejectWithValue(extractErrorMessage(error));
  }
});

/**
 * Fetch the currently authenticated user's profile.
 * Useful on app boot to rehydrate state from a persisted token.
 */
export const getMeThunk = createAsyncThunk<
  User,
  void,
  { rejectValue: string }
>('auth/getMe', async (_, { rejectWithValue }) => {
  try {
    const token = await getAccessToken();
    if (!token) {
      return rejectWithValue('No access token stored');
    }

    const { data } = await authService.getMe();
    const user = normaliseUser(data.data as Record<string, unknown>);

    await setUser(user);
    return user;
  } catch (error) {
    return rejectWithValue(extractErrorMessage(error));
  }
});

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /**
     * Manually set credentials (e.g. when restoring from AsyncStorage on boot).
     */
    setCredentials(
      state,
      action: PayloadAction<{
        user: User;
        accessToken: string;
        refreshToken: string;
      }>,
    ) {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.isAuthenticated = true;
      state.error = null;
    },

    /**
     * Clear all auth state (e.g. after forced logout from 401 handler).
     */
    clearAuth(state) {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
      state.error = null;
      state.isLoading = false;
    },

    setLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },

    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },

    /**
     * Update specific user fields (e.g. after profile edit).
     */
    updateUser(state, action: PayloadAction<Partial<User>>) {
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
      }
    },
  },

  extraReducers: (builder) => {
    // ------------------------------------------------------------------
    // loginThunk
    // ------------------------------------------------------------------
    builder
      .addCase(loginThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
        state.refreshToken = action.payload.refreshToken;
        state.isAuthenticated = true;
        state.error = null;
      })
      .addCase(loginThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Login failed';
        state.isAuthenticated = false;
      });

    // ------------------------------------------------------------------
    // logoutThunk
    // ------------------------------------------------------------------
    builder
      .addCase(logoutThunk.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(logoutThunk.fulfilled, (state) => {
        state.user = null;
        state.accessToken = null;
        state.refreshToken = null;
        state.isAuthenticated = false;
        state.isLoading = false;
        state.error = null;
      })
      .addCase(logoutThunk.rejected, (state) => {
        // Always clear auth even if the server call failed
        state.user = null;
        state.accessToken = null;
        state.refreshToken = null;
        state.isAuthenticated = false;
        state.isLoading = false;
      });

    // ------------------------------------------------------------------
    // refreshTokenThunk
    // ------------------------------------------------------------------
    builder
      .addCase(refreshTokenThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(refreshTokenThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        state.accessToken = action.payload.accessToken;
        state.refreshToken = action.payload.refreshToken;
      })
      .addCase(refreshTokenThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.user = null;
        state.accessToken = null;
        state.refreshToken = null;
        state.isAuthenticated = false;
        state.error = action.payload ?? 'Session expired. Please log in again.';
      });

    // ------------------------------------------------------------------
    // getMeThunk
    // ------------------------------------------------------------------
    builder
      .addCase(getMeThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getMeThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload;
        state.isAuthenticated = true;
        state.error = null;
      })
      .addCase(getMeThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Failed to fetch user profile';
      });
  },
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const {
  setCredentials,
  clearAuth: clearAuthAction,
  setLoading,
  setError,
  updateUser,
} = authSlice.actions;

export default authSlice.reducer;
