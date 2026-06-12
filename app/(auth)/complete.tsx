import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TwinGradient } from '../../src/components/ui/TwinGradient';
import { useAppContext } from '../../src/context/AppContext';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../src/styles/theme';

// ─── Fallback data — replaced by real parsed tokens when available ────────────

const FALLBACK_DRIPS = ['추출1', '추출2', '추출3'];
const FALLBACK_TAGS = ['#공감형', '#새벽감성', '#이모지대장'];
const MEDALS = ['🥇', '🥈', '🥉'];

// ─── Speech Bubble ────────────────────────────────────────────────────────────

function SpeechBubble({
  medal,
  text,
  delay,
}: {
  medal: string;
  text: string;
  delay: number;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(400)} style={bub.row}>
      <Text style={bub.medal}>{medal}</Text>
      <View style={bub.bubble}>
        <Text style={bub.text}>{text}</Text>
      </View>
    </Animated.View>
  );
}

const bub = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  medal: { fontSize: 22, width: 30, textAlign: 'center' },
  bubble: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 14,
    borderBottomLeftRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  text: {
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
  },
});

// ─── Tag Chip ─────────────────────────────────────────────────────────────────

function TagChip({ label, delay }: { label: string; delay: number }) {
  return (
    <Animated.View entering={FadeIn.delay(delay).duration(400)} style={tag.chip}>
      <Text style={tag.text}>{label}</Text>
    </Animated.View>
  );
}

const tag = StyleSheet.create({
  chip: {
    backgroundColor: 'rgba(124,58,237,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.35)',
    borderRadius: Radius.chip,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  text: {
    color: '#C4B5FD',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.3,
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CompleteScreen() {
  const router = useRouter();
  const { trainingResult } = useAppContext();

  // Dynamic data from parsing pipeline; fall back to placeholder when LLM not wired
  const drips: string[] =
    trainingResult?.drips && trainingResult.drips.length >= 3
      ? trainingResult.drips.slice(0, 3)
      : FALLBACK_DRIPS;

  const tags: string[] =
    trainingResult?.tags && trainingResult.tags.length >= 3
      ? trainingResult.tags.slice(0, 3)
      : FALLBACK_TAGS;

  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));

  useEffect(() => {
    const run = async () => {
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    };
    run();
  }, []);

  const handleDashboard = async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={s.container}>
      {/* ── LEARNING COMPLETE Badge ── */}
      <Animated.View entering={FadeInDown.duration(500)} style={s.badgeWrapper}>
        <View style={s.badge}>
          <Text style={s.badgeText}>✦ LEARNING COMPLETE ✦</Text>
        </View>
      </Animated.View>

      {/* ── Title ── */}
      <Animated.View entering={FadeInDown.delay(150).duration(500)} style={s.titleBlock}>
        <Text style={s.title}>준비가 끝났어요!</Text>
        <Text style={s.subtitle}>당신만의 시그니처를 찾았습니다 ✨</Text>
        {trainingResult && (
          <Text style={s.statsLine}>
            {trainingResult.myLineCount}개 대사 분석 완료
            {trainingResult.maskedCount > 0
              ? ` · 개인정보 ${trainingResult.maskedCount}건 마스킹`
              : ''}
          </Text>
        )}
      </Animated.View>

      {/* ── Glass Card ── */}
      <Animated.View entering={FadeInDown.delay(280).duration(600)} style={s.card}>
        {/* Card Header */}
        <View style={s.cardHeader}>
          <Text style={s.cardHeaderIcon}>✨</Text>
          <Text style={s.cardHeaderText}>Signature Drip</Text>
          <View style={s.cardHeaderBadge}>
            <Text style={s.cardHeaderBadgeText}>TOP 3</Text>
          </View>
        </View>

        <View style={s.cardDivider} />

        {/* Drip Bubbles — dynamically bound from trainingResult */}
        <View style={s.dripsBlock}>
          {drips.map((drip, i) => (
            <SpeechBubble
              key={`${drip}-${i}`}
              medal={MEDALS[i]}
              text={drip}
              delay={380 + i * 120}
            />
          ))}
        </View>

        <View style={s.cardDivider} />

        {/* Tag Chips — dynamically bound from trainingResult */}
        <View style={s.tagRow}>
          {tags.map((t, i) => (
            <TagChip key={`${t}-${i}`} label={t} delay={750 + i * 80} />
          ))}
        </View>
      </Animated.View>

      {/* ── CTA ── */}
      <Animated.View entering={FadeInUp.delay(900).duration(500)}>
        <Pressable
          onPress={handleDashboard}
          onPressIn={() => { btnScale.value = withTiming(0.97, { duration: 60 }); }}
          onPressOut={() => { btnScale.value = withSpring(1, { damping: 12 }); }}
        >
          <Animated.View style={btnStyle}>
            <TwinGradient
              colors={['#7C3AED', '#D946EF']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={s.ctaButton}
            >
              <Text style={s.ctaText}>대시보드 시작하기 ➔</Text>
            </TwinGradient>
          </Animated.View>
        </Pressable>
      </Animated.View>

      {/* ── Step Dots ── */}
      <View style={s.stepRow}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={[s.stepDot, i < 4 ? s.stepDotDone : s.stepDotActive]} />
        ))}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.BG_DARK_MIDNIGHT,
    justifyContent: 'center',
    paddingHorizontal: Spacing['2xl'],
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
  },

  badgeWrapper: { alignItems: 'center' },
  badge: {
    backgroundColor: 'rgba(167,139,250,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.4)',
    borderRadius: Radius.chip,
    paddingVertical: 7,
    paddingHorizontal: 18,
  },
  badgeText: {
    color: '#A78BFA',
    fontSize: 11,
    fontWeight: FontWeight.bold,
    letterSpacing: 2.5,
  },

  titleBlock: { alignItems: 'center', gap: 4 },
  title: {
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.extrabold,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: Colors.TEXT_ON_DARK_SECONDARY,
    fontSize: FontSize.base,
    textAlign: 'center',
  },
  statsLine: {
    color: Colors.TEXT_MUTED,
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: 2,
  },

  card: {
    backgroundColor: 'rgba(30,41,59,0.75)',
    borderRadius: Radius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: Spacing.xl,
    gap: Spacing.base,
    shadowColor: Colors.GRADIENT_START,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardHeaderIcon: { fontSize: 16 },
  cardHeaderText: {
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize.base,
    fontWeight: FontWeight.extrabold,
    flex: 1,
  },
  cardHeaderBadge: {
    backgroundColor: 'rgba(255,107,139,0.2)',
    borderRadius: Radius.chip,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,107,139,0.4)',
  },
  cardHeaderBadgeText: {
    color: Colors.GRADIENT_END,
    fontSize: 10,
    fontWeight: FontWeight.bold,
    letterSpacing: 1,
  },
  cardDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
  dripsBlock: { gap: Spacing.md },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  ctaButton: {
    height: 60,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    flex: undefined,
    shadowColor: Colors.GRADIENT_START,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 10,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: FontSize.base,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 0.5,
  },

  stepRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  stepDot: { height: 6, borderRadius: 3 },
  stepDotActive: { width: 22, backgroundColor: Colors.GRADIENT_END },
  stepDotDone: { width: 6, backgroundColor: Colors.GRADIENT_MID },
});
