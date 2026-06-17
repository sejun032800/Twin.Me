// Auth Service (Step #49)
// Handles server-side session blacklisting, SecureStore encrypted token
// persistence, and AsyncStorage cache purge on logout.
//
// Endpoint contract:
//   POST /api/v1/auth/logout — invalidates the refresh token on the server side
//
// Persistence contract:
//   SecureStore  → auth_token, refresh_token  (hardware-backed AES-256 on device)
//   AsyncStorage → non-sensitive session cache (user_session, couple_metadata,
//                  cached_mood_tags) — one-shot multiRemove on logout
//
// Design contract:
//   Local cleanup always runs regardless of server response (defense-in-depth).
//   When API_BASE is not configured (dev / preview) a 300 ms stub is executed
//   so the loading overlay path stays exercised locally.

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// expo-secure-store is native-only; on web we fall back to AsyncStorage
const SecureStore: {
  setItemAsync: (key: string, value: string) => Promise<void>;
  getItemAsync: (key: string) => Promise<string | null>;
  deleteItemAsync: (key: string) => Promise<void>;
} = Platform.OS === 'web'
  ? {
      setItemAsync: (key, value) => AsyncStorage.setItem(key, value),
      getItemAsync: (key) => AsyncStorage.getItem(key),
      deleteItemAsync: (key) => AsyncStorage.removeItem(key),
    }
  : require('expo-secure-store');

const API_BASE: string = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
const LOGOUT_TIMEOUT_MS = 5_000;

// ── SecureStore key names ──────────────────────────────────────────────────
const SECURE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  REFRESH_TOKEN: 'refresh_token',
} as const;

// ── AsyncStorage key names (non-sensitive session cache) ──────────────────
const ASYNC_CACHE_KEYS: string[] = [
  'user_session',
  'couple_metadata',
  'cached_mood_tags',
];

// ─────────────────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Logout timed out after ${ms}ms`)), ms),
    ),
  ]);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Persists auth and refresh tokens into the hardware-backed secure enclave.
 * Call this immediately after a successful login or token refresh.
 */
export async function saveAuthTokens(params: {
  authToken: string;
  refreshToken: string;
}): Promise<void> {
  await Promise.allSettled([
    SecureStore.setItemAsync(SECURE_KEYS.AUTH_TOKEN, params.authToken),
    SecureStore.setItemAsync(SECURE_KEYS.REFRESH_TOKEN, params.refreshToken),
  ]);
}

/**
 * Retrieves the stored auth token from the secure enclave.
 * Returns null if no token has been persisted yet.
 */
export async function getStoredAuthToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SECURE_KEYS.AUTH_TOKEN);
  } catch {
    return null;
  }
}

/**
 * Retrieves the stored refresh token from the secure enclave.
 * Returns null if no token has been persisted yet.
 */
export async function getStoredRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SECURE_KEYS.REFRESH_TOKEN);
  } catch {
    return null;
  }
}

/**
 * Notifies the backend to immediately blacklist the current refresh token.
 * Failures are swallowed — local cleanup must always proceed.
 */
export async function logoutFromServer(): Promise<void> {
  if (!API_BASE) {
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    return;
  }

  try {
    await withTimeout(
      fetch(`${API_BASE}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
      LOGOUT_TIMEOUT_MS,
    );
  } catch {
    // Non-fatal: server blacklist failure; local cleanup still executes.
  }
}

/**
 * Wipes all locally persisted auth tokens and session cache in two layers:
 *
 *   Layer 1 — SecureStore (hardware-backed):
 *     Deletes auth_token and refresh_token from the device secure enclave.
 *     Errors per-key are caught individually so a missing key never aborts
 *     the remaining cleanup.
 *
 *   Layer 2 — AsyncStorage (non-encrypted cache):
 *     Bulk-removes couple session metadata and mood-tag cache in one call.
 *
 * The entire function is wrapped in try-catch so that an unauthenticated
 * logout path (where no tokens were ever stored) degrades gracefully without
 * throwing an Unhandled Promise Rejection.
 */
export async function clearLocalAuthData(): Promise<void> {
  try {
    // Layer 1: encrypted token destruction
    const secureDeletes = [
      SecureStore.deleteItemAsync(SECURE_KEYS.AUTH_TOKEN).catch(() => {}),
      SecureStore.deleteItemAsync(SECURE_KEYS.REFRESH_TOKEN).catch(() => {}),
    ];

    // Layer 2: non-encrypted session cache purge
    const asyncPurge = AsyncStorage.multiRemove(ASYNC_CACHE_KEYS).catch(() => {});

    await Promise.allSettled([...secureDeletes, asyncPurge]);
  } catch {
    // Graceful degradation: never crash the logout flow due to missing storage.
  }
}
