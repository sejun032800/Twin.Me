// usePartnerPlaceReview — Step #48
//
// Reactive hook that wires a component to the partner's place review for a
// specific Kakao place ID.
//
// Data pipeline:
//   1. Synchronous pre-fill from existing dateCourses (zero-latency first render)
//   2. subscribeToPartnerReview()  — fires immediately with cached value, then
//      stays open for Supabase Realtime postgres_changes pushes
//   3. fetchPartnerReviewAndRating() — async REST query that refreshes the cache
//      and re-renders if the DB value differs from the cached one
//
// Memory safety:
//   - The `cancelled` flag guards all async continuations from stale state.
//   - The returned cleanup from subscribeToPartnerReview() removes the listener
//     AND decrements the shared Supabase Realtime channel refcount, which tears
//     down the channel automatically when no subscribers remain.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchPartnerReviewAndRating,
  PartnerPlaceReview,
  requestPartnerReviewNotification,
  subscribeToPartnerReview,
} from '../services/partnerReviewService';
import { useAppContext } from '../context/AppContext';

export interface UsePartnerPlaceReviewResult {
  review: PartnerPlaceReview | null;
  isLoading: boolean;
  /** true after the user tapped "흔적 남기기 요청하기" — prevents duplicate sends */
  requestSent: boolean;
  requestReview: (placeName: string, partnerName: string) => Promise<void>;
}

export function usePartnerPlaceReview(
  placeId: string | null | undefined,
): UsePartnerPlaceReviewResult {
  const { dateCourses, coupleId } = useAppContext();

  const [review, setReview] = useState<PartnerPlaceReview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  // Stable ref so the subscription callback always sees the latest coupleId
  // without needing to re-subscribe when only coupleId changes.
  const coupleIdRef = useRef(coupleId);
  coupleIdRef.current = coupleId;

  useEffect(() => {
    if (!placeId) {
      setReview(null);
      setIsLoading(false);
      setRequestSent(false);
      return;
    }

    let cancelled = false;
    setRequestSent(false);

    // ── 1. Synchronous pre-fill from local dateCourses ─────────────────────────
    const existing = dateCourses.find(
      (c) => (c as { kakaoPlaceId?: string }).kakaoPlaceId === placeId,
    ) as { partnerRating?: number; partnerReview?: string } | undefined;

    if (existing && (existing.partnerRating ?? 0) > 0) {
      setReview({
        placeId,
        rating: existing.partnerRating!,
        review: existing.partnerReview ?? '',
        updatedAt: new Date().toISOString(),
      });
      setIsLoading(false);
    } else {
      setReview(null);
      setIsLoading(true);
    }

    // ── 2. Real-time subscription (Supabase Realtime or in-memory cache) ───────
    const unsub = subscribeToPartnerReview(placeId, coupleId, (r) => {
      if (!cancelled) {
        setReview(r);
        setIsLoading(false);
      }
    });

    // ── 3. Async REST fetch — refreshes from Supabase if available ─────────────
    fetchPartnerReviewAndRating(placeId, coupleId).then((r) => {
      if (!cancelled) {
        if (r) setReview(r);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
    // dateCourses intentionally excluded: pre-fill is only for the initial render.
    // Realtime subscription handles ongoing updates without needing to re-subscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId, coupleId]);

  const requestReview = useCallback(
    async (placeName: string, partnerName: string) => {
      if (!placeId || requestSent) return;
      await requestPartnerReviewNotification(placeId, placeName, partnerName);
      setRequestSent(true);
    },
    [placeId, requestSent],
  );

  return { review, isLoading, requestSent, requestReview };
}
