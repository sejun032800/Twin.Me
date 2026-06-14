// Step #46 — Permission Manager Service
// Wraps OS-level permission queries for camera, location, and notifications,
// plus the personal-data archive export endpoint.
//
// Camera    → expo-image-picker  (getCameraPermissionsAsync / requestCameraPermissionsAsync)
// Location  → expo-location      (getForegroundPermissionsAsync / requestForegroundPermissionsAsync)
// Notifications → expo-notifications is not a project dependency; the notification
//                 row therefore always redirects the user to system settings.
// Export    → POST /api/v1/user/data/export

import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Linking } from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface PermissionState {
  camera: PermissionStatus;
  location: PermissionStatus;
  notifications: PermissionStatus;
}

function normalize(status: string): PermissionStatus {
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

// ─── Camera ──────────────────────────────────────────────────────────────────

export async function getCameraStatus(): Promise<PermissionStatus> {
  const { status } = await ImagePicker.getCameraPermissionsAsync();
  return normalize(status);
}

export async function requestCamera(): Promise<PermissionStatus> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  return normalize(status);
}

// ─── Location ─────────────────────────────────────────────────────────────────

export async function getLocationStatus(): Promise<PermissionStatus> {
  const { status } = await Location.getForegroundPermissionsAsync();
  return normalize(status);
}

export async function requestLocation(): Promise<PermissionStatus> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return normalize(status);
}

// ─── Notifications ────────────────────────────────────────────────────────────
// expo-notifications is not installed; permission state cannot be queried at
// runtime. The notification row in the UI always opens system settings so the
// user can toggle the permission there. AppState listener re-syncs on return.

export async function getNotificationsStatus(): Promise<PermissionStatus> {
  return 'undetermined';
}

// ─── Aggregate Query ──────────────────────────────────────────────────────────

export async function getAllPermissions(): Promise<PermissionState> {
  const [camera, location, notifications] = await Promise.all([
    getCameraStatus(),
    getLocationStatus(),
    getNotificationsStatus(),
  ]);
  return { camera, location, notifications };
}

// ─── System Settings Deep-link ────────────────────────────────────────────────

export async function openSystemSettings(): Promise<void> {
  await Linking.openSettings();
}

// ─── Data Archive Export ──────────────────────────────────────────────────────
// POST /api/v1/user/data/export
// Server queues a full personal-data ZIP and emails a signed download link.
// When EXPO_PUBLIC_API_BASE_URL is unset (dev/preview) the call is stubbed.

const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
const TIMEOUT_MS = 12_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('요청 시간이 초과되었습니다.')), ms),
    ),
  ]);
}

export async function requestDataArchive(): Promise<void> {
  if (!API_BASE) {
    await new Promise<void>((r) => setTimeout(r, 900));
    return;
  }
  const res = await withTimeout(
    fetch(`${API_BASE}/api/v1/user/data/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }),
    TIMEOUT_MS,
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { message?: string }).message ?? '데이터 내보내기 요청에 실패했습니다.',
    );
  }
}
