import { useCallback, useEffect, useState } from 'react';
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
  /** true after the user has tapped "흔적 남기기 요청하기" — prevents duplicate sends */
  requestSent: boolean;
  requestReview: (placeName: string, partnerName: string) => Promise<void>;
}

/**
 * Reactive hook for a partner's place review.
 *
 * Resolves data through two tiers:
 *   1. In-memory store inside partnerReviewService (seeded from existing
 *      DateCourse records + real-time partner updates).
 *   2. Direct lookup inside dateCourses by kakaoPlaceId as a synchronous
 *      fallback before the async fetch resolves.
 *
 * Automatically re-fetches when placeId changes and subscribes to real-time
 * store updates for the lifetime of the component.
 */
export function usePartnerPlaceReview(
  placeId: string | null,
): UsePartnerPlaceReviewResult {
  const { dateCourses } = useAppContext();
  const [review, setReview] = useState<PartnerPlaceReview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  useEffect(() => {
    if (!placeId) {
      setReview(null);
      setIsLoading(false);
      setRequestSent(false);
      return;
    }

    let cancelled = false;

    // Synchronous pre-fill from existing dateCourses so UI never starts blank
    const existingCourse = dateCourses.find(
      (c) => (c as { kakaoPlaceId?: string }).kakaoPlaceId === placeId,
    ) as { partnerRating: number; partnerReview: string } | undefined;

    if (existingCourse && existingCourse.partnerRating > 0) {
      setReview({
        placeId,
        rating: existingCourse.partnerRating,
        review: existingCourse.partnerReview,
        updatedAt: new Date().toISOString(),
      });
      setIsLoading(false);
    } else {
      setReview(null);
      setIsLoading(true);
    }

    setRequestSent(false);

    // Subscribe to real-time store updates — fires immediately with current value
    const unsub = subscribeToPartnerReview(placeId, (r) => {
      if (!cancelled) {
        setReview(r);
        setIsLoading(false);
      }
    });

    // Async fetch (250 ms simulated latency) — confirms / updates the value
    fetchPartnerReviewAndRating(placeId).then((r) => {
      if (!cancelled) {
        if (r) setReview(r);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId]);

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
