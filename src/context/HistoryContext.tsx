/**
 * HistoryContext — dedicated state layer for the History tab's photo-memory pins.
 *
 * Separates photo-derived map data (EXIF-extracted PhotoMeta) from the global
 * AppContext (which manages DateCourse records). Keeps the camera panTo signal
 * here so DateMapView can subscribe to it without prop drilling.
 */

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { PhotoMeta } from '../hooks/usePhotoMetadata';

interface HistoryContextValue {
  // Photo pins derived from EXIF metadata
  historyPlaces: PhotoMeta[];
  addHistoryPlace: (photo: PhotoMeta) => void;
  removeHistoryPlace: (id: string) => void;
  clearHistoryPlaces: () => void;

  // Map camera control — set to a coordinate to trigger a smooth panTo.
  // Automatically clears after the animation window (consumers should not
  // depend on it staying non-null beyond 1.5 s).
  mapPanTarget: { lat: number; lng: number } | null;
  panMapTo: (lat: number, lng: number) => void;
}

const HistoryContext = createContext<HistoryContextValue>({
  historyPlaces: [],
  addHistoryPlace: () => {},
  removeHistoryPlace: () => {},
  clearHistoryPlaces: () => {},
  mapPanTarget: null,
  panMapTo: () => {},
});

export function HistoryProvider({ children }: { children: React.ReactNode }) {
  const [historyPlaces, setHistoryPlaces] = useState<PhotoMeta[]>([]);
  const [mapPanTarget, setMapPanTarget]   = useState<{ lat: number; lng: number } | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addHistoryPlace = useCallback((photo: PhotoMeta) => {
    setHistoryPlaces((prev) => [photo, ...prev]);
  }, []);

  const removeHistoryPlace = useCallback((id: string) => {
    setHistoryPlaces((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearHistoryPlaces = useCallback(() => {
    setHistoryPlaces([]);
  }, []);

  // Trigger a camera pan then auto-clear so the same coordinates can be
  // re-triggered if the user uploads another photo at the same spot.
  const panMapTo = useCallback((lat: number, lng: number) => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    setMapPanTarget({ lat, lng });
    clearTimer.current = setTimeout(() => setMapPanTarget(null), 1400);
  }, []);

  return (
    <HistoryContext.Provider
      value={{
        historyPlaces,
        addHistoryPlace,
        removeHistoryPlace,
        clearHistoryPlaces,
        mapPanTarget,
        panMapTo,
      }}
    >
      {children}
    </HistoryContext.Provider>
  );
}

export const useHistoryContext = () => useContext(HistoryContext);
