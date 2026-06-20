// ─── Secret Layer Biometric Auth Engine (FUN-HIS-006) ────────────────────────
//
// Native:  expo-local-authentication → FaceID / fingerprint
// Web:     returns 'web_fallback' so the caller shows WebAuthModal (PIN pad)
//
// Usage:
//   const result = await authenticateSecretLayer();
//   if (result.type === 'web_fallback') showWebAuthModal();
//   else if (result.success) unlockLayer();
//   else showErrorSnackbar();

import { Platform } from 'react-native';

// ── Result discriminated union ────────────────────────────────────────────────

export type AuthResult =
  | { type: 'success' }
  | { type: 'cancelled' }
  | { type: 'failed'; reason: string }
  | { type: 'hardware_unavailable' }
  | { type: 'web_fallback' };        // caller must mount WebAuthModal

// ── Native biometric auth ─────────────────────────────────────────────────────

async function nativeBiometricAuth(): Promise<AuthResult> {
  const LA = require('expo-local-authentication') as typeof import('expo-local-authentication');

  const hasHardware = await LA.hasHardwareAsync();
  if (!hasHardware) {
    return { type: 'hardware_unavailable' };
  }

  const isEnrolled = await LA.isEnrolledAsync();
  if (!isEnrolled) {
    return { type: 'hardware_unavailable' };
  }

  const result = await LA.authenticateAsync({
    promptMessage: '서프라이즈 데이트 계획을 보호하기 위해 FaceID/지문 인증이 필요합니다.',
    cancelLabel: '취소',
    fallbackLabel: 'PIN 입력',
    disableDeviceFallback: false,
  });

  if (result.success) return { type: 'success' };
  if (result.error === 'user_cancel' || result.error === 'system_cancel') {
    return { type: 'cancelled' };
  }
  return { type: 'failed', reason: result.error ?? 'unknown' };
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function authenticateSecretLayer(): Promise<AuthResult> {
  if (Platform.OS === 'web') {
    // Web (사지방 크롬 등) — PIN fallback via WebAuthModal
    return { type: 'web_fallback' };
  }
  return nativeBiometricAuth();
}

// ── Web PIN validation (4-digit, used by WebAuthModal) ───────────────────────

const WEB_SECRET_PIN = '0000'; // default demo PIN

export function validateWebPin(pin: string): boolean {
  return pin === WEB_SECRET_PIN;
}

export { WEB_SECRET_PIN };
