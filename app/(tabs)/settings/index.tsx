import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Linking,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrivacyLevel, useAppContext } from '../../../src/context/AppContext';
import {
  Colors,
  FontSize,
  FontWeight,
  Radius,
  Shadows,
  Spacing,
  TabBar,
  ThemeMode,
  ThemeTokens,
} from '../../../src/styles/theme';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Theme Toggle Section ─────────────────────────────────────────────────────

function ThemeToggleSection({
  t,
  themeMode,
  onChangeTheme,
}: {
  t: ThemeTokens;
  themeMode: ThemeMode;
  onChangeTheme: (mode: ThemeMode) => void;
}) {
  const handlePress = (mode: ThemeMode) => {
    if (mode === themeMode) return;
    onChangeTheme(mode);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={[tS.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
      <View style={tS.cardHeader}>
        <Text style={[tS.cardTitle, { color: t.text }]}>화면 테마 설정</Text>
        <View style={[tS.modeBadge, { backgroundColor: t.chipBg, borderColor: t.chipBorder }]}>
          <Text style={[tS.modeBadgeText, { color: t.textSecondary }]}>
            {themeMode === 'light' ? '☀️ 라이트' : '🌙 다크'}
          </Text>
        </View>
      </View>
      <Text style={[tS.cardSub, { color: t.textSecondary }]}>
        앱 전체의 배경·카드·텍스트 색상이 실시간으로 바뀌어요.
      </Text>

      <View style={[tS.segmentRow, { backgroundColor: t.segmentTrack }]}>
        {(['light', 'dark'] as const).map((mode) => {
          const isActive = themeMode === mode;
          return (
            <Pressable key={mode} style={tS.segmentBtn} onPress={() => handlePress(mode)}>
              {isActive ? (
                <LinearGradient
                  colors={mode === 'light' ? ['#FFB7CE', '#E1BEE7', '#B39DDB'] : ['#7C3AED', '#D946EF', '#FF6B8B']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={tS.segmentActive}
                >
                  <Text style={tS.segmentTextActive}>
                    {mode === 'light' ? '☀️ 라이트 모드' : '🌙 다크 모드'}
                  </Text>
                </LinearGradient>
              ) : (
                <View style={tS.segmentInactive}>
                  <Text style={[tS.segmentText, { color: t.textMuted }]}>
                    {mode === 'light' ? '☀️ 라이트 모드' : '🌙 다크 모드'}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const tS = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
    borderWidth: 1,
    ...Shadows.subtle,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  cardSub: {
    fontSize: FontSize.sm,
    lineHeight: 18,
  },
  modeBadge: {
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  modeBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  segmentRow: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    padding: 4,
    gap: 4,
  },
  segmentBtn: { flex: 1, borderRadius: Radius.pill, overflow: 'hidden' },
  segmentActive: {
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: Radius.pill,
  },
  segmentInactive: {
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: Radius.pill,
  },
  segmentTextActive: {
    color: '#FFF',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  segmentText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
});

// ─── Privacy Slider (FUN-SET-001) ────────────────────────────────────────────

const PRIVACY_STAGES = [
  {
    key: 'full_clone',
    snapLabel: '💖 완전복제',
    emoji: '💖',
    desc: '당신의 대화 습관과 관심사를 모두 학습하여\n거울처럼 완벽하게 동기화합니다.',
    color: '#FF6B8B',
    level: 3 as PrivacyLevel,
    badge: 'Lv 3',
  },
  {
    key: 'optimized',
    snapLabel: '🎭 최적화',
    emoji: '🎭',
    desc: '말투는 더 이상 학습하지 않지만, 대화의 맥락을\n분석해 완벽한 데이트 코스를 제안합니다.',
    color: '#D946EF',
    level: 2 as PrivacyLevel,
    badge: 'Lv 2',
  },
  {
    key: 'protected',
    snapLabel: '🤫 보호',
    emoji: '🤫',
    desc: '실시간 데이터 수집을 전면 차단합니다.\nAI는 오직 온보딩 때 입력된 기본 데이터만 기억합니다.',
    color: '#7C3AED',
    level: 1 as PrivacyLevel,
    badge: 'Lv 1',
  },
] as const;

type PrivacyStage = 0 | 1 | 2;

function PrivacySlider({ t }: { t: ThemeTokens }) {
  const { privacyLevel, setPrivacyLevel } = useAppContext();

  const initialStage = (3 - privacyLevel) as PrivacyStage;

  const TRACK_W = SCREEN_W - Spacing.base * 2 - Spacing.md * 2;
  const KNOB_SIZE = 34;
  const KNOB_TRAVEL = TRACK_W - KNOB_SIZE;
  const stagePositions: [number, number, number] = [0, KNOB_TRAVEL / 2, KNOB_TRAVEL];

  const [stage, setStage] = useState<PrivacyStage>(initialStage);
  const prevStage = useRef<PrivacyStage>(initialStage);

  const knobX      = useSharedValue(stagePositions[initialStage]);
  const glowColor  = useSharedValue(initialStage / 2);

  const desc0 = useSharedValue(initialStage === 0 ? 1 : 0);
  const desc1 = useSharedValue(initialStage === 1 ? 1 : 0);
  const desc2 = useSharedValue(initialStage === 2 ? 1 : 0);
  const descSVs = useRef([desc0, desc1, desc2]);

  const changeStage = (newStage: PrivacyStage) => {
    if (newStage === prevStage.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    descSVs.current[prevStage.current].value = withTiming(0, { duration: 140 });
    descSVs.current[newStage].value          = withDelay(100, withTiming(1, { duration: 210 }));
    glowColor.value = withTiming(newStage / 2, { duration: 300 });
    prevStage.current = newStage;
    setStage(newStage);
    setPrivacyLevel((3 - newStage) as PrivacyLevel);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => { Haptics.selectionAsync(); },
      onPanResponderMove: (_, gs) => {
        const raw     = stagePositions[prevStage.current] + gs.dx;
        const clamped = Math.max(0, Math.min(KNOB_TRAVEL, raw));
        knobX.value   = clamped;

        const pct = clamped / KNOB_TRAVEL;
        let ns: PrivacyStage = 1;
        if (pct < 0.33)      ns = 0;
        else if (pct > 0.67) ns = 2;
        runOnJS(changeStage)(ns);
      },
      onPanResponderRelease: () => {
        knobX.value = withSpring(stagePositions[prevStage.current], {
          stiffness: 320,
          damping: 28,
        });
      },
    }),
  ).current;

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: knobX.value }],
  }));

  const trackFillStyle = useAnimatedStyle(() => ({
    width: knobX.value + KNOB_SIZE / 2,
  }));

  const descStyle0 = useAnimatedStyle(() => ({ opacity: descSVs.current[0].value, position: 'absolute' as const }));
  const descStyle1 = useAnimatedStyle(() => ({ opacity: descSVs.current[1].value, position: 'absolute' as const }));
  const descStyle2 = useAnimatedStyle(() => ({ opacity: descSVs.current[2].value, position: 'absolute' as const }));
  const descStyles = [descStyle0, descStyle1, descStyle2];

  const currentStage = PRIVACY_STAGES[stage];

  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder, borderWidth: 1 }]}>
      <View style={styles.cardHeader}>
        <View style={{ gap: 3 }}>
          <Text style={[styles.cardTitle, { color: t.text }]}>프라이버시 컨트롤 센터</Text>
          <Text style={[styles.cardSub, { color: t.textSecondary }]}>
            AI 학습 데이터 수집 범위를 직접 제어하세요.
          </Text>
        </View>
        <View style={[styles.stageBadge, { backgroundColor: currentStage.color + '22' }]}>
          <Text style={[styles.stageBadgeText, { color: currentStage.color }]}>
            {currentStage.badge}
          </Text>
        </View>
      </View>

      <View style={[styles.snapLabelsRow, { marginBottom: 6 }]}>
        {PRIVACY_STAGES.map((s, i) => (
          <Pressable
            key={s.key}
            style={styles.snapLabelWrap}
            onPress={() => {
              const ns = i as PrivacyStage;
              knobX.value = withSpring(stagePositions[ns], { stiffness: 320, damping: 28 });
              changeStage(ns);
            }}
          >
            <Text
              style={[
                styles.snapLabelText,
                { color: stage === i ? s.color : t.textMuted },
                stage === i && { fontWeight: FontWeight.bold },
              ]}
            >
              {s.snapLabel}
            </Text>
            {stage === i && (
              <View style={[styles.snapDot, { backgroundColor: s.color }]} />
            )}
          </Pressable>
        ))}
      </View>

      <View style={styles.sliderContainer}>
        <View
          style={[
            styles.sliderTrack,
            {
              backgroundColor: t.isLight
                ? 'rgba(180,140,160,0.15)'
                : 'rgba(255,255,255,0.08)',
            },
          ]}
        >
          <Animated.View style={[styles.sliderFill, trackFillStyle]}>
            <LinearGradient
              colors={['#FF6B8B', '#D946EF', '#7C3AED']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>

          {stagePositions.map((pos, i) => (
            <View
              key={i}
              style={[
                styles.snapTick,
                {
                  left: pos + KNOB_SIZE / 2 - 1,
                  backgroundColor: stage === i
                    ? PRIVACY_STAGES[i].color
                    : t.isLight ? 'rgba(120,80,100,0.25)' : 'rgba(255,255,255,0.18)',
                },
              ]}
            />
          ))}

          <Animated.View
            style={[styles.sliderKnob, knobStyle]}
            {...panResponder.panHandlers}
          >
            <LinearGradient
              colors={['#FF6B8B', '#D946EF', '#7C3AED']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.knobGradient}
            >
              <Text style={styles.knobEmoji}>{currentStage.emoji}</Text>
            </LinearGradient>
          </Animated.View>
        </View>
      </View>

      <View style={styles.descBox}>
        {PRIVACY_STAGES.map((s, i) => (
          <Animated.Text
            key={s.key}
            style={[styles.descText, { color: t.textSecondary }, descStyles[i]]}
          >
            {s.desc}
          </Animated.Text>
        ))}
        <Text style={[styles.descText, { opacity: 0 }]}>{PRIVACY_STAGES[0].desc}</Text>
      </View>

      <View
        style={[
          styles.pipelineStrip,
          {
            backgroundColor: t.isLight
              ? currentStage.color + '14'
              : currentStage.color + '1A',
            borderColor: currentStage.color + '40',
          },
        ]}
      >
        <Text style={{ fontSize: 13 }}>
          {stage === 0 ? '🟢' : stage === 1 ? '🟡' : '🔴'}
        </Text>
        <Text style={[styles.pipelineText, { color: currentStage.color }]}>
          {stage === 0
            ? '말투 학습 활성 · PII 마스킹 적용 중'
            : stage === 1
            ? '말투 학습 일시 중단 · 데이트 뮤즈 컨텍스트 수집 유지'
            : '모든 실시간 수집 차단 · 온보딩 데이터만 사용'}
        </Text>
      </View>
    </View>
  );
}

// ─── Dissolve Particle ────────────────────────────────────────────────────────

function DissolveParticle({ x, y, char, delay }: { x: number; y: number; char: string; delay: number }) {
  const opacity = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    const dx = (Math.random() - 0.5) * 80;
    const dy = (Math.random() - 0.5) * 60 - 20;
    opacity.value = withDelay(delay, withTiming(0, { duration: 700, easing: Easing.out(Easing.quad) }));
    tx.value = withDelay(delay, withTiming(dx, { duration: 700 }));
    ty.value = withDelay(delay, withTiming(dy, { duration: 700 }));
    scale.value = withDelay(delay, withTiming(0.3, { duration: 700 }));
  }, []);

  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    left: x,
    top: y,
    opacity: opacity.value,
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.Text style={[{ color: Colors.ALERT_SIREN_RED, fontSize: 12 }, style]}>
      {char}
    </Animated.Text>
  );
}

// ─── Memory Eraser ────────────────────────────────────────────────────────────

const MEMORY_ITEMS = [
  '말투 DNA 벡터 데이터 (3,241개 문장)',
  '10분 인터뷰 성향 매트릭스',
  '커플 공유 추억 아카이브 (18개)',
  '크라이시스 중재 히스토리',
  '데이트 코스 선호도 학습 데이터',
];

function MemoryEraser({ t }: { t: ThemeTokens }) {
  const [showModal, setShowModal] = useState(false);
  const [dissolving, setDissolving] = useState(false);
  const [particles, setParticles] = useState<{ id: string; x: number; y: number; char: string; delay: number }[]>([]);
  const [done, setDone] = useState(false);

  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));

  const handleDelete = () => {
    setShowModal(false);
    setDissolving(true);

    const chars = '세준서영기억벡터데이터학습메모리파기삭제0101'.split('');
    const newParticles = Array.from({ length: 40 }, (_, i) => ({
      id: String(i),
      x: Math.random() * (SCREEN_W - 80),
      y: Math.random() * 120,
      char: chars[i % chars.length],
      delay: i * 30,
    }));
    setParticles(newParticles);

    setTimeout(() => {
      setDissolving(false);
      setDone(true);
    }, 1800);
  };

  return (
    <View style={[styles.dangerCard, { backgroundColor: t.card }]}>
      <LinearGradient
        colors={['rgba(239,68,68,0.08)', 'rgba(239,68,68,0.02)']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.dangerHeader}>
        <View style={styles.dangerBadge}>
          <Text style={styles.dangerBadgeText}>⚠️ DANGER ZONE</Text>
        </View>
        <Text style={[styles.cardTitle, { color: t.text }]}>기억 삭제 디지털 지우개</Text>
        <Text style={[styles.cardSub, { color: t.textSecondary }]}>AI가 학습한 모든 데이터를 벡터 DB에서 영구 파기해요.</Text>
      </View>

      {dissolving ? (
        <View style={styles.dissolveZone}>
          {particles.map((p) => (
            <DissolveParticle key={p.id} {...p} />
          ))}
        </View>
      ) : done ? (
        <View style={styles.dissolveZone}>
          <Text style={styles.doneText}>✅ 모든 AI 기억 데이터가 영구 파기되었습니다.</Text>
        </View>
      ) : (
        <View style={styles.memoryList}>
          {MEMORY_ITEMS.map((item) => (
            <View key={item} style={styles.memoryRow}>
              <Text style={styles.memoryDot}>▪</Text>
              <Text style={[styles.memoryItemText, { color: t.textSecondary }]}>{item}</Text>
            </View>
          ))}
        </View>
      )}

      {!done && (
        <Animated.View style={btnStyle}>
          <Pressable
            style={styles.eraseButton}
            onPressIn={() => { btnScale.value = withSpring(0.95); }}
            onPressOut={() => { btnScale.value = withSpring(1); }}
            onPress={() => setShowModal(true)}
          >
            <Text style={styles.eraseButtonText}>🔥 우리의 모든 AI 기억 데이터 영구 파기</Text>
          </Pressable>
        </Animated.View>
      )}

      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: t.card }]}>
            <Text style={styles.modalEmoji}>🚨</Text>
            <Text style={[styles.modalTitle, { color: t.text }]}>정말로 파기하시겠어요?</Text>
            <Text style={[styles.modalDesc, { color: t.textSecondary }]}>
              이 작업은 되돌릴 수 없어요.{'\n'}AI가 학습한 모든 기억이 영구 삭제됩니다.
            </Text>
            <Pressable style={styles.modalConfirmBtn} onPress={handleDelete}>
              <Text style={styles.modalConfirmText}>🔥 영구 파기 실행</Text>
            </Pressable>
            <Pressable style={styles.modalCancelBtn} onPress={() => setShowModal(false)}>
              <Text style={[styles.modalCancelText, { color: t.textMuted }]}>취소</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Subscription Store ───────────────────────────────────────────────────────

const PLANS = [
  {
    id: 'coffee',
    name: 'Coffee Break',
    price: '₩9,900',
    period: '/월',
    emoji: '☕',
    desc: '가벼운 말투 동기화 및 실시간 상태 칩 개방',
    perks: ['주간 리포트 블러 해제', '데이트 코스 셔틀 무제한', '말투 동기화 실시간 업데이트'],
    colors: ['#1E293B', '#0F172A'] as const,
    accentColor: '#38BDF8',
  },
  {
    id: 'deep',
    name: 'Deep Talk Night',
    price: '₩29,900',
    period: '/월',
    emoji: '🌙',
    desc: '무제한 딥챗, 크라이시스 중재안, 3D 헬릭스 타워 백업 무제한',
    perks: ['무제한 딥챗 세션', '크라이시스 중재안 도출', '3D 헬릭스 타워 백업 무제한', '속마음 브리핑 리포트', '고음질 보이스 클로닝'],
    colors: ['#2D1B69', '#0A0D1A'] as const,
    accentColor: '#D946EF',
    featured: true,
  },
] as const;

function PlanCard({ plan }: { plan: typeof PLANS[number] }) {
  const [purchased, setPurchased] = useState(false);
  const scale = useSharedValue(1);
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const borderStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + shimmer.value * 0.5,
  }));

  const handleBuy = () => {
    scale.value = withSequence(
      withTiming(0.94, { duration: 60, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 14, stiffness: 800 }),
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTimeout(() => {
      Alert.alert(
        `${plan.emoji} ${plan.name}`,
        `월 ${plan.price} 구독 결제창으로 연결됩니다.\n\n(시뮬레이션 모드)`,
        [
          { text: '취소', style: 'cancel' },
          { text: '결제하기', onPress: () => setPurchased(true) },
        ]
      );
    }, 150);
  };

  return (
    <Animated.View style={[styles.planCardWrapper, cardStyle]}>
      <Animated.View style={[StyleSheet.absoluteFill, borderStyle]}>
        <LinearGradient
          colors={['#7C3AED', '#D946EF', '#FF6B8B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.planCardBorderGlow}
        />
      </Animated.View>

      <LinearGradient colors={plan.colors} style={styles.planCard}>
        {'featured' in plan && plan.featured && (
          <LinearGradient
            colors={['#7C3AED', '#D946EF']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.featuredBadge}
          >
            <Text style={styles.featuredText}>✨ BEST</Text>
          </LinearGradient>
        )}

        <View style={styles.planHeader}>
          <Text style={styles.planEmoji}>{plan.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.planName}>{plan.name}</Text>
            <Text style={styles.planDesc}>{plan.desc}</Text>
          </View>
          <View style={styles.planPriceBox}>
            <Text style={[styles.planPrice, { color: plan.accentColor }]}>{plan.price}</Text>
            <Text style={styles.planPeriod}>{plan.period}</Text>
          </View>
        </View>

        <View style={styles.planPerks}>
          {plan.perks.map((p) => (
            <View key={p} style={styles.perkRow}>
              <Text style={[styles.perkDot, { color: plan.accentColor }]}>✓</Text>
              <Text style={styles.perkText}>{p}</Text>
            </View>
          ))}
        </View>

        <Pressable
          style={[styles.buyButton, purchased && styles.buyButtonDone]}
          onPress={handleBuy}
          disabled={purchased}
        >
          <LinearGradient
            colors={purchased ? ['#1E293B', '#1E293B'] : ['#7C3AED', '#D946EF', '#FF6B8B']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.buyGradient}
          >
            <Text style={styles.buyText}>
              {purchased ? '✅ 구독 중' : '구독 시작하기'}
            </Text>
          </LinearGradient>
        </Pressable>
      </LinearGradient>
    </Animated.View>
  );
}

function SubscriptionStore() {
  const breathProgress = useSharedValue(0);

  useEffect(() => {
    breathProgress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 4000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []);

  const bannerStyle = useAnimatedStyle(() => ({
    opacity: 0.8 + breathProgress.value * 0.2,
  }));

  return (
    <View style={styles.storeSection}>
      <Animated.View style={[styles.storeBanner, bannerStyle]}>
        <LinearGradient
          colors={['#7C3AED', '#D946EF', '#FF6B8B']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.storeBannerGrad}
        >
          <Text style={styles.storeBannerEmoji}>💎</Text>
          <View>
            <Text style={styles.storeBannerTitle}>Twin.me Premium</Text>
            <Text style={styles.storeBannerSub}>AI 연애의 모든 기능을 경험해보세요</Text>
          </View>
        </LinearGradient>
      </Animated.View>

      <View style={styles.planList}>
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </View>
    </View>
  );
}

// ─── Profile Header ───────────────────────────────────────────────────────────

function ProfileHeader({ t }: { t: ThemeTokens }) {
  return (
    <View style={styles.profileHeader}>
      <LinearGradient
        colors={t.gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.profileRing}
      >
        <View style={[styles.profileInner, { backgroundColor: t.avatarInner }]}>
          <Text style={styles.profileEmoji}>🙋‍♂️</Text>
        </View>
      </LinearGradient>
      <View>
        <Text style={[styles.profileName, { color: t.text }]}>세준 AI 관리 센터</Text>
        <Text style={[styles.profileSub, { color: t.textSecondary }]}>마이 트윈 데이터 제어 패널</Text>
      </View>
    </View>
  );
}

// ─── Menu Item (Shared) ───────────────────────────────────────────────────────

function MenuItem({
  t,
  iconEmoji,
  iconBgColor,
  label,
  desc,
  onPress,
  externalLink = false,
  isLast = false,
}: {
  t: ThemeTokens;
  iconEmoji: string;
  iconBgColor: string;
  label: string;
  desc?: string;
  onPress: () => void;
  externalLink?: boolean;
  isLast?: boolean;
}) {
  return (
    <>
      <Pressable
        style={({ pressed }) => [mS.row, pressed && { opacity: 0.6 }]}
        onPress={onPress}
      >
        <View style={[mS.iconWrap, { backgroundColor: iconBgColor }]}>
          <Text style={mS.iconEmoji}>{iconEmoji}</Text>
        </View>
        <View style={mS.labelWrap}>
          <Text style={[mS.label, { color: t.text }]}>{label}</Text>
          {desc ? <Text style={[mS.desc, { color: t.textSecondary }]}>{desc}</Text> : null}
        </View>
        <Text style={[mS.chevron, { color: t.textMuted }]}>
          {externalLink ? '↗' : '›'}
        </Text>
      </Pressable>
      {!isLast && <View style={[mS.divider, { backgroundColor: t.cardBorder }]} />}
    </>
  );
}

const mS = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: Spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: 18,
  },
  labelWrap: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
  },
  desc: {
    fontSize: FontSize.xs,
    lineHeight: 16,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '300' as const,
    lineHeight: 24,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 56,
  },
});

// ─── Account Center Section ───────────────────────────────────────────────────

function AccountCenterSection({ t }: { t: ThemeTokens }) {
  const router = useRouter();

  const items = [
    {
      id: 'personal-info',
      emoji: '👤',
      bg: 'rgba(124,58,237,0.15)',
      label: '개인 정보',
      desc: '이름 · 이메일 · 생년월일',
      route: '/settings/personal-info',
    },
    {
      id: 'security',
      emoji: '🔐',
      bg: 'rgba(217,70,239,0.15)',
      label: '비밀번호 및 보안',
      desc: '비밀번호 변경 · 2단계 인증 · 로그인 활동',
      route: '/settings/security',
    },
    {
      id: 'data-permissions',
      emoji: '🗄️',
      bg: 'rgba(56,189,248,0.15)',
      label: '내 정보 및 권한',
      desc: '데이터 다운로드 · 검색 기록 · 앱 권한',
      route: '/settings/data-permissions',
    },
  ];

  return (
    <View style={[acS.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
      <View style={acS.header}>
        <Text style={[acS.sectionLabel, { color: t.textMuted }]}>계정 센터</Text>
        <Text style={[acS.subtitle, { color: t.textSecondary }]}>
          Twin.me 경험을 통합적으로 관리하세요.
        </Text>
      </View>
      {items.map((item, i) => (
        <MenuItem
          key={item.id}
          t={t}
          iconEmoji={item.emoji}
          iconBgColor={item.bg}
          label={item.label}
          desc={item.desc}
          isLast={i === items.length - 1}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(item.route as any);
          }}
        />
      ))}
    </View>
  );
}

const acS = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: 4,
    borderWidth: 1,
    ...Shadows.card,
  },
  header: {
    gap: 4,
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: FontSize.sm,
    lineHeight: 18,
  },
});

// ─── Support & Legal Section ──────────────────────────────────────────────────

function SupportLegalSection({ t }: { t: ThemeTokens }) {
  const router = useRouter();

  const items = [
    {
      id: 'help',
      emoji: '❓',
      bg: 'rgba(74,222,128,0.15)',
      label: '도움말 센터',
      desc: '자주 묻는 질문 및 고객 지원',
      external: true,
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        Linking.openURL('https://twin.me/help').catch(() => {});
      },
    },
    {
      id: 'privacy-policy',
      emoji: '📄',
      bg: 'rgba(251,191,36,0.15)',
      label: '개인정보 처리방침',
      desc: '데이터 수집 · 이용 · 보호 방침',
      external: false,
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push('/settings/privacy-policy' as any);
      },
    },
    {
      id: 'terms',
      emoji: '📋',
      bg: 'rgba(148,163,184,0.15)',
      label: '서비스 이용약관',
      desc: '서비스 제공 조건 및 이용 규칙',
      external: false,
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push('/settings/terms' as any);
      },
    },
  ];

  return (
    <View style={[acS.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
      <View style={acS.header}>
        <Text style={[acS.sectionLabel, { color: t.textMuted }]}>지원 및 법률</Text>
      </View>
      {items.map((item, i) => (
        <MenuItem
          key={item.id}
          t={t}
          iconEmoji={item.emoji}
          iconBgColor={item.bg}
          label={item.label}
          desc={item.desc}
          externalLink={item.external}
          isLast={i === items.length - 1}
          onPress={item.onPress}
        />
      ))}
    </View>
  );
}

// ─── Settings Footer ──────────────────────────────────────────────────────────

function SettingsFooter({ t }: { t: ThemeTokens }) {
  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      '로그아웃',
      'Twin.me에서 로그아웃하시겠어요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '로그아웃',
          style: 'destructive',
          onPress: () => {
            // TODO: clear session & navigate to splash
          },
        },
      ],
    );
  };

  return (
    <View style={ftS.container}>
      <Text style={[ftS.version, { color: t.textMuted }]}>Twin.me version 2.4.0</Text>
      <Pressable
        style={({ pressed }) => [ftS.logoutBtn, pressed && { opacity: 0.7 }]}
        onPress={handleLogout}
      >
        <Text style={ftS.logoutText}>로그아웃</Text>
      </Pressable>
    </View>
  );
}

const ftS = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.sm,
  },
  version: {
    fontSize: FontSize.xs,
    letterSpacing: 0.3,
  },
  logoutBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    backgroundColor: 'rgba(239,68,68,0.06)',
    alignItems: 'center',
  },
  logoutText: {
    color: Colors.ALERT_SIREN_RED,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.3,
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { themeTokens, themeMode, setThemeMode } = useAppContext();
  const t = themeTokens;

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: t.bg }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ProfileHeader t={t} />

        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: t.textMuted }]}>화면 테마</Text>
          <ThemeToggleSection t={t} themeMode={themeMode} onChangeTheme={setThemeMode} />
        </View>

        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: t.textMuted }]}>프라이버시</Text>
          <PrivacySlider t={t} />
        </View>

        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: t.textMuted }]}>데이터 주권</Text>
          <MemoryEraser t={t} />
        </View>

        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: t.textMuted }]}>프리미엄 플랜</Text>
          <SubscriptionStore />
        </View>

        <View style={styles.sectionBlock}>
          <AccountCenterSection t={t} />
        </View>

        <View style={styles.sectionBlock}>
          <SupportLegalSection t={t} />
        </View>

        <View style={styles.sectionBlock}>
          <SettingsFooter t={t} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: TabBar.height + 32,
    gap: Spacing.xl,
  },

  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.lg,
  },
  profileRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInner: {
    width: 49,
    height: 49,
    borderRadius: 24.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileEmoji: { fontSize: 24 },
  profileName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  profileSub: {
    fontSize: FontSize.sm,
    marginTop: 2,
  },

  sectionBlock: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  card: {
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
    ...Shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  cardSub: {
    fontSize: FontSize.sm,
    lineHeight: 18,
  },
  stageBadge: {
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  stageBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },

  snapLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  snapLabelWrap: {
    alignItems: 'center',
    gap: 3,
    flex: 1,
  },
  snapLabelText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
  },
  snapDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  sliderContainer: {
    paddingVertical: Spacing.sm,
  },
  sliderTrack: {
    height: 6,
    borderRadius: Radius.pill,
    justifyContent: 'center',
  },
  sliderFill: {
    position: 'absolute',
    height: '100%',
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  snapTick: {
    position: 'absolute',
    width: 2,
    height: 12,
    top: -3,
    borderRadius: 1,
  },
  sliderKnob: {
    position: 'absolute',
    top: -14,
    width: 34,
    height: 34,
    borderRadius: 17,
    ...Shadows.glow,
  },
  knobGradient: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  knobEmoji: { fontSize: 15 },
  descBox: {
    minHeight: 48,
    position: 'relative',
    justifyContent: 'center',
    marginTop: 4,
  },
  descText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  pipelineStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    marginTop: 4,
  },
  pipelineText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    flex: 1,
    lineHeight: 16,
  },

  dangerCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    padding: Spacing.md,
    gap: Spacing.md,
    overflow: 'hidden',
    ...Shadows.card,
  },
  dangerHeader: { gap: Spacing.xs },
  dangerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  dangerBadgeText: {
    color: Colors.ALERT_SIREN_RED,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.5,
  },
  memoryList: { gap: 6 },
  memoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memoryDot: {
    color: Colors.ALERT_SIREN_RED,
    fontSize: 10,
  },
  memoryItemText: {
    fontSize: FontSize.sm,
  },
  dissolveZone: {
    height: 100,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneText: {
    color: '#4ADE80',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
  },
  eraseButton: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    paddingVertical: 14,
    alignItems: 'center',
  },
  eraseButtonText: {
    color: Colors.ALERT_SIREN_RED,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  modalBox: {
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    width: '100%',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    ...Shadows.card,
  },
  modalEmoji: { fontSize: 40 },
  modalTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
  },
  modalDesc: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalConfirmBtn: {
    width: '100%',
    backgroundColor: Colors.ALERT_SIREN_RED,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#FFF',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  modalCancelBtn: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: FontSize.base,
  },

  storeSection: { gap: Spacing.md },
  storeBanner: { borderRadius: Radius.lg, overflow: 'hidden' },
  storeBannerGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
  },
  storeBannerEmoji: { fontSize: 28 },
  storeBannerTitle: {
    color: '#FFF',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  storeBannerSub: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  planList: { gap: Spacing.md },
  planCardWrapper: {
    borderRadius: Radius.xl,
    ...Shadows.glow,
    shadowOpacity: 0.3,
  },
  planCardBorderGlow: {
    borderRadius: Radius.xl,
    padding: 1.5,
    ...StyleSheet.absoluteFill,
  },
  planCard: {
    borderRadius: Radius.xl,
    margin: 1.5,
    padding: Spacing.md,
    gap: Spacing.md,
    overflow: 'hidden',
  },
  featuredBadge: {
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  featuredText: {
    color: '#FFF',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  planEmoji: { fontSize: 28, marginTop: 2 },
  planName: {
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  planDesc: {
    color: Colors.TEXT_ON_DARK_SECONDARY,
    fontSize: FontSize.xs,
    marginTop: 2,
    lineHeight: 16,
  },
  planPriceBox: { alignItems: 'flex-end' },
  planPrice: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.extrabold,
  },
  planPeriod: {
    color: Colors.TEXT_MUTED,
    fontSize: FontSize.xs,
  },
  planPerks: { gap: 6 },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  perkDot: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    width: 16,
  },
  perkText: {
    color: Colors.TEXT_ON_DARK_SECONDARY,
    fontSize: FontSize.sm,
  },
  buyButton: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  buyButtonDone: { opacity: 0.7 },
  buyGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  buyText: {
    color: '#FFF',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
});
