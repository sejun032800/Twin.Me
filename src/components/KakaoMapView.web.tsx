import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { DateCourse, RecommendedPlace } from '../context/AppContext';

// Replace with your actual Kakao Maps JavaScript App Key
const KAKAO_MAPS_APP_KEY = 'YOUR_KAKAO_MAPS_APP_KEY';

interface Props {
  courses: DateCourse[];
  onMarkerPress?: (course: DateCourse) => void;
  recommendedPlaces?: RecommendedPlace[];
}

declare global {
  interface Window {
    kakao: any;
    __kakaoMapScriptLoaded?: boolean;
  }
}

export default function KakaoMapView({ courses, onMarkerPress, recommendedPlaces }: Props) {
  const containerRef = useRef<View>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const overlaysRef = useRef<any[]>([]);
  const recMarkersRef = useRef<any[]>([]);
  const polylineRef = useRef<any>(null);

  // ── Initialize Kakao Map ───────────────────────────────────────────────────
  const initMap = () => {
    const el = containerRef.current as unknown as HTMLDivElement;
    if (!el || !window.kakao?.maps) return;

    window.kakao.maps.load(() => {
      mapRef.current = new window.kakao.maps.Map(el, {
        center: new window.kakao.maps.LatLng(37.5512, 126.9882),
        level: 7,
      });

      syncMarkers();
      syncRecommendedOverlays();
    });
  };

  // ── Draw recommended polyline + glowing pink markers ─────────────────────
  const syncRecommendedOverlays = () => {
    // Clear previous
    recMarkersRef.current.forEach((m) => m.setMap(null));
    if (polylineRef.current) polylineRef.current.setMap(null);
    recMarkersRef.current = [];
    polylineRef.current = null;

    if (!recommendedPlaces?.length || !mapRef.current || !window.kakao?.maps) return;

    const path = recommendedPlaces.map(
      (p) => new window.kakao.maps.LatLng(p.latitude, p.longitude),
    );

    // Dashed pink polyline
    const polyline = new window.kakao.maps.Polyline({
      path,
      strokeWeight: 3,
      strokeColor: '#FF6B8B',
      strokeOpacity: 0.9,
      strokeStyle: 'dashed',
    });
    polyline.setMap(mapRef.current);
    polylineRef.current = polyline;

    // Glowing numbered markers
    recommendedPlaces.forEach((place, index) => {
      const pos = new window.kakao.maps.LatLng(place.latitude, place.longitude);
      const el = document.createElement('div');
      el.style.cssText = `
        width:34px; height:34px;
        background:linear-gradient(135deg,#FF6B8B,#D946EF);
        border-radius:50%; border:2.5px solid #fff;
        box-shadow:0 0 18px rgba(255,107,139,0.85),0 0 6px rgba(255,107,139,0.6);
        display:flex; align-items:center; justify-content:center;
        font-size:14px; font-weight:800; color:#fff;
        font-family:-apple-system,BlinkMacSystemFont,sans-serif;
        cursor:pointer; user-select:none;
      `;
      el.textContent = String(index + 1);

      const overlay = new window.kakao.maps.CustomOverlay({
        position: pos,
        content: el,
        yAnchor: 1,
        zIndex: 20,
      });
      overlay.setMap(mapRef.current);
      recMarkersRef.current.push(overlay);
    });

    // Pan to fit all recommended places
    const bounds = new window.kakao.maps.LatLngBounds();
    recommendedPlaces.forEach((p) =>
      bounds.extend(new window.kakao.maps.LatLng(p.latitude, p.longitude)),
    );
    mapRef.current.setBounds(bounds, 80, 80, 80, 80);
  };

  // ── Load Kakao Maps SDK ────────────────────────────────────────────────────
  useEffect(() => {
    // Already loaded
    if (window.kakao?.maps) {
      initMap();
      return;
    }

    // Script tag already injected but not yet ready
    if (window.__kakaoMapScriptLoaded) {
      const timer = setInterval(() => {
        if (window.kakao?.maps) {
          clearInterval(timer);
          initMap();
        }
      }, 200);
      return () => clearInterval(timer);
    }

    window.__kakaoMapScriptLoaded = true;
    const script = document.createElement('script');
    script.type = 'text/javascript';
    // autoload=false so we can call kakao.maps.load() manually (avoids race)
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAPS_APP_KEY}&autoload=false`;

    script.onload = initMap;

    script.onerror = () => {
      // Fallback placeholder when App Key is invalid / offline
      const el = containerRef.current as unknown as HTMLDivElement;
      if (!el) return;
      el.innerHTML = `
        <div style="
          width:100%; height:100%;
          background: linear-gradient(135deg, #0A0D1A 0%, #1E293B 100%);
          display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px;
        ">
          <div style="font-size:52px">🗺️</div>
          <div style="
            color:#94A3B8; font-size:14px; text-align:center;
            padding:0 32px; line-height:1.6;
          ">
            카카오 지도를 불러오려면<br/>
            <code style="color:#7C3AED; font-size:12px;">KakaoMapView.web.tsx</code>의<br/>
            <code style="color:#FF6B8B; font-size:12px;">KAKAO_MAPS_APP_KEY</code>를 설정해주세요.
          </div>
          <div style="
            color:#475569; font-size:11px; font-family:monospace;
            background:rgba(124,58,237,0.1); padding:6px 14px; border-radius:8px;
            border:1px solid rgba(124,58,237,0.3);
          ">
            등록된 장소 ${courses.length}곳
          </div>
        </div>
      `;
    };

    document.head.appendChild(script);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync markers whenever courses changes ──────────────────────────────────
  const syncMarkers = () => {
    if (!mapRef.current || !window.kakao?.maps) return;

    // Remove existing markers & custom overlays
    markersRef.current.forEach((m) => m.setMap(null));
    overlaysRef.current.forEach((o) => o.setMap(null));
    markersRef.current = [];
    overlaysRef.current = [];

    courses.forEach((course) => {
      const avg = ((course.myRating + course.partnerRating) / 2).toFixed(1);
      const pos = new window.kakao.maps.LatLng(course.latitude, course.longitude);

      // ── Custom pin marker (signature purple diamond) ────────────────────
      const pinEl = document.createElement('div');
      pinEl.style.cssText = `
        width: 28px; height: 28px;
        background: linear-gradient(135deg, #7C3AED, #FF6B8B);
        border-radius: 50% 50% 0 50%;
        transform: rotate(45deg);
        border: 2.5px solid #fff;
        box-shadow: 0 3px 14px rgba(124,58,237,0.75);
        cursor: pointer;
      `;

      const marker = new window.kakao.maps.CustomOverlay({
        position: pos,
        content: pinEl,
        yAnchor: 1,
      });
      marker.setMap(mapRef.current);
      markersRef.current.push(marker);

      // ── InfoWindow overlay (appears on pin click) ───────────────────────
      const infoEl = document.createElement('div');
      infoEl.style.cssText = `
        display:none;
        background: rgba(10,13,26,0.97);
        border: 1px solid rgba(124,58,237,0.55);
        border-radius: 14px;
        padding: 10px 16px;
        min-width: 180px;
        box-shadow: 0 6px 24px rgba(0,0,0,0.7);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        position: relative;
        bottom: 8px;
        cursor: default;
        user-select: none;
      `;
      infoEl.innerHTML = `
        <div style="color:#F1F5F9; font-size:13px; font-weight:700; margin-bottom:2px;">${course.title}</div>
        <div style="color:#64748B; font-size:11px; margin-bottom:5px;">${course.date}</div>
        <div style="color:#FF6B8B; font-size:13px; font-weight:600;">❤️ 평균 ${avg}점</div>
      `;

      const infoOverlay = new window.kakao.maps.CustomOverlay({
        position: pos,
        content: infoEl,
        yAnchor: 2.4,
        zIndex: 10,
      });

      // Toggle info on pin click
      pinEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = infoEl.style.display !== 'none';
        // Hide all open info overlays first
        overlaysRef.current.forEach((o) => {
          const el = o.getContent?.() as HTMLDivElement | undefined;
          if (el) el.style.display = 'none';
        });
        if (!isVisible) {
          infoEl.style.display = 'block';
          infoOverlay.setMap(mapRef.current);
        }
        onMarkerPress?.(course);
      });

      infoOverlay.setMap(mapRef.current);
      overlaysRef.current.push(infoOverlay);
    });

    // Close all info windows on map click
    window.kakao.maps.event.addListener(mapRef.current, 'click', () => {
      overlaysRef.current.forEach((o) => {
        const el = o.getContent?.() as HTMLDivElement | undefined;
        if (el) el.style.display = 'none';
      });
    });
  };

  useEffect(() => {
    syncMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses]);

  useEffect(() => {
    syncRecommendedOverlays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendedPlaces]);

  return <View ref={containerRef} style={styles.container} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
