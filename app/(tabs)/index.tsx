import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppContext } from '../../src/context/AppContext';
import {
  Colors,
  FontSize,
  FontWeight,
  Gradients,
  Radius,
  Shadows,
  Spacing,
  TabBar,
  ThemeTokens,
} from '../../src/styles/theme';

// ─── Mock Data ────────────────────────────────────────────────────────────────

const STATUS_TAGS = [
  '#오늘부장님잔소리폭발',
  '#퇴근후치맥땡김',
  '#내일데이트설렘',
  '#요즘계속야근중',
  '#주말캠핑하고싶다',
  '#배고프다는말5번',
];

const MEMORY_RINGS = [
  { id: '1', label: '첫 데이트', emoji: '🌸' },
  { id: '2', label: '100일', emoji: '💝' },
  { id: '3', label: '부산여행', emoji: '✈️' },
  { id: '4', label: '내 생일', emoji: '🎂' },
  { id: '5', label: '겨울밤', emoji: '⛄' },
];

const ACCURACY = 50;

// ─── Accuracy Banner ──────────────────────────────────────────────────────────

function AccuracyBanner({
  myName,
  onDismiss,
  t,
}: {
  myName: string;
  onDismiss: () => void;
  t: ThemeTokens;
}) {
  const router = useRouter();
  const breathProgress = useSharedValue(0);
  const dismissOpacity = useSharedValue(1);
  const dismissTranslateY = useSharedValue(0);
  const dismissScale = useSharedValue(1);

  useEffect(() => {
    breathProgress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []);

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      breathProgress.value,
      [0, 1],
      ['rgba(124,58,237,0.2)', 'rgba(124,58,237,0.95)'],
    ),
    shadowOpacity: breathProgress.value * 0.55,
  }));

  const dissolveStyle = useAnimatedStyle(() => ({
    opacity: dismissOpacity.value,
    transform: [
      { translateY: dismissTranslateY.value },
      { scale: dismissScale.value },
    ],
  }));

  const handleInterviewPress = () => {
    dismissOpacity.value = withTiming(0, { duration: 480, easing: Easing.in(Easing.quad) });
    dismissTranslateY.value = withTiming(-24, { duration: 460, easing: Easing.out(Easing.quad) });
    dismissScale.value = withTiming(0.88, { duration: 460, easing: Easing.in(Easing.quad) });
    setTimeout(onDismiss, 500);
  };

  return (
    <Animated.View style={[
      styles.bannerWrapper,
      borderStyle,
      dissolveStyle,
      { backgroundColor: t.card },
    ]}>
      <View style={styles.bannerRow}>
        <View style={styles.bannerLeft}>
          <Text style={styles.bannerWarning}>⚠️</Text>
          <View>
            <Text style={[styles.bannerTitle, { color: t.textSecondary }]}>현재 {myName} AI의 재현 정확도</Text>
            <Text style={[styles.bannerAccuracy, { color: t.text }]}>{ACCURACY}%</Text>
          </View>
        </View>
        <Pressable
          style={styles.interviewButton}
          onPress={handleInterviewPress}
          android_ripple={{ color: 'rgba(255,255,255,0.1)', borderless: false }}
        >
          <LinearGradient
            colors={t.gradientColors}
            start={Gradients.TWIN_PRIMARY.start}
            end={Gradients.TWIN_PRIMARY.end}
            style={styles.interviewGradient}
          >
            <Text style={styles.interviewText}>🎙️ 95%로 올리기 →</Text>
          </LinearGradient>
        </Pressable>
      </View>

      <View style={[styles.gaugeTrack, { backgroundColor: t.divider }]}>
        <LinearGradient
          colors={t.gradientColors}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.gaugeFill, { width: `${ACCURACY}%` }]}
        />
      </View>
      <Text style={[styles.gaugeHint, { color: t.textMuted }]}>인터뷰 완료 시 자동 소멸</Text>
    </Animated.View>
  );
}

// ─── Status Chips ─────────────────────────────────────────────────────────────

function StatusSection({ partnerName, t }: { partnerName: string; t: ThemeTokens }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionLabel, { color: t.text }]}>{partnerName}님의 오늘 상태</Text>
        <View style={styles.aiLiveBadge}>
          <View style={styles.aiDot} />
          <Text style={styles.aiLiveText}>AI 분석 중</Text>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
        decelerationRate="fast"
      >
        {STATUS_TAGS.map((tag) => (
          <Pressable key={tag} style={[styles.chip, { backgroundColor: t.chipBg, borderColor: t.chipBorder }]}>
            <Text style={[styles.chipText, { color: t.text }]}>{tag}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Memory Ring Item ─────────────────────────────────────────────────────────

function MemoryRing({ item, t }: { item: (typeof MEMORY_RINGS)[0]; t: ThemeTokens }) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      style={styles.ringWrapper}
      onPressIn={() => { scale.value = withTiming(0.93, { duration: 80 }); }}
      onPressOut={() => { scale.value = withTiming(1, { duration: 120 }); }}
    >
      <Animated.View style={animStyle}>
        <LinearGradient
          colors={t.gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.ringGradientBorder}
        >
          <View style={[styles.ringInner, { backgroundColor: t.avatarInner }]}>
            <Text style={styles.ringEmoji}>{item.emoji}</Text>
          </View>
        </LinearGradient>
      </Animated.View>
      <Text style={[styles.ringLabel, { color: t.textSecondary }]} numberOfLines={1}>{item.label}</Text>
    </Pressable>
  );
}

function MemoryRingsSection({ t }: { t: ThemeTokens }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: t.text }]}>추억 아카이브</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.ringsRow}
        decelerationRate="fast"
      >
        {MEMORY_RINGS.map((item) => (
          <MemoryRing key={item.id} item={item} t={t} />
        ))}
        {/* Add ring */}
        <Pressable style={styles.ringWrapper}>
          <View style={[styles.ringGradientBorder, styles.addRingBorder, { borderColor: t.divider }]}>
            <View style={[styles.ringInner, { backgroundColor: t.card }]}>
              <Text style={[styles.addRingPlus, { color: t.textMuted }]}>+</Text>
            </View>
          </View>
          <Text style={[styles.ringLabel, { color: t.textSecondary }]}>추억 추가</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

// ─── Greeting ─────────────────────────────────────────────────────────────────

function GreetingSection({ partnerName, t }: { partnerName: string; t: ThemeTokens }) {
  return (
    <View style={styles.greetingSection}>
      <View style={styles.avatarRow}>
        <LinearGradient
          colors={t.gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatarRing}
        >
          <View style={[styles.avatarInner, { backgroundColor: t.avatarInner }]}>
            <Text style={styles.avatarEmoji}>🙋‍♂️</Text>
          </View>
        </LinearGradient>

        <View style={[styles.heartBadge, { backgroundColor: t.bg }]}>
          <Text style={styles.heartText}>💜</Text>
        </View>

        <LinearGradient
          colors={[...t.gradientColors].reverse() as [string, string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatarRing}
        >
          <View style={[styles.avatarInner, { backgroundColor: t.avatarInner }]}>
            <Text style={styles.avatarEmoji}>🙋‍♀️</Text>
          </View>
        </LinearGradient>
      </View>

      <Text style={[styles.greetingText, { color: t.textSecondary }]}>{partnerName}님과 함께한 지</Text>
      <Text style={[styles.dDayText, { color: t.text }]}>365일째 🎉</Text>
      <Text style={[styles.greetingSubText, { color: t.gradientColors[0] }]}>예쁘게 연애 중!</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { accuracyBannerVisible, dismissAccuracyBanner, myProfile, partnerProfile, themeTokens } = useAppContext();
  const t = themeTokens;
  const partnerName = partnerProfile.name;
  const myName = myProfile.name;

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: t.bg }]}>
      {accuracyBannerVisible && (
        <AccuracyBanner myName={myName} onDismiss={dismissAccuracyBanner} t={t} />
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <GreetingSection partnerName={partnerName} t={t} />
        <StatusSection partnerName={partnerName} t={t} />
        <MemoryRingsSection t={t} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const RING_SIZE = 72;
const RING_INNER_SIZE = 63;
const RING_BORDER = (RING_SIZE - RING_INNER_SIZE) / 2;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // ── Banner ──
  bannerWrapper: {
    marginHorizontal: Spacing.base,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.GRADIENT_START,
    padding: Spacing.md,
    gap: Spacing.sm,
    shadowColor: Colors.GRADIENT_START,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 14,
    elevation: 8,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  bannerWarning: {
    fontSize: 18,
  },
  bannerTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  bannerAccuracy: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.extrabold,
    lineHeight: 24,
  },
  interviewButton: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  interviewGradient: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  interviewText: {
    color: '#FFFFFF',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.2,
  },
  gaugeTrack: {
    width: '100%',
    height: 6,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
  gaugeHint: {
    fontSize: FontSize.xs,
    textAlign: 'right',
    marginTop: -2,
  },

  // ── Scroll ──
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: TabBar.height + 32,
    gap: Spacing.xl,
  },

  // ── Greeting ──
  greetingSection: {
    alignItems: 'center',
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.base,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    gap: 0,
  },
  avatarRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: 61,
    height: 61,
    borderRadius: 30.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 30,
  },
  heartBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    marginHorizontal: -8,
  },
  heartText: {
    fontSize: 16,
  },
  greetingText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  dDayText: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.extrabold,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  greetingSubText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    marginTop: 2,
  },

  // ── Section ──
  section: {
    paddingHorizontal: Spacing.base,
    gap: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
  },
  aiLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(56,189,248,0.1)',
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.25)',
  },
  aiDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.BADGE_AI_BLUE,
  },
  aiLiveText: {
    color: Colors.BADGE_AI_BLUE,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },

  // ── Status Chips ──
  chipsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingRight: Spacing.base,
  },
  chip: {
    borderRadius: Radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
  },
  chipText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },

  // ── Memory Rings ──
  ringsRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
    paddingRight: Spacing.base,
    paddingBottom: Spacing.xs,
  },
  ringWrapper: {
    alignItems: 'center',
    gap: 8,
    width: RING_SIZE,
  },
  ringGradientBorder: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.glow,
    shadowOpacity: 0.25,
  },
  ringInner: {
    width: RING_INNER_SIZE,
    height: RING_INNER_SIZE,
    borderRadius: RING_INNER_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringEmoji: {
    fontSize: 28,
  },
  ringLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
    width: RING_SIZE,
  },
  addRingBorder: {
    borderWidth: RING_BORDER,
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  addRingPlus: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.regular,
  },
});
