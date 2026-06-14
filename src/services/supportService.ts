// Support Ticket Service (Step #42)
// Submits 1:1 CS tickets to the backend support intake endpoint.
//
// Endpoint: POST /api/v1/support/ticket
// When EXPO_PUBLIC_API_BASE_URL is unset (dev/preview), simulates a 900ms call
// with a 10% failure rate so error-state UI stays exercised locally.

const API_BASE: string = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
const TIMEOUT_MS = 10_000;

export interface SupportTicketPayload {
  appVersion: string;
  deviceId: string;
  sessionMeta: {
    userId?: string;
    subscriptionPlanId?: string;
  };
  subject: string;
  message: string;
  timestamp: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout:${ms}ms`)), ms),
    ),
  ]);
}

export async function submitSupportTicket(payload: SupportTicketPayload): Promise<void> {
  if (!API_BASE) {
    await new Promise<void>((resolve, reject) =>
      setTimeout(() => {
        if (__DEV__ && Math.random() < 0.1) {
          reject(new Error('Simulated ticket submission failure'));
        } else {
          resolve();
        }
      }, 900),
    );
    return;
  }

  const res = await withTimeout(
    fetch(`${API_BASE}/api/v1/support/ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    TIMEOUT_MS,
  );

  if (!res.ok) throw new Error(`support_ticket_error:${res.status}`);
}
