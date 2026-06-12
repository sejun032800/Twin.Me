/**
 * Expo Go–compatible Kakao Map viewer (native).
 *
 * Uses react-native-webview to embed Kakao Maps JavaScript API inline.
 * When EXPO_PUBLIC_KAKAO_JS_KEY is the placeholder "MOCK_JS_KEY", the map
 * falls back to free OpenStreetMap / CartoDB dark tiles via Leaflet.
 * Replace the key in .env and the component transparently switches to live
 * Kakao Maps with no code changes.
 */

import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import { DateCourse, RecommendedPlace } from '../../context/AppContext';
import { PhotoMeta } from '../../hooks/usePhotoMetadata';

const JS_KEY = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';
const isMockMode = JS_KEY === 'MOCK_JS_KEY' || JS_KEY === '';

interface Props {
  courses: DateCourse[];
  photos?: PhotoMeta[];
  recommendedPlaces?: RecommendedPlace[];
  onMarkerPress?: (course: DateCourse) => void;
  panTarget?: { lat: number; lng: number } | null;
}

// ── Inline HTML ───────────────────────────────────────────────────────────────

function buildHTML(): string {
  const mapInit = isMockMode
    ? /* Leaflet fallback */ `
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = function() {
        map = L.map('map', { center: [37.5512, 126.9882], zoom: 12, zoomControl: true });
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          attribution: '© OpenStreetMap © CARTO',
          subdomains: 'abcd', maxZoom: 20,
        }).addTo(map);
        injectStyles();
        mapReady = true;
        flushQueue();
      };
      document.head.appendChild(script);
    `
    : /* Real Kakao Maps */ `
      const script = document.createElement('script');
      script.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=${JS_KEY}&autoload=false';
      script.onload = function() {
        kakao.maps.load(function() {
          const container = document.getElementById('map');
          const options = { center: new kakao.maps.LatLng(37.5512, 126.9882), level: 5 };
          map = new kakao.maps.Map(container, options);
          mapReady = true;
          flushQueue();
        });
      };
      document.head.appendChild(script);
    `;

  const courseMarkerFn = isMockMode
    ? `
      function renderCourseMarker(course) {
        const avg = ((course.myRating + course.partnerRating) / 2).toFixed(1);
        const isPending = course.myRating === 0 && course.partnerRating === 0;
        const icon = L.divIcon({
          className: '',
          html: \`<div style="
            width:28px;height:28px;
            background:linear-gradient(135deg,#7C3AED,#FF6B8B);
            border-radius:50% 50% 0 50%;transform:rotate(45deg);
            border:2.5px solid #fff;box-shadow:0 3px 14px rgba(124,58,237,.75);
          "></div>\`,
          iconSize: [28,28], iconAnchor: [14,28], popupAnchor: [0,-32],
        });
        const m = L.marker([course.latitude, course.longitude], { icon }).addTo(map);
        m.bindPopup(\`<div style="
          background:#0A0D1A;border:1px solid rgba(124,58,237,.55);
          border-radius:14px;padding:10px 16px;min-width:170px;
          font-family:-apple-system,sans-serif;
        ">
          <div style="color:#F1F5F9;font-size:13px;font-weight:700;">\${course.title}</div>
          <div style="color:#64748B;font-size:11px;margin:2px 0 6px;">\${course.date}</div>
          <div style="color:#FF6B8B;font-size:13px;font-weight:600;">
            \${isPending ? '✈️ 방문 예정' : '❤️ 평균 ' + avg + '점'}
          </div>
        </div>\`, { className:'twin-popup', maxWidth:240 });
        m.on('click', () => rn({ type:'courseMarkerPress', id: course.id }));
        return m;
      }
    `
    : `
      function renderCourseMarker(course) {
        const pos = new kakao.maps.LatLng(course.latitude, course.longitude);
        const avg = ((course.myRating + course.partnerRating) / 2).toFixed(1);
        const isPending = course.myRating === 0 && course.partnerRating === 0;
        const content = \`<div style="
          width:28px;height:28px;
          background:linear-gradient(135deg,#7C3AED,#FF6B8B);
          border-radius:50% 50% 0 50%;transform:rotate(45deg);
          border:2.5px solid #fff;box-shadow:0 3px 14px rgba(124,58,237,.75);
          cursor:pointer;
        "></div>\`;
        const overlay = new kakao.maps.CustomOverlay({ position: pos, content, zIndex:3 });
        overlay.setMap(map);
        const infoContent = \`<div style="
          background:#0A0D1A;border:1px solid rgba(124,58,237,.55);
          border-radius:14px;padding:10px 16px;min-width:170px;
          font-family:-apple-system,sans-serif;
          position:relative;left:-80px;top:-90px;
        ">
          <div style="color:#F1F5F9;font-size:13px;font-weight:700;">\${course.title}</div>
          <div style="color:#64748B;font-size:11px;margin:2px 0 6px;">\${course.date}</div>
          <div style="color:#FF6B8B;font-size:13px;font-weight:600;">
            \${isPending ? '✈️ 방문 예정' : '❤️ 평균 ' + avg + '점'}
          </div>
        </div>\`;
        const info = new kakao.maps.CustomOverlay({ position: pos, content: infoContent, zIndex:4 });
        kakao.maps.event.addListener(overlay, 'click', function() {
          if (openInfo) openInfo.setMap(null);
          if (openInfo === info) { openInfo = null; return; }
          info.setMap(map);
          openInfo = info;
          rn({ type:'courseMarkerPress', id: course.id });
        });
        return { overlay, info };
      }
    `;

  // ── Shared photo popup card HTML (used by both Leaflet and Kakao Maps) ────
  // Renders: circular thumbnail pin → tap → card with preview + "YYYY.MM.DD HH:mm 여기서의 추억 ✨"
  const photoPopupCardHTML = `
    function photoPopupCard(photo) {
      return \`<div style="
        background:#0A0D1A;
        border:1px solid rgba(124,58,237,.6);
        border-radius:16px;overflow:hidden;width:172px;
        box-shadow:0 8px 32px rgba(0,0,0,.75),0 0 0 1px rgba(124,58,237,.15);
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      ">
        <div style="position:relative;width:172px;height:148px;overflow:hidden;">
          <img src="\${photo.uri}" style="
            width:172px;height:148px;object-fit:cover;display:block;
          " onerror="this.style.cssText='width:172px;height:148px;background:linear-gradient(135deg,#1E293B,#0F172A);display:block;'"/>
          <div style="
            position:absolute;bottom:0;left:0;right:0;height:36px;
            background:linear-gradient(transparent,rgba(10,13,26,.85));
          "></div>
        </div>
        <div style="padding:10px 13px 12px;">
          <div style="
            display:flex;align-items:center;gap:5px;margin-bottom:5px;
          ">
            <span style="
              background:linear-gradient(90deg,#7C3AED,#D946EF);
              color:#fff;font-size:9px;font-weight:700;
              letter-spacing:.7px;padding:2px 8px;border-radius:20px;
              text-transform:uppercase;
            ">📸 추억 사진</span>
          </div>
          <div style="color:#F1F5F9;font-size:13px;font-weight:600;line-height:1.35;letter-spacing:-.2px;">
            \${photo.formattedTime}
          </div>
          <div style="
            color:#94A3B8;font-size:11px;font-style:italic;margin-top:3px;
            letter-spacing:.1px;
          ">여기서의 추억 ✨</div>
        </div>
      </div>\`;
    }
  `;

  const photoMarkerFn = isMockMode
    ? `
      ${photoPopupCardHTML}
      function renderPhotoMarker(photo) {
        const thumbStyle = [
          'width:46px','height:46px','border-radius:50%','object-fit:cover',
          'border:3px solid #7C3AED',
          'box-shadow:0 0 0 2px rgba(124,58,237,.35),0 4px 14px rgba(124,58,237,.6)',
          'cursor:pointer','display:block',
        ].join(';');
        const icon = L.divIcon({
          className: '',
          html: \`<img src="\${photo.uri}" style="\${thumbStyle}" onerror="this.style.cssText='\${thumbStyle};background:#7C3AED'"/>\`,
          iconSize:[46,46], iconAnchor:[23,46], popupAnchor:[0,-50],
        });
        const m = L.marker([photo.lat, photo.lng], { icon }).addTo(map);
        m.bindPopup(photoPopupCard(photo), { className:'twin-popup', maxWidth:190 });
        return m;
      }
    `
    : `
      ${photoPopupCardHTML}
      function renderPhotoMarker(photo) {
        const pos = new kakao.maps.LatLng(photo.lat, photo.lng);
        const pinHTML = \`<img src="\${photo.uri}" style="
          width:46px;height:46px;border-radius:50%;object-fit:cover;cursor:pointer;display:block;
          border:3px solid #7C3AED;
          box-shadow:0 0 0 2px rgba(124,58,237,.35),0 4px 14px rgba(124,58,237,.6);
        " onerror="this.style.cssText='width:46px;height:46px;border-radius:50%;display:block;background:#7C3AED;cursor:pointer;'"/>\`;
        const overlay = new kakao.maps.CustomOverlay({ position: pos, content: pinHTML, zIndex:5 });
        overlay.setMap(map);

        const cardHTML = \`<div style="position:relative;left:-75px;top:-222px;">\${photoPopupCard(photo)}</div>\`;
        const info = new kakao.maps.CustomOverlay({ position: pos, content: cardHTML, zIndex:6 });

        function toggleInfo() {
          if (openInfo) { openInfo.setMap(null); if (openInfo === info) { openInfo = null; return; } }
          info.setMap(map);
          openInfo = info;
        }
        const el = overlay.getContent && typeof overlay.getContent === 'function'
          ? overlay.getContent()
          : null;
        if (el && el.addEventListener) el.addEventListener('click', toggleInfo);
        else overlay.a && overlay.a.addEventListener && overlay.a.addEventListener('click', toggleInfo);

        return { overlay, info };
      }
    `;

  const syncRecommendedFn = isMockMode
    ? `
      function syncRecommended(places) {
        recLayers.forEach(l => map.removeLayer(l));
        recLayers = [];
        if (!places || !places.length) return;
        const latlngs = places.map(p => [p.latitude, p.longitude]);
        const poly = L.polyline(latlngs, { color:'#FF6B8B', weight:3, opacity:.92, dashArray:'9,9' }).addTo(map);
        recLayers.push(poly);
        places.forEach((place, i) => {
          const icon = L.divIcon({
            className:'',
            html: \`<div style="
              width:34px;height:34px;background:linear-gradient(135deg,#FF6B8B,#D946EF);
              border-radius:50%;border:2.5px solid #fff;
              box-shadow:0 0 18px rgba(255,107,139,.85);
              display:flex;align-items:center;justify-content:center;
              font-size:14px;font-weight:800;color:#fff;font-family:-apple-system,sans-serif;
            ">\${i+1}</div>\`,
            iconSize:[34,34], iconAnchor:[17,34], popupAnchor:[0,-36],
          });
          const m = L.marker([place.latitude, place.longitude], { icon }).addTo(map);
          m.bindPopup(\`<div style="
            background:#0A0D1A;border:1px solid rgba(255,107,139,.45);
            border-radius:14px;padding:10px 16px;min-width:186px;
            font-family:-apple-system,sans-serif;
          ">
            <div style="color:#FF6B8B;font-size:11px;font-weight:600;">\${place.category}</div>
            <div style="color:#F1F5F9;font-size:13px;font-weight:700;margin:3px 0 4px;">\${place.title}</div>
            <div style="color:#94A3B8;font-size:11px;line-height:1.5;">\${place.reason}</div>
            <div style="color:#FF6B8B;font-size:11px;margin-top:5px;">🚶 \${place.estimatedTime}</div>
          </div>\`, { className:'twin-popup', maxWidth:250 });
          recLayers.push(m);
        });
        try { const b = L.latLngBounds(latlngs); map.fitBounds(b, { padding:[64,64], maxZoom:15 }); } catch(_) {}
      }
    `
    : `
      function syncRecommended(places) {
        recLayers.forEach(function(l) {
          if (l.setMap) l.setMap(null);
          else if (l.getMap) l.setMap(null);
        });
        recLayers = [];
        if (!places || !places.length) return;
        const path = places.map(p => new kakao.maps.LatLng(p.latitude, p.longitude));
        const poly = new kakao.maps.Polyline({
          path, strokeWeight:3, strokeColor:'#FF6B8B',
          strokeOpacity:.92, strokeStyle:'shortdash',
        });
        poly.setMap(map);
        recLayers.push(poly);
        places.forEach(function(place, i) {
          const pos = new kakao.maps.LatLng(place.latitude, place.longitude);
          const content = \`<div style="
            width:34px;height:34px;background:linear-gradient(135deg,#FF6B8B,#D946EF);
            border-radius:50%;border:2.5px solid #fff;
            box-shadow:0 0 18px rgba(255,107,139,.85);
            display:flex;align-items:center;justify-content:center;
            font-size:14px;font-weight:800;color:#fff;font-family:-apple-system,sans-serif;
          ">\${i+1}</div>\`;
          const overlay = new kakao.maps.CustomOverlay({ position:pos, content, zIndex:3 });
          overlay.setMap(map);
          recLayers.push(overlay);
        });
        try {
          const bounds = new kakao.maps.LatLngBounds();
          path.forEach(p => bounds.extend(p));
          map.setBounds(bounds);
        } catch(_) {}
      }
    `;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body { width:100%; height:100%; background:#0A0D1A; }
    #map { width:100%; height:100%; }
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
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = null;
    var mapReady = false;
    var queue = [];
    var courseMarkers = [];
    var photoMarkers = [];
    var recLayers = [];
    var openInfo = null;

    function rn(obj) {
      try { window.ReactNativeWebView.postMessage(JSON.stringify(obj)); } catch(_) {}
    }

    function flushQueue() {
      queue.forEach(function(fn) { try { fn(); } catch(e) {} });
      queue = [];
    }

    function injectStyles() {
      // Additional Leaflet tweaks loaded after L is ready
    }

    ${courseMarkerFn}
    ${photoMarkerFn}
    ${syncRecommendedFn}

    function syncCourses(courses) {
      ${isMockMode ? `
        courseMarkers.forEach(function(m) { map.removeLayer(m); });
        courseMarkers = [];
        courses.forEach(function(course) { courseMarkers.push(renderCourseMarker(course)); });
      ` : `
        courseMarkers.forEach(function(m) { if (m.overlay) m.overlay.setMap(null); if (m.info) m.info.setMap(null); });
        courseMarkers = [];
        courses.forEach(function(course) { courseMarkers.push(renderCourseMarker(course)); });
      `}
    }

    function syncPhotos(photos) {
      ${isMockMode ? `
        photoMarkers.forEach(function(m) { map.removeLayer(m); });
        photoMarkers = [];
        photos.forEach(function(photo) { photoMarkers.push(renderPhotoMarker(photo)); });
      ` : `
        photoMarkers.forEach(function(m) { if (m.overlay) m.overlay.setMap(null); if (m.info) m.info.setMap(null); });
        photoMarkers = [];
        photos.forEach(function(photo) { photoMarkers.push(renderPhotoMarker(photo)); });
      `}
    }

    function panTo(lat, lng) {
      if (!map) return;
      ${isMockMode
        ? 'map.panTo([lat, lng], { animate:true, duration:0.8 });'
        : 'map.panTo(new kakao.maps.LatLng(lat, lng));'
      }
    }

    // ── Message bus (RN → WebView) ─────────────────────────────────────────
    function handleMessage(data) {
      var msg;
      try { msg = JSON.parse(data); } catch(_) { return; }
      var fn = function() {
        if (msg.type === 'syncCourses')     syncCourses(msg.data);
        if (msg.type === 'syncPhotos')      syncPhotos(msg.data);
        if (msg.type === 'syncRecommended') syncRecommended(msg.data);
        if (msg.type === 'panTo')           panTo(msg.lat, msg.lng);
      };
      if (mapReady) { try { fn(); } catch(e) {} }
      else queue.push(fn);
    }

    document.addEventListener('message', function(e) { handleMessage(e.data); });
    window.addEventListener('message',   function(e) { handleMessage(e.data); });

    // ── Boot ──────────────────────────────────────────────────────────────
    ${mapInit}
  </script>
</body>
</html>`;
}

// ── Component ─────────────────────────────────────────────────────────────────

const HTML = buildHTML();

export default function KakaoMapView({
  courses,
  photos = [],
  recommendedPlaces,
  onMarkerPress,
  panTarget,
}: Props) {
  const webViewRef = useRef<WebView>(null);

  const post = (obj: object) => {
    webViewRef.current?.injectJavaScript(
      `handleMessage(${JSON.stringify(JSON.stringify(obj))});true;`,
    );
  };

  useEffect(() => { post({ type: 'syncCourses', data: courses }); }, [courses]);
  useEffect(() => { post({ type: 'syncPhotos', data: photos }); }, [photos]);
  useEffect(() => { post({ type: 'syncRecommended', data: recommendedPlaces ?? [] }); }, [recommendedPlaces]);
  useEffect(() => {
    if (panTarget) post({ type: 'panTo', lat: panTarget.lat, lng: panTarget.lng });
  }, [panTarget]);

  const handleMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'courseMarkerPress' && onMarkerPress) {
        const course = courses.find((c) => c.id === msg.id);
        if (course) onMarkerPress(course);
      }
    } catch (_) {}
  };

  return (
    <WebView
      ref={webViewRef}
      style={styles.map}
      source={{ html: HTML }}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      mixedContentMode="always"
      onMessage={handleMessage}
      // Initial data inject after map is ready
      injectedJavaScript={`
        (function() {
          var courses = ${JSON.stringify(courses)};
          var photos  = ${JSON.stringify(photos)};
          var rec     = ${JSON.stringify(recommendedPlaces ?? [])};
          if (mapReady) {
            syncCourses(courses);
            syncPhotos(photos);
            syncRecommended(rec);
          } else {
            queue.push(function() {
              syncCourses(courses);
              syncPhotos(photos);
              syncRecommended(rec);
            });
          }
        })();
        true;
      `}
    />
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, backgroundColor: '#0A0D1A' },
});
