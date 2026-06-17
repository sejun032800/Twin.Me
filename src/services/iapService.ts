/**
 * iapService.ts — Native In-App Purchase pipeline (Step #50)
 *
 * Library : react-native-iap v15 (Nitro architecture)
 * Requires: Expo prebuild (bare workflow) or EAS Build
 *           → npx eas build (네이티브 코드 컴파일 필수)
 *
 * Flow (subscription):
 *   initIAP() → purchaseSubscription(planId) → verifyReceipt() → SubscriptionStatus
 *
 * Flow (one-time / theme):
 *   initIAP() → purchaseOneTimeProduct(sku) → transactionId
 *
 * Sandbox mode:
 *   In Expo Go / simulator (Nitro not linked), isNitroReady() returns false.
 *   All purchase functions return simulated success after a short delay.
 *   Sandbox snackbar + visual badge is shown in UI.
 *
 * Receipt verification:
 *   Endpoint is built from EXPO_PUBLIC_API_BASE_URL env var.
 *   If the var is empty the store receipt is trusted locally (dev / staging).
 *
 * teardownIAP() — call in component useEffect cleanup to prevent listener leaks.
 */

import { Platform } from 'react-native';

// react-native-iap is native-only — dynamically required so web builds compile cleanly
type IapModule = typeof import('react-native-iap');
let _rniap: IapModule | null = null;
function iap(): IapModule {
  if (!_rniap) _rniap = require('react-native-iap') as IapModule;
  return _rniap;
}

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

// ─── API Endpoint (env-var based, no hardcoded domain) ───────────────────────

const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');

function getVerifyEndpoint(): string | null {
  return API_BASE ? `${API_BASE}/api/v1/billing/verify-receipt` : null;
}

function getThemeOwnershipEndpoint(): string | null {
  return API_BASE ? `${API_BASE}/api/v1/themes/verify-ownership` : null;
}

// ─── Sandbox Detection ────────────────────────────────────────────────────────
// isNitroReady() lazily tries NitroModules.createHybridObject<RnIap>('RnIap').
// In Expo Go / unlinked environments this throws → sandbox mode.
// In a proper EAS Build the native module is present → live IAP.

let _isSandbox = false;

if (Platform.OS === 'web') {
  _isSandbox = true;
} else {
  try {
    _isSandbox = !iap().isNitroReady();
  } catch {
    _isSandbox = true;
  }
}

/** Returns true when running in Expo Go / simulator without native IAP support. */
export function isSandboxMode(): boolean {
  return _isSandbox;
}

// ─── Connection Lifecycle ─────────────────────────────────────────────────────

let _connected = false;

/**
 * Opens the IAP billing connection.
 * Idempotent — safe to call multiple times.
 * Falls into sandbox mode if the native module is unavailable.
 */
export async function initIAP(): Promise<void> {
  if (_connected) return;
  if (_isSandbox) {
    _connected = true;
    return;
  }
  try {
    await iap().initConnection();
    _connected = true;
  } catch {
    // Native IAP module unavailable (Expo Go, Android emulator, TestFlight sandbox)
    _isSandbox = true;
    _connected = true;
  }
}

/**
 * Closes the IAP billing connection and removes all native listeners.
 * Call in useEffect cleanup to prevent listener leaks on component unmount.
 */
export async function teardownIAP(): Promise<void> {
  if (!_connected) return;
  if (!_isSandbox) {
    try {
      await iap().endConnection();
    } catch {
      // endConnection can throw on Android if already disconnected — safe to ignore
    }
  }
  _connected = false;
}

// ─── Store Product Info ───────────────────────────────────────────────────────

export interface StoreProduct {
  productId: string;
  localizedPrice: string;
  title?: string;
  description?: string;
}

/**
 * Fetches live subscription product metadata (price, title) from the store.
 * Returns hardcoded Korean won prices when in sandbox mode.
 */
export async function getAvailableSubscriptions(): Promise<StoreProduct[]> {
  if (_isSandbox) {
    return [
      {
        productId: IAP_SKUS.coffee,
        localizedPrice: '₩9,900/월',
        title: 'Coffee Break',
        description: '주간 리포트 언락 + 데이트 코스 셔틀 무제한',
      },
      {
        productId: IAP_SKUS.deep,
        localizedPrice: '₩29,900/월',
        title: 'Deep Talk Night',
        description: '취중진담 연출 + 속마음 브리핑 리포트 + 보이스 클로닝',
      },
    ];
  }

  try {
    const result = await iap().fetchProducts({
      skus: Object.values(IAP_SKUS),
      type: 'subs',
    });
    const subs = (result ?? []) as Array<{ id: string; displayPrice: string; title?: string; description?: string }>;
    return subs.map((s) => ({
      productId: s.id,
      localizedPrice: s.displayPrice,
      title: s.title,
      description: s.description,
    }));
  } catch {
    return [];
  }
}

// ─── Receipt Verification ─────────────────────────────────────────────────────

async function verifyReceipt(payload: {
  platform: string;
  productId: string;
  receipt: string;
  transactionId: string;
}): Promise<{ expiresAt: string | null }> {
  const endpoint = getVerifyEndpoint();

  if (!endpoint) {
    // No backend configured (dev / preview) — trust the store receipt locally.
    return { expiresAt: null };
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`VERIFY_FAILED:${res.status}`);
  }

  return res.json() as Promise<{ expiresAt: string | null }>;
}

// ─── Subscription Purchase ────────────────────────────────────────────────────

/**
 * Opens the OS native subscription sheet for the given plan.
 * Waits for the store callback, verifies the receipt with the backend,
 * and returns the updated SubscriptionStatus.
 *
 * In sandbox mode, simulates a successful purchase after 1.2 s.
 *
 * @throws `(err as Error & { userCancelled: true })` when the user dismisses
 *         the payment sheet without completing the purchase.
 */
export async function purchaseSubscription(planId: PlanId): Promise<SubscriptionStatus> {
  const sku = IAP_SKUS[planId];

  if (_isSandbox) {
    await new Promise<void>((r) => setTimeout(r, 1_200));
    return { isPremium: true, planId, expiresAt: null };
  }

  return new Promise<SubscriptionStatus>((resolve, reject) => {
    let settled = false;

    function settle(fn: () => void) {
      if (settled) return;
      settled = true;
      updateSub.remove();
      errorSub.remove();
      fn();
    }

    const { purchaseUpdatedListener, purchaseErrorListener, getReceiptIOS, finishTransaction, requestPurchase } = iap();

    const updateSub = purchaseUpdatedListener(async (purchase) => {
      if (purchase.productId !== sku) return;

      let receipt: string | undefined;
      if (Platform.OS === 'ios') {
        try {
          receipt = await getReceiptIOS();
        } catch {
          receipt = undefined;
        }
      } else {
        receipt = (purchase as { purchaseToken?: string }).purchaseToken ?? undefined;
      }

      if (!receipt) {
        settle(() => reject(new Error('RECEIPT_MISSING')));
        return;
      }

      try {
        const data = await verifyReceipt({
          platform: Platform.OS,
          productId: sku,
          receipt,
          transactionId:
            (purchase as { transactionId?: string }).transactionId ??
            (purchase as { id?: string }).id ??
            '',
        });

        await finishTransaction({ purchase, isConsumable: false });

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

    const errorSub = purchaseErrorListener((err) => {
      if ((err as { code?: string }).code === 'E_USER_CANCELLED') {
        const cancelErr = new Error('USER_CANCELLED') as Error & { userCancelled: boolean };
        cancelErr.userCancelled = true;
        settle(() => reject(cancelErr));
      } else {
        settle(() => reject(new Error(String((err as { message?: string }).message ?? 'IAP_ERROR'))));
      }
    });

    requestPurchase({
      type: 'subs',
      request: {
        apple: { sku },
        google: { skus: [sku] },
      },
    }).catch((err: unknown) => settle(() => reject(err)));
  });
}

// ─── One-Time Product Purchase (used by ThemeShop) ───────────────────────────

/**
 * Triggers the OS native purchase sheet for a one-time (in-app) product.
 * Returns the transactionId on success.
 *
 * In sandbox mode, simulates success and returns a synthetic transaction ID.
 */
export async function purchaseOneTimeProduct(sku: string): Promise<string> {
  if (_isSandbox) {
    await new Promise<void>((r) => setTimeout(r, 900));
    return `sandbox-txn-${Date.now()}`;
  }

  return new Promise<string>((resolve, reject) => {
    let settled = false;

    function settle(fn: () => void) {
      if (settled) return;
      settled = true;
      updateSub.remove();
      errorSub.remove();
      fn();
    }

    const { purchaseUpdatedListener, purchaseErrorListener, finishTransaction, requestPurchase } = iap();

    const updateSub = purchaseUpdatedListener(async (purchase) => {
      if (purchase.productId !== sku) return;
      try {
        await finishTransaction({ purchase, isConsumable: false });
        settle(() =>
          resolve(
            (purchase as { transactionId?: string }).transactionId ??
            (purchase as { id?: string }).id ??
            '',
          ),
        );
      } catch (err) {
        settle(() => reject(err));
      }
    });

    const errorSub = purchaseErrorListener((err) => {
      if ((err as { code?: string }).code === 'E_USER_CANCELLED') {
        const cancelErr = new Error('USER_CANCELLED') as Error & { userCancelled: boolean };
        cancelErr.userCancelled = true;
        settle(() => reject(cancelErr));
      } else {
        settle(() => reject(new Error(String((err as { message?: string }).message ?? 'IAP_ERROR'))));
      }
    });

    requestPurchase({
      type: 'in-app',
      request: {
        apple: { sku },
        google: { skus: [sku] },
      },
    }).catch((err: unknown) => settle(() => reject(err)));
  });
}

// ─── Theme Ownership Verification ────────────────────────────────────────────

/**
 * Verifies theme product ownership with the backend after a successful purchase.
 * Falls back to trusting the local receipt if the backend is unreachable or
 * the API_BASE env var is not configured.
 */
export async function verifyThemeOwnership(
  sku: string,
  transactionId: string,
): Promise<boolean> {
  if (_isSandbox) return true;

  const endpoint = getThemeOwnershipEndpoint();
  if (!endpoint) return true; // No backend configured — trust locally

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku, transactionId }),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { owned?: boolean };
    return json.owned === true;
  } catch {
    return true; // Backend unreachable → trust successful IAP receipt locally
  }
}
