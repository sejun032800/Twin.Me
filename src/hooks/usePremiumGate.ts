/**
 * usePremiumGate.ts — Step #40
 *
 * Single source of truth for subscription-based feature gating.
 * Reads subscriptionStatus from AppContext, validates expiry in real-time,
 * and exposes plan-tier permission flags consumed by UI components.
 *
 * Tier matrix:
 *   free   → no premium features
 *   coffee → hasReportAccess (blur removed), hasLuxuryUI
 *   deep   → hasReportAccess + hasDeepChatAccess, hasLuxuryUI
 */

import { useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { DEFAULT_SUBSCRIPTION_STATUS, type PlanId } from '../services/iapService';

export type PlanTier = 'free' | 'coffee' | 'deep';

export interface PremiumGateResult {
  isPremium: boolean;
  planTier: PlanTier;
  /** Weekly report blur removal — coffee_break or deep_talk_night */
  hasReportAccess: boolean;
  /** Unlimited deep-chat sessions + deep inference — deep_talk_night only */
  hasDeepChatAccess: boolean;
  /** Luxury UI animations (gold badge, particle aura) — any premium tier */
  hasLuxuryUI: boolean;
  planId: PlanId | null;
}

function isExpiredNow(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

function deriveTier(planId: PlanId | null, effectivelyPremium: boolean): PlanTier {
  if (!effectivelyPremium) return 'free';
  if (planId === 'deep') return 'deep';
  if (planId === 'coffee') return 'coffee';
  return 'free';
}

export function usePremiumGate(): PremiumGateResult {
  const { subscriptionStatus, setSubscriptionStatus } = useAppContext();
  const { isPremium, planId, expiresAt } = subscriptionStatus;

  // Hard-gate: runtime expiry enforcement
  // - On mount / when subscriptionStatus changes: check if already expired.
  // - Schedule a one-shot timeout to revoke exactly when the subscription ends.
  useEffect(() => {
    if (!isPremium || !expiresAt) return;

    const expiryMs = new Date(expiresAt).getTime();
    const remainingMs = expiryMs - Date.now();

    if (remainingMs <= 0) {
      // Already expired — hard revoke immediately, safe to call in effect
      setSubscriptionStatus({ ...DEFAULT_SUBSCRIPTION_STATUS });
      return;
    }

    // setTimeout safe upper bound is ~24.8 days; clamp to avoid silent overflow
    const safeDelay = Math.min(remainingMs, 2_147_483_647);
    const timer = setTimeout(() => {
      setSubscriptionStatus({ ...DEFAULT_SUBSCRIPTION_STATUS });
    }, safeDelay);

    return () => clearTimeout(timer);
  }, [isPremium, expiresAt, setSubscriptionStatus]);

  // Inline check — catches the window before the above effect fires (same render)
  const expired = isPremium && isExpiredNow(expiresAt);
  const effectivelyPremium = isPremium && !expired;
  const tier = deriveTier(planId, effectivelyPremium);

  return {
    isPremium: effectivelyPremium,
    planTier: tier,
    hasReportAccess: tier === 'coffee' || tier === 'deep',
    hasDeepChatAccess: tier === 'deep',
    hasLuxuryUI: effectivelyPremium,
    planId: effectivelyPremium ? planId : null,
  };
}
