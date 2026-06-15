/**
 * MemoryMapOptimizer — Supercluster-powered photo memory map
 *
 * Step #53 + 54: Dual-theme dynamic color mapping
 *
 * Dark mode  (BrandTokens,      docs/Darkmode_color.PNG):
 *   PRIMARY #F48FB1 / SECONDARY #CE93D8 / TERTIARY #1A1A2E / NEUTRAL #807477
 *
 * Light mode (LightBrandTokens, docs/Lightmode_color.PNG):
 *   PRIMARY #70585B / SECONDARY #725477 / TERTIARY #5355AA / NEUTRAL #7B7676
 *
 * Features:
 *  - Supercluster via CDN (unpkg) with offline fallback (no-cluster dots)
 *  - Bounding-box guard: markers outside viewport skipped to prevent frame drop
 *  - Dot (8 px) → tap → Callout popup UX
 *  - Cluster tap → flyTo zoom-in animation
 *  - React.memo — prevents WebView remount on unrelated parent re-renders
 *  - syncTheme message: live theme swap + Leaflet tile layer swap
 */

import React, { memo, useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import type { PhotoMeta } from '../../hooks/usePhotoMetadata';

const JS_KEY = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';
const isMockMode = JS_KEY === 'MOCK_JS_KEY' || JS_KEY === '';

const SUPERCLUSTER_CDN = 'https://unpkg.com/supercluster@8.0.1/dist/supercluster.min.js';

// ── Theme colour sets ──────────────────────────────────────────────────────────

const DARK_COLORS = {
  primary:   '#F48FB1',
  secondary: '#CE93D8',
  tertiary:  '#1A1A2E',
  neutral:   '#807477',
  isLight:   false,
} as const;

const LIGHT_COLORS = {
  primary:   '#70585B',
  secondary: '#725477',
  tertiary:  '#5355AA',
  neutral:   '#7B7676',
  isLight:   true,
} as const;

type ThemeColors = typeof DARK_COLORS | typeof LIGHT_COLORS;

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  photos: PhotoMeta[];
  /** Pass `true` when the app is in light mode to swap map colours. */
  isLight?: boolean;
  panTarget?: { lat: number; lng: number } | null;
  onPhotoPress?: (photo: PhotoMeta) => void;
}

// ── Tile URLs ─────────────────────────────────────────────────────────────────

const TILE_DARK  = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

// ── WebView HTML ──────────────────────────────────────────────────────────────
// Built once at module load. All colours are read at runtime from the THEME JS
// object so a single syncTheme() call re-renders everything without a reload.

function buildHTML(): string {
  // ── JS injected into the WebView ──────────────────────────────────────────
  const sharedJS = `
    // ── Live theme object — updated by syncTheme() ────────────────────────
    var THEME = {
      primary:   '#F48FB1',
      secondary: '#CE93D8',
      tertiary:  '#1A1A2E',
      neutral:   '#807477',
      isLight:   false,
    };

    var map        = null;
    var mapReady   = false;
    var sc         = null;
    var tileLayer  = null;
    var photos     = [];
    var markerLayers = [];
    var openInfo   = null;

    function rn(obj) {
      try { window.ReactNativeWebView.postMessage(JSON.stringify(obj)); } catch(_) {}
    }

    // ── Dynamic callout card ────────────────────────────────────────────────
    function buildCallout(photo) {
      var bg          = THEME.tertiary;
      var border      = THEME.isLight ? 'rgba(112,88,91,0.45)' : 'rgba(244,143,177,0.55)';
      var labelColor  = THEME.primary;
      var timeColor   = THEME.isLight ? '#1E293B' : '#F1F5F9';
      var noteColor   = THEME.neutral;
      var gradFall    = THEME.isLight
        ? 'linear-gradient(135deg,#EDE0E2,#F0E8F0)'
        : 'linear-gradient(135deg,#1E293B,' + THEME.tertiary + ')';
      var footerGrad  = THEME.isLight
        ? 'linear-gradient(transparent,rgba(249,246,247,.9))'
        : 'linear-gradient(transparent,rgba(26,26,46,.9))';

      return (
        '<div style="' +
          'background:' + bg + ';' +
          'border:1.5px solid ' + border + ';' +
          'border-radius:16px;overflow:hidden;width:172px;' +
          'box-shadow:0 8px 32px rgba(0,0,0,.75),0 0 0 1px rgba(0,0,0,.05);' +
          'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;' +
        '">' +
          '<div style="position:relative;width:172px;height:144px;overflow:hidden;">' +
            '<img src="' + photo.uri + '" style="width:172px;height:144px;object-fit:cover;display:block;" ' +
              'onerror="this.parentNode.style.cssText+=\'background:' + gradFall + '\'"/>' +
            '<div style="position:absolute;bottom:0;left:0;right:0;height:36px;background:' + footerGrad + ';"></div>' +
          '</div>' +
          '<div style="padding:9px 12px 11px;">' +
            '<div style="color:' + labelColor + ';font-size:9px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;margin-bottom:4px;">📸 추억 사진</div>' +
            '<div style="color:' + timeColor + ';font-size:12px;font-weight:600;line-height:1.3;">' + photo.formattedTime + '</div>' +
            '<div style="color:' + noteColor + ';font-size:10px;margin-top:3px;font-style:italic;">여기서의 추억 ✨</div>' +
          '</div>' +
        '</div>'
      );
    }

    // ── Cluster bubble HTML ─────────────────────────────────────────────────
    function buildClusterHtml(count) {
      var glowColor  = THEME.isLight ? 'rgba(114,84,119,.55)' : 'rgba(206,147,216,.75)';
      var shadowRgba = THEME.isLight ? 'rgba(0,0,0,.22)' : 'rgba(0,0,0,.45)';
      var textColor  = '#FFFFFF';
      return (
        '<div style="' +
          'width:44px;height:44px;border-radius:50%;' +
          'background:' + THEME.secondary + ';' +
          'border:3px solid rgba(255,255,255,0.88);' +
          'box-shadow:0 0 22px ' + glowColor + ',0 4px 12px ' + shadowRgba + ';' +
          'display:flex;align-items:center;justify-content:center;' +
          'font-size:15px;font-weight:900;color:' + textColor + ';' +
          'font-family:-apple-system,sans-serif;cursor:pointer;' +
        '">' + count + '</div>'
      );
    }

    // ── Dot pin HTML ────────────────────────────────────────────────────────
    function buildDotHtml(isActive) {
      var dotColor  = isActive ? THEME.primary  : THEME.neutral;
      var glowSize  = isActive ? '10px'          : '4px';
      var glowColor = isActive ? THEME.primary   : 'rgba(128,116,119,.45)';
      return (
        '<div style="' +
          'width:10px;height:10px;border-radius:50%;' +
          'background:' + dotColor + ';' +
          'box-shadow:0 0 ' + glowSize + ' ' + glowColor + ';' +
          'cursor:pointer;' +
        '"></div>'
      );
    }
  `;

  // ── Mock-mode (Leaflet) cluster renderer ───────────────────────────────────
  const mockClusterLogic = `
    function renderClusters(clusters) {
      markerLayers.forEach(function(l) { try { map.removeLayer(l); } catch(_){} });
      markerLayers = [];
      var bounds = map.getBounds();
      var swLat = bounds.getSouthWest().lat, swLng = bounds.getSouthWest().lng;
      var neLat = bounds.getNorthEast().lat, neLng = bounds.getNorthEast().lng;
      var latM = (neLat - swLat) * 0.2, lngM = (neLng - swLng) * 0.2;

      clusters.forEach(function(feat) {
        var lng = feat.geometry.coordinates[0], lat = feat.geometry.coordinates[1];
        if (lat < swLat-latM || lat > neLat+latM || lng < swLng-lngM || lng > neLng+lngM) return;
        var props = feat.properties || {};

        if (props.cluster) {
          var icon = L.divIcon({
            className: '',
            html: buildClusterHtml(props.point_count),
            iconSize: [44,44], iconAnchor: [22,22],
          });
          var m = L.marker([lat, lng], { icon: icon }).addTo(map);
          (function(cId) {
            m.on('click', function() {
              var z = Math.min(sc.getClusterExpansionZoom(cId), 18);
              map.flyTo([lat, lng], z, { animate: true, duration: 0.55 });
            });
          })(props.cluster_id);
          markerLayers.push(m);
        } else {
          var photo = props.photo;
          var dotIcon = L.divIcon({
            className: '', html: buildDotHtml(false),
            iconSize: [10,10], iconAnchor: [5,5], popupAnchor: [0,-12],
          });
          var pm = L.marker([lat, lng], { icon: dotIcon }).addTo(map);
          pm.bindPopup(buildCallout(photo), { className: 'mem-popup', maxWidth: 192 });
          pm.on('click', function() { rn({ type: 'photoPress', id: photo.id }); });
          markerLayers.push(pm);
        }
      });
    }

    function refresh() {
      if (!sc || !map) return;
      var zoom   = Math.round(map.getZoom());
      var bounds = map.getBounds();
      var bbox   = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
      renderClusters(sc.getClusters(bbox, zoom));
    }

    function initMapEvents() { map.on('zoomend moveend', refresh); }

    function syncTheme(t) {
      THEME = t;
      // Swap tile layer
      if (tileLayer) { map.removeLayer(tileLayer); }
      var url = THEME.isLight ? '${TILE_LIGHT}' : '${TILE_DARK}';
      tileLayer = L.tileLayer(url, {
        attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 20,
      }).addTo(map);
      // Update body + zoom control colours via CSS var trick
      document.body.style.background = THEME.isLight ? '#F9F6F7' : THEME.tertiary;
      document.getElementById('map').style.background = THEME.isLight ? '#F9F6F7' : THEME.tertiary;
      // Recolour Leaflet zoom buttons
      var style = document.getElementById('dyn-css') || (function() {
        var s = document.createElement('style'); s.id = 'dyn-css'; document.head.appendChild(s); return s;
      })();
      if (THEME.isLight) {
        style.textContent =
          '.leaflet-control-zoom{background:rgba(249,246,247,.95)!important;border:1px solid rgba(112,88,91,.3)!important}' +
          '.leaflet-control-zoom a{color:#4A3D40!important;border-bottom:1px solid rgba(112,88,91,.18)!important}' +
          '.leaflet-control-zoom a:hover{background:rgba(112,88,91,.12)!important}';
      } else {
        style.textContent =
          '.leaflet-control-zoom{background:rgba(26,26,46,.9)!important;border:1px solid rgba(244,143,177,.35)!important}' +
          '.leaflet-control-zoom a{color:#807477!important;border-bottom:1px solid rgba(244,143,177,.2)!important}' +
          '.leaflet-control-zoom a:hover{background:rgba(244,143,177,.15)!important}';
      }
      refresh();
    }
  `;

  // ── Kakao-mode cluster renderer ────────────────────────────────────────────
  const kakaoClusterLogic = `
    function renderClusters(clusters) {
      markerLayers.forEach(function(item) {
        if (item.overlay) item.overlay.setMap(null);
        if (item.info)    item.info.setMap(null);
      });
      markerLayers = [];
      var mapBounds = map.getBounds();
      var sw = mapBounds.getSouthWest(), ne = mapBounds.getNorthEast();
      var latM = (ne.getLat() - sw.getLat()) * 0.2;
      var lngM = (ne.getLng() - sw.getLng()) * 0.2;

      clusters.forEach(function(feat) {
        var lng = feat.geometry.coordinates[0], lat = feat.geometry.coordinates[1];
        if (lat < sw.getLat()-latM || lat > ne.getLat()+latM ||
            lng < sw.getLng()-lngM || lng > ne.getLng()+lngM) return;
        var props = feat.properties || {};
        var pos = new kakao.maps.LatLng(lat, lng);

        if (props.cluster) {
          var el = document.createElement('div');
          el.innerHTML = buildClusterHtml(props.point_count);
          var ov = new kakao.maps.CustomOverlay({ position: pos, content: el, zIndex: 8 });
          ov.setMap(map);
          (function(cId) {
            el.firstChild && el.firstChild.addEventListener('click', function() {
              var z = Math.min(sc.getClusterExpansionZoom(cId), 14);
              map.setCenter(new kakao.maps.LatLng(lat, lng));
              map.setLevel(Math.max(1, 14 - z));
            });
          })(props.cluster_id);
          markerLayers.push({ overlay: ov, info: null });
        } else {
          var photo = props.photo;
          var dotEl = document.createElement('div');
          dotEl.innerHTML = buildDotHtml(false);
          var overlay = new kakao.maps.CustomOverlay({ position: pos, content: dotEl, zIndex: 5 });
          overlay.setMap(map);
          var infoEl = document.createElement('div');
          infoEl.style.cssText = 'position:relative;left:-80px;top:-182px;';
          infoEl.innerHTML = buildCallout(photo);
          var info = new kakao.maps.CustomOverlay({ position: pos, content: infoEl, zIndex: 6 });
          (function(ov2, inf, ph, dEl) {
            dEl.addEventListener('click', function() {
              if (openInfo) { openInfo.setMap(null); if (openInfo === inf) { openInfo = null; return; } }
              inf.setMap(map);
              openInfo = inf;
              dEl.innerHTML = buildDotHtml(true);
              rn({ type: 'photoPress', id: ph.id });
            });
          })(overlay, info, photo, dotEl);
          markerLayers.push({ overlay: overlay, info: info });
        }
      });
    }

    function refresh() {
      if (!sc || !map) return;
      var level  = map.getLevel();
      var zoom   = Math.max(1, Math.round(20 - level * 1.3));
      var bounds = map.getBounds();
      var sw = bounds.getSouthWest(), ne = bounds.getNorthEast();
      var bbox = [sw.getLng(), sw.getLat(), ne.getLng(), ne.getLat()];
      renderClusters(sc.getClusters(bbox, zoom));
    }

    function initMapEvents() { kakao.maps.event.addListener(map, 'idle', refresh); }

    function syncTheme(t) {
      THEME = t;
      refresh();
    }
  `;

  // ── Supercluster bootstrap ─────────────────────────────────────────────────
  const superclusterBootstrap = `
    function buildSupercluster() {
      if (typeof Supercluster === 'undefined') { refresh(); return; }
      sc = new Supercluster({ radius: 60, maxZoom: 18 });
      sc.load(photos.map(function(p) {
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
          properties: { photo: p },
        };
      }));
      refresh();
    }

    function syncPhotos(newPhotos) {
      photos = newPhotos;
      buildSupercluster();
    }

    function loadSupercluster() {
      var s = document.createElement('script');
      s.src = '${SUPERCLUSTER_CDN}';
      s.onload  = function() { buildSupercluster(); initMapEvents(); };
      s.onerror = function() { initMapEvents(); };
      document.head.appendChild(s);
    }

    function panTo(lat, lng) {
      if (!map) return;
      ${isMockMode
        ? 'map.panTo([lat, lng], { animate:true, duration:0.7 });'
        : 'map.panTo(new kakao.maps.LatLng(lat, lng));'
      }
    }

    function handleMessage(data) {
      var msg; try { msg = JSON.parse(data); } catch(_) { return; }
      if (msg.type === 'syncPhotos') syncPhotos(msg.data);
      if (msg.type === 'syncTheme')  syncTheme(msg.theme);
      if (msg.type === 'panTo')      panTo(msg.lat, msg.lng);
    }
    document.addEventListener('message', function(e) { handleMessage(e.data); });
    window.addEventListener('message',   function(e) { handleMessage(e.data); });
  `;

  // ── Map initialisation ─────────────────────────────────────────────────────
  const mockInit = `
    var leafletLink = document.createElement('link');
    leafletLink.rel = 'stylesheet';
    leafletLink.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(leafletLink);
    var leafletScript = document.createElement('script');
    leafletScript.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    leafletScript.onload = function() {
      map = L.map('map', { center:[37.5512,126.9882], zoom:12, zoomControl:true, preferCanvas:true });
      tileLayer = L.tileLayer('${TILE_DARK}', {
        attribution:'© OpenStreetMap © CARTO', subdomains:'abcd', maxZoom:20,
      }).addTo(map);
      mapReady = true;
      loadSupercluster();
    };
    document.head.appendChild(leafletScript);
  `;

  const kakaoInit = `
    var kakaoScript = document.createElement('script');
    kakaoScript.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=${JS_KEY}&autoload=false';
    kakaoScript.onload = function() {
      kakao.maps.load(function() {
        var container = document.getElementById('map');
        map = new kakao.maps.Map(container, { center: new kakao.maps.LatLng(37.5512,126.9882), level:5 });
        mapReady = true;
        loadSupercluster();
      });
    };
    document.head.appendChild(kakaoScript);
  `;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
  <style>
    * { margin:0;padding:0;box-sizing:border-box; }
    html,body { width:100%;height:100%;background:#1A1A2E; }
    #map { width:100%;height:100%; }
    /* Leaflet popup reset */
    .mem-popup .leaflet-popup-content-wrapper{background:transparent!important;border:none!important;box-shadow:none!important;padding:0!important;border-radius:0!important;}
    .mem-popup .leaflet-popup-content{margin:0!important;}
    .mem-popup .leaflet-popup-tip-container{display:none!important;}
    /* Default dark zoom controls — overridden by syncTheme dyn-css */
    .leaflet-control-zoom{border:1px solid rgba(244,143,177,.35)!important;background:rgba(26,26,46,.9)!important;border-radius:10px!important;overflow:hidden;}
    .leaflet-control-zoom a{background:transparent!important;color:#807477!important;border-bottom:1px solid rgba(244,143,177,.2)!important;width:32px!important;height:32px!important;line-height:32px!important;}
    .leaflet-control-zoom a:hover{background:rgba(244,143,177,.15)!important;color:#F1F5F9!important;}
    .leaflet-control-attribution{background:rgba(26,26,46,.65)!important;color:#334155!important;font-size:9px!important;}
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    ${sharedJS}
    ${isMockMode ? mockClusterLogic : kakaoClusterLogic}
    ${superclusterBootstrap}
    ${isMockMode ? mockInit : kakaoInit}
  </script>
</body>
</html>`;
}

const HTML = buildHTML();

// ── Component ─────────────────────────────────────────────────────────────────

function MemoryMapOptimizer({ photos, isLight = false, panTarget, onPhotoPress }: Props) {
  const webViewRef = useRef<WebView>(null);

  const post = (obj: object) => {
    webViewRef.current?.injectJavaScript(
      `handleMessage(${JSON.stringify(JSON.stringify(obj))});true;`,
    );
  };

  // Sync photo data whenever it changes
  useEffect(() => {
    post({ type: 'syncPhotos', data: photos });
  }, [photos]);

  // Sync theme colours whenever light/dark mode switches
  useEffect(() => {
    const themeColors: ThemeColors = isLight ? LIGHT_COLORS : DARK_COLORS;
    post({ type: 'syncTheme', theme: themeColors });
  }, [isLight]);

  // Camera pan
  useEffect(() => {
    if (panTarget) post({ type: 'panTo', lat: panTarget.lat, lng: panTarget.lng });
  }, [panTarget]);

  const handleMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'photoPress' && onPhotoPress) {
        const photo = photos.find((p) => p.id === msg.id);
        if (photo) onPhotoPress(photo);
      }
    } catch (_) {}
  };

  return (
    <WebView
      ref={webViewRef}
      style={[styles.map, { backgroundColor: isLight ? '#F9F6F7' : '#1A1A2E' }]}
      source={{ html: HTML }}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      mixedContentMode="always"
      onMessage={handleMessage}
      injectedJavaScript={`
        (function() {
          var p = ${JSON.stringify(photos)};
          var t = ${JSON.stringify(isLight ? LIGHT_COLORS : DARK_COLORS)};
          function doSync() { syncPhotos(p); syncTheme(t); }
          if (mapReady) doSync();
          else {
            var orig = loadSupercluster;
            loadSupercluster = function() { orig(); doSync(); };
          }
        })();
        true;
      `}
    />
  );
}

export default memo(MemoryMapOptimizer);

const styles = StyleSheet.create({
  map: { flex: 1 },
});
