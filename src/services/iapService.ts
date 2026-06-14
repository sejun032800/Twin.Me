/**
 * iapService.ts — Native In-App Purchase pipeline (Step #39)
 *
 * Library: react-native-iap (https://react-native-iap.dooboolab.com/)
 * Install:  npx expo install react-native-iap
 * Requires: Expo prebuild (bare workflow) or EAS Build
 *
 * Flow:
 *   initIAP() → purchaseSubscription(planId) → verifyReceipt() → setSubscriptionStatus()
 *   teardownIAP() on unmount
 */

import { Platform } from 'react-native';

// ─── Public Types ─────────────────────────────────────────────────────────────

export type PlanId = 'coffee' | 'deep';

export interface SubscriptionStatus {
  isPremium: boolean;
  planId: PlanId | null;
  expiresAt: string | null;
}

export const DEFAULT_SUBSCRIPTION_STATUS: SubscriptionStatus = {
  isPremium: false,
  planId: null,
  expiresAt: null,
};

// ─── SKU Registry ─────────────────────────────────────────────────────────────

export const IAP_SKUS: Record<PlanId, string> = {
  coffee: 'coffee_break_monthly',
  deep:   'deep_talk_night_monthly',
};

// ─── Backend endpoint ─────────────────────────────────────────────────────────

const VERIFY_ENDPOINT = 'https://api.twin.me/api/v1/billing/verify-receipt';

// ─── Lazy module loader ───────────────────────────────────────────────────────
// react-native-iap requires a native build; using dynamic require so TS compiles
// before the package is installed (throws a helpful error at runtime instead).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function iap(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-iap');
  } catch {
    throw new Error(
      '[iapService] react-native-iap가 설치되지 않았습니다.\n' +
      '터미널에서 실행: npx expo install react-native-iap',
    );
  }
}

// ─── Connection lifecycle ─────────────────────────────────────────────────────

let _connected = false;

export async function initIAP(): Promise<void> {
  if (_connected) return;
  await iap().initConnection();
  _connected = true;
}

export async function teardownIAP(): Promise<void> {
  if (!_connected) return;
  try {
    await iap().endConnection();
  } catch {
    // endConnection can throw on Android if already disconnected
  }
  _connected = false;
}

// ─── Receipt verification ─────────────────────────────────────────────────────

async function verifyReceipt(payload: {
  platform: string;
  productId: string;
  receipt: string;
  transactionId: string;
}): Promise<{ expiresAt: string | null }> {
  const res = await fetch(VERIFY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`VERIFY_FAILED:${res.status}`);
  }

  return res.json() as Promise<{ expiresAt?: string }>;
}

// ─── Purchase orchestrator ────────────────────────────────────────────────────

/**
 * Triggers the OS native subscription sheet for the given plan, waits for
 * the store approval callback, verifies the receipt with the backend, and
 * returns the updated subscription status.
 *
 * Throws with `(err as Error & { userCancelled?: boolean }).userCancelled === true`
 * when the user explicitly closes the payment sheet.
 */
export async function purchaseSubscription(planId: PlanId): Promise<SubscriptionStatus> {
  const m   = iap();
  const sku = IAP_SKUS[planId];

  return new Promise<SubscriptionStatus>((resolve, reject) => {
    let settled = false;

    // Ensure listeners are cleaned up exactly once
    function settle(fn: () => void) {
      if (settled) return;
      settled = true;
      updateSub.remove();
      errorSub.remove();
      fn();
    }

    // Listen for purchase approval from the store
    const updateSub = m.purchaseUpdatedListener(async (purchase: Record<string, unknown>) => {
      if (purchase.productId !== sku) return;

      const receipt: string | undefined =
        Platform.OS === 'ios'
          ? (purchase.transactionReceipt as string | undefined)
          : (purchase.purchaseToken as string | undefined);

      if (!receipt) {
        settle(() => reject(new Error('RECEIPT_MISSING')));
        return;
      }

      try {
        const data = await verifyReceipt({
          platform: Platform.OS,
          productId: sku,
          receipt,
          transactionId: (purchase.transactionId as string | undefined) ?? '',
        });

        // Acknowledge the transaction (mandatory on both iOS + Android)
        await m.finishTransaction({ purchase, isConsumable: false });

        settle(() =>
          resolve({
            isPremium: true,
            planId,
            expiresAt: data.expiresAt ?? null,
          }),
        );
      } catch (err) {
        settle(() => reject(err));
      }
    });

    // Listen for store-level errors (network, declined, etc.)
    const errorSub = m.purchaseErrorListener((err: Record<string, unknown>) => {
      if (err.code === 'E_USER_CANCELLED') {
        const cancelErr = new Error('USER_CANCELLED') as Error & { userCancelled: boolean };
        cancelErr.userCancelled = true;
        settle(() => reject(cancelErr));
      } else {
        settle(() => reject(new Error(String(err.message ?? 'IAP_ERROR'))));
      }
    });

    // Trigger the native store payment sheet
    m.requestSubscription({ sku }).catch((err: unknown) => {
      settle(() => reject(err));
    });
  });
}
