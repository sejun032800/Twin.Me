// Partner place-review synchronisation layer.
// This service owns an in-memory store keyed by Kakao place ID.
// On a real backend this store is backed by Supabase Realtime / Firebase RTDB.
// The hook `usePartnerPlaceReview` is the recommended consumer.

export interface PartnerPlaceReview {
  placeId: string;    // Kakao place ID (KakaoPlace.id)
  rating: number;     // 1–5 (0 means partner hasn't reviewed yet)
  review: string;     // empty string = not yet reviewed
  updatedAt: string;  // ISO-8601 timestamp of last partner update
}

type Listener = (review: PartnerPlaceReview | null) => void;

// Module-level store so updates survive component remounts.
const store = new Map<string, PartnerPlaceReview>();
const listeners = new Map<string, Set<Listener>>();

function emit(placeId: string, review: PartnerPlaceReview | null): void {
  listeners.get(placeId)?.forEach((l) => l(review));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch the partner review for a place.
 * Resolves from the in-memory store (fed by real-time partner updates or
 * seeded from existing DateCourse records).  Returns null when the partner
 * hasn't reviewed the place yet.
 */
export async function fetchPartnerReviewAndRating(
  placeId: string,
): Promise<PartnerPlaceReview | null> {
  // Simulate network round-trip (replace with actual API call once backend exists)
  await new Promise<void>((r) => setTimeout(r, 220));
  return store.get(placeId) ?? null;
}

/**
 * Subscribe to real-time partner review updates for a specific place.
 * The callback fires immediately with the current value if one exists,
 * then again whenever the partner updates their review.
 * Returns an unsubscribe function — call it in useEffect cleanup.
 */
export function subscribeToPartnerReview(
  placeId: string,
  listener: Listener,
): () => void {
  if (!listeners.has(placeId)) listeners.set(placeId, new Set());
  listeners.get(placeId)!.add(listener);

  // Deliver current value immediately so the hook doesn't need a separate fetch
  const current = store.get(placeId) ?? null;
  listener(current);

  return () => {
    listeners.get(placeId)?.delete(listener);
  };
}

/**
 * Insert or update a partner review in the store and notify subscribers.
 * Call this when the backend pushes a real-time update (Supabase channel,
 * WebSocket frame, or Firebase onValue).
 */
export function upsertPartnerReview(review: PartnerPlaceReview): void {
  store.set(review.placeId, review);
  emit(review.placeId, review);
}

/**
 * Seed the store from existing DateCourse records (called by AppContext on mount
 * and whenever dateCourses changes).  Only seeds entries that already have a
 * partner rating so the store never contains empty stubs.
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
    if (store.has(c.kakaoPlaceId)) continue; // real-time update wins — don't overwrite

    store.set(c.kakaoPlaceId, {
      placeId: c.kakaoPlaceId,
      rating: c.partnerRating,
      review: c.partnerReview,
      updatedAt: new Date().toISOString(),
    });
  }
}

/**
 * Send a "콕 찌르기" push notification asking the partner to leave a review
 * for a specific place.
 * Real implementation: POST /api/v1/notifications with { type: 'review_request', placeId, placeName }.
 */
export async function requestPartnerReviewNotification(
  placeId: string,
  placeName: string,
  partnerName: string,
): Promise<void> {
  // Simulate push-notification delivery (~400 ms)
  await new Promise<void>((r) => setTimeout(r, 400));
  // eslint-disable-next-line no-console
  console.log(
    `[partnerReviewService] 📱 콕 찌르기 → ${partnerName} | "${placeName}" (${placeId})`,
  );
}
