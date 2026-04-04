import { configureStore } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';

import authReducer from './slices/authSlice';
import notificationReducer from './slices/notificationSlice';
import chatReducer from './slices/chatSlice';

// ---------------------------------------------------------------------------
// Store configuration
// ---------------------------------------------------------------------------

export const store = configureStore({
  reducer: {
    auth: authReducer,
    notifications: notificationReducer,
    chat: chatReducer,
  },

  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      // We occasionally store non-serialisable values (e.g. Date objects
      // coerced as strings) and FormData inside thunk arguments.
      // Warn in development for most paths but ignore known safe ones.
      serializableCheck: {
        ignoredActions: [
          // FormData payloads inside these thunks are not serialisable
          'auth/login/pending',
          'auth/login/fulfilled',
          'auth/login/rejected',
        ],
        ignoredPaths: [
          // If any slice ever holds a Date or similar, add the path here
        ],
      },
    }),

  devTools: __DEV__,
});

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

/** The complete Redux state shape. */
export type RootState = ReturnType<typeof store.getState>;

/** The store's dispatch type (understands thunks). */
export type AppDispatch = typeof store.dispatch;

// ---------------------------------------------------------------------------
// Typed hooks
// ---------------------------------------------------------------------------

/**
 * A pre-typed version of `useDispatch` that knows about async thunks.
 * Use this instead of the plain `useDispatch` hook throughout the app.
 *
 * @example
 * const dispatch = useAppDispatch();
 * dispatch(loginThunk({ email, password }));
 */
export const useAppDispatch: () => AppDispatch = useDispatch;

/**
 * A pre-typed version of `useSelector` that automatically infers state shape.
 * Use this instead of the plain `useSelector` hook throughout the app.
 *
 * @example
 * const user = useAppSelector((state) => state.auth.user);
 */
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export default store;
