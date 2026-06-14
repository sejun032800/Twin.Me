// GPS Location Engine (Step #32)
// Manages expo-location foreground permission state machine and real-time coordinate tracking.
// Exposes a stable coords pair that is always valid — real GPS when available, Seoul fallback otherwise.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

/** Seoul city centre — default when GPS is unavailable or permission denied */
export const GEO_FALLBACK = { lat: 37.5512, lng: 126.9882 } as const;

export type GeoPermission = 'pending' | 'granted' | 'denied';

export interface GeoState {
  /** Runtime permission status */
  permission: GeoPermission;
  /**
   * Always a valid lat/lng pair.
   * GPS coordinates when permission is granted and a fix is available;
   * GEO_FALLBACK (Seoul) otherwise so callers never need null-guards.
   */
  coords: { lat: number; lng: number };
  /** true = real GPS fix, false = fallback position */
  isReal: boolean;
  /** Trigger the OS permission dialog (no-op if already granted/denied) */
  requestPermission: () => Promise<void>;
  /** Snap to the freshest GPS position; returns the captured coords */
  recenter: () => Promise<{ lat: number; lng: number }>;
}

export function useGeoLocation(): GeoState {
  const [permission, setPermission] = useState<GeoPermission>('pending');
  const [coords, setCoords]         = useState<{ lat: number; lng: number }>(GEO_FALLBACK);
  const [isReal, setIsReal]         = useState(false);

  const watchRef   = useRef<Location.LocationSubscription | null>(null);
  const mountedRef = useRef(true);
  // Mirror of coords state — readable synchronously inside callbacks without closure staleness
  const coordsRef  = useRef<{ lat: number; lng: number }>(GEO_FALLBACK);

  // ── Internal: apply a fresh Location object ───────────────────────────────────
  const applyLoc = useCallback((loc: Location.LocationObject) => {
    if (!mountedRef.current) return;
    const next = { lat: loc.coords.latitude, lng: loc.coords.longitude };
    coordsRef.current = next;
    setCoords(next);
    setIsReal(true);
  }, []);

  // ── Internal: start watchPositionAsync subscription ───────────────────────────
  const startTracking = useCallback(async () => {
    if (watchRef.current) return; // already watching — idempotent
    try {
      // Immediate one-shot fix first so the pin appears without waiting for the watcher
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      applyLoc(current);

      // Subscribe to ongoing position updates (every 10s or 15m moved)
      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy:         Location.Accuracy.Balanced,
          timeInterval:     10_000,
          distanceInterval: 15,
        },
        applyLoc,
      );
    } catch {
      // GPS unavailable (tunnel / indoor / emulator) — coords stay at fallback silently
    }
  }, [applyLoc]);

  // ── Public: request foreground permission from the OS ─────────────────────────
  const requestPermission = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === Location.PermissionStatus.GRANTED) {
        if (mountedRef.current) setPermission('granted');
        await startTracking();
      } else {
        if (mountedRef.current) setPermission('denied');
      }
    } catch {
      if (mountedRef.current) setPermission('denied');
    }
  }, [startTracking]);

  // ── Public: re-acquire current position and return the fresh coords ───────────
  const recenter = useCallback(async (): Promise<{ lat: number; lng: number }> => {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      applyLoc(loc);
      return { lat: loc.coords.latitude, lng: loc.coords.longitude };
    } catch {
      return coordsRef.current; // return last-known position on error
    }
  }, [applyLoc]);

  // ── Mount: check existing permission, auto-request if not yet determined ──────
  useEffect(() => {
    mountedRef.current = true;

    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === Location.PermissionStatus.GRANTED) {
          // Permission already granted from a previous session — start tracking silently
          if (mountedRef.current) setPermission('granted');
          await startTracking();
        } else {
          // First-time activation or previously denied — auto-request per spec
          await requestPermission();
        }
      } catch {
        if (mountedRef.current) setPermission('denied');
      }
    })();

    return () => {
      mountedRef.current = false;
      watchRef.current?.remove();
      watchRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — runs only on mount/unmount

  return { permission, coords, isReal, requestPermission, recenter };
}
