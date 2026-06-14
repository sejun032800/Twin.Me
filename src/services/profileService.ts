// Profile Service (Step #44)
// Handles PATCH /api/v1/user/profile — persists display name and status message.
//
// When EXPO_PUBLIC_API_BASE_URL is unset (dev/preview) a 700 ms stub executes
// so save-state UI stays exercised locally.

const API_BASE: string = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
const TIMEOUT_MS = 8_000;

export interface ProfileUpdatePayload {
  name: string;
  statusMessage: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout:${ms}ms`)), ms),
    ),
  ]);
}

export async function updateUserProfile(payload: ProfileUpdatePayload): Promise<void> {
  if (!API_BASE) {
    await new Promise<void>((resolve) => setTimeout(resolve, 700));
    return;
  }

  const res = await withTimeout(
    fetch(`${API_BASE}/api/v1/user/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    TIMEOUT_MS,
  );

  if (!res.ok) throw new Error(`profile_update_error:${res.status}`);
}
