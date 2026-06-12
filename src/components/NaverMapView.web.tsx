import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { DateCourse } from '../context/AppContext';

// Replace with your actual Naver Cloud Platform Client ID
const NAVER_CLIENT_ID = 'YOUR_NAVER_MAPS_CLIENT_ID';

interface Props {
  courses: DateCourse[];
  onMarkerPress?: (course: DateCourse) => void;
}

declare global {
  interface Window {
    naver: any;
    __naverMapScriptLoaded?: boolean;
  }
}

export default function NaverMapView({ courses, onMarkerPress }: Props) {
  const containerRef = useRef<View>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any>(null);

  const initMap = () => {
    const el = containerRef.current as unknown as HTMLDivElement;
    if (!el || !window.naver?.maps) return;

    mapRef.current = new window.naver.maps.Map(el, {
      center: new window.naver.maps.LatLng(37.5512, 126.9882),
      zoom: 12,
      mapTypeControl: false,
      zoomControl: true,
      zoomControlOptions: {
        position: window.naver.maps.Position.TOP_RIGHT,
      },
      logoControl: false,
    });

    infoWindowRef.current = new window.naver.maps.InfoWindow({
      borderWidth: 0,
      backgroundColor: 'transparent',
      pixelOffset: new window.naver.maps.Point(0, -8),
      disableAnchor: true,
    });
  };

  // Load Naver Maps script once
  useEffect(() => {
    if (window.naver?.maps) {
      initMap();
      return;
    }

    if (window.__naverMapScriptLoaded) {
      // Script is loading; poll until naver.maps is ready
      const timer = setInterval(() => {
        if (window.naver?.maps) {
          clearInterval(timer);
          initMap();
        }
      }, 200);
      return () => clearInterval(timer);
    }

    window.__naverMapScriptLoaded = true;
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = `https://openapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${NAVER_CLIENT_ID}`;
    script.onload = initMap;
    script.onerror = () => {
      // Show fallback: inject a styled placeholder div into the container
      const el = containerRef.current as unknown as HTMLDivElement;
      if (!el) return;
      el.innerHTML = `
        <div style="
          width:100%; height:100%;
          background: linear-gradient(135deg, #0A0D1A 0%, #1E293B 100%);
          display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px;
        ">
          <div style="font-size:48px;">🗺️</div>
          <div style="color:#94A3B8; font-size:14px; text-align:center; padding:0 24px;">
            Naver Maps 클라이언트 ID를 설정하면 지도가 활성화됩니다.<br/>
            <span style="color:#7C3AED; font-size:12px; font-family:monospace;">${NAVER_CLIENT_ID}</span>
          </div>
        </div>
      `;
    };
    document.head.appendChild(script);
  }, []);

  // Sync markers whenever courses array changes
  useEffect(() => {
    if (!mapRef.current || !window.naver?.maps) return;

    // Remove old markers
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    courses.forEach((course) => {
      const avg = ((course.myRating + course.partnerRating) / 2).toFixed(1);

      const markerEl = document.createElement('div');
      markerEl.style.cssText = `
        width:32px; height:32px;
        background: linear-gradient(135deg, #7C3AED, #FF6B8B);
        border-radius: 50% 50% 0 50%;
        transform: rotate(45deg);
        border: 2.5px solid #fff;
        box-shadow: 0 3px 12px rgba(124,58,237,0.7);
        cursor: pointer;
      `;

      const marker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(course.latitude, course.longitude),
        map: mapRef.current,
        icon: {
          content: markerEl,
          anchor: new window.naver.maps.Point(16, 32),
        },
      });

      window.naver.maps.Event.addListener(marker, 'click', () => {
        const content = `
          <div style="
            background: rgba(10,13,26,0.96);
            border: 1px solid rgba(124,58,237,0.45);
            border-radius: 14px;
            padding: 10px 14px;
            min-width: 170px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.6);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          ">
            <div style="color:#F1F5F9; font-size:13px; font-weight:700; margin-bottom:3px;">
              ${course.title}
            </div>
            <div style="color:#64748B; font-size:11px; margin-bottom:5px;">
              ${course.date}
            </div>
            <div style="color:#FF6B8B; font-size:12px; font-weight:600;">
              ❤️ 평균 ${avg}점
            </div>
          </div>
        `;
        infoWindowRef.current?.setContent(content);
        infoWindowRef.current?.open(mapRef.current, marker);
        onMarkerPress?.(course);
      });

      markersRef.current.push(marker);
    });

    // Close infowindow on map click
    window.naver.maps.Event.addListener(mapRef.current, 'click', () => {
      infoWindowRef.current?.close();
    });
  }, [courses]);

  return <View ref={containerRef} style={styles.container} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
