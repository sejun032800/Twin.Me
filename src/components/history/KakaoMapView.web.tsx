/**
 * Web-platform replacement for KakaoMapView.tsx.
 * Uses <iframe> + postMessage instead of react-native-webview.
 * Metro selects this file automatically for the web platform.
 *
 * Shares the same HTML/JS (Leaflet fallback) from kakaoMapHTML.ts,
 * so all markers, routes, candidates, and GPS pulse pin work on web too.
 */

import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { buildHTML, KakaoMapProps as Props } from './kakaoMapHTML';

// Inject a polyfill so the map HTML can send events to us via parent.postMessage.
const WEB_HTML = buildHTML().replace(
  '<script>',
  `<script>
window.ReactNativeWebView = {
  postMessage: function(d) { window.parent.postMessage(d, '*'); }
};`,
);

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
  const containerRef = useRef<any>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Keep latest callbacks accessible without re-mounting the iframe.
  const coursesRef = useRef(courses);
  const onMarkerPressRef = useRef(onMarkerPress);
  const onMapLongPressRef = useRef(onMapLongPress);
  const onCandidatePressRef = useRef(onCandidatePress);
  useEffect(() => { coursesRef.current = courses; }, [courses]);
  useEffect(() => { onMarkerPressRef.current = onMarkerPress; }, [onMarkerPress]);
  useEffect(() => { onMapLongPressRef.current = onMapLongPress; }, [onMapLongPress]);
  useEffect(() => { onCandidatePressRef.current = onCandidatePress; }, [onCandidatePress]);

  const post = useCallback((obj: object) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(obj), '*');
  }, []);

  // Mount iframe once on component mount.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const iframe = document.createElement('iframe');
    iframe.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;border:none;display:block;';
    iframe.srcdoc = WEB_HTML;
    node.appendChild(iframe);
    iframeRef.current = iframe;

    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow) return;
      try {
        const msg = JSON.parse(e.data as string);
        if (msg.type === 'courseMarkerPress' && onMarkerPressRef.current) {
          const course = coursesRef.current.find((c) => c.id === msg.id);
          if (course) onMarkerPressRef.current(course);
        }
        if (msg.type === 'mapLongPress' && onMapLongPressRef.current) {
          onMapLongPressRef.current(msg.lat, msg.lng);
        }
        if (msg.type === 'candidatePress' && onCandidatePressRef.current) {
          onCandidatePressRef.current(msg.id, msg.label);
        }
      } catch (_) {}
    };

    window.addEventListener('message', onMsg);
    return () => {
      window.removeEventListener('message', onMsg);
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      iframeRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { post({ type: 'syncCourses',         data: courses }); }, [courses, post]);
  useEffect(() => { post({ type: 'syncPhotos',          data: photos  }); }, [photos, post]);
  useEffect(() => { post({ type: 'syncRecommended',     data: recommendedPlaces ?? [] }); }, [recommendedPlaces, post]);
  useEffect(() => { post({ type: 'syncCandidatePlaces', data: candidatePlaces  ?? [] }); }, [candidatePlaces, post]);
  useEffect(() => { post({ type: 'syncCourseRoute',     data: courseRoute ?? [] }); }, [courseRoute, post]);

  useEffect(() => {
    if (panTarget) post({ type: 'panTo', lat: panTarget.lat, lng: panTarget.lng });
  }, [panTarget, post]);

  useEffect(() => {
    if (userLocation) {
      post({ type: 'syncUserLocation', lat: userLocation.lat, lng: userLocation.lng });
    } else {
      post({ type: 'syncUserLocation', lat: null, lng: null });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation?.lat, userLocation?.lng, post]);

  return <View ref={containerRef} style={styles.map} />;
}

const styles = StyleSheet.create({
  map: { flex: 1, backgroundColor: '#0A0D1A', position: 'relative' } as any,
});
