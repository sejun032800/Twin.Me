/**
 * Web version of the history KakaoMapView.
 * Uses Leaflet / OpenStreetMap (no API key needed on web dev).
 * Extends base DateCourse marker support with PhotoMeta photo markers.
 */

import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { DateCourse, RecommendedPlace } from '../../context/AppContext';
import { PhotoMeta } from '../../hooks/usePhotoMetadata';

interface Props {
  courses: DateCourse[];
  photos?: PhotoMeta[];
  recommendedPlaces?: RecommendedPlace[];
  onMarkerPress?: (course: DateCourse) => void;
  panTarget?: { lat: number; lng: number } | null;
}

declare global {
  interface Window {
    L: any;
    __leafletCSSInjected?: boolean;
    __leafletScriptInjected?: boolean;
  }
}

const SEOUL_CENTER: [number, number] = [37.5512, 126.9882];

function injectLeaflet(onReady: () => void) {
  if (typeof window === 'undefined') return;
  if (window.L) { onReady(); return; }

  if (!window.__leafletCSSInjected) {
    window.__leafletCSSInjected = true;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }

  if (!window.__leafletScriptInjected) {
    window.__leafletScriptInjected = true;
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

function ensureStyles() {
  if (document.getElementById('twin-history-map-styles')) return;
  const style = document.createElement('style');
  style.id = 'twin-history-map-styles';
  style.textContent = `
    .twin-popup .leaflet-popup-content-wrapper {
      background:transparent !important; border:none !important;
      box-shadow:none !important; padding:0 !important; border-radius:0 !important;
    }
    .twin-popup .leaflet-popup-content { margin:0 !important; }
    .twin-popup .leaflet-popup-tip-container { display:none !important; }
    .leaflet-control-zoom {
      border:1px solid rgba(124,58,237,.4) !important;
      background:rgba(10,13,26,.9) !important; border-radius:10px !important; overflow:hidden;
    }
    .leaflet-control-zoom a {
      background:transparent !important; color:#94A3B8 !important;
      border-bottom:1px solid rgba(124,58,237,.3) !important;
      width:32px !important; height:32px !important; line-height:32px !important;
    }
    .leaflet-control-zoom a:hover { background:rgba(124,58,237,.22) !important; color:#F1F5F9 !important; }
    .leaflet-control-attribution {
      background:rgba(10,13,26,.65) !important; color:#334155 !important; font-size:9px !important;
    }
    .leaflet-control-attribution a { color:#475569 !important; }
  `;
  document.head.appendChild(style);
}

export default function KakaoMapView({
  courses,
  photos = [],
  recommendedPlaces,
  onMarkerPress,
  panTarget,
}: Props) {
  const containerRef   = useRef<View>(null);
  const mapRef         = useRef<any>(null);
  const courseMarkersRef = useRef<any[]>([]);
  const photoMarkersRef  = useRef<any[]>([]);
  const recLayersRef     = useRef<any[]>([]);

  // ── Sync date-course markers ───────────────────────────────────────────────
  const syncCourses = (list: DateCourse[]) => {
    const L = window.L;
    const map = mapRef.current;
    if (!L || !map) return;

    courseMarkersRef.current.forEach((m) => map.removeLayer(m));
    courseMarkersRef.current = [];

    list.forEach((course) => {
      const avg = ((course.myRating + course.partnerRating) / 2).toFixed(1);
      const isPending = course.myRating === 0 && course.partnerRating === 0;
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:28px;height:28px;
          background:linear-gradient(135deg,#7C3AED,#FF6B8B);
          border-radius:50% 50% 0 50%;transform:rotate(45deg);
          border:2.5px solid #fff;box-shadow:0 3px 14px rgba(124,58,237,.75);cursor:pointer;
        "></div>`,
        iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -32],
      });
      const marker = L.marker([course.latitude, course.longitude], { icon })
        .addTo(map)
        .bindPopup(
          `<div style="
            background:#0A0D1A;border:1px solid rgba(124,58,237,.55);
            border-radius:14px;padding:10px 16px;min-width:176px;
            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
          ">
            <div style="color:#F1F5F9;font-size:13px;font-weight:700;margin-bottom:2px;">${course.title}</div>
            <div style="color:#64748B;font-size:11px;margin-bottom:6px;">${course.date}</div>
            <div style="color:#FF6B8B;font-size:13px;font-weight:600;">
              ${isPending ? '✈️ 방문 예정' : '❤️ 평균 ' + avg + '점'}
            </div>
          </div>`,
          { className: 'twin-popup', maxWidth: 240 },
        );
      marker.on('click', () => onMarkerPress?.(course));
      courseMarkersRef.current.push(marker);
    });
  };

  // ── Sync photo markers ─────────────────────────────────────────────────────
  const syncPhotos = (list: PhotoMeta[]) => {
    const L = window.L;
    const map = mapRef.current;
    if (!L || !map) return;

    photoMarkersRef.current.forEach((m) => map.removeLayer(m));
    photoMarkersRef.current = [];

    list.forEach((photo) => {
      const thumbStyle = [
        'width:46px', 'height:46px', 'border-radius:50%',
        'object-fit:cover', 'border:3px solid #7C3AED',
        'box-shadow:0 0 0 2px rgba(124,58,237,.35),0 4px 14px rgba(124,58,237,.6)',
        'cursor:pointer', 'display:block',
      ].join(';');

      const icon = L.divIcon({
        className: '',
        html: `<img src="${photo.uri}" style="${thumbStyle}" onerror="this.style.cssText='${thumbStyle};background:#7C3AED'"/>`,
        iconSize: [46, 46], iconAnchor: [23, 46], popupAnchor: [0, -50],
      });

      // Sensory popup card: "YYYY.MM.DD HH:mm 여기서의 추억 ✨"
      const popupHTML = `
        <div style="
          background:#0A0D1A;
          border:1px solid rgba(124,58,237,.6);
          border-radius:16px;overflow:hidden;width:172px;
          box-shadow:0 8px 32px rgba(0,0,0,.75),0 0 0 1px rgba(124,58,237,.15);
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        ">
          <div style="position:relative;width:172px;height:148px;overflow:hidden;">
            <img src="${photo.uri}" style="
              width:172px;height:148px;object-fit:cover;display:block;
            " onerror="this.style.cssText='width:172px;height:148px;background:linear-gradient(135deg,#1E293B,#0F172A);display:block;'"/>
            <div style="
              position:absolute;bottom:0;left:0;right:0;height:36px;
              background:linear-gradient(transparent,rgba(10,13,26,.85));
            "></div>
          </div>
          <div style="padding:10px 13px 12px;">
            <div style="margin-bottom:5px;">
              <span style="
                background:linear-gradient(90deg,#7C3AED,#D946EF);
                color:#fff;font-size:9px;font-weight:700;
                letter-spacing:.7px;padding:2px 8px;border-radius:20px;
                text-transform:uppercase;
              ">📸 추억 사진</span>
            </div>
            <div style="color:#F1F5F9;font-size:13px;font-weight:600;line-height:1.35;letter-spacing:-.2px;">
              ${photo.formattedTime}
            </div>
            <div style="
              color:#94A3B8;font-size:11px;font-style:italic;margin-top:3px;
              letter-spacing:.1px;
            ">여기서의 추억 ✨</div>
          </div>
        </div>
      `;

      const marker = L.marker([photo.lat, photo.lng], { icon })
        .addTo(map)
        .bindPopup(popupHTML, { className: 'twin-popup', maxWidth: 190 });
      photoMarkersRef.current.push(marker);
    });
  };

  // ── Sync recommended-place overlays ───────────────────────────────────────
  const syncRecommended = (places?: RecommendedPlace[]) => {
    const L = window.L;
    const map = mapRef.current;
    if (!L || !map) return;

    recLayersRef.current.forEach((l) => map.removeLayer(l));
    recLayersRef.current = [];
    if (!places?.length) return;

    const latlngs: [number, number][] = places.map((p) => [p.latitude, p.longitude]);
    const poly = L.polyline(latlngs, { color: '#FF6B8B', weight: 3, opacity: 0.92, dashArray: '9,9' }).addTo(map);
    recLayersRef.current.push(poly);

    places.forEach((place, i) => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:34px;height:34px;background:linear-gradient(135deg,#FF6B8B,#D946EF);
          border-radius:50%;border:2.5px solid #fff;
          box-shadow:0 0 18px rgba(255,107,139,.85);
          display:flex;align-items:center;justify-content:center;
          font-size:14px;font-weight:800;color:#fff;
          font-family:-apple-system,BlinkMacSystemFont,sans-serif;cursor:pointer;
        ">${i + 1}</div>`,
        iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -36],
      });
      const marker = L.marker([place.latitude, place.longitude], { icon })
        .addTo(map)
        .bindPopup(
          `<div style="
            background:#0A0D1A;border:1px solid rgba(255,107,139,.45);
            border-radius:14px;padding:10px 16px;min-width:186px;
            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
          ">
            <div style="color:#FF6B8B;font-size:11px;font-weight:600;">${place.category}</div>
            <div style="color:#F1F5F9;font-size:13px;font-weight:700;margin:3px 0 4px;">${place.title}</div>
            <div style="color:#94A3B8;font-size:11px;line-height:1.5;">${place.reason}</div>
            <div style="color:#FF6B8B;font-size:11px;margin-top:5px;">🚶 ${place.estimatedTime}</div>
          </div>`,
          { className: 'twin-popup', maxWidth: 250 },
        );
      recLayersRef.current.push(marker);
    });

    try { map.fitBounds(L.latLngBounds(latlngs), { padding: [64, 64], maxZoom: 15 }); } catch (_) {}
  };

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    let destroyed = false;

    const timer = setTimeout(() => {
      if (destroyed) return;
      injectLeaflet(() => {
        if (destroyed) return;
        const L = window.L;
        const el = containerRef.current as unknown as HTMLDivElement;
        if (!el) return;

        ensureStyles();
        if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

        const map = L.map(el, { center: SEOUL_CENTER, zoom: 12, zoomControl: true });
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 20,
        }).addTo(map);
        mapRef.current = map;

        syncCourses(courses);
        syncPhotos(photos);
        syncRecommended(recommendedPlaces);
      });
    }, 60);

    return () => {
      destroyed = true;
      clearTimeout(timer);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { syncCourses(courses); },         [courses]);        // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { syncPhotos(photos); },           [photos]);          // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { syncRecommended(recommendedPlaces); }, [recommendedPlaces]); // eslint-disable-line react-hooks/exhaustive-deps

  // PanTo effect
  useEffect(() => {
    if (!panTarget || !mapRef.current || !window.L) return;
    mapRef.current.panTo([panTarget.lat, panTarget.lng], { animate: true, duration: 0.8 });
  }, [panTarget]);

  return <View ref={containerRef} style={styles.container} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
