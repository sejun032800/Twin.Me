import React from 'react';
import * as Clipboard from 'expo-clipboard';
import TabTutorialOverlay, { TutorialStep } from '../../src/components/onboarding/TabTutorialOverlay';
import { useTutorialGuard } from '../../src/hooks/useTutorialGuard';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import HistoryKakaoMapView from '../../src/components/history/KakaoMapView';
import DateMapPlanner from '../../src/components/history/DateMapPlanner';
import { KakaoPlace, searchPlacesByKeyword } from '../../src/services/kakaoService';
import { calculateNextCourseCandidates, CandidatePlace } from '../../src/utils/courseRecommendation';
// BudgetRange used via inline object — no explicit import needed
import { requestMuseCourse } from '../../src/services/aiMuseService';
import { fetchCurrentWeather } from '../../src/services/weatherService';
import type { WeatherData } from '../../src/services/weatherService';
import { DateCourse, MapLayer, RecommendedPlace, useAppContext } from '../../src/context/AppContext';
import { authenticateSecretLayer } from '../../src/utils/authEngine';
import { WebAuthModal } from '../../src/components/modals/WebAuthModal';
import { CoursePlanner } from '../../src/components/maps/CoursePlanner';
import type { OptimizedCourse } from '../../src/utils/courseOptimizer';
import { HistoryProvider, useHistoryContext } from '../../src/context/HistoryContext';
import { usePhotoMetadata } from '../../src/hooks/usePhotoMetadata';
import { useMemoryWall, MemoryNode } from '../../src/hooks/useMemoryWall';
import { usePartnerPlaceReview } from '../../src/hooks/usePartnerPlaceReview';
import { useCoupleLiveStats } from '../../src/hooks/useCoupleLiveStats';
import {
  gatherDateShuttleContext,
  requestDateShuttleRecommendation,
} from '../../src/services/dateShuttleService';
import type { ShuttleResult } from '../../src/services/dateShuttleService';
import { useGeoLocation } from '../../src/hooks/useGeoLocation';
import { RelationshipHelix } from '../../src/components/history/RelationshipHelix';
import { EMOTION_META } from '../../src/services/kakaoHighlightService';
import {
  FontSize,
  FontWeight,
  Radius,
  Spacing,
  TabBar,
  ThemeTokens,
} from '../../src/styles/theme';

const { width: SW, height: SH } = Dimensions.get('window');

// MEMORIES 하드코딩 → useMemoryWall 훅으로 대체됨 (Step #24)

const FOOD_CHIPS = ['🍣 일식', '🍜 중식', '🥩 한식', '🍕 양식', '🧋 카페'];
const MOOD_CHIPS = ['💃 액티비티', '🌿 힐링', '🎬 문화생활', '🍻 술자리'];
const OOTD_OPTIONS = [
  { icon: '👗', label: '캐주얼' },
  { icon: '💼', label: '정장' },
  { icon: '👫', label: '시밀러룩' },
];

// ─── FUN-CHA-004: AI Date Muse chip options ──────────────────────────────────
// SPOT_POOL 12개 하드코딩 및 fetchAIDateCourse() 가짜 딜레이 → Step #29에서 완파
// 실제 파이프라인은 src/services/aiMuseService.ts의 requestMuseCourse() 사용

const AI_OOTD_CHIPS = ['캐주얼', '시크', '스트릿', '페미닌'];
const AI_MOOD_CHIPS = ['차분함', '신남', '로맨틱', '힐링'];

// ─── Layout Constants ─────────────────────────────────────────────────────────

const CARD_W   = 162;
const CARD_IMG = CARD_W - 16;
const H_PAD    = 12;
const USABLE_X = Math.max(0, SW - CARD_W - H_PAD * 2);

// Seeded-deterministic scatter positions so layout is stable across re-renders.
// Uses sin-based hash — no external PRNG dependency.
function buildScatter(count: number): Array<{ xFrac: number; y: number; rot: number }> {
  const slotH = (WALL_H - 200) / Math.max(count, 1);
  return Array.from({ length: count }, (_, i) => {
    const h1 = Math.abs(Math.sin(i * 37.13 + 1.77) * 9973) % 1;
    const h2 = Math.abs(Math.sin(i * 53.71 + 3.14) * 9967) % 1;
    const h3 = Math.abs(Math.sin(i * 29.53 + 2.71) * 9949) % 1;

    // Alternate left / center / right columns for natural wall feel
    const col = i % 3;
    const xFrac =
      col === 0 ? 0.02 + h1 * 0.07 :   // left: 2–9%
      col === 1 ? 0.42 + h1 * 0.16 :   // centre: 42–58%
                  0.86 + h1 * 0.08;    // right: 86–94%

    const y   = Math.max(8, slotH * i + h2 * slotH * 0.55);
    const rot = (h3 - 0.5) * 14; // ±7°

    return { xFrac, y, rot };
  });
}

const WALL_H      = 580 + 255;
const STATS_BAR_H = 106;
const MAP_H       = Math.min(SH * 0.46, 360);

// ─── Route Polyline Utility ───────────────────────────────────────────────────
// Converts a course-spots array into an ordered lat/lng coordinate chain for
// Polyline rendering. Sorts by `date` field (ISO string) ascending so the path
// follows the chronological date order. Returns [] when length <= 1 so the
// map component can safely skip polyline geometry without a crash.

function generateRoutePolylineSegments(
  spots: Array<{ latitude: number; longitude: number; date?: string }>,
): Array<{ latitude: number; longitude: number }> {
  if (spots.length <= 1) return [];
  const sorted = [...spots].sort((a, b) => {
    if (!a.date || !b.date) return 0;
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  });
  return sorted.map(({ latitude, longitude }) => ({ latitude, longitude }));
}

// ─── Segmented Control ────────────────────────────────────────────────────────

type TabKey = 'archive' | 'map' | 'feed';

const TABS_CONFIG: { key: TabKey; label: string }[] = [
  { key: 'archive', label: '📸  추억 월' },
  { key: 'map',     label: '🗺️  지도' },
  { key: 'feed',    label: '🧭  무드 피드' },
];
const TAB_COUNT = TABS_CONFIG.length;
const SCREEN_W = Dimensions.get('window').width;
// track width = screen - marginHorizontal*2 - inner padding*2
const INDICATOR_W = (SCREEN_W - Spacing.base * 2 - 6) / TAB_COUNT;

function SegmentedControl({
  active,
  onChange,
  t,
  swipeProgress,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
  t: ThemeTokens;
  swipeProgress: SharedValue<number>;
}) {
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeProgress.value * INDICATOR_W }],
  }));

  return (
    <View style={segS.wrapper}>
      <View style={[segS.track, { backgroundColor: t.segmentTrack }]}>
        {TABS_CONFIG.map((tab) => {
          const isOn = active === tab.key;
          return (
            <Pressable key={tab.key} style={segS.segWrap} onPress={() => onChange(tab.key)}>
              {isOn ? (
                <LinearGradient
                  colors={t.gradientColors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={segS.activeItem}
                >
                  <Text style={segS.activeTxt}>{tab.label}</Text>
                </LinearGradient>
              ) : (
                <View style={segS.inactiveItem}>
                  <Text style={[segS.inactiveTxt, { color: t.textMuted }]}>{tab.label}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      {/* Reactive underline — follows finger in real-time */}
      <Animated.View style={[segS.underline, indicatorStyle]} />
    </View>
  );
}

const segS = StyleSheet.create({
  wrapper: { marginHorizontal: Spacing.base, marginBottom: Spacing.md },
  track: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    padding: 3,
  },
  segWrap: { flex: 1 },
  activeItem: {
    borderRadius: Radius.pill,
    paddingVertical: 9,
    alignItems: 'center',
  },
  inactiveItem: {
    borderRadius: Radius.pill,
    paddingVertical: 9,
    alignItems: 'center',
  },
  activeTxt:  { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  inactiveTxt: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  underline: {
    height: 2,
    width: INDICATOR_W,
    borderRadius: 1,
    backgroundColor: '#7C3AED',
    marginTop: 4,
  },
});

// ─── Polaroid gradient palettes (fallback when no real photo) ─────────────────
// Each palette is drawn from Twin.me's brand neon spectrum.
const CARD_PALETTES: [string, string, string][] = [
  ['#7C3AED', '#D946EF', '#FF6B8B'],
  ['#1E1B4B', '#4338CA', '#7C3AED'],
  ['#831843', '#D946EF', '#F472B6'],
  ['#0F172A', '#1E3A5F', '#38BDF8'],
  ['#1A0A2E', '#6D28D9', '#A855F7'],
  ['#0C1A20', '#0891B2', '#38BDF8'],
  ['#1E0A12', '#E11D48', '#FF6B8B'],
];

// ─── MemoryDetailModal ────────────────────────────────────────────────────────
// Step #53: Enhanced with 3 action buttons — 복사하기, 저장하기, 대화 하이라이트

function MemoryDetailModal({
  node,
  onClose,
}: {
  node: MemoryNode | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  if (!node) return null;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(node.quote);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
  };

  const handleHighlightGallery = () => {
    onClose();
    router.push('/highlight-gallery');
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={detailS.backdrop} onPress={onClose}>
        <Pressable style={detailS.card} onPress={() => {}}>
          {/* Photo or gradient header */}
          {node.imageUri ? (
            <Image
              source={{ uri: node.imageUri }}
              style={detailS.headerImg}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              colors={CARD_PALETTES[Number(node.id.replace(/\D/g, '')) % CARD_PALETTES.length]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={detailS.headerGrad}
            >
              <Text style={detailS.gradEmoji}>💬</Text>
            </LinearGradient>
          )}

          {/* Content */}
          <View style={detailS.body}>
            <View style={detailS.tagRow}>
              <View style={detailS.tagBadge}>
                <Text style={detailS.tagBadgeText}>{node.tag}</Text>
              </View>
              <Text style={detailS.speakerText}>
                {node.speaker === 'me' ? '내가 한 말' : '상대방이 한 말'}
              </Text>
            </View>

            <Text style={detailS.quoteText}>
              "{node.quote}"
            </Text>

            <Text style={detailS.dateText}>{node.date}</Text>

            {/* ── 3 action buttons ─────────────────────────────────────────── */}
            <View style={detailS.actionRow}>
              {/* 복사하기 */}
              <Pressable style={detailS.actionBtn} onPress={handleCopy}>
                <Text style={detailS.actionEmoji}>{copied ? '✅' : '📋'}</Text>
                <Text style={[detailS.actionText, copied && { color: '#4ADE80' }]}>
                  {copied ? '복사됨' : '복사하기'}
                </Text>
              </Pressable>

              {/* 저장하기 (share / 준비 중) */}
              <Pressable
                style={detailS.actionBtn}
                onPress={() => {
                  // 이미지 저장 기능은 미디어 라이브러리 권한이 필요합니다
                  Clipboard.setStringAsync(`"${node.quote}" - ${node.date}`);
                }}
              >
                <Text style={detailS.actionEmoji}>💾</Text>
                <Text style={detailS.actionText}>저장하기</Text>
              </Pressable>

              {/* 대화 하이라이트 갤러리 */}
              <Pressable style={detailS.actionBtn} onPress={handleHighlightGallery}>
                <Text style={detailS.actionEmoji}>🖼️</Text>
                <Text style={detailS.actionText}>대화 하이라이트</Text>
              </Pressable>
            </View>

            <Pressable style={detailS.closeBtn} onPress={onClose}>
              <LinearGradient
                colors={['#7C3AED', '#D946EF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={detailS.closeBtnGrad}
              >
                <Text style={detailS.closeBtnText}>닫기</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const detailS = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  card: {
    width: '100%',
    backgroundColor: '#1E293B',
    borderRadius: Radius.xl,
    overflow: 'hidden',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 20,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.35)',
  },
  headerImg: { width: '100%', height: 200 },
  headerGrad: {
    width: '100%',
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradEmoji: { fontSize: 52 },
  body: { padding: Spacing.lg, gap: Spacing.md },
  tagRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tagBadge: {
    backgroundColor: 'rgba(124,58,237,0.25)',
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.4)',
  },
  tagBadgeText: { color: '#C084FC', fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  speakerText: { color: '#64748B', fontSize: FontSize.xs },
  quoteText: {
    color: '#F1F5F9',
    fontSize: FontSize.lg,
    fontStyle: 'italic',
    lineHeight: 26,
    letterSpacing: 0.2,
  },
  dateText: { color: '#475569', fontSize: FontSize.sm },
  // Action buttons row
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 2,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.35)',
    backgroundColor: 'rgba(30,41,59,0.8)',
    gap: 4,
  },
  actionEmoji: { fontSize: 20 },
  actionText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
  closeBtn: { borderRadius: Radius.xl, overflow: 'hidden', marginTop: 4 },
  closeBtnGrad: { paddingVertical: 12, alignItems: 'center' },
  closeBtnText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
});

// ─── PolaroidCard ─────────────────────────────────────────────────────────────

function PolaroidCard({
  node,
  index,
  scatter,
  onShowDetail,
}: {
  node: MemoryNode;
  index: number;
  scatter: { xFrac: number; y: number; rot: number };
  onShowDetail: (node: MemoryNode) => void;
}) {
  const scale = useSharedValue(1);
  const { xFrac, y, rot } = scatter;
  const left = H_PAD + xFrac * USABLE_X;

  // Gradient palette index is stable per memory id
  const paletteIdx = Number(node.id.replace(/\D/g, '0') || 0) % CARD_PALETTES.length;

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: rot + 'deg' }, { scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        polaS.card,
        { left, top: y, zIndex: index + 1, elevation: 6 + index },
        animStyle,
      ]}
    >
      <Pressable
        onPressIn={() => { scale.value = withSpring(1.06, { damping: 10, stiffness: 260 }); }}
        onPressOut={() => { scale.value = withSpring(1.0,  { damping: 14, stiffness: 220 }); }}
        onPress={() => onShowDetail(node)}
        onLongPress={() => onShowDetail(node)}
      >
        {/* Photo or elegant gradient fallback */}
        {node.imageUri ? (
          <Image
            source={{ uri: node.imageUri }}
            style={polaS.photo}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient
            colors={CARD_PALETTES[paletteIdx]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={polaS.photoGrad}
          >
            <Text style={polaS.gradEmoji}>{node.tag.split(' ')[0]}</Text>
          </LinearGradient>
        )}

        <View style={polaS.caption}>
          <Text style={polaS.tagText}>{node.tag}</Text>
          <Text style={polaS.quote} numberOfLines={2}>"{node.quote}"</Text>
          <Text style={polaS.date}>{node.date}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const polaS = StyleSheet.create({
  card: {
    position: 'absolute',
    width: CARD_W,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    padding: 8,
    paddingBottom: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 2, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
  },
  photo:     { width: CARD_IMG, height: CARD_IMG, backgroundColor: '#E2E8F0' },
  photoGrad: {
    width: CARD_IMG,
    height: CARD_IMG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradEmoji: { fontSize: 36 },
  caption:   { paddingTop: 8, paddingBottom: 14, gap: 3 },
  tagText:   {
    fontSize: 9, color: '#7C3AED', fontWeight: '600',
    letterSpacing: 0.6, textTransform: 'uppercase',
  },
  quote: { fontSize: 11, fontStyle: 'italic', color: '#1E293B', lineHeight: 15 },
  date:  { fontSize: 9, color: '#94A3B8', fontWeight: '500' },
});

// ─── HeartPulse ───────────────────────────────────────────────────────────────

function HeartPulse() {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.28, { duration: 720, easing: Easing.inOut(Easing.ease) }),
      -1, true,
    );
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={style}><Text style={{ fontSize: 18 }}>❤️</Text></Animated.View>;
}

// ─── AnimatedCounter ──────────────────────────────────────────────────────────
// Counts up from `from` to `to` over `duration` ms with ease-out cubic timing.

function useCountUp(target: number, duration = 1100): number {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const prevTarget = useRef(0);

  useEffect(() => {
    if (prevTarget.current === target) return;
    const startVal = prevTarget.current;
    const endVal = target;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(startVal + (endVal - startVal) * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevTarget.current = endVal;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return display;
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  t: ThemeTokens;
  icon: React.ReactNode;
  // When `valuePrefix`/`valueSuffix` wrap the animated number
  prefix?: string;
  animatedNum: number;
  suffix?: string;
  // Overrides the animated number entirely (e.g. "D+?" when not configured)
  staticValue?: string;
  label: string;
  glowColor: string;
}

function StatCard({
  t, icon, prefix = '', animatedNum, suffix = '', staticValue, label, glowColor,
}: StatCardProps) {
  const countedNum = useCountUp(animatedNum);
  const displayVal = staticValue ?? `${prefix}${countedNum.toLocaleString()}${suffix}`;

  return (
    <View
      style={[
        statsS.card,
        {
          borderColor: t.isLight ? 'rgba(200,150,180,0.28)' : 'rgba(124,58,237,0.22)',
          backgroundColor: t.isLight ? 'rgba(255,255,255,0.72)' : 'rgba(30,41,59,0.52)',
        },
      ]}
    >
      <View style={statsS.iconBox}>{icon}</View>
      <Text
        style={[
          statsS.value,
          {
            color: glowColor,
            textShadowColor: glowColor,
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: 8,
          },
        ]}
      >
        {displayVal}
      </Text>
      <Text style={[statsS.label, { color: t.textMuted }]}>{label}</Text>
    </View>
  );
}

// ─── StatsBar ─────────────────────────────────────────────────────────────────

function StatsBar({ t }: { t: ThemeTokens }) {
  const { dDay, dDayLabel, photoCount, visitCount } = useCoupleLiveStats();

  // D-Day display: when startedAt configured → "D+516", else "D+?"
  const dDayDisplay = dDay > 0 ? `D+${dDay.toLocaleString()}` : undefined;

  return (
    <View style={statsS.wrapper}>
      <LinearGradient
        colors={
          t.isLight
            ? ['rgba(255,245,247,0.95)', 'rgba(255,240,248,0.97)']
            : ['rgba(10,13,26,0.92)', 'rgba(15,23,42,0.97)']
        }
        style={statsS.row}
      >
        {/* D-Day card — violet glow */}
        <StatCard
          t={t}
          icon={<HeartPulse />}
          animatedNum={dDay}
          staticValue={dDayDisplay ?? 'D+?'}
          label={dDayLabel}
          glowColor="#7C3AED"
        />

        {/* Photo count card — neon green glow */}
        <StatCard
          t={t}
          icon={<Text style={{ fontSize: 18 }}>📸</Text>}
          animatedNum={photoCount}
          suffix="장"
          label="업로드 사진"
          glowColor="#4ADE80"
        />

        {/* Visit count card — orchid glow */}
        <StatCard
          t={t}
          icon={<Text style={{ fontSize: 18 }}>📍</Text>}
          animatedNum={visitCount}
          suffix="곳"
          label="방문 장소"
          glowColor="#D946EF"
        />
      </LinearGradient>
    </View>
  );
}

const statsS = StyleSheet.create({
  wrapper: {
    position: 'absolute', bottom: TabBar.height, left: 0, right: 0,
    overflow: 'hidden', borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(124,58,237,0.22)',
  },
  row: {
    flexDirection: 'row', height: STATS_BAR_H, alignItems: 'center',
    paddingHorizontal: Spacing.md, gap: Spacing.sm,
  },
  card: {
    flex: 1, height: STATS_BAR_H - 22, alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.lg, borderWidth: 1, gap: 2,
  },
  iconBox: { height: 26, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  label: { fontSize: 10, textAlign: 'center' },
});

// ─── ScreenHeader ─────────────────────────────────────────────────────────────

function ScreenHeader({ t }: { t: ThemeTokens }) {
  return (
    <View style={headS.wrap}>
      <Text style={[headS.title, { color: t.text }]}>우리만의 시간</Text>
      <Text style={[headS.sub, { color: t.textMuted }]}>
        카카오톡이 기억하는 가장 다정한 순간들
      </Text>
    </View>
  );
}

const headS = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingTop: Spacing.base,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.base,
  },
  title: { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, letterSpacing: -0.5 },
  sub:   { fontSize: FontSize.sm, fontStyle: 'italic', marginTop: 4 },
});

// ─── PartnerReviewSkeleton ─────────────────────────────────────────────────────
// Displayed while the async fetch is in progress.

function PartnerReviewSkeleton() {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const barStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + shimmer.value * 0.45,
  }));

  return (
    <View style={prS.skeletonWrap}>
      <Text style={prS.loadingLabel}>추억을 불러오는 중이에요... 🗺️</Text>
      <Animated.View style={[prS.skeletonBar, prS.skeletonBarWide, barStyle]} />
      <Animated.View style={[prS.skeletonBar, prS.skeletonBarNarrow, barStyle]} />
    </View>
  );
}

// ─── PartnerGlowStars ──────────────────────────────────────────────────────────
// Star rating with neon violet/pink glow for the partner review card.

function PartnerGlowStars({ value }: { value: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Text
          key={star}
          style={[
            { fontSize: 22 },
            star <= value
              ? {
                  textShadowColor: '#D946EF',
                  textShadowOffset: { width: 0, height: 0 },
                  textShadowRadius: 10,
                }
              : { opacity: 0.2 },
          ]}
        >
          ⭐
        </Text>
      ))}
    </View>
  );
}

// ─── PartnerReviewCard ─────────────────────────────────────────────────────────

interface PartnerReviewCardProps {
  partnerName: string;
  review: import('../../src/services/partnerReviewService').PartnerPlaceReview | null;
  isLoading: boolean;
  requestSent: boolean;
  onRequest: () => void;
}

function PartnerReviewCard({
  partnerName,
  review,
  isLoading,
  requestSent,
  onRequest,
}: PartnerReviewCardProps) {
  return (
    <View style={prS.section}>
      <LinearGradient
        colors={['rgba(124,58,237,0.14)', 'rgba(217,70,239,0.08)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={prS.card}
      >
        {/* Section header */}
        <View style={prS.headerRow}>
          <Text style={prS.avatarEmoji}>💜</Text>
          <Text style={prS.partnerNameText}>{partnerName}의 후기</Text>
        </View>

        {isLoading ? (
          <PartnerReviewSkeleton />
        ) : review && review.rating > 0 ? (
          /* ── Review exists ── */
          <View style={prS.reviewBody}>
            <PartnerGlowStars value={review.rating} />
            {review.review ? (
              <Text style={prS.reviewText}>"{review.review}"</Text>
            ) : null}
            <Text style={prS.syncBadge}>✅ 실시간 연동 완료</Text>
          </View>
        ) : (
          /* ── No review yet ── */
          <View style={prS.emptyBody}>
            <Text style={prS.emptyText}>
              파트너가 아직 별점을 남기지 않았어요 💬
            </Text>
            <Pressable
              onPress={onRequest}
              disabled={requestSent}
              style={({ pressed }) => [
                prS.nudgeBtn,
                (pressed || requestSent) && prS.nudgeBtnPressed,
              ]}
            >
              <LinearGradient
                colors={
                  requestSent
                    ? ['#334155', '#1E293B']
                    : ['#7C3AED', '#D946EF']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={prS.nudgeGrad}
              >
                <Text style={prS.nudgeTxt}>
                  {requestSent ? '📨 요청 보냄!' : '흔적 남기기 요청하기 👉'}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

const prS = StyleSheet.create({
  section: { marginVertical: 8 },
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.28)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatarEmoji: { fontSize: 20 },
  partnerNameText: {
    color: '#F1F5F9',
    fontSize: 14,
    fontWeight: '700',
  },
  reviewBody: { gap: 8 },
  reviewText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 19,
  },
  syncBadge: {
    color: '#4ADE80',
    fontSize: 11,
    fontWeight: '600',
  },
  emptyBody: { gap: 10 },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
  },
  nudgeBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  nudgeBtnPressed: { opacity: 0.65 },
  nudgeGrad: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  nudgeTxt: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  // skeleton
  skeletonWrap: { gap: 10 },
  loadingLabel: {
    color: '#64748B',
    fontSize: 12,
  },
  skeletonBar: {
    height: 10,
    borderRadius: 6,
    backgroundColor: '#7C3AED',
  },
  skeletonBarWide: { width: '70%' },
  skeletonBarNarrow: { width: '45%' },
});

// ─── StarRating ───────────────────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
  readonly = false,
  size = 28,
}: {
  value: number;
  onChange?: (v: number) => void;
  readonly?: boolean;
  size?: number;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          onPress={() => !readonly && onChange?.(star)}
          disabled={readonly}
        >
          <Text style={{ fontSize: size, opacity: star <= value ? 1 : 0.25 }}>⭐</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── AddCourseSheet ───────────────────────────────────────────────────────────

function AddCourseSheet({
  visible,
  onClose,
  partnerName,
  onPlaceSelected,
}: {
  visible: boolean;
  onClose: () => void;
  partnerName: string;
  onPlaceSelected?: (lat: number, lng: number) => void;
}) {
  const { addDateCourse } = useAppContext();
  const [title, setTitle]     = useState('');
  const [date, setDate]       = useState('');
  const [myRating, setMyRating]   = useState(0);
  const [myReview, setMyReview]   = useState('');

  // ── Geocoding state ──────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState<KakaoPlace[]>([]);
  const [isSearching, setIsSearching]     = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<KakaoPlace | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slideY = useSharedValue(600);

  useEffect(() => {
    slideY.value = visible
      ? withSpring(0, { damping: 22, stiffness: 180 })
      : withTiming(600, { duration: 260 });
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideY.value }],
  }));

  // Debounced keyword search — 300 ms after typing stops
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await searchPlacesByKeyword(q);
        setSearchResults(results.slice(0, 5));
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQuery]);

  const handleSelectPlace = (place: KakaoPlace) => {
    setSelectedPlace(place);
    setTitle(place.place_name);
    setSearchQuery(place.place_name);
    setSearchResults([]);
  };

  const handleClearPlace = () => {
    setSelectedPlace(null);
    setSearchQuery('');
    setTitle('');
  };

  // ── Partner review — real-time data pipeline ─────────────────────────────
  const placeId = selectedPlace?.id ?? null;
  const {
    review: partnerPlaceReview,
    isLoading: partnerLoading,
    requestSent,
    requestReview,
  } = usePartnerPlaceReview(placeId);

  const handleSave = () => {
    if (!title.trim() || !date.trim() || myRating === 0 || !selectedPlace) return;

    const lat = parseFloat(selectedPlace.y);
    const lng = parseFloat(selectedPlace.x);

    const course: DateCourse = {
      id: Date.now().toString(),
      title: title.trim(),
      date: date.trim(),
      latitude: lat,
      longitude: lng,
      myRating,
      myReview: myReview.trim(),
      // Partner data starts empty — populated reactively when partner reviews the place
      partnerRating: partnerPlaceReview?.rating ?? 0,
      partnerReview: partnerPlaceReview?.review ?? '',
      kakaoPlaceId: selectedPlace.id,
    };

    addDateCourse(course);
    onPlaceSelected?.(lat, lng);

    setTitle('');
    setDate('');
    setMyRating(0);
    setMyReview('');
    setSearchQuery('');
    setSearchResults([]);
    setSelectedPlace(null);
    onClose();
  };

  const canSave =
    title.trim().length > 0 &&
    date.trim().length > 0 &&
    myRating > 0 &&
    selectedPlace !== null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={sheetS.backdrop} />
        </TouchableWithoutFeedback>

        <Animated.View style={[sheetS.sheet, sheetStyle]}>
          <LinearGradient
            colors={['rgba(30,41,59,0.99)', 'rgba(10,13,26,1)']}
            style={sheetS.inner}
          >
            {/* Handle */}
            <View style={sheetS.handle} />

            {/* Title badge */}
            <LinearGradient
              colors={['#7C3AED', '#D946EF', '#FF6B8B']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={sheetS.headerBadge}
            >
              <Text style={sheetS.headerEmoji}>📍</Text>
              <Text style={sheetS.headerText}>데이트 코스 등록</Text>
            </LinearGradient>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* ── Geocoding Search ─────────────────────────────────────── */}
              <Text style={sheetS.fieldLabel}>🔍 장소 검색</Text>

              {/* Search input row */}
              <View style={[
                sheetS.searchRow,
                selectedPlace ? sheetS.searchRowDone : null,
              ]}>
                <TextInput
                  style={sheetS.searchInput}
                  placeholder="카페, 식당, 공원... 키워드 검색"
                  placeholderTextColor="#475569"
                  value={searchQuery}
                  onChangeText={(text) => {
                    setSearchQuery(text);
                    // clear selection if user edits after selecting
                    if (selectedPlace && text !== selectedPlace.place_name) {
                      setSelectedPlace(null);
                      setTitle('');
                    }
                  }}
                  returnKeyType="search"
                />
                {isSearching ? (
                  <ActivityIndicator size="small" color="#D946EF" style={sheetS.searchSpinner} />
                ) : null}
              </View>

              {/* Search results dropdown */}
              {searchResults.length > 0 && !selectedPlace && (
                <View style={sheetS.resultsList}>
                  {searchResults.map((place, idx) => (
                    <Pressable
                      key={place.id}
                      style={({ pressed }) => [
                        sheetS.resultItem,
                        idx === searchResults.length - 1 && { borderBottomWidth: 0 },
                        pressed && sheetS.resultItemPressed,
                      ]}
                      onPress={() => handleSelectPlace(place)}
                    >
                      <Text style={sheetS.resultName} numberOfLines={1}>
                        {place.place_name}
                      </Text>
                      <Text style={sheetS.resultAddr} numberOfLines={1}>
                        {place.road_address_name || place.address_name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {/* Selected place badge */}
              {selectedPlace && (
                <View style={sheetS.selectedBadge}>
                  <LinearGradient
                    colors={['rgba(74,222,128,0.12)', 'rgba(74,222,128,0.06)']}
                    style={sheetS.selectedBadgeInner}
                  >
                    <Text style={sheetS.selectedIcon}>✅</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={sheetS.selectedName}>{selectedPlace.place_name}</Text>
                      <Text style={sheetS.selectedAddr} numberOfLines={1}>
                        {selectedPlace.road_address_name || selectedPlace.address_name}
                      </Text>
                    </View>
                    <Pressable onPress={handleClearPlace} hitSlop={10}>
                      <Text style={sheetS.selectedClear}>✕</Text>
                    </Pressable>
                  </LinearGradient>
                </View>
              )}

              {/* Place label (auto-filled, editable) */}
              <Text style={sheetS.fieldLabel}>장소 / 코스 명칭</Text>
              <TextInput
                style={sheetS.input}
                placeholder="ex. 성수동 카페, 한강 피크닉"
                placeholderTextColor="#475569"
                value={title}
                onChangeText={setTitle}
              />

              {/* Date */}
              <Text style={sheetS.fieldLabel}>방문 날짜</Text>
              <TextInput
                style={sheetS.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#475569"
                value={date}
                onChangeText={setDate}
                keyboardType="numbers-and-punctuation"
              />

              {/* My rating */}
              <Text style={sheetS.fieldLabel}>나의 별점</Text>
              <StarRating value={myRating} onChange={setMyRating} size={32} />

              {/* My review */}
              <Text style={[sheetS.fieldLabel, { marginTop: Spacing.md }]}>나의 한 줄 후기</Text>
              <TextInput
                style={[sheetS.input, sheetS.reviewInput]}
                placeholder="이 장소의 분위기는..."
                placeholderTextColor="#475569"
                value={myReview}
                onChangeText={setMyReview}
                multiline
              />

              {/* Partner review — real-time data card */}
              {selectedPlace && (
                <PartnerReviewCard
                  partnerName={partnerName}
                  review={partnerPlaceReview}
                  isLoading={partnerLoading}
                  requestSent={requestSent}
                  onRequest={() =>
                    requestReview(selectedPlace.place_name, partnerName)
                  }
                />
              )}

              {/* Save CTA */}
              <Pressable
                onPress={handleSave}
                disabled={!canSave}
                style={[sheetS.cta, !canSave && { opacity: 0.35 }]}
              >
                <LinearGradient
                  colors={['#7C3AED', '#D946EF', '#FF6B8B']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={sheetS.ctaGrad}
                >
                  <Text style={sheetS.ctaTxt}>지도에 핀 꽂기 📌</Text>
                </LinearGradient>
              </Pressable>
            </ScrollView>
          </LinearGradient>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const sheetS = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    maxHeight: SH * 0.82,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    overflow: 'hidden',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(124,58,237,0.32)',
  },
  inner: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: 40, gap: Spacing.md },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(148,163,184,0.3)', alignSelf: 'center',
  },
  headerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: Radius.xl, paddingHorizontal: Spacing.lg,
    paddingVertical: 10, alignSelf: 'center',
  },
  headerEmoji: { fontSize: 18 },
  headerText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
  fieldLabel: {
    color: '#94A3B8', fontSize: FontSize.xs, fontWeight: FontWeight.semibold,
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6,
  },
  input: {
    backgroundColor: 'rgba(30,41,59,0.8)',
    color: '#F1F5F9',
    fontSize: FontSize.base,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.2)',
    marginBottom: Spacing.md,
  },
  reviewInput: { minHeight: 72, textAlignVertical: 'top' },
  cta: { borderRadius: Radius.xl, overflow: 'hidden', marginTop: Spacing.sm },
  ctaGrad: { paddingVertical: Spacing.md, alignItems: 'center' },
  ctaTxt: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },

  // ── Geocoding search UI ────────────────────────────────────────────────────
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30,41,59,0.8)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.3)',
    marginBottom: 6,
    overflow: 'hidden',
  },
  searchRowDone: {
    borderColor: '#4ADE80',
  },
  searchInput: {
    flex: 1,
    color: '#F1F5F9',
    fontSize: FontSize.base,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  searchSpinner: {
    marginRight: Spacing.md,
  },
  resultsList: {
    backgroundColor: 'rgba(10,13,26,0.97)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.28)',
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  resultItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(124,58,237,0.14)',
  },
  resultItemPressed: {
    backgroundColor: 'rgba(124,58,237,0.18)',
  },
  resultName: {
    color: '#F1F5F9',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  resultAddr: {
    color: '#64748B',
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  selectedBadge: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.38)',
  },
  selectedBadgeInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  selectedIcon: { fontSize: 16 },
  selectedName: {
    color: '#4ADE80',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  selectedAddr: {
    color: '#64748B',
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  selectedClear: {
    color: '#475569',
    fontSize: 15,
    paddingLeft: 8,
  },
});

// ─── CourseListCard ───────────────────────────────────────────────────────────

function CourseListCard({ course, t }: { course: DateCourse; t: ThemeTokens }) {
  const isPending = course.myRating === 0 && course.partnerRating === 0;
  const avg = ((course.myRating + course.partnerRating) / 2).toFixed(1);
  return (
    <View
      style={[
        cListS.card,
        {
          backgroundColor: t.isLight ? 'rgba(255,255,255,0.9)' : 'rgba(30,41,59,0.9)',
          borderColor: isPending
            ? 'rgba(255,107,139,0.4)'
            : t.isLight ? 'rgba(200,150,180,0.25)' : 'rgba(124,58,237,0.2)',
        },
      ]}
    >
      <View style={[cListS.pinDot, isPending && { backgroundColor: '#FF6B8B' }]} />
      <View style={{ flex: 1 }}>
        <Text style={[cListS.title, { color: t.text }]} numberOfLines={1}>{course.title}</Text>
        <Text style={[cListS.date, { color: t.textMuted }]}>{course.date}</Text>
      </View>
      {isPending ? (
        <View style={[cListS.ratingPill, { backgroundColor: 'rgba(255,107,139,0.14)', borderColor: 'rgba(255,107,139,0.3)' }]}>
          <Text style={[cListS.ratingText, { color: '#FF6B8B' }]}>✈️ 예정</Text>
        </View>
      ) : (
        <View style={cListS.ratingPill}>
          <Text style={cListS.ratingText}>❤️ {avg}</Text>
        </View>
      )}
    </View>
  );
}

const cListS = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.md,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
  },
  pinDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#7C3AED',
  },
  title: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  date: { fontSize: FontSize.xs, marginTop: 2 },
  ratingPill: {
    backgroundColor: 'rgba(124,58,237,0.14)',
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  ratingText: { fontSize: FontSize.sm, color: '#FF6B8B', fontWeight: FontWeight.bold },
});

// ─── DateShuttleModal ─────────────────────────────────────────────────────────

type ShuttlePhase = 'idle' | 'gathering' | 'generating' | 'done';

// ── Orbital loading animation (neon pink/violet rings) ────────────────────────
function ShuttleLoadingView({ label }: { label: string }) {
  const r1    = useSharedValue(0);
  const r2    = useSharedValue(0);
  const r3    = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    r1.value    = withRepeat(withTiming(360,  { duration: 3000, easing: Easing.linear }), -1, false);
    r2.value    = withRepeat(withTiming(-360, { duration: 2200, easing: Easing.linear }), -1, false);
    r3.value    = withRepeat(withTiming(360,  { duration: 1600, easing: Easing.linear }), -1, false);
    pulse.value = withRepeat(
      withSequence(withTiming(1.14, { duration: 660 }), withTiming(0.92, { duration: 660 })),
      -1,
      true,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ring1S = useAnimatedStyle(() => ({ transform: [{ rotate: `${r1.value}deg` }] }));
  const ring2S = useAnimatedStyle(() => ({ transform: [{ rotate: `${r2.value}deg` }] }));
  const ring3S = useAnimatedStyle(() => ({ transform: [{ rotate: `${r3.value}deg` }] }));
  const coreS  = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <View style={shuS.loadWrap}>
      <View style={shuS.orbitArea}>
        <Animated.View style={[shuS.ring3, ring3S]} />
        <Animated.View style={[shuS.ring2, ring2S]} />
        <Animated.View style={[shuS.ring1, ring1S]} />
        <Animated.View style={[shuS.coreCircle, coreS]}>
          <Text style={shuS.coreEmoji}>🚀</Text>
        </Animated.View>
      </View>
      <Text style={shuS.loadLabel}>{label}</Text>
    </View>
  );
}

// ── Structured 3-card result view ─────────────────────────────────────────────
function ShuttleResultView({
  result,
  onReset,
}: {
  result: ShuttleResult;
  onReset: () => void;
}) {
  return (
    <ScrollView style={shuS.resultScroll} showsVerticalScrollIndicator={false}>
      <View style={shuS.introWrap}>
        <Text style={shuS.introEmoji}>✨</Text>
        <Text style={shuS.introText}>{result.intro}</Text>
      </View>

      {result.cards.map((card) => (
        <View key={card.step} style={shuS.card}>
          <LinearGradient
            colors={['rgba(124,58,237,0.15)', 'rgba(255,107,139,0.08)']}
            style={shuS.cardInner}
          >
            <View style={shuS.cardHeader}>
              <LinearGradient
                colors={['#7C3AED', '#D946EF']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={shuS.stepBadge}
              >
                <Text style={shuS.stepNum}>{card.step}</Text>
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={shuS.cardPlace}>📍 {card.place}</Text>
                <Text style={shuS.cardCategory}>{card.category}</Text>
              </View>
            </View>
            <Text style={shuS.cardTimeSlot}>⏰ {card.timeSlot}</Text>
            <Text style={shuS.cardTip}>📝 {card.tip}</Text>
          </LinearGradient>
        </View>
      ))}

      <Pressable style={shuS.resetBtn} onPress={onReset}>
        <Text style={shuS.resetTxt}>다시 물어보기</Text>
      </Pressable>
    </ScrollView>
  );
}

// ── Main modal component ──────────────────────────────────────────────────────
function DateShuttleModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { partnerProfile, dateCourses } = useAppContext();
  const [food, setFood]   = useState<string | null>(null);
  const [mood, setMood]   = useState<string | null>(null);
  const [ootd, setOotd]   = useState<string | null>(null);
  const [phase, setPhase] = useState<ShuttlePhase>('idle');
  const [phaseLabel, setPhaseLabel] = useState('');
  const [result, setResult] = useState<ShuttleResult | null>(null);

  const ready     = food !== null && mood !== null && ootd !== null;
  const isLoading = phase === 'gathering' || phase === 'generating';

  const handleFind = async () => {
    if (!ready) return;
    try {
      // Phase 1: collect GPS · weather · partner prefs in parallel
      setPhase('gathering');
      setPhaseLabel('GPS · 날씨 · 취향 데이터 수집 중...');
      const ctx = await gatherDateShuttleContext(partnerProfile, dateCourses);

      // Phase 2: LLM recommendation with rich context
      setPhase('generating');
      setPhaseLabel('AI 셔틀 엔진 최적 코스 생성 중...');
      const shuttleResult = await requestDateShuttleRecommendation(ctx, food!, mood!, ootd!);

      setResult(shuttleResult);
      setPhase('done');
    } catch {
      // Hard catch-all — requestDateShuttleRecommendation already returns fallback
      // so this branch is only hit on extreme runtime errors
      setResult({
        intro: '셔틀 엔진에 일시적인 안개가 꼈어요 🌫️ 주변 추천 코스를 대신 불러올게요!',
        cards: [
          { step: 1, place: '성수동 감성 이탈리안', category: '🍝 레스토랑', timeSlot: '오후 6시~7시30분',    tip: '조용하고 분위기 있어서 편하게 대화하기 딱 좋아요 🤍' },
          { step: 2, place: '서울숲 야간 산책로',   category: '🌳 산책',     timeSlot: '오후 7시30분~8시30분', tip: '손 꼭 잡고 걷다 보면 기억에 남는 밤이 될 거예요 🌙' },
          { step: 3, place: '어니언 성수 루프탑',   category: '☕ 카페',     timeSlot: '오후 8시30분~10시',   tip: '야경 보면서 오늘 하루 이야기 나눠봐요 ✨' },
        ],
      });
      setPhase('done');
    }
  };

  const handleClose = () => {
    setFood(null); setMood(null); setOotd(null);
    setResult(null); setPhase('idle');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={shuS.backdrop} onPress={handleClose} />
      <View style={shuS.sheet}>
        <LinearGradient colors={['rgba(30,41,59,0.98)', 'rgba(10,13,26,0.99)']} style={shuS.inner}>
          <View style={shuS.handle} />
          <View style={shuS.headerRow}>
            <LinearGradient
              colors={['#7C3AED', '#D946EF', '#FF6B8B']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={shuS.sticker}
            >
              <Text style={shuS.stickerEmoji}>🗺️</Text>
              <Text style={shuS.stickerText}>이번 주말 어디서 만날까?</Text>
            </LinearGradient>
          </View>

          {isLoading ? (
            <ShuttleLoadingView label={phaseLabel} />
          ) : phase === 'done' && result ? (
            <ShuttleResultView
              result={result}
              onReset={() => { setResult(null); setPhase('idle'); }}
            />
          ) : (
            <>
              <Text style={shuS.sectionLabel}>🍽️ 오늘 뭐 땡겨?</Text>
              <View style={shuS.chipRow}>
                {FOOD_CHIPS.map((c) => (
                  <Pressable key={c} style={[shuS.chip, food === c && shuS.chipOn]} onPress={() => setFood(c)}>
                    <Text style={[shuS.chipTxt, food === c && shuS.chipTxtOn]}>{c}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={shuS.sectionLabel}>💫 오늘 데이트 무드는?</Text>
              <View style={shuS.chipRow}>
                {MOOD_CHIPS.map((c) => (
                  <Pressable key={c} style={[shuS.chip, mood === c && shuS.chipOn]} onPress={() => setMood(c)}>
                    <Text style={[shuS.chipTxt, mood === c && shuS.chipTxtOn]}>{c}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={shuS.sectionLabel}>👗 오늘 서로의 OOTD는?</Text>
              <View style={shuS.ootdRow}>
                {OOTD_OPTIONS.map((o) => (
                  <Pressable
                    key={o.label}
                    style={[shuS.ootdBtn, ootd === o.label && shuS.ootdOn]}
                    onPress={() => setOotd(o.label)}
                  >
                    <Text style={shuS.ootdEmoji}>{o.icon}</Text>
                    <Text style={[shuS.ootdLabel, ootd === o.label && shuS.ootdLabelOn]}>{o.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                onPress={handleFind}
                style={[shuS.ctaWrap, !ready && { opacity: 0.38 }]}
                disabled={!ready}
              >
                <LinearGradient
                  colors={['#7C3AED', '#D946EF', '#FF6B8B']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={shuS.ctaGradient}
                >
                  <Text style={shuS.ctaTxt}>데이트 코스 찾아줘 🚀</Text>
                </LinearGradient>
              </Pressable>
            </>
          )}
        </LinearGradient>
      </View>
    </Modal>
  );
}

const shuS = StyleSheet.create({
  // ── Modal structure ──────────────────────────────────────────────────────────
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)' },
  sheet: {
    borderTopLeftRadius: Radius['2xl'], borderTopRightRadius: Radius['2xl'],
    overflow: 'hidden', borderWidth: 1, borderBottomWidth: 0,
    borderColor: 'rgba(124,58,237,0.28)',
  },
  inner: { padding: Spacing.base, paddingBottom: 44, gap: Spacing.md },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(148,163,184,0.3)', alignSelf: 'center' },
  headerRow: { alignItems: 'center' },
  sticker: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.xl, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  stickerEmoji: { fontSize: 20 },
  stickerText: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.bold },
  // ── Selection chips ──────────────────────────────────────────────────────────
  sectionLabel: { color: '#F1F5F9', fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { backgroundColor: 'rgba(30,41,59,0.8)', borderRadius: Radius.pill, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(124,58,237,0.2)' },
  chipOn: { backgroundColor: 'rgba(124,58,237,0.22)', borderColor: '#7C3AED' },
  chipTxt: { color: '#94A3B8', fontSize: FontSize.sm },
  chipTxtOn: { color: '#F1F5F9', fontWeight: FontWeight.semibold },
  ootdRow: { flexDirection: 'row', gap: Spacing.md },
  ootdBtn: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md, borderRadius: Radius.lg, backgroundColor: 'rgba(30,41,59,0.8)', borderWidth: 1, borderColor: 'rgba(124,58,237,0.2)', gap: 6 },
  ootdOn: { backgroundColor: 'rgba(124,58,237,0.2)', borderColor: '#7C3AED' },
  ootdEmoji: { fontSize: 26 },
  ootdLabel: { color: '#94A3B8', fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  ootdLabelOn: { color: '#F1F5F9', fontWeight: FontWeight.semibold },
  ctaWrap: { borderRadius: Radius.xl, overflow: 'hidden', marginTop: 4 },
  ctaGradient: { paddingVertical: Spacing.md, alignItems: 'center' },
  ctaTxt: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
  // ── Shuttle loading animation ────────────────────────────────────────────────
  loadWrap: { alignItems: 'center', paddingVertical: 24, gap: Spacing.lg },
  orbitArea: { width: 124, height: 124, alignItems: 'center', justifyContent: 'center' },
  // Outer ring — FF6B8B peach pink
  ring3: {
    position: 'absolute',
    width: 118, height: 118, borderRadius: 59,
    borderWidth: 1.5, borderColor: 'transparent',
    borderBottomColor: '#FF6B8B',
    borderRightColor: 'rgba(255,107,139,0.28)',
  },
  // Middle ring — 7C3AED neon violet
  ring1: {
    position: 'absolute',
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 2.5, borderColor: 'transparent',
    borderTopColor: '#7C3AED',
    borderRightColor: 'rgba(124,58,237,0.22)',
  },
  // Inner ring — D946EF orchid magenta
  ring2: {
    position: 'absolute',
    width: 70, height: 70, borderRadius: 35,
    borderWidth: 2, borderColor: 'transparent',
    borderTopColor: '#D946EF',
    borderLeftColor: 'rgba(217,70,239,0.22)',
  },
  coreCircle: { alignItems: 'center', justifyContent: 'center' },
  coreEmoji: { fontSize: 28 },
  loadLabel: { color: 'rgba(148,163,184,0.85)', fontSize: FontSize.sm, textAlign: 'center' },
  // ── Result cards ─────────────────────────────────────────────────────────────
  resultScroll: { maxHeight: 360 },
  introWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.sm },
  introEmoji: { fontSize: 20, marginTop: 1 },
  introText: { flex: 1, color: '#F1F5F9', fontSize: FontSize.sm, lineHeight: 20 },
  card: { borderRadius: Radius.xl, overflow: 'hidden', marginBottom: Spacing.sm },
  cardInner: {
    padding: Spacing.md, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.22)',
    gap: Spacing.xs,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
  stepBadge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepNum: { color: '#fff', fontSize: 11, fontWeight: FontWeight.bold },
  cardPlace: { color: '#F1F5F9', fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  cardCategory: { color: '#94A3B8', fontSize: FontSize.xs, marginTop: 1 },
  cardTimeSlot: { color: 'rgba(217,70,239,0.9)', fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  cardTip: { color: '#CBD5E1', fontSize: FontSize.xs, lineHeight: 17, marginTop: 2 },
  resetBtn: { backgroundColor: 'rgba(30,41,59,0.8)', borderRadius: Radius.pill, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, alignSelf: 'center', marginTop: Spacing.sm },
  resetTxt: { color: '#94A3B8', fontSize: FontSize.xs },
});

// ─── StarParticleOverlay ──────────────────────────────────────────────────────

const PARTICLE_DATA = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  x: Math.floor(SW * (0.05 + ((i * 79) % 85) / 100)),
  delay: i * 200,
  emoji: (['⭐', '✨', '🌟', '💫'] as const)[i % 4],
  size: 13 + (i % 3) * 4,
}));

function FloatingStar({
  x, delay, emoji, size,
}: { x: number; delay: number; emoji: string; size: number }) {
  const ty = useSharedValue(0);
  const op = useSharedValue(0);

  useEffect(() => {
    const CYCLE = 2300;
    ty.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-72, { duration: 1700, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 0 }),
          withTiming(0, { duration: 600 }),
        ),
        -1,
        false,
      ),
    );
    op.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.85, { duration: 280 }),
          withTiming(0.85, { duration: 1220 }),
          withTiming(0, { duration: 200 }),
          withTiming(0, { duration: CYCLE - 280 - 1220 - 200 }),
        ),
        -1,
        false,
      ),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ translateY: ty.value }],
  }));

  return (
    <Animated.Text
      style={[{ position: 'absolute', left: x, bottom: MAP_H * 0.22, fontSize: size }, style]}
    >
      {emoji}
    </Animated.Text>
  );
}

function StarParticleOverlay() {
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { zIndex: 20, backgroundColor: 'rgba(10,13,26,0.38)', alignItems: 'center', justifyContent: 'center' },
      ]}
    >
      {PARTICLE_DATA.map((p) => (
        <FloatingStar key={p.id} x={p.x} delay={p.delay} emoji={p.emoji} size={p.size} />
      ))}
      <Text style={{ color: '#F1F5F9', fontSize: FontSize.sm, fontWeight: FontWeight.semibold, marginTop: MAP_H * 0.1 }}>
        ✨ AI 뮤즈가 취향을 분석 중...
      </Text>
    </View>
  );
}

// ─── AuroraMuseFAB ────────────────────────────────────────────────────────────

function AuroraMuseFAB({ onPress, bottom }: { onPress: () => void; bottom: number }) {
  const glowScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.75);

  useEffect(() => {
    glowScale.value = withRepeat(
      withTiming(1.55, { duration: 1300, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    glowOpacity.value = withRepeat(
      withTiming(0, { duration: 1300, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: glowOpacity.value,
  }));

  return (
    <View
      style={{
        position: 'absolute',
        right: Spacing.base,
        bottom,
        width: 56,
        height: 56,
      }}
    >
      {/* Aurora pulse ring */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: 28 },
          glowStyle,
        ]}
      >
        <LinearGradient
          colors={['#7C3AED', '#D946EF', '#FF6B8B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, borderRadius: 28, opacity: 0.45 }}
        />
      </Animated.View>

      {/* Main button */}
      <Pressable
        onPress={onPress}
        style={{
          flex: 1,
          borderRadius: 28,
          overflow: 'hidden',
          shadowColor: '#D946EF',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.65,
          shadowRadius: 16,
          elevation: 18,
        }}
      >
        <LinearGradient
          colors={['#7C3AED', '#D946EF', '#FF6B8B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 0 }}
        >
          <Text style={{ fontSize: 22 }}>✨</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

// ─── RecommendationCard ───────────────────────────────────────────────────────

function RecommendationCard({ place, step }: { place: RecommendedPlace; step: number }) {
  return (
    <View style={recS.card}>
      <LinearGradient
        colors={['rgba(10,13,26,0.96)', 'rgba(30,20,46,0.97)']}
        style={recS.cardInner}
      >
        <View style={recS.stepBadge}>
          <LinearGradient
            colors={['#FF6B8B', '#D946EF']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={recS.stepGrad}
          >
            <Text style={recS.stepTxt}>{step}</Text>
          </LinearGradient>
          <Text style={recS.category}>{place.category}</Text>
        </View>
        <Text style={recS.title} numberOfLines={2}>{place.title}</Text>
        <Text style={recS.reason} numberOfLines={3}>{place.reason}</Text>
        <View style={recS.timePill}>
          <Text style={recS.timeTxt}>🚶 {place.estimatedTime}</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

const recS = StyleSheet.create({
  card: {
    width: 220,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,107,139,0.35)',
    shadowColor: '#FF6B8B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
  },
  cardInner: {
    padding: Spacing.md,
    gap: 7,
    minHeight: 130,
  },
  stepBadge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stepGrad: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  stepTxt: { color: '#fff', fontSize: 11, fontWeight: FontWeight.extrabold },
  category: { color: '#94A3B8', fontSize: 11, fontWeight: FontWeight.medium },
  title: { color: '#F1F5F9', fontSize: FontSize.sm, fontWeight: FontWeight.bold, lineHeight: 18 },
  reason: { color: '#94A3B8', fontSize: 10, lineHeight: 14 },
  timePill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,107,139,0.14)',
    borderRadius: Radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,107,139,0.28)',
  },
  timeTxt: { color: '#FF6B8B', fontSize: 10, fontWeight: FontWeight.semibold },
});

// ─── WeatherWidget ────────────────────────────────────────────────────────────
// Displays real-time weather fetched for the map center. Shown inside AIMuseSheet
// so the user knows whether today's outing leans indoor or outdoor before picking
// a course. Uses neon glow coloring aligned with the Twin.me dark design tokens.

function WeatherWidget({
  weather,
  isLoading,
}: {
  weather: WeatherData | null;
  isLoading: boolean;
}) {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    if (isLoading) {
      shimmer.value = withRepeat(
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      shimmer.value = withTiming(1, { duration: 200 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: isLoading ? 0.35 + shimmer.value * 0.5 : 1,
  }));

  const glowColor = weather?.glowColor ?? '#7C3AED';

  return (
    <Animated.View
      style={[
        wxS.container,
        { borderColor: glowColor + '44' },
        shimmerStyle,
      ]}
    >
      {/* Icon */}
      <Text
        style={[
          wxS.icon,
          {
            textShadowColor: glowColor,
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: 14,
          },
        ]}
      >
        {isLoading ? '🌡️' : (weather?.icon ?? '🌡️')}
      </Text>

      {/* Temp + status */}
      <View style={wxS.info}>
        <Text
          style={[
            wxS.temp,
            {
              color: glowColor,
              textShadowColor: glowColor,
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 8,
            },
          ]}
        >
          {isLoading ? '—°C' : `${weather?.temperature ?? '—'}°C`}
        </Text>
        <Text style={wxS.status}>
          {isLoading ? '날씨 불러오는 중...' : (weather?.weatherStatus ?? '—')}
        </Text>
      </View>

      {/* Outdoor risk badge */}
      {!isLoading && weather && (
        <View
          style={[
            wxS.riskBadge,
            weather.isOutdoorRisky
              ? { backgroundColor: 'rgba(248,113,113,0.12)', borderColor: 'rgba(248,113,113,0.35)' }
              : { backgroundColor: 'rgba(74,222,128,0.10)', borderColor: 'rgba(74,222,128,0.32)' },
          ]}
        >
          <Text
            style={[
              wxS.riskTxt,
              { color: weather.isOutdoorRisky ? '#F87171' : '#4ADE80' },
            ]}
          >
            {weather.isOutdoorRisky ? '🏠 실내 코스 우선' : '🌿 야외 활동 최적'}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

const wxS = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(10,13,26,0.65)',
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
  },
  icon: {
    fontSize: 30,
  },
  info: { flex: 1, gap: 2 },
  temp: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    letterSpacing: -0.3,
  },
  status: {
    color: '#64748B',
    fontSize: FontSize.xs,
  },
  riskBadge: {
    borderRadius: Radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
  },
  riskTxt: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
  },
});

// ─── AIMuseSheet ──────────────────────────────────────────────────────────────

function AIMuseSheet({
  visible,
  onClose,
  onSubmit,
  weather,
  weatherLoading,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (ootd: string, mood: string) => void;
  weather: WeatherData | null;
  weatherLoading: boolean;
}) {
  const [ootd, setOotd] = useState<string | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const slideY = useSharedValue(600);

  useEffect(() => {
    slideY.value = visible
      ? withSpring(0, { damping: 22, stiffness: 180 })
      : withTiming(600, { duration: 260 });
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: slideY.value }] }));

  const canSubmit = ootd !== null && mood !== null;

  const handleSubmit = () => {
    if (!ootd || !mood) return;
    setOotd(null);
    setMood(null);
    onSubmit(ootd, mood);
  };

  const handleClose = () => {
    setOotd(null);
    setMood(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={museS.backdrop} />
      </TouchableWithoutFeedback>

      <Animated.View style={[museS.sheet, sheetStyle]}>
        <LinearGradient
          colors={['rgba(22,16,40,0.99)', 'rgba(10,13,26,1)']}
          style={museS.inner}
        >
          <View style={museS.handle} />

          {/* Header */}
          <View style={museS.headerRow}>
            <LinearGradient
              colors={['#7C3AED', '#D946EF', '#FF6B8B']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={museS.headerBadge}
            >
              <Text style={museS.headerEmoji}>✨</Text>
              <Text style={museS.headerText}>AI 데이트 뮤즈</Text>
            </LinearGradient>
            <Text style={museS.headerSub}>
              오늘의 감성을 알려주시면{'\n'}우리 커플 데이터 기반으로 코스를 큐레이션해 드릴게요
            </Text>
          </View>

          {/* Real-time weather indicator */}
          <WeatherWidget weather={weather} isLoading={weatherLoading} />

          {/* OOTD chips */}
          <Text style={museS.sectionLabel}>👗 오늘 OOTD 스타일</Text>
          <View style={museS.chipRow}>
            {AI_OOTD_CHIPS.map((c) => (
              <Pressable
                key={c}
                style={[museS.chip, ootd === c && museS.chipOn]}
                onPress={() => setOotd(c)}
              >
                <Text style={[museS.chipTxt, ootd === c && museS.chipTxtOn]}>{c}</Text>
              </Pressable>
            ))}
          </View>

          {/* Mood chips */}
          <Text style={museS.sectionLabel}>💫 지금 원하는 무드</Text>
          <View style={museS.chipRow}>
            {AI_MOOD_CHIPS.map((c) => (
              <Pressable
                key={c}
                style={[museS.chip, mood === c && museS.chipOn]}
                onPress={() => setMood(c)}
              >
                <Text style={[museS.chipTxt, mood === c && museS.chipTxtOn]}>{c}</Text>
              </Pressable>
            ))}
          </View>

          {/* CTA */}
          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={[museS.cta, !canSubmit && { opacity: 0.35 }]}
          >
            <LinearGradient
              colors={['#7C3AED', '#D946EF', '#FF6B8B']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={museS.ctaGrad}
            >
              <Text style={museS.ctaTxt}>✨ 코스 추천받기</Text>
            </LinearGradient>
          </Pressable>
        </LinearGradient>
      </Animated.View>
    </Modal>
  );
}

const museS = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    overflow: 'hidden',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(124,58,237,0.45)',
  },
  inner: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: 44, gap: Spacing.lg },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(148,163,184,0.3)', alignSelf: 'center',
  },
  headerRow: { alignItems: 'center', gap: Spacing.md },
  headerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: Radius.xl, paddingHorizontal: Spacing.lg, paddingVertical: 11,
  },
  headerEmoji: { fontSize: 20 },
  headerText: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.bold },
  headerSub: {
    color: '#64748B', fontSize: FontSize.xs, textAlign: 'center', lineHeight: 17,
  },
  sectionLabel: { color: '#F1F5F9', fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    backgroundColor: 'rgba(30,41,59,0.8)',
    borderRadius: Radius.pill,
    paddingHorizontal: 18, paddingVertical: 9,
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.22)',
  },
  chipOn: { backgroundColor: 'rgba(124,58,237,0.26)', borderColor: '#D946EF' },
  chipTxt: { color: '#94A3B8', fontSize: FontSize.sm },
  chipTxtOn: { color: '#F1F5F9', fontWeight: FontWeight.semibold },
  cta: { borderRadius: Radius.xl, overflow: 'hidden', marginTop: 4 },
  ctaGrad: { paddingVertical: Spacing.md, alignItems: 'center' },
  ctaTxt: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
});

// ─── LocationPermissionModal ──────────────────────────────────────────────────
// Shown once when foreground location permission is denied so the user is
// aware that Seoul fallback coords are being used instead of real GPS.

function LocationPermissionModal({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) {
  const slideY = useSharedValue(300);

  useEffect(() => {
    slideY.value = visible
      ? withSpring(0, { damping: 22, stiffness: 180 })
      : withTiming(300, { duration: 240 });
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: slideY.value }] }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <Pressable style={locPermS.backdrop} onPress={onDismiss}>
        <Animated.View style={[locPermS.card, sheetStyle]}>
          <Pressable onPress={() => {}} style={{ flex: 1 }}>
            <LinearGradient
              colors={['rgba(30,41,59,0.99)', 'rgba(10,13,26,1)']}
              style={locPermS.inner}
            >
              <View style={locPermS.handle} />
              <Text style={locPermS.iconEmoji}>🗺️</Text>
              <Text style={locPermS.title}>현재 위치를 확인할 수 없어요</Text>
              <Text style={locPermS.body}>
                위치 권한이 허용되지 않아 GPS를 사용할 수 없어요.{'\n\n'}
                <Text style={locPermS.highlight}>서울 중심부</Text>를 기준으로 AI 뮤즈를 가동할게요 🗺️{'\n\n'}
                설정 앱에서 Twin.me의 위치 권한을 허용하면{'\n'}실제 내 위치 기반 추천을 받을 수 있어요.
              </Text>
              <Pressable onPress={onDismiss} style={locPermS.btn}>
                <LinearGradient
                  colors={['#7C3AED', '#D946EF']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={locPermS.btnGrad}
                >
                  <Text style={locPermS.btnTxt}>알겠어요 👍</Text>
                </LinearGradient>
              </Pressable>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const locPermS = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'flex-end',
  },
  card: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    overflow: 'hidden',
    borderWidth: 1, borderBottomWidth: 0,
    borderColor: 'rgba(56,189,248,0.35)',
  },
  inner: {
    padding: 24, paddingBottom: 44, gap: 16, alignItems: 'center',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(148,163,184,0.3)', marginBottom: 4,
  },
  iconEmoji: { fontSize: 48 },
  title: {
    color: '#F1F5F9', fontSize: 18, fontWeight: '700', textAlign: 'center',
  },
  body: {
    color: '#94A3B8', fontSize: 14, lineHeight: 22, textAlign: 'center',
  },
  highlight: { color: '#38BDF8', fontWeight: '700' },
  btn: { width: '100%', borderRadius: 16, overflow: 'hidden', marginTop: 4 },
  btnGrad: { paddingVertical: 14, alignItems: 'center' },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

// ─── LayerControlPanel ────────────────────────────────────────────────────────
// Hamburger-triggered bottom sheet. Shows HISTORY (auto monthly), PLAN (custom),
// and SECRET (local-only) layer types with full CRUD and visibility toggles.

function LayerControlPanel({
  visible,
  onClose,
  t,
}: {
  visible: boolean;
  onClose: () => void;
  t: ThemeTokens;
}) {
  const {
    dateCourses,
    planLayers,
    layerVisibility,
    secretCourses,
    addPlanLayer,
    removePlanLayer,
    renamePlanLayer,
    movePlanLayerUp,
    movePlanLayerDown,
    toggleLayerVisible,
  } = useAppContext();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText]   = useState('');
  const [newName, setNewName]         = useState('');
  const [showNewInput, setShowNewInput] = useState(false);

  // ── FUN-HIS-006: Secret layer auth state ────────────────────────────────────
  const [secretAuthPending, setSecretAuthPending] = useState(false);
  const [webAuthVisible, setWebAuthVisible]       = useState(false);
  const [snackbarMsg, setSnackbarMsg]             = useState('');

  // Lock icon animation: 0 = locked, 1 = unlocked
  const lockRotate  = useSharedValue(0);
  const lockColor   = useSharedValue(0); // 0=red,1=green
  const snackbarY   = useSharedValue(80);
  const snackbarOp  = useSharedValue(0);

  const isSecretUnlocked = layerVisibility['secret'] !== false;

  // Sync lock anim with current visibility
  useEffect(() => {
    lockRotate.value = withSpring(isSecretUnlocked ? -30 : 0, { damping: 14, stiffness: 180 });
    lockColor.value  = withTiming(isSecretUnlocked ? 1 : 0, { duration: 300 });
  }, [isSecretUnlocked, lockRotate, lockColor]);

  const lockIconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${lockRotate.value}deg` }],
    opacity: interpolate(lockColor.value, [0, 1], [0.7, 1]),
  }));

  const snackbarStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: snackbarY.value }],
    opacity: snackbarOp.value,
  }));

  const showSnackbar = (msg: string) => {
    setSnackbarMsg(msg);
    snackbarY.value  = withSpring(0, { damping: 16, stiffness: 200 });
    snackbarOp.value = withTiming(1, { duration: 180 });
    setTimeout(() => {
      snackbarY.value  = withTiming(80, { duration: 260 });
      snackbarOp.value = withTiming(0, { duration: 220 });
    }, 3000);
  };

  // Called when user taps secret layer eye/toggle
  const handleSecretToggle = async () => {
    if (secretAuthPending) return;
    setSecretAuthPending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await authenticateSecretLayer();

    if (result.type === 'web_fallback') {
      setSecretAuthPending(false);
      setWebAuthVisible(true);
      return;
    }

    setSecretAuthPending(false);

    if (result.type === 'success') {
      toggleLayerVisible('secret');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (result.type !== 'cancelled') {
      showSnackbar('인증에 실패하여 시크릿 계획을 불러오지 못했습니다.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleWebAuthSuccess = () => {
    setWebAuthVisible(false);
    toggleLayerVisible('secret');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleWebAuthCancel = () => {
    setWebAuthVisible(false);
    showSnackbar('인증에 실패하여 시크릿 계획을 불러오지 못했습니다.');
  };

  const lcpS = useMemo(() => makeLcpStyles(t), [t.isLight]);

  const slideY = useSharedValue(SH);

  useEffect(() => {
    slideY.value = visible
      ? withSpring(0, { damping: 22, stiffness: 180 })
      : withTiming(SH, { duration: 280 });
  }, [visible]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideY.value }],
  }));

  // Compute HISTORY layer groups from courses that have no explicit layerId
  const historyGroups = useMemo(() => {
    const grouped: Record<string, DateCourse[]> = {};
    dateCourses.forEach((c) => {
      if (!c.layerId) {
        const month = c.date.length >= 7 ? c.date.substring(0, 7) : 'unknown';
        if (!grouped[month]) grouped[month] = [];
        grouped[month].push(c);
      }
    });
    return Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));
  }, [dateCourses]);

  const fmtMonth = (yyyyMM: string) => {
    const parts = yyyyMM.split('-');
    if (parts.length < 2) return yyyyMM;
    return `${parseInt(parts[0], 10) % 100}년 ${parseInt(parts[1], 10)}월`;
  };

  const handleAddLayer = () => {
    const name = newName.trim() || `새 계획 ${planLayers.length + 1}`;
    addPlanLayer(name);
    setNewName('');
    setShowNewInput(false);
  };

  const handleRenameConfirm = (id: string) => {
    if (renameText.trim()) renamePlanLayer(id, renameText.trim());
    setRenamingId(null);
    setRenameText('');
  };

  const sortedPlanLayers = useMemo(
    () => [...planLayers].sort((a, b) => a.order - b.order),
    [planLayers],
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={lcpS.backdrop} onPress={onClose} />

      <Animated.View style={[lcpS.sheet, panelStyle]}>
        <LinearGradient
          colors={t.isLight ? ['rgba(255,255,255,0.99)', 'rgba(248,246,249,1)'] : ['rgba(12,16,30,0.99)', 'rgba(10,13,26,1)']}
          style={lcpS.inner}
        >
          <View style={lcpS.handle} />

          {/* Header */}
          <View style={lcpS.headerRow}>
            <View style={lcpS.headerLeft}>
              <Text style={lcpS.headerHamburger}>≡</Text>
              <Text style={lcpS.headerTitle}>레이어 관리</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={lcpS.closeBtn}>
              <Text style={lcpS.closeTxt}>✕</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>

            {/* ══ HISTORY LAYERS ══════════════════════════════════════════════ */}
            <View style={lcpS.sectionHeader}>
              <Text style={lcpS.sectionIcon}>🕐</Text>
              <Text style={lcpS.sectionTitle}>히스토리 레이어</Text>
              <View style={lcpS.autoBadge}>
                <Text style={lcpS.autoBadgeTxt}>자동 생성</Text>
              </View>
            </View>

            {historyGroups.length === 0 ? (
              <View style={lcpS.emptyBox}>
                <Text style={lcpS.emptyTxt}>
                  방문 코스를 추가하면 월별로 자동 생성돼요 📍
                </Text>
              </View>
            ) : (
              historyGroups.map(([month, courses]) => {
                const key = `history-${month}`;
                const isVisible = layerVisibility[key] !== false;
                return (
                  <View key={key} style={lcpS.layerRow}>
                    <Text style={lcpS.lockEmoji}>🔒</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={lcpS.layerName}>{fmtMonth(month)}</Text>
                      <Text style={lcpS.layerMeta}>{courses.length}개 코스</Text>
                    </View>
                    <Pressable onPress={() => toggleLayerVisible(key)} style={lcpS.eyeBtn} hitSlop={8}>
                      <Text style={[lcpS.eyeEmoji, !isVisible && lcpS.eyeOff]}>
                        {isVisible ? '👁️' : '👁️‍🗨️'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })
            )}

            <View style={lcpS.divider} />

            {/* ══ PLAN LAYERS ═════════════════════════════════════════════════ */}
            <View style={lcpS.sectionHeader}>
              <Text style={lcpS.sectionIcon}>📋</Text>
              <Text style={lcpS.sectionTitle}>계획 레이어</Text>
              <Pressable
                style={lcpS.addLayerBtn}
                onPress={() => setShowNewInput(true)}
              >
                <LinearGradient
                  colors={['#7C3AED', '#D946EF']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={lcpS.addLayerGrad}
                >
                  <Text style={lcpS.addLayerTxt}>+ 새 계획 레이어</Text>
                </LinearGradient>
              </Pressable>
            </View>

            {showNewInput && (
              <View style={lcpS.newLayerRow}>
                <TextInput
                  style={lcpS.newLayerInput}
                  placeholder="레이어 이름 입력..."
                  placeholderTextColor="#475569"
                  value={newName}
                  onChangeText={setNewName}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleAddLayer}
                />
                <Pressable onPress={handleAddLayer} style={lcpS.confirmBtn}>
                  <Text style={lcpS.confirmTxt}>✓</Text>
                </Pressable>
                <Pressable
                  onPress={() => { setShowNewInput(false); setNewName(''); }}
                  style={lcpS.cancelBtn}
                >
                  <Text style={lcpS.cancelTxt}>✕</Text>
                </Pressable>
              </View>
            )}

            {sortedPlanLayers.length === 0 && !showNewInput && (
              <View style={lcpS.emptyBox}>
                <Text style={lcpS.emptyTxt}>
                  + 버튼으로 나만의 데이트 계획 레이어를 만들어보세요 🗺️
                </Text>
              </View>
            )}

            {sortedPlanLayers.map((layer, idx) => {
              const isVisible = layerVisibility[layer.id] !== false;
              const isRenaming = renamingId === layer.id;
              const count = dateCourses.filter((c) => c.layerId === layer.id).length;
              return (
                <View key={layer.id} style={{ marginBottom: 8 }}>
                  <View style={lcpS.planRow}>
                    {isRenaming ? (
                      <TextInput
                        style={lcpS.renameInput}
                        value={renameText}
                        onChangeText={setRenameText}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={() => handleRenameConfirm(layer.id)}
                      />
                    ) : (
                      <View style={{ flex: 1 }}>
                        <Text style={lcpS.layerName}>{layer.name}</Text>
                        <Text style={lcpS.layerMeta}>{count}개 코스</Text>
                      </View>
                    )}

                    <Pressable onPress={() => toggleLayerVisible(layer.id)} style={lcpS.eyeBtn} hitSlop={8}>
                      <Text style={[lcpS.eyeEmoji, !isVisible && lcpS.eyeOff]}>
                        {isVisible ? '👁️' : '👁️‍🗨️'}
                      </Text>
                    </Pressable>

                    {isRenaming ? (
                      <Pressable onPress={() => handleRenameConfirm(layer.id)} style={lcpS.iconBtn}>
                        <Text style={lcpS.iconBtnTxt}>✓</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => { setRenamingId(layer.id); setRenameText(layer.name); }}
                        style={lcpS.iconBtn}
                      >
                        <Text style={lcpS.iconBtnTxt}>✎</Text>
                      </Pressable>
                    )}

                    <Pressable onPress={() => removePlanLayer(layer.id)} style={lcpS.iconBtn}>
                      <Text style={[lcpS.iconBtnTxt, { color: '#EF4444' }]}>🗑</Text>
                    </Pressable>
                  </View>

                  {/* Up / Down reorder arrows */}
                  <View style={lcpS.orderRow}>
                    <Pressable
                      onPress={() => movePlanLayerUp(layer.id)}
                      disabled={idx === 0}
                      style={[lcpS.orderBtn, idx === 0 && lcpS.orderBtnOff]}
                    >
                      <Text style={lcpS.orderBtnTxt}>▲ 위로</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => movePlanLayerDown(layer.id)}
                      disabled={idx === sortedPlanLayers.length - 1}
                      style={[lcpS.orderBtn, idx === sortedPlanLayers.length - 1 && lcpS.orderBtnOff]}
                    >
                      <Text style={lcpS.orderBtnTxt}>▼ 아래로</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}

            <View style={lcpS.divider} />

            {/* ══ SECRET LAYER ════════════════════════════════════════════════ */}
            <View style={lcpS.sectionHeader}>
              <Text style={lcpS.sectionIcon}>🤫</Text>
              <Text style={lcpS.sectionTitle}>나만 보기 레이어</Text>
              {/* Animated lock icon */}
              <Animated.Text style={[lcpS.lockIconAnim, lockIconStyle]}>
                {isSecretUnlocked ? '🔓' : '🔒'}
              </Animated.Text>
              <View style={lcpS.localBadge}>
                <Text style={lcpS.localBadgeTxt}>로컬 전용</Text>
              </View>
            </View>

            {/* Secret card — biometric-guarded */}
            <View style={lcpS.secretCard}>
              <LinearGradient
                colors={t.isLight ? ['rgba(114,84,119,0.09)', 'rgba(83,85,170,0.07)'] : ['rgba(60,4,72,0.28)', 'rgba(76,29,149,0.22)']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={lcpS.secretGrad}
              >
                <Text style={lcpS.secretEmoji}>🤫</Text>
                <View style={{ flex: 1 }}>
                  <Text style={lcpS.layerName}>시크릿 플래너</Text>
                  <Text style={lcpS.layerMeta}>
                    {secretCourses.length}개 코스 · 연인에게 비공개
                  </Text>
                </View>
                {/* Eye toggle — intercepted by auth */}
                <Pressable
                  onPress={handleSecretToggle}
                  style={lcpS.eyeBtn}
                  hitSlop={8}
                  disabled={secretAuthPending}
                >
                  {secretAuthPending ? (
                    <ActivityIndicator size="small" color="#D946EF" />
                  ) : (
                    <Text style={[
                      lcpS.eyeEmoji,
                      !isSecretUnlocked && lcpS.eyeOff,
                    ]}>
                      {isSecretUnlocked ? '👁️' : '👁️‍🗨️'}
                    </Text>
                  )}
                </Pressable>
              </LinearGradient>
            </View>

            <View style={lcpS.secretNote}>
              <Text style={lcpS.secretNoteTxt}>
                🔐 이 레이어의 데이터는 기기 로컬에만 저장되며 서버 동기화가 차단됩니다
              </Text>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </LinearGradient>
      </Animated.View>

      {/* ── Error snackbar ───────────────────────────────────────────────── */}
      {snackbarMsg !== '' && (
        <Animated.View style={[lcpS.snackbar, snackbarStyle]} pointerEvents="none">
          <LinearGradient
            colors={['rgba(239,68,68,0.92)', 'rgba(185,28,28,0.92)']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={lcpS.snackbarText}>🚨 {snackbarMsg}</Text>
        </Animated.View>
      )}

      {/* ── Web PIN fallback modal ───────────────────────────────────────── */}
      <WebAuthModal
        visible={webAuthVisible}
        onSuccess={handleWebAuthSuccess}
        onCancel={handleWebAuthCancel}
      />
    </Modal>
  );
}

function makeLcpStyles(t: ThemeTokens) {
  const L = t.isLight;
  return StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: L ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.58)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: SH * 0.82,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    overflow: 'hidden',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: L ? 'rgba(112,88,91,0.28)' : 'rgba(124,58,237,0.42)',
  },
  inner: {
    flex: 1,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: L ? 'rgba(112,88,91,0.25)' : 'rgba(148,163,184,0.28)',
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerHamburger: {
    color: L ? '#725477' : '#C084FC',
    fontSize: 24,
    fontWeight: '800' as const,
    lineHeight: 26,
  },
  headerTitle: { color: t.text, fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  closeBtn: { padding: 6 },
  closeTxt: { color: t.textMuted, fontSize: 18 },
  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionIcon: { fontSize: 16 },
  sectionTitle: { color: t.text, fontSize: FontSize.sm, fontWeight: FontWeight.bold, flex: 1 },
  autoBadge: {
    backgroundColor: L ? 'rgba(114,84,119,0.12)' : 'rgba(124,58,237,0.18)',
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: L ? 'rgba(114,84,119,0.35)' : 'rgba(124,58,237,0.35)',
  },
  autoBadgeTxt: { color: L ? '#725477' : '#C084FC', fontSize: 10, fontWeight: FontWeight.bold },
  localBadge: {
    backgroundColor: L ? 'rgba(83,85,170,0.12)' : 'rgba(74,4,78,0.28)',
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: L ? 'rgba(83,85,170,0.38)' : 'rgba(124,58,237,0.55)',
  },
  localBadgeTxt: { color: L ? '#5355AA' : '#A78BFA', fontSize: 10, fontWeight: FontWeight.bold },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: L ? t.divider : 'rgba(124,58,237,0.2)',
    marginVertical: Spacing.lg,
  },
  // Common layer row
  layerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: L ? 'rgba(255,255,255,0.85)' : 'rgba(30,41,59,0.55)',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: L ? 'rgba(112,88,91,0.15)' : 'rgba(100,116,139,0.18)',
  },
  lockEmoji: { fontSize: 14 },
  layerName: { color: t.text, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  layerMeta: { color: t.textMuted, fontSize: 11, marginTop: 2 },
  eyeBtn: { padding: 4 },
  eyeEmoji: { fontSize: 20 },
  eyeOff: { opacity: 0.28 },
  emptyBox: { alignItems: 'center', paddingVertical: Spacing.lg },
  emptyTxt: { color: t.textMuted, fontSize: FontSize.xs, textAlign: 'center', lineHeight: 18 },
  // Plan layer add
  addLayerBtn: { borderRadius: Radius.pill, overflow: 'hidden' },
  addLayerGrad: { paddingHorizontal: 12, paddingVertical: 5 },
  addLayerTxt: { color: '#fff', fontSize: 11, fontWeight: FontWeight.bold },
  newLayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  newLayerInput: {
    flex: 1,
    backgroundColor: L ? 'rgba(244,240,241,0.9)' : 'rgba(30,41,59,0.85)',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    color: t.text,
    fontSize: FontSize.sm,
    borderWidth: 1,
    borderColor: L ? 'rgba(114,84,119,0.35)' : 'rgba(124,58,237,0.45)',
  },
  confirmBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(74,222,128,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.5)',
  },
  confirmTxt: { color: '#4ADE80', fontSize: 18, fontWeight: FontWeight.bold },
  cancelBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: L ? 'rgba(112,88,91,0.10)' : 'rgba(100,116,139,0.12)',
  },
  cancelTxt: { color: t.textMuted, fontSize: 16 },
  // Plan layer row
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: L ? 'rgba(255,255,255,0.85)' : 'rgba(30,41,59,0.55)',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: L ? 'rgba(114,84,119,0.15)' : 'rgba(124,58,237,0.18)',
  },
  renameInput: {
    flex: 1,
    backgroundColor: L ? 'rgba(244,240,241,0.9)' : 'rgba(30,41,59,0.85)',
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: t.text,
    fontSize: FontSize.sm,
    borderWidth: 1,
    borderColor: L ? 'rgba(114,84,119,0.35)' : 'rgba(124,58,237,0.5)',
  },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  iconBtnTxt: { color: t.textSecondary, fontSize: 15 },
  // Order buttons
  orderRow: { flexDirection: 'row', gap: 6, paddingLeft: Spacing.md, marginTop: 5 },
  orderBtn: {
    backgroundColor: L ? 'rgba(240,236,241,0.85)' : 'rgba(30,41,59,0.5)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: L ? 'rgba(112,88,91,0.15)' : 'rgba(100,116,139,0.2)',
  },
  orderBtnOff: { opacity: 0.22 },
  orderBtnTxt: { color: t.textSecondary, fontSize: 10, fontWeight: FontWeight.bold },
  // Secret layer card
  secretCard: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(124,58,237,0.6)',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
  },
  secretGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: Spacing.md,
  },
  secretEmoji: { fontSize: 22 },
  secretNote: {
    marginTop: 10,
    backgroundColor: L ? 'rgba(83,85,170,0.07)' : 'rgba(124,58,237,0.1)',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: L ? 'rgba(83,85,170,0.22)' : 'rgba(124,58,237,0.25)',
  },
  secretNoteTxt: { color: L ? '#5355AA' : '#8B7CB3', fontSize: 11, lineHeight: 16 },

  // Auth lock icon
  lockIconAnim: { fontSize: 18, marginLeft: 4 },

  // Error snackbar
  snackbar: {
    position: 'absolute',
    bottom: 24, left: 16, right: 16,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    paddingVertical: 12, paddingHorizontal: 16,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 18,
    zIndex: 1000,
  },
  snackbarText: {
    color: '#fff', fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold, lineHeight: 20,
  },
  });
}

// ─── DateMapView ──────────────────────────────────────────────────────────────

function DateMapView({ t }: { t: ThemeTokens }) {
  const {
    dateCourses, addDateCourse, partnerProfile, bulkAddDateCourses, privacyLevel,
    triggerAddCourse, setTriggerAddCourse, setCurrentOOTD, setCurrentMood,
    layerVisibility, secretCourses, toggleLayerVisible,
  } = useAppContext();
  const { historyPlaces, addHistoryPlace, mapPanTarget, panMapTo } = useHistoryContext();
  const { pickPhoto } = usePhotoMetadata();

  // ── Layer control panel ────────────────────────────────────────────────────
  const [layerPanelVisible, setLayerPanelVisible] = useState(false);

  // ── FUN-HIS-006: layer-aware filtering ────────────────────────────────────
  // Courses with no layerId → HISTORY (grouped by month, visibility by key history-YYYY-MM)
  // Courses with layerId    → PLAN   (visibility by key = layerId)
  const filteredCourses = useMemo(() => {
    return dateCourses.filter((c) => {
      if (c.layerId) {
        return layerVisibility[c.layerId] !== false;
      }
      const month = c.date.length >= 7 ? c.date.substring(0, 7) : 'unknown';
      return layerVisibility[`history-${month}`] !== false;
    });
  }, [dateCourses, layerVisibility]);

  // Secret courses — shown only when secret layer is not explicitly hidden
  const visibleSecretCourses = useMemo(
    () => (layerVisibility['secret'] !== false ? secretCourses : []),
    [secretCourses, layerVisibility],
  );

  // Combined for KakaoMapView (regular + secret)
  const allMapCourses = useMemo(
    () => [...filteredCourses, ...visibleSecretCourses],
    [filteredCourses, visibleSecretCourses],
  );

  // ── Planner state ──────────────────────────────────────────────────────────
  const [plannerVisible, setPlannerVisible] = useState(false);
  const [plannerAnchor, setPlannerAnchor] = useState<DateCourse | null>(null);
  const [plannerSlots, setPlannerSlots] = useState<DateCourse[]>([]);
  const [candidates, setCandidates] = useState<CandidatePlace[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);

  // ── AI Course Planner state (FUN-HIS-006) ─────────────────────────────────
  const [aiPlannerVisible, setAiPlannerVisible] = useState(false);
  const [aiPlannerRoute, setAiPlannerRoute]     = useState<Array<{ latitude: number; longitude: number }>>([]);

  // ── Budget filter state ────────────────────────────────────────────────────
  const [budgetRange, setBudgetRange] = useState({ min: 0, max: 300_000 });
  const [confirmedBudgets, setConfirmedBudgets] = useState<number[]>([]);
  const totalConfirmedBudget = confirmedBudgets.reduce((s, b) => s + b, 0);

  const fetchCandidates = async (
    anchor: DateCourse,
    budget: { min: number; max: number },
  ) => {
    setIsLoadingCandidates(true);
    setCandidates([]);
    try {
      const result = await calculateNextCourseCandidates(anchor, undefined, budget);
      setCandidates(result);
    } finally {
      setIsLoadingCandidates(false);
    }
  };

  const handleSetAnchor = (anchor: DateCourse) => {
    setPlannerAnchor(anchor);
    setPlannerSlots([anchor]);
    setConfirmedBudgets([]);
    setPlannerVisible(true);
    fetchCandidates(anchor, budgetRange);
  };

  const handleBudgetChange = (min: number, max: number) => {
    const next = { min, max };
    setBudgetRange(next);
    if (plannerAnchor) {
      fetchCandidates(plannerAnchor, next);
    }
  };

  const handleMapLongPress = (lat: number, lng: number) => {
    const today = new Date().toISOString().split('T')[0];
    const anchor: DateCourse = {
      id: `longpress-${Date.now()}`,
      title: `선택한 위치 (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      date: today,
      latitude: lat,
      longitude: lng,
      myRating: 0,
      myReview: '',
      partnerRating: 0,
      partnerReview: '',
    };
    handleSetAnchor(anchor);
  };

  const handleCandidateConfirm = (candidate: CandidatePlace) => {
    const today = new Date().toISOString().split('T')[0];
    const newCourse: DateCourse = {
      id: `planner-${candidate.id}-${Date.now()}`,
      title: candidate.title,
      date: today,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      myRating: 0,
      myReview: '[ 플래너 AI 추천 · 방문 예정 ]',
      partnerRating: 0,
      partnerReview: '',
    };
    addDateCourse(newCourse);
    setPlannerSlots((prev) => [...prev, newCourse]);
    setConfirmedBudgets((prev) => [...prev, candidate.estimatedBudget]);
    // Chain: search next candidates from the just-confirmed course
    fetchCandidates(newCourse, budgetRange);
  };

  // Reactive coordinate chain — only visible (non-secret) courses form the polyline.
  // When AI planner has produced an optimized route, use that instead.
  const courseRoute = useMemo(() => {
    if (aiPlannerRoute.length > 0) return aiPlannerRoute;
    return generateRoutePolylineSegments(filteredCourses);
  }, [filteredCourses, aiPlannerRoute]);

  // ── Empty-state guide overlay: fade out after 5 s ─────────────────────────
  const overlayOpacity = useSharedValue(1);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const overlayAnimStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  useEffect(() => {
    if (allMapCourses.length > 0) {
      // Courses exist — hide immediately without animation
      overlayOpacity.value = 0;
      setOverlayVisible(false);
      return;
    }
    const timer = setTimeout(() => {
      overlayOpacity.value = withTiming(0, { duration: 600 });
      setTimeout(() => setOverlayVisible(false), 620);
    }, 5000);
    return () => clearTimeout(timer);
  // Only run on mount and when course count crosses 0→positive boundary
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMapCourses.length]);

  // ── GPS real-time location engine (Step #32) ──────────────────────────────
  const geoLocation = useGeoLocation();

  // Permission denial modal — shown at most once per session
  const [showPermModal, setShowPermModal]  = useState(false);
  const permModalShownRef                  = useRef(false);

  // One-shot camera pan when the first real GPS fix arrives
  const firstGpsPanRef = useRef(false);

  useEffect(() => {
    if (geoLocation.permission === 'denied' && !permModalShownRef.current) {
      permModalShownRef.current = true;
      setShowPermModal(true);
    }
  }, [geoLocation.permission]);

  useEffect(() => {
    // Animate map to real GPS position once on first fix — never again (user may have panned)
    if (geoLocation.isReal && !firstGpsPanRef.current) {
      firstGpsPanRef.current = true;
      panMapTo(geoLocation.coords.lat, geoLocation.coords.lng);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoLocation.isReal]); // intentionally not including coords to prevent re-panning on every update

  const handleRecenter = async () => {
    // Re-acquire GPS position, then smoothly animate the map camera
    const freshCoords = await geoLocation.recenter();
    panMapTo(freshCoords.lat, freshCoords.lng);
  };

  const [addVisible, setAddVisible]           = useState(false);
  const [currentWeather, setCurrentWeather]   = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading]   = useState(false);

  // Open AddCourseSheet when triggered from home tab [+추가] button
  useEffect(() => {
    if (triggerAddCourse) {
      setAddVisible(true);
      setTriggerAddCourse(false);
    }
  }, [triggerAddCourse, setTriggerAddCourse]);
  const [museVisible, setMuseVisible]         = useState(false);
  const [selectedCourse, setSelectedCourse]   = useState<DateCourse | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendedPlace[] | null>(null);
  const [isLoadingAI, setIsLoadingAI]         = useState(false);

  // Map centre — real GPS when available, Seoul centre fallback otherwise.
  // Replaces the old dateCourses[0] heuristic so AI Muse / Weather always use the user's physical position.
  const mapCenter = geoLocation.coords;

  // ── Weather fetch triggered on FAB press (Step #31) ─────────────────────
  // Fires concurrently with opening the sheet so the WeatherWidget renders
  // the data as soon as the OWM response arrives — typically within 1–2s.
  const handleMuseFABPress = async () => {
    setMuseVisible(true);
    setWeatherLoading(true);
    try {
      const w = await fetchCurrentWeather(mapCenter.lat, mapCenter.lng);
      setCurrentWeather(w);
    } catch {
      setCurrentWeather(null);
    } finally {
      setWeatherLoading(false);
    }
  };

  // ── AI Muse orchestration (Step #29 + #31: real LLM pipeline + weather) ──
  // Closes the sheet immediately → shows star particle overlay while Kakao + LLM run
  // Lv1 (보호): empty date history passed to LLM (no personal context)
  const handleMuseSubmit = async (ootd: string, mood: string) => {
    // FUN-HIS-005: 전역 상태 영속화 → 무드 피드 필터가 실시간 구독
    setCurrentOOTD(ootd);
    setCurrentMood(mood);
    setMuseVisible(false);
    setIsLoadingAI(true);
    setRecommendations(null);
    setSelectedCourse(null);
    try {
      const result = await requestMuseCourse(
        mapCenter.lat,
        mapCenter.lng,
        ootd,
        mood,
        dateCourses,
        privacyLevel,
        currentWeather,
      );
      setRecommendations(result);
    } finally {
      setIsLoadingAI(false);
    }
  };

  // ── Bulk insert recommended courses ───────────────────────────────────────
  const handleConfirmCourse = () => {
    if (!recommendations) return;
    const today = new Date().toISOString().split('T')[0];
    const newCourses: DateCourse[] = recommendations.map((r) => ({
      id: r.id,
      title: r.title,
      date: today,
      latitude: r.latitude,
      longitude: r.longitude,
      myRating: 0,
      myReview: '[ AI 추천 · 방문 예정 ]',
      partnerRating: 0,
      partnerReview: '',
    }));
    bulkAddDateCourses(newCourses);
    setRecommendations(null);
  };

  // ── Photo upload FAB handler ───────────────────────────────────────────────
  // Adds new PhotoMeta to HistoryContext, then triggers a smooth camera panTo.
  const handlePhotoUpload = () => {
    pickPhoto(
      (meta) => {
        addHistoryPlace(meta);
        panMapTo(meta.lat, meta.lng);
      },
      mapCenter,
    );
  };

  const FAB_BOTTOM        = STATS_BAR_H + TabBar.height + 16;
  const PHOTO_FAB_BOTTOM  = FAB_BOTTOM + 62;
  const MUSE_FAB_BOTTOM   = PHOTO_FAB_BOTTOM + 62;

  return (
    <View style={[mapV.root, { backgroundColor: t.bg }]}>
      {/* ── Map canvas ── */}
      <View style={[mapV.mapContainer, { height: MAP_H }]}>
        <HistoryKakaoMapView
          courses={allMapCourses}
          photos={historyPlaces}
          onMarkerPress={(c) => { setSelectedCourse(c); setRecommendations(null); }}
          recommendedPlaces={recommendations ?? undefined}
          candidatePlaces={candidates.length > 0 ? candidates : undefined}
          panTarget={mapPanTarget}
          courseRoute={courseRoute}
          userLocation={geoLocation.isReal ? geoLocation.coords : undefined}
          onMapLongPress={handleMapLongPress}
        />

        {/* ── Empty-state onboarding guide overlay ── */}
        {overlayVisible && (
          <Animated.View
            style={[mapGuideS.overlay, overlayAnimStyle]}
            pointerEvents="none"
          >
            <View style={mapGuideS.card}>
              <Text style={mapGuideS.text}>
                {'📍 지도를 롱프레스해서 첫 번째 데이트 장소를\n핀으로 꽂아보세요!'}
              </Text>
            </View>
          </Animated.View>
        )}

        {/* ── GPS 내 위치 버튼 (My Location FAB) — top-right inside map ── */}
        <Pressable
          onPress={handleRecenter}
          style={[
            mapV.gpsBtn,
            !geoLocation.isReal && { opacity: 0.48 },
          ]}
          accessibilityLabel="내 위치로 이동"
        >
          <LinearGradient
            colors={
              geoLocation.isReal
                ? ['rgba(56,189,248,0.22)', 'rgba(124,58,237,0.18)']
                : ['rgba(30,41,59,0.85)', 'rgba(15,23,42,0.88)']
            }
            style={mapV.gpsBtnGrad}
          >
            {/* Neon blue GPS indicator dot */}
            {geoLocation.isReal && (
              <View style={mapV.gpsDot} />
            )}
            <Text style={mapV.gpsBtnIcon}>◎</Text>
          </LinearGradient>
        </Pressable>

        {/* ── 햄버거 레이어 컨트롤 버튼 — top-right, below GPS ── */}
        <Pressable
          onPress={() => setLayerPanelVisible(true)}
          style={mapV.hamburgerBtn}
          accessibilityLabel="레이어 관리 패널 열기"
        >
          <LinearGradient
            colors={['rgba(10,13,26,0.92)', 'rgba(30,20,46,0.88)']}
            style={mapV.hamburgerGrad}
          >
            <View style={mapV.hamburgerLines}>
              <View style={mapV.hamburgerLine} />
              <View style={mapV.hamburgerLine} />
              <View style={mapV.hamburgerLine} />
            </View>
          </LinearGradient>
        </Pressable>

        {/* Star particle loading overlay */}
        {isLoadingAI && <StarParticleOverlay />}

        {/* Floating recommendation cards at map bottom */}
        {recommendations && !isLoadingAI && (
          <View style={mapV.recCardRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: Spacing.md, gap: 10, paddingBottom: 10 }}
            >
              {recommendations.map((r, i) => (
                <RecommendationCard key={r.id} place={r} step={i + 1} />
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* ── Quick peek card (selected existing course) ── */}
      {selectedCourse && !recommendations && (
        <View
          style={[
            mapV.quickPeek,
            {
              backgroundColor: t.isLight ? 'rgba(255,255,255,0.97)' : 'rgba(30,41,59,0.97)',
              borderColor: t.isLight ? 'rgba(200,150,180,0.3)' : 'rgba(124,58,237,0.3)',
            },
          ]}
        >
          <Text style={[mapV.qTitle, { color: t.text }]}>{selectedCourse.title}</Text>
          <Text style={[mapV.qDate, { color: t.textMuted }]}>{selectedCourse.date}</Text>
          <View style={mapV.qRatings}>
            <View style={mapV.qRatingRow}>
              <Text style={[mapV.qName, { color: t.textSecondary }]}>나</Text>
              {selectedCourse.myRating === 0
                ? <Text style={{ color: '#FF6B8B', fontSize: 11 }}>방문 예정 ✈️</Text>
                : <StarRating value={selectedCourse.myRating} readonly size={14} />
              }
            </View>
            <View style={mapV.qRatingRow}>
              <Text style={[mapV.qName, { color: t.textSecondary }]}>{partnerProfile.name}</Text>
              {selectedCourse.partnerRating === 0
                ? <Text style={{ color: '#94A3B8', fontSize: 11 }}>미입력</Text>
                : <StarRating value={Math.round(selectedCourse.partnerRating)} readonly size={14} />
              }
            </View>
          </View>
          <View style={mapV.qActions}>
            <Pressable
              style={mapV.qStartPlanner}
              onPress={() => { handleSetAnchor(selectedCourse!); setSelectedCourse(null); }}
            >
              <Text style={mapV.qStartPlannerTxt}>📋 여기서 코스 시작</Text>
            </Pressable>
            <Pressable style={mapV.qClose} onPress={() => setSelectedCourse(null)}>
              <Text style={{ color: '#94A3B8', fontSize: 12 }}>✕</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Planner trigger strips ── */}
      {!recommendations && !isLoadingAI && (
        <View style={mapV.plannerTriggerGroup}>
          {/* Slot-based planner (existing) */}
          <Pressable style={[mapV.plannerTrigger, { flex: 1, marginHorizontal: 0, marginTop: 0, marginBottom: 0 }]} onPress={() => setPlannerVisible(true)}>
            <LinearGradient
              colors={['rgba(74,222,128,0.09)', 'rgba(34,211,238,0.06)']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={mapV.plannerTriggerGrad}
            >
              <Text style={mapV.plannerTriggerTxt}>📋 코스 플래너</Text>
              <Text style={mapV.plannerTriggerHint}>핀 탭해 시작</Text>
            </LinearGradient>
          </Pressable>
          {/* AI Course Planner (new) */}
          <Pressable
            style={[mapV.plannerTrigger, mapV.aiPlannerTrigger]}
            onPress={() => setAiPlannerVisible(true)}
          >
            <LinearGradient
              colors={['rgba(124,58,237,0.18)', 'rgba(217,70,239,0.12)']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={mapV.plannerTriggerGrad}
            >
              <Text style={mapV.aiPlannerTriggerTxt}>🗺️ AI 코스 플래너</Text>
              <Text style={mapV.plannerTriggerHint}>자동 동선 최적화</Text>
            </LinearGradient>
          </Pressable>
        </View>
      )}

      {/* ── Recommendation confirm panel OR course list ── */}
      {recommendations && !isLoadingAI ? (
        <View style={mapV.recPanel}>
          {/* AI 뮤즈 특별 추천 배지 — neon violet glow */}
          <View style={mapV.museBadgeWrap}>
            <LinearGradient
              colors={['#7C3AED', '#D946EF', '#FF6B8B']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={mapV.museBadge}
            >
              <Text style={mapV.museBadgeTxt}>✨ AI 뮤즈 특별 추천</Text>
            </LinearGradient>
          </View>
          <Text style={[mapV.recPanelTitle, { color: t.textMuted }]}>
            현재 위치 기반으로 큐레이션한 실시간 데이트 코스예요
          </Text>
          <Pressable style={mapV.confirmBtn} onPress={handleConfirmCourse}>
            <LinearGradient
              colors={['#7C3AED', '#D946EF', '#FF6B8B']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={mapV.confirmGrad}
            >
              <Text style={mapV.confirmTxt}>👉 이 코스로 데이트 확정하기</Text>
            </LinearGradient>
          </Pressable>
          <Pressable style={mapV.dismissBtn} onPress={() => setRecommendations(null)}>
            <Text style={{ color: '#64748B', fontSize: FontSize.xs }}>✕ 다시 추천받기</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: Spacing.md, paddingBottom: STATS_BAR_H + TabBar.height + 80 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[mapV.listHeader, { color: t.textMuted }]}>
            📍 등록된 장소 {dateCourses.length}곳
          </Text>
          {dateCourses.map((c) => (
            <CourseListCard key={c.id} course={c} t={t} />
          ))}
        </ScrollView>
      )}

      {/* ── Privacy level badge (shown when collection is restricted) ── */}
      {privacyLevel < 3 && (
        <View
          style={{
            position: 'absolute',
            right: Spacing.base + 4,
            bottom: MUSE_FAB_BOTTOM + 60,
            backgroundColor: privacyLevel === 1 ? 'rgba(248,113,113,0.92)' : 'rgba(251,191,36,0.92)',
            borderRadius: Radius.pill,
            paddingHorizontal: 10,
            paddingVertical: 5,
          }}
          pointerEvents="none"
        >
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
            {privacyLevel === 1 ? '🔴 수집 차단' : '🟡 학습 일시 중단'}
          </Text>
        </View>
      )}

      {/* ── AI Muse FAB (aurora, above photo FAB) ── */}
      <AuroraMuseFAB onPress={handleMuseFABPress} bottom={MUSE_FAB_BOTTOM} />

      {/* ── 📸 추억 사진 올리기 FAB ── */}
      <Pressable
        style={[mapV.fab, { bottom: PHOTO_FAB_BOTTOM }]}
        onPress={handlePhotoUpload}
      >
        <LinearGradient
          colors={['#7C3AED', '#D946EF', '#FF6B8B']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={mapV.fabGrad}
        >
          <Text style={mapV.fabTxt}>📸 추억 사진 올리기</Text>
        </LinearGradient>
      </Pressable>

      {/* ── + 코스 추가 FAB ── */}
      <Pressable
        style={[mapV.fab, { bottom: FAB_BOTTOM }]}
        onPress={() => setAddVisible(true)}
      >
        <LinearGradient
          colors={t.gradientColors}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={mapV.fabGrad}
        >
          <Text style={mapV.fabTxt}>+ 코스 추가</Text>
        </LinearGradient>
      </Pressable>

      <AIMuseSheet
        visible={museVisible}
        onClose={() => setMuseVisible(false)}
        onSubmit={handleMuseSubmit}
        weather={currentWeather}
        weatherLoading={weatherLoading}
      />
      <AddCourseSheet
        visible={addVisible}
        onClose={() => setAddVisible(false)}
        partnerName={partnerProfile.name}
        onPlaceSelected={panMapTo}
      />

      {/* GPS permission denial guide modal — shown once when user denies location access */}
      <LocationPermissionModal
        visible={showPermModal}
        onDismiss={() => setShowPermModal(false)}
      />

      {/* ── Layer Control Panel (hamburger) ── */}
      <LayerControlPanel
        visible={layerPanelVisible}
        onClose={() => setLayerPanelVisible(false)}
        t={t}
      />

      {/* ── Date Course Planner Bottom Sheet ── */}
      <DateMapPlanner
        visible={plannerVisible}
        onClose={() => setPlannerVisible(false)}
        anchor={plannerAnchor}
        plannerSlots={plannerSlots}
        candidates={candidates}
        isLoadingCandidates={isLoadingCandidates}
        onCandidateConfirm={handleCandidateConfirm}
        budgetRange={budgetRange}
        onBudgetChange={handleBudgetChange}
        totalConfirmedBudget={totalConfirmedBudget}
      />

      {/* ── AI 코스 플래너 Bottom Sheet (FUN-HIS-006) ── */}
      <CoursePlanner
        visible={aiPlannerVisible}
        onClose={() => setAiPlannerVisible(false)}
        courses={[...filteredCourses, ...visibleSecretCourses]}
        isLight={t.isLight}
        onOptimized={(ordered: OptimizedCourse[]) => {
          setAiPlannerRoute(ordered.map((c) => ({ latitude: c.latitude, longitude: c.longitude })));
        }}
      />
    </View>
  );
}

const mapGuideS = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 20,
  },
  card: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    maxWidth: 280,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.35)',
  },
  text: {
    color: '#E2D9FF',
    fontSize: FontSize.sm,
    lineHeight: 20,
    textAlign: 'center',
    fontWeight: FontWeight.medium,
  },
});

const mapV = StyleSheet.create({
  root: { flex: 1 },
  mapContainer: {
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(124,58,237,0.22)',
  },
  // ── GPS My-Location FAB (inside map canvas, top-right) ─────────────────────
  gpsBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(56,189,248,0.45)',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 12,
    zIndex: 30,
  },
  // ── Hamburger Layer Control Button (top-right, below GPS) ────────────────────
  hamburgerBtn: {
    position: 'absolute',
    top: 60,   // GPS button: top 12, height 40 → ends at 52; add 8px gap → 60
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(124,58,237,0.5)',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 10,
    elevation: 12,
    zIndex: 30,
  },
  hamburgerGrad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hamburgerLines: { gap: 4, alignItems: 'center' },
  hamburgerLine: {
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#C084FC',
  },
  gpsBtnGrad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsBtnIcon: {
    color: '#38BDF8',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
  },
  gpsDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#38BDF8',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 4,
  },
  // Recommendation card row floating at map bottom
  recCardRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: 'rgba(10,13,26,0.55)',
  },
  // Recommendation confirm panel
  recPanel: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  // AI 뮤즈 특별 추천 배지 (neon violet glow)
  museBadgeWrap: { alignItems: 'center', marginBottom: 2 },
  museBadge: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 9,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 18,
    elevation: 16,
  },
  museBadgeTxt: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.6,
  },
  recPanelTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  confirmBtn: { borderRadius: Radius.xl, overflow: 'hidden' },
  confirmGrad: { paddingVertical: Spacing.md, alignItems: 'center' },
  confirmTxt: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
  dismissBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  quickPeek: {
    marginHorizontal: Spacing.base,
    marginTop: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: 6,
  },
  qTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  qDate:  { fontSize: FontSize.xs },
  qRatings: { gap: 4, marginTop: 2 },
  qRatingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  qName: { fontSize: FontSize.xs, width: 28 },
  qActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  qStartPlanner: {
    backgroundColor: 'rgba(74,222,128,0.12)',
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.35)',
  },
  qStartPlannerTxt: { color: '#4ADE80', fontSize: 11, fontWeight: FontWeight.bold },
  qClose: { padding: 4 },
  // Planner trigger strip
  plannerTrigger: {
    marginHorizontal: Spacing.base,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.25)',
  },
  plannerTriggerGrad: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  plannerTriggerGroup: {
    flexDirection: 'row',
    marginHorizontal: Spacing.base,
    marginTop: 8,
    marginBottom: 4,
    gap: 8,
  },
  aiPlannerTrigger: {
    flex: 1,
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 0,
    borderColor: 'rgba(124,58,237,0.35)',
  },
  aiPlannerTriggerTxt: { color: '#A78BFA', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  plannerTriggerTxt: { color: '#4ADE80', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  plannerTriggerHint: { color: '#334155', fontSize: 10 },
  listHeader: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginLeft: Spacing.base,
    marginBottom: Spacing.sm,
  },
  fab: {
    position: 'absolute',
    right: Spacing.base,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    shadowColor: '#D946EF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 14,
  },
  fabGrad: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fabTxt: { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
});

// ─── ArchiveView (Polaroid Wall) ──────────────────────────────────────────────

function ArchiveView({ t }: { t: ThemeTokens }) {
  const memories = useMemoryWall(7);
  const [detailNode, setDetailNode] = useState<MemoryNode | null>(null);
  const [shuttleVisible, setShuttleVisible] = useState(false);

  // Scatter positions recomputed whenever memory count changes — stable per count
  const scatter = useMemo(() => buildScatter(memories.length), [memories.length]);

  const wallH = Math.max(WALL_H, memories.length * 200 + 100);

  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: STATS_BAR_H + TabBar.height + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {memories.length === 0 ? (
          // ── Empty state ────────────────────────────────────────────────────
          <View style={archS.emptyWrap}>
            <LinearGradient
              colors={['rgba(124,58,237,0.12)', 'rgba(217,70,239,0.08)']}
              style={archS.emptyCard}
            >
              <Text style={archS.emptyEmoji}>📭</Text>
              <Text style={[archS.emptyTitle, { color: t.text }]}>
                아직 추억이 없어요
              </Text>
              <Text style={[archS.emptyDesc, { color: t.textMuted }]}>
                카카오톡 대화 파일을 업로드하면{'\n'}가장 다정했던 순간들을 자동으로 골라드려요 ✨
              </Text>
            </LinearGradient>
          </View>
        ) : (
          <View style={{ height: wallH }}>
            {memories.map((node, i) => (
              <PolaroidCard
                key={node.id}
                node={node}
                index={i}
                scatter={scatter[i]}
                onShowDetail={setDetailNode}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <StatsBar t={t} />

      <Pressable
        style={[archS.fab, { bottom: STATS_BAR_H + TabBar.height + 16 }]}
        onPress={() => setShuttleVisible(true)}
      >
        <LinearGradient
          colors={t.gradientColors}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={archS.fabGrad}
        >
          <Text style={archS.fabEmoji}>🗺️</Text>
        </LinearGradient>
      </Pressable>

      <DateShuttleModal visible={shuttleVisible} onClose={() => setShuttleVisible(false)} />

      {detailNode && (
        <MemoryDetailModal node={detailNode} onClose={() => setDetailNode(null)} />
      )}
    </>
  );
}

const archS = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: Spacing.base,
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#D946EF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 14,
  },
  fabGrad:   { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  fabEmoji:  { fontSize: 24 },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: 60,
  },
  emptyCard: {
    width: '100%',
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.25)',
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, textAlign: 'center' },
  emptyDesc: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
});

// ─── FUN-HIS-005: 무드 피드 데이터 & 유틸 ────────────────────────────────────

interface FeedSpot {
  title: string;
  latitude: number;
  longitude: number;
  category: string;
}

interface FeedCardData {
  id: string;
  tierScore: number;
  region: string;
  ootdTags: string[];
  moodTags: string[];
  myRating: number;
  partnerRating: number;
  comment: string;
  spots: FeedSpot[];
}

function getTierInfo(score: number): { emoji: string; label: string } {
  if (score >= 95) return { emoji: '🏆', label: '환상 속의 신화적 결합' };
  if (score >= 90) return { emoji: '🧬', label: '영혼까지 닮은 도플갱어' };
  if (score >= 85) return { emoji: '💖', label: '기적의 소울메이트' };
  if (score >= 80) return { emoji: '✨', label: '눈빛만 봐도 아는 사이' };
  if (score >= 75) return { emoji: '🍃', label: '달달한 핑크빛 로맨스' };
  if (score >= 70) return { emoji: '🌸', label: '다정다감한 모범 커플' };
  if (score >= 65) return { emoji: '🎭', label: '평소엔 연인, 싸울 땐 웬수' };
  if (score >= 60) return { emoji: '📉', label: '아슬아슬한 밀당 권태기' };
  if (score >= 55) return { emoji: '⚡', label: '말 한마디가 시한폭탄' };
  return { emoji: '🚨', label: '살얼음판 위 대치 상황' };
}

type FeedSortKey = 'latest' | 'rating' | 'nearby';

const VIRTUAL_FEED: FeedCardData[] = [
  {
    id: 'feed-1',
    tierScore: 88,
    region: '성수동',
    ootdTags: ['시크', '캐주얼'],
    moodTags: ['차분함', '로맨틱'],
    myRating: 4.8,
    partnerRating: 4.5,
    comment: '조용한 카페에서 시작해 서울숲으로 이어지는 여유로운 반나절 코스',
    spots: [
      { title: '어니언 성수', latitude: 37.5440, longitude: 127.0568, category: '☕ 카페' },
      { title: '서울숲 공원', latitude: 37.5444, longitude: 127.0375, category: '🌳 공원' },
      { title: '뚝섬 한강공원', latitude: 37.5310, longitude: 127.0680, category: '🌊 한강' },
    ],
  },
  {
    id: 'feed-2',
    tierScore: 92,
    region: '홍대',
    ootdTags: ['페미닌', '캐주얼'],
    moodTags: ['신남', '힐링'],
    myRating: 5.0,
    partnerRating: 4.8,
    comment: '핫플 카페 홀릭 + 전시회 + 연남동 맛집으로 이어지는 인생 데이트',
    spots: [
      { title: '카페 꼼마 홍대', latitude: 37.5570, longitude: 126.9217, category: '☕ 카페' },
      { title: '무신사 스탠다드 홍대', latitude: 37.5560, longitude: 126.9226, category: '🛍️ 전시' },
      { title: '연남동 돼지고기 골목', latitude: 37.5593, longitude: 126.9246, category: '🍖 맛집' },
    ],
  },
  {
    id: 'feed-3',
    tierScore: 96,
    region: '경리단길',
    ootdTags: ['시크'],
    moodTags: ['로맨틱', '차분함'],
    myRating: 4.9,
    partnerRating: 5.0,
    comment: '경리단길 야경 투어 + 숨겨진 와인바로 완성하는 로맨틱 나이트',
    spots: [
      { title: '경리단길 와인바', latitude: 37.5348, longitude: 126.9893, category: '🍷 바' },
      { title: 'N서울타워 전망대', latitude: 37.5512, longitude: 126.9882, category: '🗼 뷰포인트' },
      { title: '해방촌 루프탑 카페', latitude: 37.5448, longitude: 126.9869, category: '☕ 루프탑' },
    ],
  },
  {
    id: 'feed-4',
    tierScore: 82,
    region: '압구정',
    ootdTags: ['캐주얼', '페미닌'],
    moodTags: ['신남', '차분함'],
    myRating: 4.6,
    partnerRating: 4.5,
    comment: '압구정 갤러리 + 도산공원 카페 + 청담 한강으로 감성 충전 주말',
    spots: [
      { title: '도산공원 카페 거리', latitude: 37.5233, longitude: 127.0389, category: '☕ 카페' },
      { title: '압구정 현대갤러리', latitude: 37.5269, longitude: 127.0339, category: '🖼️ 갤러리' },
      { title: '청담 한강공원', latitude: 37.5166, longitude: 127.0485, category: '🌊 한강' },
    ],
  },
  {
    id: 'feed-5',
    tierScore: 91,
    region: '북촌',
    ootdTags: ['캐주얼', '시크'],
    moodTags: ['힐링', '차분함'],
    myRating: 4.7,
    partnerRating: 4.9,
    comment: '한옥 골목 산책 + 북촌 맛집 + 경복궁 야간 특별관람까지 완벽한 하루',
    spots: [
      { title: '북촌 한옥마을', latitude: 37.5826, longitude: 126.9831, category: '🏛️ 관광' },
      { title: '인사동 카페 골목', latitude: 37.5741, longitude: 126.9851, category: '☕ 카페' },
      { title: '경복궁 야간관람', latitude: 37.5796, longitude: 126.9770, category: '🌙 야간' },
    ],
  },
];

// ─── MoodFeedCardItem ─────────────────────────────────────────────────────────

function MoodFeedCardItem({
  card,
  onSave,
  saved,
  t,
}: {
  card: FeedCardData;
  onSave: (card: FeedCardData) => void;
  saved: boolean;
  t: ThemeTokens;
}) {
  const { emoji, label } = getTierInfo(card.tierScore);
  const btnScale = useSharedValue(1);

  const handleSave = () => {
    if (saved) return;
    // 150ms withSpring 감쇠비 튜닝 → 핑크 하트 전환
    btnScale.value = withSpring(0.86, { damping: 8, stiffness: 400 }, () => {
      btnScale.value = withSpring(1, { damping: 14, stiffness: 260 });
    });
    onSave(card);
  };

  const btnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const allTagChips = [...card.ootdTags, ...card.moodTags];

  return (
    <View
      style={[
        fcS.card,
        {
          backgroundColor: t.isLight
            ? 'rgba(255,255,255,0.96)'
            : 'rgba(22,28,45,0.97)',
          shadowColor: t.isLight ? '#D946EF' : '#7C3AED',
        },
      ]}
    >
      {/* ── Header: tier badge + region ────────────────────────────────── */}
      <View style={fcS.header}>
        <LinearGradient
          colors={['rgba(124,58,237,0.18)', 'rgba(217,70,239,0.12)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={fcS.tierBadge}
        >
          <Text style={fcS.tierEmoji}>{emoji}</Text>
          <Text style={fcS.tierLabel} numberOfLines={1}>
            익명의 [{emoji} {label}] 커플
          </Text>
        </LinearGradient>
        <View style={fcS.regionBadge}>
          <Text style={fcS.regionText}>📍 {card.region}</Text>
        </View>
      </View>

      {/* ── Body: mini map placeholder + polyline dots ─────────────────── */}
      <View
        style={[
          fcS.miniMap,
          {
            backgroundColor: t.isLight
              ? 'rgba(241,245,249,0.9)'
              : 'rgba(10,13,26,0.85)',
            borderColor: 'rgba(124,58,237,0.22)',
          },
        ]}
      >
        {/* Route polyline visual */}
        <View style={fcS.routeRow}>
          {card.spots.map((spot, idx) => (
            <React.Fragment key={spot.title}>
              <View style={fcS.spotPill}>
                <Text style={fcS.spotCategory}>{spot.category.split(' ')[0]}</Text>
                <Text style={fcS.spotTitle} numberOfLines={1}>{spot.title}</Text>
              </View>
              {idx < card.spots.length - 1 && (
                <View style={fcS.polylineSegment}>
                  {[0, 1, 2, 3].map((d) => (
                    <View key={d} style={fcS.polylineDot} />
                  ))}
                  <Text style={fcS.polylineArrow}>›</Text>
                </View>
              )}
            </React.Fragment>
          ))}
        </View>

        {/* Mood / OOTD tag chips */}
        <View style={fcS.tagChipRow}>
          {allTagChips.map((tag) => (
            <View key={tag} style={fcS.tagChip}>
              <Text style={fcS.tagChipText}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Footer: dual ratings + comment ─────────────────────────────── */}
      <View style={fcS.footer}>
        <View style={fcS.ratingRow}>
          <View style={fcS.ratingItem}>
            <Text style={fcS.ratingLabel}>나의 별점</Text>
            <View style={fcS.ratingValueRow}>
              <Text style={fcS.ratingStar}>⭐</Text>
              <Text style={fcS.ratingValue}>{card.myRating.toFixed(1)}</Text>
            </View>
          </View>
          <View style={fcS.ratingDivider} />
          <View style={fcS.ratingItem}>
            <Text style={fcS.ratingLabel}>연인의 별점</Text>
            <View style={fcS.ratingValueRow}>
              <Text style={fcS.ratingStar}>⭐</Text>
              <Text style={fcS.ratingValue}>{card.partnerRating.toFixed(1)}</Text>
            </View>
          </View>
        </View>
        <Text style={[fcS.comment, { color: t.textMuted }]} numberOfLines={2}>
          "{card.comment}"
        </Text>
      </View>

      {/* ── CTA: 코스 내 지도에 담기 ───────────────────────────────────── */}
      <Animated.View style={[fcS.ctaWrap, btnAnimStyle]}>
        <Pressable onPress={handleSave} disabled={saved}>
          <LinearGradient
            colors={
              saved
                ? ['rgba(255,107,139,0.25)', 'rgba(217,70,239,0.15)']
                : ['#7C3AED', '#D946EF', '#FF6B8B']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[fcS.ctaGrad, saved && fcS.ctaGradSaved]}
          >
            <Text style={[fcS.ctaText, saved && fcS.ctaTextSaved]}>
              {saved ? '💗 내 지도에 담겼어요!' : '🧭 이 코스 내 지도에 담기'}
            </Text>
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const fcS = StyleSheet.create({
  card: {
    borderRadius: 24,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.22)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 10,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.35)',
    flex: 1,
    minWidth: 0,
  },
  tierEmoji: { fontSize: 14 },
  tierLabel: {
    color: '#C084FC',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    flex: 1,
  },
  regionBadge: {
    backgroundColor: 'rgba(30,41,59,0.6)',
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.28)',
  },
  regionText: {
    color: '#38BDF8',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  // Mini map placeholder
  miniMap: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    overflow: 'hidden',
  },
  spotPill: {
    backgroundColor: 'rgba(124,58,237,0.14)',
    borderRadius: Radius.md,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.28)',
    maxWidth: 90,
  },
  spotCategory: { fontSize: 16, lineHeight: 18 },
  spotTitle: {
    color: '#F1F5F9',
    fontSize: 9,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
    marginTop: 2,
  },
  polylineSegment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    gap: 2,
    minWidth: 0,
  },
  polylineDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(217,70,239,0.6)',
  },
  polylineArrow: {
    color: '#D946EF',
    fontSize: 14,
    fontWeight: FontWeight.bold,
  },
  tagChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: 2,
  },
  tagChip: {
    backgroundColor: 'rgba(124,58,237,0.12)',
    borderRadius: Radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.28)',
  },
  tagChipText: {
    color: '#A78BFA',
    fontSize: 10,
    fontWeight: FontWeight.semibold,
  },
  // Footer
  footer: { gap: Spacing.sm },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  ratingItem: { flex: 1, alignItems: 'center', gap: 2 },
  ratingLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: FontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  ratingValueRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingStar: { fontSize: 15 },
  ratingValue: {
    color: '#FF6B8B',
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    letterSpacing: -0.3,
  },
  ratingDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(124,58,237,0.2)',
  },
  comment: {
    fontSize: FontSize.sm,
    fontStyle: 'italic',
    lineHeight: 19,
  },
  // CTA
  ctaWrap: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    shadowColor: '#D946EF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
  },
  ctaGrad: {
    paddingVertical: 13,
    alignItems: 'center',
  },
  ctaGradSaved: { shadowOpacity: 0 },
  ctaText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
  ctaTextSaved: { color: '#FF6B8B' },
});

// ─── MoodFeedView ─────────────────────────────────────────────────────────────

function MoodFeedView({ t }: { t: ThemeTokens }) {
  const { currentOOTD, currentMood, bulkAddDateCourses } = useAppContext();

  const [sortKey, setSortKey] = useState<FeedSortKey>('rating');
  const [filterActive, setFilterActive] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  // Aurora toggle pulse animation
  const toggleGlow = useSharedValue(0.6);
  useEffect(() => {
    if (filterActive) {
      toggleGlow.value = withRepeat(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      toggleGlow.value = withTiming(0.6, { duration: 200 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterActive]);

  const toggleGlowStyle = useAnimatedStyle(() => ({
    opacity: toggleGlow.value,
  }));

  const showTooltip = filterActive && !currentOOTD && !currentMood;

  // Sort + filter pipeline
  const visibleCards = useMemo(() => {
    let cards = [...VIRTUAL_FEED];

    // Sort
    if (sortKey === 'rating') {
      cards = cards.sort(
        (a, b) => (b.myRating + b.partnerRating) / 2 - (a.myRating + a.partnerRating) / 2,
      );
    } else if (sortKey === 'latest') {
      cards = cards.sort((a, b) => parseInt(b.id.replace('feed-', ''), 10) - parseInt(a.id.replace('feed-', ''), 10));
    }
    // 'nearby' — keep insertion order (실제 구현 시 geoLocation 기반 정렬)

    // Conditional OOTD/Mood filter
    if (filterActive && (currentOOTD || currentMood)) {
      cards = cards.filter((card) => {
        const ootdMatch = currentOOTD ? card.ootdTags.includes(currentOOTD) : false;
        const moodMatch = currentMood ? card.moodTags.includes(currentMood) : false;
        return ootdMatch || moodMatch;
      });
    }

    return cards;
  }, [sortKey, filterActive, currentOOTD, currentMood]);

  const handleSave = (card: FeedCardData) => {
    if (savedIds.has(card.id)) return;
    setSavedIds((prev) => new Set([...prev, card.id]));

    const today = new Date().toISOString().split('T')[0];
    const newCourses: DateCourse[] = card.spots.map((spot, i) => ({
      id: `feed-${card.id}-${i}-${Date.now()}`,
      title: spot.title,
      date: today,
      latitude: spot.latitude,
      longitude: spot.longitude,
      myRating: 0,
      myReview: `[ 무드 피드 복사 · ${card.region} 코스 ]`,
      partnerRating: 0,
      partnerReview: '',
    }));
    bulkAddDateCourses(newCourses);
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: Spacing.md, paddingBottom: STATS_BAR_H + TabBar.height + 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── OOTD & 무드 필터 토글 ────────────────────────────────────────── */}
      <View style={feedS.filterSection}>
        {/* Aurora 테두리 토글 버튼 */}
        <Pressable onPress={() => setFilterActive((v) => !v)} style={feedS.filterToggleWrap}>
          {/* Aurora glow ring */}
          <Animated.View
            style={[StyleSheet.absoluteFill, { borderRadius: 20 }, toggleGlowStyle]}
            pointerEvents="none"
          >
            <LinearGradient
              colors={filterActive
                ? ['#7C3AED', '#D946EF', '#FF6B8B', '#7C3AED']
                : ['rgba(124,58,237,0.25)', 'rgba(217,70,239,0.18)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ flex: 1, borderRadius: 20 }}
            />
          </Animated.View>
          <LinearGradient
            colors={filterActive
              ? ['rgba(124,58,237,0.22)', 'rgba(217,70,239,0.15)']
              : ['rgba(30,41,59,0.9)', 'rgba(22,20,40,0.95)']}
            style={feedS.filterToggleInner}
          >
            <Text style={feedS.filterToggleEmoji}>✨</Text>
            <Text style={[feedS.filterToggleText, filterActive && feedS.filterToggleTextOn]}>
              내 현재 OOTD & 무드 코스만 보기
            </Text>
            <View style={[feedS.filterTogglePill, filterActive && feedS.filterTogglePillOn]}>
              <Text style={feedS.filterTogglePillText}>{filterActive ? 'ON' : 'OFF'}</Text>
            </View>
          </LinearGradient>
        </Pressable>

        {/* OOTD/무드 미선택 시 툴팁 */}
        {showTooltip && (
          <View style={feedS.tooltip}>
            <Text style={feedS.tooltipText}>
              💡 AI 뮤즈에게 오늘의 무드를 먼저 알려주세요{'\n'}
              (🗺️ 지도 탭 → ✨ AI 뮤즈 버튼)
            </Text>
          </View>
        )}

        {/* 현재 선택된 OOTD/무드 표시 */}
        {filterActive && (currentOOTD || currentMood) && (
          <View style={feedS.activeFilterRow}>
            {currentOOTD && (
              <View style={feedS.activeFilterChip}>
                <Text style={feedS.activeFilterChipText}>👗 {currentOOTD}</Text>
              </View>
            )}
            {currentMood && (
              <View style={feedS.activeFilterChip}>
                <Text style={feedS.activeFilterChipText}>💫 {currentMood}</Text>
              </View>
            )}
            <Text style={feedS.activeFilterHint}>에 맞는 코스만 표시 중</Text>
          </View>
        )}
      </View>

      {/* ── 정렬 필터 칩 ──────────────────────────────────────────────────── */}
      <View style={feedS.sortRow}>
        {([
          { key: 'rating' as FeedSortKey, label: '⭐ 별점순' },
          { key: 'latest' as FeedSortKey, label: '🕐 최신순' },
          { key: 'nearby' as FeedSortKey, label: '📍 내 지역' },
        ] as const).map(({ key, label }) => (
          <Pressable
            key={key}
            style={[feedS.sortChip, sortKey === key && feedS.sortChipOn]}
            onPress={() => setSortKey(key)}
          >
            <Text style={[feedS.sortChipText, sortKey === key && feedS.sortChipTextOn]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── 피드 카드 리스트 ──────────────────────────────────────────────── */}
      {visibleCards.length === 0 ? (
        <View style={feedS.emptyWrap}>
          <LinearGradient
            colors={['rgba(124,58,237,0.12)', 'rgba(217,70,239,0.08)']}
            style={feedS.emptyCard}
          >
            <Text style={feedS.emptyEmoji}>🧭</Text>
            <Text style={[feedS.emptyTitle, { color: t.text }]}>
              조건에 맞는 코스가 없어요
            </Text>
            <Text style={[feedS.emptyDesc, { color: t.textMuted }]}>
              필터를 해제하거나 AI 뮤즈에서{'\n'}다른 OOTD / 무드를 선택해보세요
            </Text>
          </LinearGradient>
        </View>
      ) : (
        visibleCards.map((card) => (
          <MoodFeedCardItem
            key={card.id}
            card={card}
            saved={savedIds.has(card.id)}
            onSave={handleSave}
            t={t}
          />
        ))
      )}
    </ScrollView>
  );
}

const feedS = StyleSheet.create({
  filterSection: {
    paddingHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  filterToggleWrap: {
    borderRadius: 20,
    overflow: 'visible',
    borderWidth: 1.5,
    borderColor: 'rgba(124,58,237,0.45)',
    shadowColor: '#D946EF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  filterToggleInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 13,
    borderRadius: 19,
  },
  filterToggleEmoji: { fontSize: 18 },
  filterToggleText: {
    flex: 1,
    color: '#94A3B8',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  filterToggleTextOn: { color: '#F1F5F9' },
  filterTogglePill: {
    backgroundColor: 'rgba(30,41,59,0.8)',
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.3)',
  },
  filterTogglePillOn: {
    backgroundColor: 'rgba(124,58,237,0.3)',
    borderColor: '#D946EF',
  },
  filterTogglePillText: {
    color: '#D946EF',
    fontSize: 10,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 0.5,
  },
  tooltip: {
    backgroundColor: 'rgba(30,41,59,0.92)',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
  },
  tooltipText: {
    color: '#FCD34D',
    fontSize: FontSize.xs,
    lineHeight: 18,
    textAlign: 'center',
  },
  activeFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  activeFilterChip: {
    backgroundColor: 'rgba(124,58,237,0.22)',
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#D946EF',
  },
  activeFilterChipText: {
    color: '#F1F5F9',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  activeFilterHint: {
    color: '#64748B',
    fontSize: FontSize.xs,
  },
  // Sort chips
  sortRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.base,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sortChip: {
    backgroundColor: 'rgba(30,41,59,0.8)',
    borderRadius: Radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.2)',
  },
  sortChipOn: {
    backgroundColor: 'rgba(124,58,237,0.22)',
    borderColor: '#7C3AED',
  },
  sortChipText: {
    color: '#64748B',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  sortChipTextOn: { color: '#F1F5F9' },
  // Empty state
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: 40,
  },
  emptyCard: {
    width: '100%',
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.25)',
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, textAlign: 'center' },
  emptyDesc: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
});

// ─── HelixView ────────────────────────────────────────────────────────────────
// Step #33 + Step #50: DNA 나선 탭 래퍼.
// memorySentences(AI 선별) + useMemoryWall(로컬 발렌스) 병합.
// newMemoryCount → RelationshipHelix 파티클 Glow 트리거.

function HelixView() {
  const valenceMemories = useMemoryWall(5);
  const { memorySentences, highlightCards, themeTokens: t } = useAppContext();
  const [height, setHeight] = useState(SH * 0.68);

  // AI 선별 KakaoSyncRecord → MemoryNode 변환 (상위 5개)
  const aiMemories: MemoryNode[] = memorySentences
    .slice(0, 5)
    .map((r) => ({
      id: `sync-${r.id}`,
      date: r.date,
      rawDate: new Date(r.date),
      quote: r.coreQuote,
      tag: '💕 AI 선별',
      speaker: 'partner' as const,
      valenceScore: 10,
      imageUri: null,
    }));

  // 4감정 HighlightCard → MemoryNode 변환 (상위 4개, 감정별 1개)
  const emotionNodes: MemoryNode[] = (['caring', 'funny', 'touching', 'random'] as const)
    .map((emotion) => {
      const card = highlightCards.find((c) => c.emotion === emotion);
      if (!card) return null;
      const meta = EMOTION_META[emotion];
      return {
        id: `emo-${card.id}`,
        date: card.date,
        rawDate: new Date(card.date),
        quote: card.text,
        tag: `${meta.emoji} ${meta.label}`,
        speaker: 'partner' as const,
        valenceScore: 9,
        imageUri: null,
      } as MemoryNode;
    })
    .filter((n): n is MemoryNode => n !== null);

  // 병합 (중복 id 제거) — 감정노드 → AI 선별 → 발렌스 순
  const existingIds = new Set([...emotionNodes, ...aiMemories].map((m) => m.id));
  const mergedMemories = [
    ...emotionNodes,
    ...aiMemories.filter((m) => !existingIds.has(m.id)),
    ...valenceMemories.filter((m) => !existingIds.has(m.id)).slice(0, 4),
  ].slice(0, 10);

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
    >
      <RelationshipHelix
        memories={mergedMemories}
        height={height}
        newMemoryCount={memorySentences.length}
      />

      {/* 헬릭스 탭 빈 상태 안내 */}
      {mergedMemories.length === 0 && (
        <View style={helixEmptyS.overlay} pointerEvents="none">
          <View style={helixEmptyS.hint}>
            <Text style={helixEmptyS.emoji}>🧬</Text>
            <Text style={helixEmptyS.title}>카카오톡을 학습시켜보세요</Text>
            <Text style={[helixEmptyS.sub, { color: t.textMuted }]}>
              채팅 탭 '+' 버튼 또는 설정 탭{'\n'}'추억 동기화' 에서 파일을 업로드하세요
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const helixEmptyS = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 60,
  },
  hint: {
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(10,13,26,0.78)',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 28,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.3)',
  },
  emoji: { fontSize: 32 },
  title: {
    color: '#F1F5F9',
    fontSize: 15,
    fontWeight: '700' as const,
    textAlign: 'center',
  },
  sub: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

const TABS_KEYS: TabKey[] = ['archive', 'map', 'feed'];

function HistoryScreenContent() {
  const [activeTab, setActiveTab] = useState<TabKey>('archive');
  const { themeTokens } = useAppContext();
  const t = themeTokens;
  const { shouldShow, markDone } = useTutorialGuard('history');

  const refSegment = useRef<View>(null);
  const refHeader = useRef<View>(null);
  const refContent = useRef<View>(null);

  // ── Swipe gesture shared state ─────────────────────────────────────────────
  const currentIndexSv = useSharedValue(0);
  const swipeProgress = useSharedValue(0);   // drives underline indicator (0–2)
  const contentTranslateX = useSharedValue(0); // drives horizontal slide

  const contentSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: contentTranslateX.value }],
  }));

  // JS-thread callback invoked from worklet via runOnJS
  const applyTabByIndex = useCallback((idx: number) => {
    setActiveTab(TABS_KEYS[idx]);
  }, []);

  // Keep SharedValues in sync when tab changes via button press
  useEffect(() => {
    const idx = TABS_KEYS.indexOf(activeTab);
    currentIndexSv.value = idx;
    swipeProgress.value = withSpring(idx, { damping: 20, stiffness: 300 });
    contentTranslateX.value = withSpring(-idx * SCREEN_W, { damping: 20, stiffness: 300 });
  }, [activeTab, currentIndexSv, swipeProgress, contentTranslateX]);

  // ── Pan gesture: horizontal swipe switches tabs ────────────────────────────
  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-20, 20])
    .onUpdate((e) => {
      'worklet';
      const baseX = -currentIndexSv.value * SCREEN_W;
      const clamped = Math.max(
        -(TABS_KEYS.length - 1) * SCREEN_W,
        Math.min(0, baseX + e.translationX),
      );
      contentTranslateX.value = clamped;
      // Drive underline in real-time
      const progress = -clamped / SCREEN_W;
      swipeProgress.value = Math.max(0, Math.min(TABS_KEYS.length - 1, progress));
    })
    .onEnd((e) => {
      'worklet';
      const idx = currentIndexSv.value;
      const shouldSwitch = Math.abs(e.translationX) > 60 || Math.abs(e.velocityX) > 500;
      let nextIdx = idx;
      if (shouldSwitch) {
        if (e.translationX < 0) nextIdx = Math.min(TABS_KEYS.length - 1, idx + 1);
        else nextIdx = Math.max(0, idx - 1);
      }
      currentIndexSv.value = nextIdx;
      swipeProgress.value = withSpring(nextIdx, { damping: 20, stiffness: 300 });
      contentTranslateX.value = withSpring(-nextIdx * SCREEN_W, { damping: 20, stiffness: 300 });
      if (nextIdx !== idx) runOnJS(applyTabByIndex)(nextIdx);
    });

  const tutorialSteps: TutorialStep[] = [
    {
      targetRef: refHeader,
      title: '📸 추억 아카이브',
      description: '카카오톡에서 선별된 감동 순간들이 폴라로이드 카드로 펼쳐져요.',
      arrowDir: 'below',
      pad: 12,
    },
    {
      targetRef: refSegment,
      title: '🗂️ 탭 전환',
      description: '추억 월 · 데이트 지도 · 무드 피드 세 가지 뷰로 커플의 추억을 탐색해요.',
      arrowDir: 'below',
      pad: 8,
    },
    {
      targetRef: refContent,
      title: '🧭 무드 피드',
      description: '"무드 피드" 탭에서 AI 뮤즈 무드 필터로 찐 커플 추천 코스를 탐색하세요!',
      arrowDir: 'above',
      pad: 16,
    },
  ];

  return (
    <SafeAreaView edges={['top']} style={[screenS.root, { backgroundColor: t.bg }]}>
      <View ref={refHeader} collapsable={false}>
        <ScreenHeader t={t} />
      </View>
      <View ref={refSegment} collapsable={false}>
        <SegmentedControl
          active={activeTab}
          onChange={setActiveTab}
          t={t}
          swipeProgress={swipeProgress}
        />
      </View>

      {/* GestureDetector wraps only the scrollable content area */}
      <GestureDetector gesture={panGesture}>
        <View ref={refContent} collapsable={false} style={{ flex: 1, overflow: 'hidden' }}>
          <Animated.View style={[{ flexDirection: 'row', flex: 1 }, contentSlideStyle]}>
            <View style={{ width: SCREEN_W, flex: 1 }}>
              <ArchiveView t={t} />
            </View>
            <View style={{ width: SCREEN_W, flex: 1 }}>
              <DateMapView t={t} />
            </View>
            <View style={{ width: SCREEN_W, flex: 1 }}>
              <MoodFeedView t={t} />
            </View>
          </Animated.View>
        </View>
      </GestureDetector>

      {/* ── 신규 유저 스포트라이트 튜토리얼 ── */}
      <TabTutorialOverlay
        steps={tutorialSteps}
        visible={shouldShow}
        onDone={markDone}
      />
    </SafeAreaView>
  );
}

// HistoryProvider wraps only this screen so its state doesn't pollute the
// global AppContext and is automatically reset when the tab unmounts.
export default function HistoryScreen() {
  return (
    <HistoryProvider>
      <HistoryScreenContent />
    </HistoryProvider>
  );
}

const screenS = StyleSheet.create({
  root: { flex: 1 },
});
