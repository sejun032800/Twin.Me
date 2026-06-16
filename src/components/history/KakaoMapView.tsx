/**
 * Expo Go–compatible Kakao Map viewer (native).
 * Web platform uses KakaoMapView.web.tsx (iframe, no react-native-webview).
 */

import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import { buildHTML, KakaoMapProps as Props } from './kakaoMapHTML';

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
