import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CoupleLiveStats {
  dDay: number;         // 0 when startedAt is null (shows fallback label)
  dDayLabel: string;   // e.g. "함께한 날", "우리 100일", "우리 1주년"
  photoCount: number;  // dateCourse images + chat uploads
  visitCount: number;  // unique coordinate clusters across dateCourses
  isLoading: boolean;
}

// ─── Module-level cache ───────────────────────────────────────────────────────
// Survives navigation re-mounts; resets on full app restart.
// Used as fallback when primary data is unavailable (e.g. context not hydrated).
let _cache: Omit<CoupleLiveStats, 'isLoading'> | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeDDay(startedAt: string | null): number {
  if (!startedAt) return 0;
  const start = new Date(startedAt);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = today.getTime() - start.getTime();
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}

function dDayLabel(dDay: number, startedAt: string | null): string {
  if (!startedAt) return '사귄 날';
  if (dDay === 0) return '오늘 사귀었어요!';
  // Anniversary milestones (multiples of 365)
  if (dDay > 0 && dDay % 365 === 0) return `우리 ${dDay / 365}주년`;
  // Round-number milestones: 100, 200, 300, …
  if (dDay % 100 === 0) return `우리 ${dDay}일`;
  return '함께한 날';
}

// Round to ~3 decimal places (~100 m precision) for dedup
function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCoupleLiveStats(): CoupleLiveStats {
  const { coupleInfo, dateCourses, uploadedMediaCount } = useAppContext();

  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<Omit<CoupleLiveStats, 'isLoading'>>(() =>
    _cache ?? { dDay: 0, dDayLabel: '함께한 날', photoCount: 0, visitCount: 0 }
  );

  // Keep deps stable to avoid spurious recomputes
  const startedAt = coupleInfo.startedAt;
  const courseCount = dateCourses.length;
  const prevDepsRef = useRef({ startedAt, courseCount, uploadedMediaCount });

  const compute = useCallback(() => {
    const dDay = computeDDay(startedAt);
    const label = dDayLabel(dDay, startedAt);

    // Media: every DateCourse that has an imageUrl + any additional chat uploads
    const coursePhotos = dateCourses.filter((c) => Boolean(c.imageUrl)).length;
    const photoCount = coursePhotos + uploadedMediaCount;

    // Visits: unique coordinate clusters
    const seen = new Set<string>();
    for (const course of dateCourses) {
      seen.add(coordKey(course.latitude, course.longitude));
    }
    const visitCount = seen.size;

    const computed: Omit<CoupleLiveStats, 'isLoading'> = {
      dDay,
      dDayLabel: label,
      photoCount,
      visitCount,
    };

    // Only update state if values actually changed (prevents pointless re-renders)
    setStats((prev) => {
      if (
        prev.dDay === computed.dDay &&
        prev.photoCount === computed.photoCount &&
        prev.visitCount === computed.visitCount
      ) {
        return prev;
      }
      _cache = computed;
      return computed;
    });

    setIsLoading(false);
  }, [startedAt, dateCourses, uploadedMediaCount]);

  useEffect(() => {
    setIsLoading(true);
    compute();
  }, [compute]);

  // Sync re-compute when any of the key deps change between renders
  useEffect(() => {
    const prev = prevDepsRef.current;
    if (
      prev.startedAt !== startedAt ||
      prev.courseCount !== courseCount ||
      prev.uploadedMediaCount !== uploadedMediaCount
    ) {
      prevDepsRef.current = { startedAt, courseCount, uploadedMediaCount };
      compute();
    }
  });

  // On unrecoverable null data, serve cached values so UI never shows 0
  const safeSrc = stats.photoCount === 0 && stats.visitCount === 0 && _cache
    ? _cache
    : stats;

  return { ...safeSrc, isLoading };
}
