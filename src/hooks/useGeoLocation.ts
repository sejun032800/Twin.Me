// GPS Location Engine (Step #32)
// Manages expo-location foreground permission state machine and real-time coordinate tracking.
// Exposes a stable coords pair that is always valid — real GPS when available, Seoul fallback otherwise.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

// expo-location is native-only; on web we use navigator.geolocation
let Location: typeof import('expo-location') | null = null;
if (Platform.OS !== 'web') {
  Location = require('expo-location') as typeof import('expo-location');
}

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

  const watchRef   = useRef<{ remove: () => void } | null>(null);
  const mountedRef = useRef(true);
  const coordsRef  = useRef<{ lat: number; lng: number }>(GEO_FALLBACK);

  const applyCoords = useCallback((lat: number, lng: number) => {
    if (!mountedRef.current) return;
    const next = { lat, lng };
    coordsRef.current = next;
    setCoords(next);
    setIsReal(true);
  }, []);

  // ── Web: browser Geolocation API ──────────────────────────────────────────────
  const requestPermissionWeb = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      if (mountedRef.current) setPermission('denied');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (mountedRef.current) setPermission('granted');
        applyCoords(pos.coords.latitude, pos.coords.longitude);
        // Watch ongoing updates
        const id = navigator.geolocation.watchPosition(
          (p) => applyCoords(p.coords.latitude, p.coords.longitude),
          () => {},
          { enableHighAccuracy: false },
        );
        watchRef.current = { remove: () => navigator.geolocation.clearWatch(id) };
      },
      () => {
        if (mountedRef.current) setPermission('denied');
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }, [applyCoords]);

  // ── Native: expo-location ─────────────────────────────────────────────────────
  const startTrackingNative = useCallback(async () => {
    if (!Location || watchRef.current) return;
    try {
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      applyCoords(current.coords.latitude, current.coords.longitude);
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 10_000, distanceInterval: 15 },
        (loc) => applyCoords(loc.coords.latitude, loc.coords.longitude),
      );
      watchRef.current = sub;
    } catch {
      // GPS unavailable — stay at fallback
    }
  }, [applyCoords]);

  const requestPermissionNative = useCallback(async () => {
    if (!Location) return;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === Location.PermissionStatus.GRANTED) {
        if (mountedRef.current) setPermission('granted');
        await startTrackingNative();
      } else {
        if (mountedRef.current) setPermission('denied');
      }
    } catch {
      if (mountedRef.current) setPermission('denied');
    }
  }, [startTrackingNative]);

  const requestPermission = Platform.OS === 'web' ? requestPermissionWeb : requestPermissionNative;

  const recenter = useCallback(async (): Promise<{ lat: number; lng: number }> => {
    if (Platform.OS === 'web') {
      return new Promise((resolve) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          resolve(coordsRef.current);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            applyCoords(pos.coords.latitude, pos.coords.longitude);
            resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          },
          () => resolve(coordsRef.current),
        );
      });
    }
    if (!Location) return coordsRef.current;
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      applyCoords(loc.coords.latitude, loc.coords.longitude);
      return { lat: loc.coords.latitude, lng: loc.coords.longitude };
    } catch {
      return coordsRef.current;
    }
  }, [applyCoords]);

  useEffect(() => {
    mountedRef.current = true;

    if (Platform.OS === 'web') {
      requestPermissionWeb();
    } else {
      (async () => {
        if (!Location) { setPermission('denied'); return; }
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status === Location.PermissionStatus.GRANTED) {
            if (mountedRef.current) setPermission('granted');
            await startTrackingNative();
          } else {
            await requestPermissionNative();
          }
        } catch {
          if (mountedRef.current) setPermission('denied');
        }
      })();
    }

    return () => {
      mountedRef.current = false;
      watchRef.current?.remove();
      watchRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { permission, coords, isReal, requestPermission, recenter };
}
