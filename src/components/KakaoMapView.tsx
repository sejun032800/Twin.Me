import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { DateCourse, RecommendedPlace } from '../context/AppContext';

interface Props {
  courses: DateCourse[];
  onMarkerPress?: (course: DateCourse) => void;
  recommendedPlaces?: RecommendedPlace[];
}

// Native placeholder — Kakao Maps JavaScript API is web-only.
// On iOS/Android use react-native-webview to embed a full-page HTML map.
export default function KakaoMapView({ courses, recommendedPlaces }: Props) {
  return (
    <View style={styles.root}>
      <LinearGradient colors={['#0A0D1A', '#1E293B']} style={styles.inner}>
        <Text style={styles.icon}>🗺️</Text>
        <Text style={styles.title}>카카오 지도는 앱(iOS/Android)에서 이용 가능합니다</Text>
        <Text style={styles.sub}>{courses.length}개 장소 등록됨{recommendedPlaces?.length ? ` · 추천 ${recommendedPlaces.length}곳` : ''}</Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  icon: { fontSize: 48 },
  title: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  sub: {
    color: '#7C3AED',
    fontSize: 13,
    fontWeight: '600',
  },
});
