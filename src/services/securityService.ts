// Step #45 — Security Service
// Endpoints:
//   POST /api/v1/auth/change-password
//   POST /api/v1/auth/2fa/setup    → { qrCodeBase64, secretKey }
//   POST /api/v1/auth/2fa/activate → { backupCodes }
//   POST /api/v1/auth/2fa/deactivate

const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
const TIMEOUT_MS = 8_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), ms),
    ),
  ]);
}

async function apiFetch<T>(path: string, body: object): Promise<T> {
  const res = await withTimeout(
    fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    TIMEOUT_MS,
  );
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    const err = new Error((payload as { message?: string }).message ?? '요청에 실패했습니다.');
    (err as any).statusCode = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

function stub(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (!API_BASE) {
    await stub(500);
    return;
  }
  await apiFetch('/api/v1/auth/change-password', { currentPassword, newPassword });
}

export interface Setup2FAResult {
  qrCodeBase64: string;
  secretKey: string;
}

export async function setup2FA(): Promise<Setup2FAResult> {
  if (!API_BASE) {
    await stub(700);
    return { qrCodeBase64: '', secretKey: 'JBSWY3DPEHPK3PXP' };
  }
  return apiFetch<Setup2FAResult>('/api/v1/auth/2fa/setup', {});
}

export interface Activate2FAResult {
  backupCodes: string[];
}

export async function activate2FA(otp: string): Promise<Activate2FAResult> {
  if (!API_BASE) {
    await stub(500);
    return {
      backupCodes: ['A1B2-C3D4', 'E5F6-G7H8', 'I9J0-K1L2', 'M3N4-O5P6', 'Q7R8-S9T0'],
    };
  }
  return apiFetch<Activate2FAResult>('/api/v1/auth/2fa/activate', { otp });
}

export async function deactivate2FA(
  credential: string,
  type: 'password' | 'otp',
): Promise<void> {
  if (!API_BASE) {
    await stub(500);
    return;
  }
  await apiFetch('/api/v1/auth/2fa/deactivate', { credential, type });
}
