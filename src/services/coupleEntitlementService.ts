// ─── Couple-Level Entitlement Sync (FUN-PAY-001 §1) ──────────────────────────
//
// 구독은 개인이 아닌 Couple_ID 단위로 귀속된다: 둘 중 한 명이 결제하면
// 커플 전체의 isPremium이 true가 되도록 서버/클라이언트를 동기화한다.
//
// Architecture (partnerReviewService.ts와 동일한 2-레이어 패턴):
//   L1  In-memory store   — 즉시 로컬 반영 (낙관적 업데이트)
//   L2  Supabase Realtime — postgres_changes 채널, coupleId로 스코프
//
// Supabase 미설정 시(로컬/샌드박스) 완전히 로컬 전용으로 동작 — 크래시 없음.
//
// ── RLS DDL (배포 시 1회 적용) ─────────────────────────────────────────────────
// create table public.couple_entitlements (
//   couple_id    text primary key,
//   is_premium   boolean not null default false,
//   plan_id      text,
//   expires_at   timestamptz,
//   purchased_by text,          -- 'me' | 'partner' (엔티티 로컬 관점이 아닌 user_id 권장)
//   updated_at   timestamptz not null default now()
// );
// alter table public.couple_entitlements enable row level security;
// create policy "couple members read/write their own entitlement"
//   on public.couple_entitlements for all
//   using (couple_id = current_setting('request.jwt.claims', true)::json->>'couple_id');
// alter publication supabase_realtime add table public.couple_entitlements;

import type { RealtimeChannel } from '@supabase/supabase-js';
import { isSupabaseReady, supabase } from '../lib/supabaseClient';
import type { PlanId, SubscriptionStatus } from './iapService';

export interface CoupleEntitlement extends SubscriptionStatus {
  purchasedBy: 'me' | 'partner' | null;
}

interface EntitlementRow {
  couple_id: string;
  is_premium: boolean;
  plan_id: PlanId | null;
  expires_at: string | null;
  purchased_by: 'me' | 'partner' | null;
}

type Listener = (entitlement: CoupleEntitlement) => void;

function mapRow(row: EntitlementRow): CoupleEntitlement {
  return {
    isPremium: row.is_premium,
    planId: row.plan_id,
    expiresAt: row.expires_at,
    // 서버 시점에선 이 값이 항상 'partner' 관점이다 (내가 쓴 값은 낙관적 업데이트로 이미 반영됨)
    purchasedBy: row.purchased_by,
  };
}

const store = new Map<string, CoupleEntitlement>();
const listeners = new Map<string, Set<Listener>>();

function emit(coupleId: string, entitlement: CoupleEntitlement): void {
  listeners.get(coupleId)?.forEach((l) => l(entitlement));
}

// ── Supabase Realtime channel registry (one channel per coupleId) ──────────────

const channels = new Map<string, { channel: RealtimeChannel; refCount: number }>();

function ensureChannel(coupleId: string): void {
  if (channels.has(coupleId)) {
    channels.get(coupleId)!.refCount += 1;
    return;
  }
  if (!isSupabaseReady || !supabase) return;

  const client = supabase;
  const channel = client
    .channel(`couple-entitlement-${coupleId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'couple_entitlements', filter: `couple_id=eq.${coupleId}` },
      (payload) => {
        const row = (payload.new ?? payload.old) as EntitlementRow | null;
        if (!row) return;
        const entitlement = mapRow(row);
        store.set(coupleId, entitlement);
        emit(coupleId, entitlement);
      },
    )
    .subscribe();

  channels.set(coupleId, { channel, refCount: 1 });
}

function releaseChannel(coupleId: string): void {
  const state = channels.get(coupleId);
  if (!state) return;
  state.refCount -= 1;
  if (state.refCount <= 0) {
    supabase?.removeChannel(state.channel);
    channels.delete(coupleId);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * 결제 성공 직후 호출 — 로컬 낙관적 반영 + Supabase에 커플 단위로 upsert하여
 * 파트너 기기에도 Realtime으로 즉시 전파한다.
 */
export async function broadcastCoupleEntitlement(
  coupleId: string | null | undefined,
  status: SubscriptionStatus,
  purchasedBy: 'me' | 'partner',
): Promise<void> {
  const entitlement: CoupleEntitlement = { ...status, purchasedBy };
  if (coupleId) {
    store.set(coupleId, entitlement);
    emit(coupleId, entitlement);
  }

  if (!isSupabaseReady || !supabase || !coupleId) return;

  try {
    // couple_entitlements는 커플당 단일 행이다 — purchased_by는 구매자 기기가 쓴 값을
    // 그대로 저장한다 (양쪽 기기가 자신의 로컬 role과 비교해 'me'/'partner'를 해석).
    await supabase.from('couple_entitlements').upsert({
      couple_id: coupleId,
      is_premium: status.isPremium,
      plan_id: status.planId,
      expires_at: status.expiresAt,
      purchased_by: purchasedBy,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[coupleEntitlementService] 동기화 실패 (로컬 낙관적 값은 유지됨):', err);
  }
}

/**
 * 커플 엔타이틀먼트 변경 구독 — 파트너의 구매/해지가 내 기기에도 실시간 반영되도록 함.
 * 반환값은 언마운트 시 반드시 호출해야 하는 unsubscribe 함수.
 */
export function subscribeToCoupleEntitlement(
  coupleId: string | null | undefined,
  listener: Listener,
): () => void {
  if (!coupleId) return () => {};

  if (!listeners.has(coupleId)) listeners.set(coupleId, new Set());
  listeners.get(coupleId)!.add(listener);

  const cached = store.get(coupleId);
  if (cached) listener(cached);

  if (isSupabaseReady && supabase) ensureChannel(coupleId);

  return () => {
    const set = listeners.get(coupleId);
    if (set) {
      set.delete(listener);
      if (set.size === 0) listeners.delete(coupleId);
    }
    if (isSupabaseReady && supabase) releaseChannel(coupleId);
  };
}
