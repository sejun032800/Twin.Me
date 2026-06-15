/**
 * HistoryContext — dedicated state layer for the History tab's photo-memory pins.
 *
 * Separates photo-derived map data (EXIF-extracted PhotoMeta) from the global
 * AppContext (which manages DateCourse records). Keeps the camera panTo signal
 * here so DateMapView can subscribe to it without prop drilling.
 *
 * Persistence: historyPlaces are saved to AsyncStorage so pins survive app restarts.
 * Schema: { id, uri, lat, lng, formattedTime }
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { PhotoMeta } from '../hooks/usePhotoMetadata';

const STORAGE_KEY = '@twin_history_places_v1';

interface HistoryContextValue {
  historyPlaces: PhotoMeta[];
  addHistoryPlace: (photo: PhotoMeta) => void;
  removeHistoryPlace: (id: string) => void;
  clearHistoryPlaces: () => void;

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
  const isHydrated = useRef(false);

  // Hydrate from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const saved: PhotoMeta[] = JSON.parse(raw);
        if (Array.isArray(saved)) setHistoryPlaces(saved);
      } catch (_) {}
    }).finally(() => {
      isHydrated.current = true;
    });
  }, []);

  // Persist whenever historyPlaces changes (skip initial hydration write)
  useEffect(() => {
    if (!isHydrated.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(historyPlaces)).catch(() => {});
  }, [historyPlaces]);

  const addHistoryPlace = useCallback((photo: PhotoMeta) => {
    setHistoryPlaces((prev) => {
      // Deduplicate by id
      if (prev.some((p) => p.id === photo.id)) return prev;
      return [photo, ...prev];
    });
    isHydrated.current = true;
  }, []);

  const removeHistoryPlace = useCallback((id: string) => {
    setHistoryPlaces((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearHistoryPlaces = useCallback(() => {
    setHistoryPlaces([]);
  }, []);

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
