/**
 * Expo Go–compatible Kakao Map viewer (native).
 *
 * Uses react-native-webview to embed Kakao Maps JavaScript API inline.
 * When EXPO_PUBLIC_KAKAO_JS_KEY is the placeholder "MOCK_JS_KEY", the map
 * falls back to free OpenStreetMap / CartoDB dark tiles via Leaflet.
 *
 * New in Step #51:
 *  - candidatePlaces — renders A/B/C labeled neon-green/yellow pins
 *  - onMapLongPress  — fires when user long-presses an empty map area
 *  - onCandidatePress — fires when user taps a candidate pin
 *  - renderCourseMarker now colors pending (pink) vs archived (purple) pins differently
 */

import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import { DateCourse, RecommendedPlace } from '../../context/AppContext';
import { PhotoMeta } from '../../hooks/usePhotoMetadata';
import type { CandidatePlace } from '../../utils/courseRecommendation';

const JS_KEY = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';
const isMockMode = JS_KEY === 'MOCK_JS_KEY' || JS_KEY === '';

interface Props {
  courses: DateCourse[];
  photos?: PhotoMeta[];
  recommendedPlaces?: RecommendedPlace[];
  /** A/B/C candidate pins from the DateMapPlanner engine */
  candidatePlaces?: CandidatePlace[];
  onMarkerPress?: (course: DateCourse) => void;
  /** Fires when user long-presses an empty map spot */
  onMapLongPress?: (lat: number, lng: number) => void;
  /** Fires when user taps a candidate pin */
  onCandidatePress?: (id: string, label: string) => void;
  panTarget?: { lat: number; lng: number } | null;
  courseRoute?: Array<{ latitude: number; longitude: number }>;
  userLocation?: { lat: number; lng: number };
}

// ── Polyline route sync ───────────────────────────────────────────────────────

const syncCourseRouteFn = isMockMode
  ? `
    function syncCourseRoute(coords) {
      if (coursesPolyline) { map.removeLayer(coursesPolyline); coursesPolyline = null; }
      if (!coords || coords.length <= 1) return;
      var latlngs = coords.map(function(c) { return [c.latitude, c.longitude]; });
      coursesPolyline = L.polyline(latlngs, {
        color: '#D946EF', weight: 4, opacity: 0.82, dashArray: '10, 5',
      }).addTo(map);
      if (recLayers.length === 0) {
        try { var b = L.latLngBounds(latlngs); map.fitBounds(b, { padding: [52, 52], maxZoom: 14 }); } catch(_) {}
      }
    }
  `
  : `
    function syncCourseRoute(coords) {
      if (coursesPolyline) { coursesPolyline.setMap(null); coursesPolyline = null; }
      if (!coords || coords.length <= 1) return;
      var path = coords.map(function(c) { return new kakao.maps.LatLng(c.latitude, c.longitude); });
      coursesPolyline = new kakao.maps.Polyline({
        path: path, strokeWeight: 4, strokeColor: '#D946EF', strokeOpacity: 0.82, strokeStyle: 'shortdash',
      });
      coursesPolyline.setMap(map);
      if (recLayers.length === 0) {
        try {
          var bounds = new kakao.maps.LatLngBounds();
          path.forEach(function(p) { bounds.extend(p); });
          map.setBounds(bounds);
        } catch(_) {}
      }
    }
  `;

// ── Candidate A/B/C pins ──────────────────────────────────────────────────────

const syncCandidatePlacesFn = isMockMode
  ? `
    function syncCandidatePlaces(places) {
      candidateLayers.forEach(function(l) { map.removeLayer(l); });
      candidateLayers = [];
      if (!places || !places.length) return;
      var colorMap = { A: '#4ADE80', B: '#FBBF24', C: '#34D399' };
      places.forEach(function(place) {
        var c = colorMap[place.label] || '#4ADE80';
        var icon = L.divIcon({
          className: '',
          html: '<div style="' +
            'width:38px;height:38px;' +
            'background:' + c + ';' +
            'border-radius:50%;' +
            'border:3px solid rgba(255,255,255,0.92);' +
            'box-shadow:0 0 20px ' + c + 'bb,0 4px 10px rgba(0,0,0,.35);' +
            'display:flex;align-items:center;justify-content:center;' +
            'font-size:15px;font-weight:900;color:#0A0D1A;' +
            'font-family:-apple-system,sans-serif;' +
          '">' + place.label + '</div>',
          iconSize: [38, 38], iconAnchor: [19, 38], popupAnchor: [0, -42],
        });
        var m = L.marker([place.latitude, place.longitude], { icon: icon }).addTo(map);
        m.bindPopup(
          '<div style="background:#0A0D1A;border:1px solid ' + c + '66;border-radius:14px;padding:10px 16px;min-width:182px;font-family:-apple-system,sans-serif;">' +
            '<div style="color:' + c + ';font-size:13px;font-weight:800;">후보 ' + place.label + '</div>' +
            '<div style="color:#F1F5F9;font-size:13px;font-weight:700;margin:3px 0 4px;">' + place.title + '</div>' +
            '<div style="color:#94A3B8;font-size:11px;">' + place.category + '</div>' +
            '<div style="color:' + c + ';font-size:11px;margin-top:5px;">' +
              (place.distance <= 800 ? '🚶 도보 ' + place.walkMinutes + '분' : '🚗 차량 ' + place.driveMinutes + '분') +
              ' · ' + place.distance + 'm' +
            '</div>' +
          '</div>',
          { className: 'twin-popup', maxWidth: 240 }
        );
        m.on('click', function() { rn({ type: 'candidatePress', id: place.id, label: place.label }); });
        candidateLayers.push(m);
      });
    }
  `
  : `
    function syncCandidatePlaces(places) {
      candidateLayers.forEach(function(l) {
        if (l && l.setMap) l.setMap(null);
      });
      candidateLayers = [];
      if (!places || !places.length) return;
      var colorMap = { A: '#4ADE80', B: '#FBBF24', C: '#34D399' };
      places.forEach(function(place) {
        var c = colorMap[place.label] || '#4ADE80';
        var pos = new kakao.maps.LatLng(place.latitude, place.longitude);
        var content = '<div style="' +
          'width:38px;height:38px;' +
          'background:' + c + ';' +
          'border-radius:50%;' +
          'border:3px solid rgba(255,255,255,0.92);' +
          'box-shadow:0 0 20px ' + c + 'bb,0 4px 10px rgba(0,0,0,.35);' +
          'display:flex;align-items:center;justify-content:center;' +
          'font-size:15px;font-weight:900;color:#0A0D1A;' +
          'font-family:-apple-system,sans-serif;cursor:pointer;' +
        '">' + place.label + '</div>';
        var overlay = new kakao.maps.CustomOverlay({ position: pos, content: content, zIndex: 7 });
        overlay.setMap(map);

        var infoContent = '<div style="position:relative;left:-85px;top:-115px;background:#0A0D1A;border:1px solid ' + c + '66;border-radius:14px;padding:10px 16px;min-width:182px;font-family:-apple-system,sans-serif;">' +
          '<div style="color:' + c + ';font-size:13px;font-weight:800;">후보 ' + place.label + '</div>' +
          '<div style="color:#F1F5F9;font-size:13px;font-weight:700;margin:3px 0 4px;">' + place.title + '</div>' +
          '<div style="color:#94A3B8;font-size:11px;">' + place.category + '</div>' +
          '<div style="color:' + c + ';font-size:11px;margin-top:5px;">' +
            (place.distance <= 800 ? '🚶 도보 ' + place.walkMinutes + '분' : '🚗 차량 ' + place.driveMinutes + '분') +
            ' · ' + place.distance + 'm' +
          '</div>' +
        '</div>';
        var infoOverlay = new kakao.maps.CustomOverlay({ position: pos, content: infoContent, zIndex: 8 });

        var el = overlay.getContent ? overlay.getContent() : null;
        if (el && el.addEventListener) {
          el.addEventListener('click', function() {
            if (openInfo) openInfo.setMap(null);
            if (openInfo === infoOverlay) { openInfo = null; return; }
            infoOverlay.setMap(map);
            openInfo = infoOverlay;
            rn({ type: 'candidatePress', id: place.id, label: place.label });
          });
        }
        candidateLayers.push(overlay);
        candidateLayers.push(infoOverlay);
      });
    }
  `;

// ── Inline HTML ───────────────────────────────────────────────────────────────

function buildHTML(): string {
  // Pending courses → neon pink pin; archived → muted purple pin.
  const courseMarkerFn = isMockMode
    ? `
      function renderCourseMarker(course) {
        var avg = ((course.myRating + course.partnerRating) / 2).toFixed(1);
        var isPending = course.myRating === 0 && course.partnerRating === 0;
        var pinBg   = isPending ? 'linear-gradient(135deg,#FF6B8B,#F472B6)' : 'linear-gradient(135deg,#7C3AED,#A855F7)';
        var pinGlow = isPending ? '0 3px 14px rgba(255,107,139,.75)' : '0 3px 14px rgba(124,58,237,.75)';
        var icon = L.divIcon({
          className: '',
          html: '<div style="width:28px;height:28px;background:' + pinBg + ';border-radius:50% 50% 0 50%;transform:rotate(45deg);border:2.5px solid #fff;box-shadow:' + pinGlow + ';"></div>',
          iconSize: [28,28], iconAnchor: [14,28], popupAnchor: [0,-32],
        });
        var m = L.marker([course.latitude, course.longitude], { icon }).addTo(map);
        m.bindPopup('<div style="background:#0A0D1A;border:1px solid rgba(124,58,237,.55);border-radius:14px;padding:10px 16px;min-width:170px;font-family:-apple-system,sans-serif;">' +
          '<div style="color:#F1F5F9;font-size:13px;font-weight:700;">' + course.title + '</div>' +
          '<div style="color:#64748B;font-size:11px;margin:2px 0 6px;">' + course.date + '</div>' +
          '<div style="color:#FF6B8B;font-size:13px;font-weight:600;">' + (isPending ? '✈️ 방문 예정' : '❤️ 평균 ' + avg + '점') + '</div>' +
        '</div>', { className: 'twin-popup', maxWidth: 240 });
        m.on('click', function() { rn({ type: 'courseMarkerPress', id: course.id }); });
        return m;
      }
    `
    : `
      function renderCourseMarker(course) {
        var pos = new kakao.maps.LatLng(course.latitude, course.longitude);
        var avg = ((course.myRating + course.partnerRating) / 2).toFixed(1);
        var isPending = course.myRating === 0 && course.partnerRating === 0;
        var pinBg   = isPending ? 'linear-gradient(135deg,#FF6B8B,#F472B6)' : 'linear-gradient(135deg,#7C3AED,#A855F7)';
        var pinGlow = isPending ? '0 3px 14px rgba(255,107,139,.75)' : '0 3px 14px rgba(124,58,237,.75)';
        var content = '<div style="width:28px;height:28px;background:' + pinBg + ';border-radius:50% 50% 0 50%;transform:rotate(45deg);border:2.5px solid #fff;box-shadow:' + pinGlow + ';cursor:pointer;"></div>';
        var overlay = new kakao.maps.CustomOverlay({ position: pos, content: content, zIndex: 3 });
        overlay.setMap(map);
        var infoContent = '<div style="background:#0A0D1A;border:1px solid rgba(124,58,237,.55);border-radius:14px;padding:10px 16px;min-width:170px;font-family:-apple-system,sans-serif;position:relative;left:-80px;top:-90px;">' +
          '<div style="color:#F1F5F9;font-size:13px;font-weight:700;">' + course.title + '</div>' +
          '<div style="color:#64748B;font-size:11px;margin:2px 0 6px;">' + course.date + '</div>' +
          '<div style="color:#FF6B8B;font-size:13px;font-weight:600;">' + (isPending ? '✈️ 방문 예정' : '❤️ 평균 ' + avg + '점') + '</div>' +
        '</div>';
        var info = new kakao.maps.CustomOverlay({ position: pos, content: infoContent, zIndex: 4 });
        kakao.maps.event.addListener(overlay, 'click', function() {
          if (openInfo) openInfo.setMap(null);
          if (openInfo === info) { openInfo = null; return; }
          info.setMap(map);
          openInfo = info;
          rn({ type: 'courseMarkerPress', id: course.id });
        });
        return { overlay, info };
      }
    `;

  const photoPopupCardHTML = `
    function photoPopupCard(photo) {
      return '<div style="background:#0A0D1A;border:1px solid rgba(124,58,237,.6);border-radius:16px;overflow:hidden;width:172px;box-shadow:0 8px 32px rgba(0,0,0,.75),0 0 0 1px rgba(124,58,237,.15);font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;">' +
        '<div style="position:relative;width:172px;height:148px;overflow:hidden;">' +
          '<img src="' + photo.uri + '" style="width:172px;height:148px;object-fit:cover;display:block;" onerror="this.style.cssText=\'width:172px;height:148px;background:linear-gradient(135deg,#1E293B,#0F172A);display:block;\'" />' +
          '<div style="position:absolute;bottom:0;left:0;right:0;height:36px;background:linear-gradient(transparent,rgba(10,13,26,.85));"></div>' +
        '</div>' +
        '<div style="padding:10px 13px 12px;">' +
          '<div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;">' +
            '<span style="background:linear-gradient(90deg,#7C3AED,#D946EF);color:#fff;font-size:9px;font-weight:700;letter-spacing:.7px;padding:2px 8px;border-radius:20px;text-transform:uppercase;">📸 추억 사진</span>' +
          '</div>' +
          '<div style="color:#F1F5F9;font-size:13px;font-weight:600;line-height:1.35;letter-spacing:-.2px;">' + photo.formattedTime + '</div>' +
          '<div style="color:#94A3B8;font-size:11px;font-style:italic;margin-top:3px;letter-spacing:.1px;">여기서의 추억 ✨</div>' +
        '</div>' +
      '</div>';
    }
  `;

  const photoMarkerFn = isMockMode
    ? `
      ${photoPopupCardHTML}
      function renderPhotoMarker(photo) {
        var thumbStyle = 'width:46px;height:46px;border-radius:50%;object-fit:cover;border:3px solid #7C3AED;box-shadow:0 0 0 2px rgba(124,58,237,.35),0 4px 14px rgba(124,58,237,.6);cursor:pointer;display:block;';
        var icon = L.divIcon({
          className: '',
          html: '<img src="' + photo.uri + '" style="' + thumbStyle + '" onerror="this.style.cssText=\'' + thumbStyle + ';background:#7C3AED\'" />',
          iconSize:[46,46], iconAnchor:[23,46], popupAnchor:[0,-50],
        });
        var m = L.marker([photo.lat, photo.lng], { icon }).addTo(map);
        m.bindPopup(photoPopupCard(photo), { className:'twin-popup', maxWidth:190 });
        return m;
      }
    `
    : `
      ${photoPopupCardHTML}
      function renderPhotoMarker(photo) {
        var pos = new kakao.maps.LatLng(photo.lat, photo.lng);
        var pinHTML = '<img src="' + photo.uri + '" style="width:46px;height:46px;border-radius:50%;object-fit:cover;cursor:pointer;display:block;border:3px solid #7C3AED;box-shadow:0 0 0 2px rgba(124,58,237,.35),0 4px 14px rgba(124,58,237,.6);" onerror="this.style.cssText=\'width:46px;height:46px;border-radius:50%;display:block;background:#7C3AED;cursor:pointer;\'" />';
        var overlay = new kakao.maps.CustomOverlay({ position: pos, content: pinHTML, zIndex: 5 });
        overlay.setMap(map);
        var cardHTML = '<div style="position:relative;left:-75px;top:-222px;">' + photoPopupCard(photo) + '</div>';
        var info = new kakao.maps.CustomOverlay({ position: pos, content: cardHTML, zIndex: 6 });
        function toggleInfo() {
          if (openInfo) { openInfo.setMap(null); if (openInfo === info) { openInfo = null; return; } }
          info.setMap(map);
          openInfo = info;
        }
        var el = overlay.getContent && typeof overlay.getContent === 'function' ? overlay.getContent() : null;
        if (el && el.addEventListener) el.addEventListener('click', toggleInfo);
        else if (overlay.a && overlay.a.addEventListener) overlay.a.addEventListener('click', toggleInfo);
        return { overlay, info };
      }
    `;

  const syncRecommendedFn = isMockMode
    ? `
      function syncRecommended(places) {
        recLayers.forEach(function(l) { map.removeLayer(l); });
        recLayers = [];
        if (!places || !places.length) return;
        var latlngs = places.map(function(p) { return [p.latitude, p.longitude]; });
        var poly = L.polyline(latlngs, { color:'#FF6B8B', weight:3, opacity:.92, dashArray:'9,9' }).addTo(map);
        recLayers.push(poly);
        places.forEach(function(place, i) {
          var icon = L.divIcon({
            className:'',
            html: '<div style="width:34px;height:34px;background:linear-gradient(135deg,#FF6B8B,#D946EF);border-radius:50%;border:2.5px solid #fff;box-shadow:0 0 18px rgba(255,107,139,.85);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#fff;font-family:-apple-system,sans-serif;">' + (i+1) + '</div>',
            iconSize:[34,34], iconAnchor:[17,34], popupAnchor:[0,-36],
          });
          var m = L.marker([place.latitude, place.longitude], { icon }).addTo(map);
          m.bindPopup('<div style="background:#0A0D1A;border:1px solid rgba(255,107,139,.45);border-radius:14px;padding:10px 16px;min-width:186px;font-family:-apple-system,sans-serif;">' +
            '<div style="color:#FF6B8B;font-size:11px;font-weight:600;">' + place.category + '</div>' +
            '<div style="color:#F1F5F9;font-size:13px;font-weight:700;margin:3px 0 4px;">' + place.title + '</div>' +
            '<div style="color:#94A3B8;font-size:11px;line-height:1.5;">' + place.reason + '</div>' +
            '<div style="color:#FF6B8B;font-size:11px;margin-top:5px;">🚶 ' + place.estimatedTime + '</div>' +
          '</div>', { className:'twin-popup', maxWidth:250 });
          recLayers.push(m);
        });
        try { var b = L.latLngBounds(latlngs); map.fitBounds(b, { padding:[64,64], maxZoom:15 }); } catch(_) {}
      }
    `
    : `
      function syncRecommended(places) {
        recLayers.forEach(function(l) { if (l.setMap) l.setMap(null); });
        recLayers = [];
        if (!places || !places.length) return;
        var path = places.map(function(p) { return new kakao.maps.LatLng(p.latitude, p.longitude); });
        var poly = new kakao.maps.Polyline({ path, strokeWeight:3, strokeColor:'#FF6B8B', strokeOpacity:.92, strokeStyle:'shortdash' });
        poly.setMap(map);
        recLayers.push(poly);
        places.forEach(function(place, i) {
          var pos = new kakao.maps.LatLng(place.latitude, place.longitude);
          var content = '<div style="width:34px;height:34px;background:linear-gradient(135deg,#FF6B8B,#D946EF);border-radius:50%;border:2.5px solid #fff;box-shadow:0 0 18px rgba(255,107,139,.85);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#fff;font-family:-apple-system,sans-serif;">' + (i+1) + '</div>';
          var overlay = new kakao.maps.CustomOverlay({ position:pos, content, zIndex:3 });
          overlay.setMap(map);
          recLayers.push(overlay);
        });
        try {
          var bounds = new kakao.maps.LatLngBounds();
          path.forEach(function(p) { bounds.extend(p); });
          map.setBounds(bounds);
        } catch(_) {}
      }
    `;

  const mapInit = isMockMode
    ? `
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = function() {
        map = L.map('map', { center: [37.5512, 126.9882], zoom: 12, zoomControl: true });
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 20,
        }).addTo(map);
        injectStyles();
        mapReady = true;
        flushQueue();
        // Long press via contextmenu (fires on mobile long-touch)
        map.on('contextmenu', function(e) {
          if (e.originalEvent) e.originalEvent.preventDefault();
          rn({ type: 'mapLongPress', lat: e.latlng.lat, lng: e.latlng.lng });
        });
      };
      document.head.appendChild(script);
    `
    : `
      const script = document.createElement('script');
      script.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=${JS_KEY}&autoload=false';
      script.onload = function() {
        kakao.maps.load(function() {
          const container = document.getElementById('map');
          const options = { center: new kakao.maps.LatLng(37.5512, 126.9882), level: 5 };
          map = new kakao.maps.Map(container, options);
          mapReady = true;
          flushQueue();
          // Long press via rightclick (mobile browsers fire this on long-touch)
          kakao.maps.event.addListener(map, 'rightclick', function(mouseEvent) {
            rn({ type: 'mapLongPress', lat: mouseEvent.latLng.getLat(), lng: mouseEvent.latLng.getLng() });
          });
        });
      };
      document.head.appendChild(script);
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
    .user-loc-wrap { position:relative; width:20px; height:20px; }
    .user-pulse-dot {
      position:absolute; width:20px; height:20px; border-radius:50%;
      background:radial-gradient(circle, #38BDF8 10%, #7C3AED 82%);
      border:2.5px solid rgba(255,255,255,0.92);
      animation:gps-dot 2.2s ease-in-out infinite; z-index:2;
    }
    .user-pulse-ring {
      position:absolute; top:-8px; left:-8px;
      width:36px; height:36px; border-radius:50%;
      background:rgba(56,189,248,0.22);
      animation:gps-ring 2.2s ease-in-out infinite; z-index:1;
    }
    @keyframes gps-dot {
      0%,100% { box-shadow:0 0 6px 2px rgba(56,189,248,0.72); }
      50% { box-shadow:0 0 18px 6px rgba(255,107,139,0.55),0 0 0 12px rgba(56,189,248,0); }
    }
    @keyframes gps-ring {
      0% { transform:scale(0.82); opacity:0.65; }
      55% { transform:scale(1.75); opacity:0; }
      100% { transform:scale(0.82); opacity:0; }
    }
    .twin-popup .leaflet-popup-content-wrapper { background:transparent !important; border:none !important; box-shadow:none !important; padding:0 !important; border-radius:0 !important; }
    .twin-popup .leaflet-popup-content { margin:0 !important; }
    .twin-popup .leaflet-popup-tip-container { display:none !important; }
    .leaflet-control-zoom { border:1px solid rgba(124,58,237,.4) !important; background:rgba(10,13,26,.9) !important; border-radius:10px !important; overflow:hidden; }
    .leaflet-control-zoom a { background:transparent !important; color:#94A3B8 !important; border-bottom:1px solid rgba(124,58,237,.3) !important; width:32px !important; height:32px !important; line-height:32px !important; }
    .leaflet-control-zoom a:hover { background:rgba(124,58,237,.22) !important; color:#F1F5F9 !important; }
    .leaflet-control-attribution { background:rgba(10,13,26,.65) !important; color:#334155 !important; font-size:9px !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = null;
    var mapReady = false;
    var queue = [];
    var courseMarkers  = [];
    var photoMarkers   = [];
    var recLayers      = [];
    var candidateLayers = [];
    var coursesPolyline = null;
    var openInfo = null;
    var userLocMarker = null;

    function rn(obj) {
      try { window.ReactNativeWebView.postMessage(JSON.stringify(obj)); } catch(_) {}
    }

    function flushQueue() {
      queue.forEach(function(fn) { try { fn(); } catch(e) {} });
      queue = [];
    }

    function injectStyles() {}

    ${courseMarkerFn}
    ${photoMarkerFn}
    ${syncRecommendedFn}
    ${syncCandidatePlacesFn}
    ${syncCourseRouteFn}

    /* ── User Location Pulse Pin ─────────────────────────────────────── */
    ${isMockMode ? `
    function syncUserLocation(lat, lng) {
      if (userLocMarker) { map.removeLayer(userLocMarker); userLocMarker = null; }
      if (lat === null || lat === undefined) return;
      var icon = L.divIcon({
        className: '',
        html: '<div class="user-loc-wrap"><div class="user-pulse-dot"></div><div class="user-pulse-ring"></div></div>',
        iconSize: [20, 20], iconAnchor: [10, 10],
      });
      userLocMarker = L.marker([lat, lng], { icon: icon, zIndexOffset: 1000 }).addTo(map);
    }
    ` : `
    function syncUserLocation(lat, lng) {
      if (userLocMarker) { userLocMarker.setMap(null); userLocMarker = null; }
      if (lat === null || lat === undefined) return;
      var pos = new kakao.maps.LatLng(lat, lng);
      var content = '<div class="user-loc-wrap"><div class="user-pulse-dot"></div><div class="user-pulse-ring"></div></div>';
      userLocMarker = new kakao.maps.CustomOverlay({ position: pos, content: content, zIndex: 20 });
      userLocMarker.setMap(map);
    }
    `}

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

    /* ── Message bus (RN → WebView) ──────────────────────────────────── */
    function handleMessage(data) {
      var msg;
      try { msg = JSON.parse(data); } catch(_) { return; }
      var fn = function() {
        if (msg.type === 'syncCourses')          syncCourses(msg.data);
        if (msg.type === 'syncPhotos')           syncPhotos(msg.data);
        if (msg.type === 'syncRecommended')      syncRecommended(msg.data);
        if (msg.type === 'syncCandidatePlaces')  syncCandidatePlaces(msg.data);
        if (msg.type === 'syncCourseRoute')      syncCourseRoute(msg.data);
        if (msg.type === 'panTo')                panTo(msg.lat, msg.lng);
        if (msg.type === 'syncUserLocation')     syncUserLocation(msg.lat, msg.lng);
      };
      if (mapReady) { try { fn(); } catch(e) {} }
      else queue.push(fn);
    }

    document.addEventListener('message', function(e) { handleMessage(e.data); });
    window.addEventListener('message',   function(e) { handleMessage(e.data); });

    /* ── Boot ────────────────────────────────────────────────────────── */
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
  candidatePlaces,
  onMarkerPress,
  onMapLongPress,
  onCandidatePress,
  panTarget,
  courseRoute,
  userLocation,
}: Props) {
  const webViewRef = useRef<WebView>(null);

  const post = (obj: object) => {
    webViewRef.current?.injectJavaScript(
      `handleMessage(${JSON.stringify(JSON.stringify(obj))});true;`,
    );
  };

  useEffect(() => { post({ type: 'syncCourses',         data: courses }); }, [courses]);
  useEffect(() => { post({ type: 'syncPhotos',          data: photos  }); }, [photos]);
  useEffect(() => { post({ type: 'syncRecommended',     data: recommendedPlaces ?? [] }); }, [recommendedPlaces]);
  useEffect(() => { post({ type: 'syncCandidatePlaces', data: candidatePlaces  ?? [] }); }, [candidatePlaces]);
  useEffect(() => { post({ type: 'syncCourseRoute',     data: courseRoute ?? [] }); }, [courseRoute]);

  useEffect(() => {
    if (panTarget) post({ type: 'panTo', lat: panTarget.lat, lng: panTarget.lng });
  }, [panTarget]);

  useEffect(() => {
    if (userLocation) {
      post({ type: 'syncUserLocation', lat: userLocation.lat, lng: userLocation.lng });
    } else {
      post({ type: 'syncUserLocation', lat: null, lng: null });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation?.lat, userLocation?.lng]);

  const handleMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'courseMarkerPress' && onMarkerPress) {
        const course = courses.find((c) => c.id === msg.id);
        if (course) onMarkerPress(course);
      }
      if (msg.type === 'mapLongPress' && onMapLongPress) {
        onMapLongPress(msg.lat, msg.lng);
      }
      if (msg.type === 'candidatePress' && onCandidatePress) {
        onCandidatePress(msg.id, msg.label);
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
      injectedJavaScript={`
        (function() {
          var courses = ${JSON.stringify(courses)};
          var photos  = ${JSON.stringify(photos)};
          var rec     = ${JSON.stringify(recommendedPlaces ?? [])};
          var cands   = ${JSON.stringify(candidatePlaces  ?? [])};
          var route   = ${JSON.stringify(courseRoute ?? [])};
          function doSync() {
            syncCourses(courses);
            syncPhotos(photos);
            syncRecommended(rec);
            syncCandidatePlaces(cands);
            syncCourseRoute(route);
          }
          if (mapReady) { doSync(); }
          else { queue.push(doSync); }
        })();
        true;
      `}
    />
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, backgroundColor: '#0A0D1A' },
});
