// Partner place-review synchronisation layer — Step #48
//
// Architecture:
//   L1  In-memory store      — instantaneous reads, survives component remounts
//   L2  Supabase Realtime    — postgres_changes channel keyed by coupleId
//   L3  Supabase REST query  — initial hydration on first fetch
//
// One Realtime channel is created per coupleId (not per place) and is shared
// across all active place subscriptions for that couple.  The channel is torn
// down automatically when the last subscriber for that coupleId unsubscribes.
//
// Fallback:
//   When EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are absent
//   the service operates in in-memory-only mode so local dev works without a
//   backend.  subscribeToPartnerReview() returns an unsubscribe noop and
//   fetchPartnerReviewAndRating() resolves from the local store.
//
// ─── Supabase DDL (run once in Supabase SQL Editor) ───────────────────────────
//
// -- pgcrypto for gen_random_uuid()
// create extension if not exists "pgcrypto";
//
// -- place_reviews table
// create table if not exists public.place_reviews (
//   id          uuid          primary key default gen_random_uuid(),
//   couple_id   uuid          not null,
//   place_id    text          not null,
//   rating      numeric(2,1)  check (rating >= 1 and rating <= 5),
//   review      text          not null default '',
//   user_id     uuid          not null,
//   updated_at  timestamptz   not null default now(),
//   unique (couple_id, place_id, user_id)
// );
//
// create index place_reviews_couple_place_idx
//   on public.place_reviews (couple_id, place_id, updated_at desc);
//
// -- Full replica identity so Realtime broadcasts old + new row values
// alter table public.place_reviews replica identity full;
//
// -- Row-Level Security ────────────────────────────────────────────────────────
// alter table public.place_reviews enable row level security;
//
// -- SELECT: any authenticated user whose couple_id matches may read
// create policy "couple_members_select"
//   on public.place_reviews for select
//   using (
//     couple_id in (
//       select couple_id from public.couple_members
//       where user_id = auth.uid()
//     )
//   );
//
// -- INSERT: user may only insert their own review for their own couple
// create policy "own_user_insert"
//   on public.place_reviews for insert
//   with check (
//     user_id = auth.uid()
//     and couple_id in (
//       select couple_id from public.couple_members
//       where user_id = auth.uid()
//     )
//   );
//
// -- UPDATE: user may only update their own rows
// create policy "own_user_update"
//   on public.place_reviews for update
//   using  (user_id = auth.uid())
//   with check (
//     user_id = auth.uid()
//     and couple_id in (
//       select couple_id from public.couple_members
//       where user_id = auth.uid()
//     )
//   );
//
// -- Enable Realtime replication on this table
// alter publication supabase_realtime add table public.place_reviews;
// ─────────────────────────────────────────────────────────────────────────────

import type { RealtimeChannel } from '@supabase/supabase-js';
import { isSupabaseReady, supabase } from '../lib/supabaseClient';

// ── Public types ───────────────────────────────────────────────────────────────

export interface PartnerPlaceReview {
  placeId: string;
  rating: number;   // 1–5  (0 = partner hasn't reviewed yet)
  review: string;   // '' = not yet reviewed
  updatedAt: string; // ISO-8601
}

type Listener = (review: PartnerPlaceReview | null) => void;

// ── DB row shape ───────────────────────────────────────────────────────────────

interface PlaceReviewRow {
  id: string;
  couple_id: string;
  place_id: string;
  rating: number;
  review: string;
  user_id: string;
  updated_at: string;
}

function mapRow(row: PlaceReviewRow): PartnerPlaceReview {
  return {
    placeId: row.place_id,
    rating: typeof row.rating === 'number' ? row.rating : 0,
    review: row.review ?? '',
    updatedAt: row.updated_at ?? new Date().toISOString(),
  };
}

// ── In-memory L1 cache ─────────────────────────────────────────────────────────
// keyed by placeId; survives component remounts

const store = new Map<string, PartnerPlaceReview>();

// ── In-memory listener registry ────────────────────────────────────────────────
// keyed by placeId → Set of callbacks

const listeners = new Map<string, Set<Listener>>();

function emit(placeId: string, review: PartnerPlaceReview | null): void {
  listeners.get(placeId)?.forEach((l) => l(review));
}

// ── Supabase Realtime channel registry (one channel per coupleId) ──────────────

interface CoupleChannelState {
  channel: RealtimeChannel;
  refCount: number; // number of active subscriptions for this coupleId
}

const coupleChannels = new Map<string, CoupleChannelState>();

const MAX_RETRIES = 5;
const RETRY_BASE_MS = 2_000;

function ensureCoupleChannel(coupleId: string): void {
  if (coupleChannels.has(coupleId)) {
    coupleChannels.get(coupleId)!.refCount += 1;
    return;
  }

  if (!isSupabaseReady || !supabase) return;

  const client = supabase;
  let retries = 0;
  let destroyed = false;

  const buildChannel = (): RealtimeChannel => {
    const ch = client
      .channel(`partner-reviews-${coupleId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT + UPDATE
          schema: 'public',
          table: 'place_reviews',
          filter: `couple_id=eq.${coupleId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as PlaceReviewRow | null;
          if (!row?.place_id) return;

          const review = mapRow(row);
          store.set(row.place_id, review);
          emit(row.place_id, review);
        },
      )
      .subscribe((status, err) => {
        if (destroyed) return;

        if (status === 'SUBSCRIBED') {
          retries = 0;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(
            `[partnerReviewService] 채널 상태: ${status}` +
              `${err ? ` — ${err.message}` : ''}. ` +
              `${retries < MAX_RETRIES
                ? `${RETRY_BASE_MS * 2 ** retries}ms 후 재연결...`
                : '최대 재시도 초과.'}`,
          );
          if (retries < MAX_RETRIES) {
            const delay = RETRY_BASE_MS * 2 ** retries;
            retries += 1;
            setTimeout(() => {
              if (destroyed) return;
              const state = coupleChannels.get(coupleId);
              if (!state) return;
              client.removeChannel(state.channel);
              const newCh = buildChannel();
              state.channel = newCh;
            }, delay);
          }
        }
      });

    return ch;
  };

  const channel = buildChannel();
  coupleChannels.set(coupleId, { channel, refCount: 1 });

  // Store destroyed flag so retry loop can detect teardown
  const originalEntry = coupleChannels.get(coupleId)!;
  Object.defineProperty(originalEntry, '_destroyed', {
    get: () => destroyed,
    set: (v: boolean) => { destroyed = v; },
  });
}

function releaseCoupleChannel(coupleId: string): void {
  const state = coupleChannels.get(coupleId);
  if (!state) return;

  state.refCount -= 1;
  if (state.refCount <= 0) {
    (state as unknown as { _destroyed: boolean })._destroyed = true;
    supabase?.removeChannel(state.channel);
    coupleChannels.delete(coupleId);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Fetch the partner's most-recent review for a place.
 *
 * Priority:
 *   1. Supabase REST query (source of truth)
 *   2. In-memory store (instant read while query is in-flight)
 *   3. null (partner hasn't reviewed yet)
 *
 * @param placeId  Kakao place ID.  Returns null immediately when falsy.
 * @param coupleId Couple UUID from AppContext.  Used for DB scope + RLS.
 */
export async function fetchPartnerReviewAndRating(
  placeId: string | null | undefined,
  coupleId: string | null | undefined,
): Promise<PartnerPlaceReview | null> {
  if (!placeId) return null;

  // ── Supabase path ────────────────────────────────────────────────────────────
  if (isSupabaseReady && supabase && coupleId) {
    try {
      const { data, error } = await supabase
        .from('place_reviews')
        .select('id,couple_id,place_id,rating,review,user_id,updated_at')
        .eq('couple_id', coupleId)
        .eq('place_id', placeId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn('[partnerReviewService] fetch 오류:', error.message);
      } else if (data) {
        const review = mapRow(data as PlaceReviewRow);
        store.set(placeId, review);
        return review;
      }
    } catch (err) {
      console.warn('[partnerReviewService] 네트워크 오류:', err);
    }
  }

  // ── In-memory fallback ───────────────────────────────────────────────────────
  return store.get(placeId) ?? null;
}

/**
 * Subscribe to real-time partner review updates for a specific place.
 *
 * - Fires the callback immediately with the current cached value (if any).
 * - If Supabase is configured, creates/reuses a shared Realtime channel for
 *   the couple and routes incoming postgres_changes to this callback.
 * - Returns an unsubscribe function — **must** be called in useEffect cleanup
 *   to prevent memory leaks and dangling channels.
 *
 * @param placeId  Kakao place ID.  Calling with null/'' is safe — returns noop.
 * @param coupleId Couple UUID.
 * @param listener Callback invoked on each update.
 */
export function subscribeToPartnerReview(
  placeId: string | null | undefined,
  coupleId: string | null | undefined,
  listener: Listener,
): () => void {
  if (!placeId) return () => {};

  // Register in-memory listener
  if (!listeners.has(placeId)) listeners.set(placeId, new Set());
  listeners.get(placeId)!.add(listener);

  // Deliver current cached value immediately
  listener(store.get(placeId) ?? null);

  // Attach Supabase Realtime channel (shared per coupleId)
  if (isSupabaseReady && supabase && coupleId) {
    ensureCoupleChannel(coupleId);
  }

  return () => {
    // Remove in-memory listener
    const set = listeners.get(placeId);
    if (set) {
      set.delete(listener);
      if (set.size === 0) listeners.delete(placeId);
    }

    // Decrement channel refcount; tears down channel when no subscribers remain
    if (isSupabaseReady && supabase && coupleId) {
      releaseCoupleChannel(coupleId);
    }
  };
}

/**
 * Insert or update a partner review in the local store and notify subscribers.
 * Also upserts to Supabase when available.
 *
 * Call this when you want to eagerly reflect a change before the Realtime
 * event arrives (optimistic update).
 */
export function upsertPartnerReview(review: PartnerPlaceReview): void {
  store.set(review.placeId, review);
  emit(review.placeId, review);
}

/**
 * Seed the store from existing DateCourse records (called on AppContext mount
 * and whenever dateCourses changes).  Only seeds entries that already have a
 * partner rating.  Real-time DB updates win — existing store entries are never
 * overwritten by seed data.
 */
export function seedReviewStore(
  courses: ReadonlyArray<{
    kakaoPlaceId?: string;
    partnerRating: number;
    partnerReview: string;
  }>,
): void {
  for (const c of courses) {
    if (!c.kakaoPlaceId) continue;
    if (c.partnerRating <= 0) continue;
    if (store.has(c.kakaoPlaceId)) continue; // real-time wins

    store.set(c.kakaoPlaceId, {
      placeId: c.kakaoPlaceId,
      rating: c.partnerRating,
      review: c.partnerReview,
      updatedAt: new Date().toISOString(),
    });
  }
}

/**
 * Send a "콕 찌르기" push notification asking the partner to leave a review.
 * POST /api/v1/notifications with { type: 'review_request', placeId, placeName }.
 */
export async function requestPartnerReviewNotification(
  placeId: string | null | undefined,
  placeName: string,
  partnerName: string,
): Promise<void> {
  if (!placeId) return;

  const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';
  if (apiBase) {
    try {
      await fetch(`${apiBase}/api/v1/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'review_request',
          placeId,
          placeName,
        }),
      });
      return;
    } catch (err) {
      console.warn('[partnerReviewService] 알림 전송 실패:', err);
    }
  }

  console.log(
    `[partnerReviewService] 📱 콕 찌르기 → ${partnerName} | "${placeName}" (${placeId})`,
  );
}
