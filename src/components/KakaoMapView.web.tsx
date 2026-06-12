import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { DateCourse, RecommendedPlace } from '../context/AppContext';

interface Props {
  courses: DateCourse[];
  onMarkerPress?: (course: DateCourse) => void;
  recommendedPlaces?: RecommendedPlace[];
}

declare global {
  interface Window {
    L: any;
    __leafletCSSInjected?: boolean;
    __leafletScriptInjected?: boolean;
  }
}

const SEOUL_CENTER: [number, number] = [37.5512, 126.9882];

// ── Inject Leaflet CSS + JS from CDN ─────────────────────────────────────────

function injectLeaflet(onReady: () => void) {
  if (typeof window === 'undefined') return;

  if (window.L) {
    onReady();
    return;
  }

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
    // Script tag already injected but not loaded yet — poll
    const timer = setInterval(() => {
      if (window.L) {
        clearInterval(timer);
        onReady();
      }
    }, 80);
  }
}

// ── Popup / control styles (injected once) ────────────────────────────────────

function ensureMapStyles() {
  if (document.getElementById('twin-leaflet-styles')) return;
  const style = document.createElement('style');
  style.id = 'twin-leaflet-styles';
  style.textContent = `
    .twin-popup .leaflet-popup-content-wrapper {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      padding: 0 !important;
      border-radius: 0 !important;
    }
    .twin-popup .leaflet-popup-content { margin: 0 !important; }
    .twin-popup .leaflet-popup-tip-container { display: none !important; }
    .leaflet-control-zoom {
      border: 1px solid rgba(124,58,237,0.4) !important;
      background: rgba(10,13,26,0.9) !important;
      border-radius: 10px !important;
      overflow: hidden;
    }
    .leaflet-control-zoom a {
      background: transparent !important;
      color: #94A3B8 !important;
      border-bottom: 1px solid rgba(124,58,237,0.3) !important;
      width: 32px !important;
      height: 32px !important;
      line-height: 32px !important;
      font-size: 16px !important;
    }
    .leaflet-control-zoom a:hover {
      background: rgba(124,58,237,0.22) !important;
      color: #F1F5F9 !important;
    }
    .leaflet-control-attribution {
      background: rgba(10,13,26,0.65) !important;
      color: #334155 !important;
      font-size: 9px !important;
    }
    .leaflet-control-attribution a { color: #475569 !important; }
  `;
  document.head.appendChild(style);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function KakaoMapView({ courses, onMarkerPress, recommendedPlaces }: Props) {
  const containerRef = useRef<View>(null);
  const mapRef        = useRef<any>(null);
  const courseMarkersRef = useRef<any[]>([]);
  const recLayersRef     = useRef<any[]>([]);

  // ── Sync existing-course markers ────────────────────────────────────────────
  const syncCourseMarkers = (coursesArg: DateCourse[]) => {
    const L = window.L;
    const map = mapRef.current;
    if (!L || !map) return;

    courseMarkersRef.current.forEach((m) => map.removeLayer(m));
    courseMarkersRef.current = [];

    coursesArg.forEach((course) => {
      const avg = ((course.myRating + course.partnerRating) / 2).toFixed(1);
      const isPending = course.myRating === 0 && course.partnerRating === 0;

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:28px;height:28px;
          background:linear-gradient(135deg,#7C3AED,#FF6B8B);
          border-radius:50% 50% 0 50%;
          transform:rotate(45deg);
          border:2.5px solid #fff;
          box-shadow:0 3px 14px rgba(124,58,237,0.75);
          cursor:pointer;
        "></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -32],
      });

      const marker = L.marker([course.latitude, course.longitude], { icon })
        .addTo(map)
        .bindPopup(
          `<div style="
            background:#0A0D1A;border:1px solid rgba(124,58,237,0.55);
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

  // ── Sync recommended-place overlays + pink dashed polyline ──────────────────
  const syncRecommended = (places?: RecommendedPlace[]) => {
    const L = window.L;
    const map = mapRef.current;
    if (!L || !map) return;

    recLayersRef.current.forEach((l) => map.removeLayer(l));
    recLayersRef.current = [];

    if (!places?.length) return;

    const latlngs: [number, number][] = places.map((p) => [p.latitude, p.longitude]);

    // ── Pink dashed polyline ───────────────────────────────────────────────
    const polyline = L.polyline(latlngs, {
      color: '#FF6B8B',
      weight: 3,
      opacity: 0.92,
      dashArray: '9, 9',
    }).addTo(map);
    recLayersRef.current.push(polyline);

    // ── Numbered glow markers ──────────────────────────────────────────────
    places.forEach((place, i) => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:34px;height:34px;
          background:linear-gradient(135deg,#FF6B8B,#D946EF);
          border-radius:50%;
          border:2.5px solid #fff;
          box-shadow:0 0 18px rgba(255,107,139,0.85),0 0 6px rgba(255,107,139,0.5);
          display:flex;align-items:center;justify-content:center;
          font-size:14px;font-weight:800;color:#fff;
          font-family:-apple-system,BlinkMacSystemFont,sans-serif;
          cursor:pointer;user-select:none;
        ">${i + 1}</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 34],
        popupAnchor: [0, -36],
      });

      const marker = L.marker([place.latitude, place.longitude], { icon })
        .addTo(map)
        .bindPopup(
          `<div style="
            background:#0A0D1A;border:1px solid rgba(255,107,139,0.45);
            border-radius:14px;padding:10px 16px;min-width:186px;
            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
          ">
            <div style="color:#FF6B8B;font-size:11px;font-weight:600;margin-bottom:3px;">${place.category}</div>
            <div style="color:#F1F5F9;font-size:13px;font-weight:700;margin-bottom:4px;">${place.title}</div>
            <div style="color:#94A3B8;font-size:11px;line-height:1.5;margin-bottom:5px;">${place.reason}</div>
            <div style="color:#FF6B8B;font-size:11px;">🚶 ${place.estimatedTime}</div>
          </div>`,
          { className: 'twin-popup', maxWidth: 250 },
        );

      recLayersRef.current.push(marker);
    });

    // Fit viewport to show all recommended places
    try {
      const bounds = L.latLngBounds(latlngs);
      map.fitBounds(bounds, { padding: [64, 64], maxZoom: 15 });
    } catch (_) {}
  };

  // ── Initialize Leaflet map ─────────────────────────────────────────────────
  const initMap = (coursesArg: DateCourse[], placesArg?: RecommendedPlace[]) => {
    const L = window.L;
    if (!L) return;

    const el = containerRef.current as unknown as HTMLDivElement;
    if (!el) return;

    ensureMapStyles();

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(el, {
      center: SEOUL_CENTER,
      zoom: 12,
      zoomControl: true,
      attributionControl: true,
    });

    // CartoDB dark tiles — free, no API key required
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map);

    mapRef.current = map;
    syncCourseMarkers(coursesArg);
    syncRecommended(placesArg);
  };

  // ── Mount: inject Leaflet then init map ────────────────────────────────────
  useEffect(() => {
    let destroyed = false;

    // Delay slightly so the View has rendered its DOM div with layout dimensions
    const timer = setTimeout(() => {
      if (destroyed) return;
      injectLeaflet(() => {
        if (destroyed) return;
        initMap(courses, recommendedPlaces);
      });
    }, 60);

    return () => {
      destroyed = true;
      clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  // Run once on mount; subsequent changes handled by dedicated effects below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync markers when courses change ────────────────────────────────────────
  useEffect(() => {
    syncCourseMarkers(courses);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses]);

  // ── Sync recommendation overlays when recommendedPlaces changes ─────────────
  useEffect(() => {
    syncRecommended(recommendedPlaces);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendedPlaces]);

  return <View ref={containerRef} style={styles.container} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
