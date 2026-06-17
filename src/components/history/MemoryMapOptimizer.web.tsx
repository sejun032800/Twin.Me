/**
 * MemoryMapOptimizer.web.tsx — Web platform override
 *
 * Replaces the react-native-webview version with a direct Leaflet map
 * rendered inside a <div> via window.L (CDN-injected, same as KakaoMapView.web.tsx).
 */

import React, { memo, useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import type { PhotoMeta } from '../../hooks/usePhotoMetadata';

declare global {
  interface Window {
    L: any;
    __leafletWebOptLoaded?: boolean;
    __leafletWebOptCSS?: boolean;
  }
}

interface Props {
  photos: PhotoMeta[];
  isLight?: boolean;
  panTarget?: { lat: number; lng: number } | null;
  onPhotoPress?: (photo: PhotoMeta) => void;
}

const SEOUL: [number, number] = [37.5512, 126.9882];

const DARK_COLORS  = { primary: '#F48FB1', secondary: '#CE93D8', tertiary: '#1A1A2E', neutral: '#807477' };
const LIGHT_COLORS = { primary: '#70585B', secondary: '#725477', tertiary: '#F9F6F7', neutral: '#7B7676' };

function injectLeaflet(onReady: () => void) {
  if (typeof window === 'undefined') return;
  if (window.L) { onReady(); return; }

  if (!window.__leafletWebOptCSS) {
    window.__leafletWebOptCSS = true;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }

  if (!window.__leafletWebOptLoaded) {
    window.__leafletWebOptLoaded = true;
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = onReady;
    document.head.appendChild(script);
  } else {
    const timer = setInterval(() => {
      if (window.L) { clearInterval(timer); onReady(); }
    }, 80);
  }
}

function MemoryMapOptimizerWeb({ photos, isLight = false, panTarget, onPhotoPress }: Props) {
  const containerRef = useRef<View>(null);
  const mapRef       = useRef<any>(null);
  const markersRef   = useRef<any[]>([]);

  const colors = isLight ? LIGHT_COLORS : DARK_COLORS;

  const syncMarkers = (photoList: PhotoMeta[], c: typeof DARK_COLORS) => {
    const L = window.L;
    const map = mapRef.current;
    if (!L || !map) return;

    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];

    photoList.forEach((photo) => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:22px;height:22px;
          background:radial-gradient(circle,${c.primary},${c.secondary});
          border-radius:50%;
          border:2px solid #fff;
          box-shadow:0 0 10px ${c.primary}99;
          cursor:pointer;
        "></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -14],
      });

      const marker = L.marker([photo.lat, photo.lng], { icon })
        .addTo(map)
        .bindPopup(
          `<div style="
            background:${c.tertiary};border:1px solid ${c.primary}88;
            border-radius:12px;padding:8px 12px;min-width:140px;
            font-family:-apple-system,BlinkMacSystemFont,sans-serif;
          ">
            <div style="color:${c.primary};font-size:11px;margin-bottom:4px;">${photo.formattedTime}</div>
            <img src="${photo.uri}" style="width:120px;height:80px;object-fit:cover;border-radius:8px;" />
          </div>`,
          { className: '', maxWidth: 160 },
        );

      marker.on('click', () => onPhotoPress?.(photo));
      markersRef.current.push(marker);
    });
  };

  const initMap = (photoList: PhotoMeta[], c: typeof DARK_COLORS) => {
    const L = window.L;
    if (!L) return;

    const el = containerRef.current as unknown as HTMLDivElement;
    if (!el) return;

    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

    const tile = isLight
      ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    const map = L.map(el, { center: SEOUL, zoom: 12, zoomControl: true });
    L.tileLayer(tile, {
      attribution: '© OpenStreetMap © CARTO',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map);

    mapRef.current = map;
    syncMarkers(photoList, c);

    if (photoList.length > 0) {
      try {
        const bounds = L.latLngBounds(photoList.map((p) => [p.lat, p.lng]));
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
      } catch (_) {}
    }
  };

  useEffect(() => {
    let destroyed = false;
    const timer = setTimeout(() => {
      if (destroyed) return;
      injectLeaflet(() => {
        if (destroyed) return;
        initMap(photos, isLight ? LIGHT_COLORS : DARK_COLORS);
      });
    }, 60);
    return () => {
      destroyed = true;
      clearTimeout(timer);
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    syncMarkers(photos, isLight ? LIGHT_COLORS : DARK_COLORS);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, isLight]);

  useEffect(() => {
    if (panTarget && mapRef.current) {
      mapRef.current.flyTo([panTarget.lat, panTarget.lng], 15, { animate: true, duration: 0.8 });
    }
  }, [panTarget]);

  return <View ref={containerRef} style={styles.map} />;
}

export default memo(MemoryMapOptimizerWeb);

const styles = StyleSheet.create({
  map: { flex: 1 },
});
