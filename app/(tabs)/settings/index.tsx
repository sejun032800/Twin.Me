import React from 'react';
import * as DocumentPicker from 'expo-document-picker';
import TabTutorialOverlay, { TutorialStep } from '../../../src/components/onboarding/TabTutorialOverlay';
import { useTutorialGuard } from '../../../src/hooks/useTutorialGuard';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { triggerHaptic } from '../../../src/utils/haptics';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  LayoutAnimation,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
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
import { usePremiumGate } from '../../../src/hooks/usePremiumGate';
import {
  deleteMemoriesPermanently,
  fetchAILearnedMemories,
  LearnedMemory,
} from '../../../src/services/memoryEraserService';
import {
  initIAP,
  teardownIAP,
  purchaseSubscription,
  type PlanId,
} from '../../../src/services/iapService';
import {
  invalidateSessionTokens,
  toggleServerDataIngestion,
} from '../../../src/services/privacyService';
import {
  clearLocalAuthData,
  logoutFromServer,
} from '../../../src/services/authService';
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
import { ThemeShop, ThemeShopEntryCard } from '../../../src/components/settings/ThemeShop';
import { HelpCenter } from '../../../src/components/settings/HelpCenter';
import { runKakaoSyncPipeline } from '../../../src/services/kakaoUploadService';

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
    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        300,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity,
      ),
    );
    onChangeTheme(mode);
    triggerHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
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

// ─── Step #36: Level Color System ────────────────────────────────────────────
// stage 0 (Full Clone / 유연함): neon green
// stage 1 (Optimized  / 보통  ): brand violet
// stage 2 (Protected  / 높음  ): deep pink
const LEVEL_COLORS: [string, string, string] = ['#4ADE80', '#7C3AED', '#EC4899'];

const LEVEL_BADGE_TEXTS: [string, string, string] = [
  '연인과 실시간 위치 및 상태를 자유롭게 공유합니다 🔓',
  '일반적인 수준의 프라이버시 보호가 작동 중입니다 🛡️',
  '채팅 스크린샷 캡처 방지 및 알림 상세 내용이 숨겨집니다 🔐',
];


function PrivacySlider({ t, onSyncError }: { t: ThemeTokens; onSyncError: () => void }) {
  const { privacyLevel, setPrivacyLevel } = useAppContext();

  const initialStage = (3 - privacyLevel) as PrivacyStage;

  const TRACK_W = SCREEN_W - Spacing.base * 2 - Spacing.md * 2;
  const KNOB_SIZE = 34;
  const KNOB_TRAVEL = TRACK_W - KNOB_SIZE;
  const stagePositions: [number, number, number] = [0, KNOB_TRAVEL / 2, KNOB_TRAVEL];

  const [stage, setStage] = useState<PrivacyStage>(initialStage);
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');

  const prevStage      = useRef<PrivacyStage>(initialStage);
  const dragStartStage = useRef<PrivacyStage>(initialStage);
  const onSyncErrorRef = useRef(onSyncError);
  useEffect(() => { onSyncErrorRef.current = onSyncError; }, [onSyncError]);

  const knobX     = useSharedValue(stagePositions[initialStage]);
  const glowColor = useSharedValue(initialStage / 2);
  const syncPulse = useSharedValue(1);

  useEffect(() => {
    if (syncState === 'syncing') {
      syncPulse.value = withRepeat(
        withSequence(
          withTiming(0.35, { duration: 420 }),
          withTiming(1, { duration: 420 }),
        ),
        -1,
        false,
      );
    } else {
      syncPulse.value = withTiming(1, { duration: 200 });
    }
  }, [syncState]);

  const desc0 = useSharedValue(initialStage === 0 ? 1 : 0);
  const desc1 = useSharedValue(initialStage === 1 ? 1 : 0);
  const desc2 = useSharedValue(initialStage === 2 ? 1 : 0);
  const descSVs = useRef([desc0, desc1, desc2]);

  const currentColor = LEVEL_COLORS[stage];

  // Tick haptic + local optimistic update — fires on every stage change during drag
  const changeStage = (newStage: PrivacyStage) => {
    if (newStage === prevStage.current) return;
    triggerHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    descSVs.current[prevStage.current].value = withTiming(0, { duration: 140 });
    descSVs.current[newStage].value          = withDelay(100, withTiming(1, { duration: 210 }));
    glowColor.value = withTiming(newStage / 2, { duration: 300 });
    prevStage.current = newStage;
    setStage(newStage);
    setPrivacyLevel((3 - newStage) as PrivacyLevel);
  };

  // Revert all visual + global state to a known-good stage (silent — no haptic)
  const rollbackToStage = (rollback: PrivacyStage) => {
    const from = prevStage.current;
    descSVs.current[from].value     = withTiming(0, { duration: 140 });
    descSVs.current[rollback].value = withDelay(100, withTiming(1, { duration: 210 }));
    glowColor.value = withTiming(rollback / 2, { duration: 300 });
    knobX.value = withSpring(stagePositions[rollback], { stiffness: 320, damping: 28 });
    prevStage.current = rollback;
    setStage(rollback);
    setPrivacyLevel((3 - rollback) as PrivacyLevel);
  };

  // Called once per drag gesture on release (equivalent to onSlidingComplete).
  // Chains: pipeline gate change → session token invalidation → success badge.
  // On any failure: hard rollback to prior stage + slide-up error snackbar.
  const handleSlidingComplete = (completedStage: PrivacyStage, startStage: PrivacyStage) => {
    if (completedStage === startStage) return;
    const newLevel = (3 - completedStage) as PrivacyLevel;
    setSyncState('syncing');

    toggleServerDataIngestion(newLevel)
      .then(() => invalidateSessionTokens(newLevel))
      .then(() => {
        setSyncState('success');
        setTimeout(() => setSyncState('idle'), 3000);
      })
      .catch(() => {
        setSyncState('error');
        triggerHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
        rollbackToStage(startStage);
        onSyncErrorRef.current();
        setTimeout(() => setSyncState('idle'), 3500);
      });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => {
        dragStartStage.current = prevStage.current;
        triggerHaptic(() => Haptics.selectionAsync());
      },
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
        const completedStage = prevStage.current;
        const startStage     = dragStartStage.current;
        knobX.value = withSpring(stagePositions[completedStage], { stiffness: 320, damping: 28 });
        runOnJS(handleSlidingComplete)(completedStage, startStage);
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

  const syncPulseStyle = useAnimatedStyle(() => ({ opacity: syncPulse.value }));

  const currentStageData = PRIVACY_STAGES[stage];

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: t.card,
          borderColor: currentColor + '50',
          borderWidth: 1,
          // Neon glow shadow that reacts to current level color
          shadowColor: currentColor,
          shadowRadius: 14,
          shadowOpacity: 0.22,
          shadowOffset: { width: 0, height: 0 },
          elevation: 8,
        },
      ]}
    >
      {/* ── Header + Level Badge ─────────────────────────────────────── */}
      <View style={styles.cardHeader}>
        <View style={{ gap: 3 }}>
          <Text style={[styles.cardTitle, { color: t.text }]}>🛡️ AI가 우리를 얼마나 알아도 될까요?</Text>
          <Text style={[styles.cardSub, { color: t.textSecondary }]}>
            트윈이가 대화를 얼마나 깊이 배울지 직접 정할 수 있어요.
          </Text>
        </View>
        <View style={[styles.stageBadge, { backgroundColor: currentColor + '22', borderColor: currentColor + '44', borderWidth: 1 }]}>
          <Text style={[styles.stageBadgeText, { color: currentColor }]}>
            {currentStageData.badge}
          </Text>
        </View>
      </View>

      {/* ── Security Level Info Badge (Step #36 UI layer) ───────────── */}
      <View style={[styles.levelInfoBadge, { backgroundColor: currentColor + '18', borderColor: currentColor + '55' }]}>
        <Text style={[styles.levelInfoText, { color: currentColor }]}>
          {LEVEL_BADGE_TEXTS[stage]}
        </Text>
      </View>

      {/* ── Snap Labels ─────────────────────────────────────────────── */}
      <View style={[styles.snapLabelsRow, { marginBottom: 6 }]}>
        {PRIVACY_STAGES.map((s, i) => (
          <Pressable
            key={s.key}
            style={styles.snapLabelWrap}
            onPress={() => {
              const ns = i as PrivacyStage;
              if (ns === prevStage.current) return;
              const prevForSnap = prevStage.current;
              knobX.value = withSpring(stagePositions[ns], { stiffness: 320, damping: 28 });
              changeStage(ns);
              // Debounce: wait 300ms so rapid taps only fire one sync
              setTimeout(() => handleSlidingComplete(ns, prevForSnap), 300);
            }}
          >
            <Text
              style={[
                styles.snapLabelText,
                { color: stage === i ? LEVEL_COLORS[i as PrivacyStage] : t.textMuted },
                stage === i && { fontWeight: FontWeight.bold },
              ]}
            >
              {s.snapLabel}
            </Text>
            {stage === i && (
              <View style={[styles.snapDot, { backgroundColor: LEVEL_COLORS[i as PrivacyStage] }]} />
            )}
          </Pressable>
        ))}
      </View>

      {/* ── Slider Track ────────────────────────────────────────────── */}
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
          {/* Track fill — gradient: green → violet → pink */}
          <Animated.View style={[styles.sliderFill, trackFillStyle]}>
            <LinearGradient
              colors={[LEVEL_COLORS[0], LEVEL_COLORS[1], LEVEL_COLORS[2]]}
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
                    ? LEVEL_COLORS[i as PrivacyStage]
                    : t.isLight ? 'rgba(120,80,100,0.25)' : 'rgba(255,255,255,0.18)',
                },
              ]}
            />
          ))}

          {/* Knob — color matches current level */}
          <Animated.View
            style={[
              styles.sliderKnob,
              knobStyle,
              { shadowColor: currentColor, shadowOpacity: 0.75, shadowRadius: 14, elevation: 10 },
            ]}
            {...panResponder.panHandlers}
          >
            <LinearGradient
              colors={[currentColor, currentColor + 'BB']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.knobGradient}
            >
              <Text style={styles.knobEmoji}>{currentStageData.emoji}</Text>
            </LinearGradient>
          </Animated.View>
        </View>
      </View>

      {/* ── Description Box ─────────────────────────────────────────── */}
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

      {/* ── Pipeline / Sync Status Strip ────────────────────────────── */}
      <View
        style={[
          styles.pipelineStrip,
          {
            backgroundColor:
              syncState === 'error'
                ? 'rgba(239,68,68,0.10)'
                : syncState === 'success'
                ? 'rgba(124,58,237,0.18)'
                : currentColor + '1A',
            borderColor:
              syncState === 'error'
                ? 'rgba(239,68,68,0.40)'
                : syncState === 'success'
                ? 'rgba(124,58,237,0.55)'
                : currentColor + '40',
            // Neon violet glow on success
            shadowColor: syncState === 'success' ? '#7C3AED' : 'transparent',
            shadowRadius: syncState === 'success' ? 12 : 0,
            shadowOpacity: syncState === 'success' ? 0.50 : 0,
            shadowOffset: { width: 0, height: 0 },
          },
        ]}
      >
        {syncState === 'syncing' ? (
          <Animated.Text style={[{ fontSize: 13 }, syncPulseStyle]}>🛡️</Animated.Text>
        ) : (
          <Text style={{ fontSize: 13 }}>
            {syncState === 'success'
              ? '🔒'
              : syncState === 'error'
              ? '⚠️'
              : stage === 0 ? '🟢' : stage === 1 ? '🟡' : '🔴'}
          </Text>
        )}
        <Text
          style={[
            styles.pipelineText,
            {
              color:
                syncState === 'error'
                  ? '#EF4444'
                  : syncState === 'success'
                  ? '#7C3AED'
                  : currentColor,
              fontWeight:
                syncState === 'success' ? FontWeight.bold : FontWeight.medium,
            },
          ]}
        >
          {syncState === 'syncing'
            ? '안전한 서버 보안 게이트웨이 동기화 중...'
            : syncState === 'success'
            ? '서버 데이터 수집 차단 완료 🔒'
            : syncState === 'error'
            ? '동기화 실패 — 이전 설정으로 롤백했습니다'
            : stage === 0
            ? '말투 학습 활성 · PII 마스킹 적용 중'
            : stage === 1
            ? '말투 학습 일시 중단 · 데이트 뮤즈 컨텍스트 수집 유지'
            : '모든 실시간 수집 차단 · 온보딩 데이터만 사용'}
        </Text>
      </View>
    </View>
  );
}

// ─── Privacy Snackbar (Step #36) ─────────────────────────────────────────────

function PrivacySnackbar({ visible }: { visible: boolean }) {
  const ty      = useSharedValue(80);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      ty.value      = withSpring(0, { damping: 20, stiffness: 280 });
      opacity.value = withTiming(1, { duration: 180 });
    } else {
      ty.value      = withTiming(80, { duration: 240, easing: Easing.in(Easing.quad) });
      opacity.value = withTiming(0, { duration: 180 });
    }
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[snkS.bar, animStyle]} pointerEvents="none">
      <Text style={snkS.icon}>🌐</Text>
      <Text style={snkS.text}>보안 인프라 동기화에 실패했습니다. 다시 시도해 주세요 🌐</Text>
    </Animated.View>
  );
}

const snkS = StyleSheet.create({
  bar: {
    position: 'absolute',
    bottom: TabBar.height + 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(15,10,30,0.94)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.40)',
    zIndex: 9999,
    shadowColor: '#EF4444',
    shadowRadius: 18,
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  icon: { fontSize: 18 },
  text: {
    flex: 1,
    color: '#FCA5A5',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    lineHeight: 18,
  },
});

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

// ─── Memory Eraser (Step #38) ─────────────────────────────────────────────────

type ParticleItem = { id: string; x: number; y: number; char: string; delay: number };

const CATEGORY_META: Record<string, { icon: string; color: string }> = {
  tone:      { icon: '🗣️', color: '#7C3AED' },
  interview: { icon: '🎙️', color: '#D946EF' },
  archive:   { icon: '💞', color: '#FF6B8B' },
  crisis:    { icon: '⚡', color: '#EF4444' },
  date_pref: { icon: '🗺️', color: '#38BDF8' },
  custom:    { icon: '📝', color: '#94A3B8' },
};

function formatLearnedAt(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} 학습`;
}

function MemoryEraser({ t }: { t: ThemeTokens }) {
  const router = useRouter();
  const [learnedMemories, setLearnedMemories] = useState<LearnedMemory[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [dissolving, setDissolving] = useState(false);
  const [apiPending, setApiPending] = useState(false);
  const [particles, setParticles] = useState<ParticleItem[]>([]);
  const [deletionError, setDeletionError] = useState<string | null>(null);

  const auroraOpacity = useSharedValue(0);
  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));
  const auroraStyle = useAnimatedStyle(() => ({ opacity: auroraOpacity.value }));

  useEffect(() => {
    fetchAILearnedMemories()
      .then((mems) => {
        setLearnedMemories(mems);
        setIsLoading(false);
      })
      .catch(() => {
        setFetchError('기억 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
        setIsLoading(false);
      });
  }, []);

  const isClean = !isLoading && !fetchError && learnedMemories.length === 0;

  useEffect(() => {
    if (isClean) {
      auroraOpacity.value = withTiming(1, { duration: 1200 });
    }
  }, [isClean]);

  // Auto-dismiss deletion error after 5s
  useEffect(() => {
    if (!deletionError) return;
    const timer = setTimeout(() => setDeletionError(null), 5000);
    return () => clearTimeout(timer);
  }, [deletionError]);

  const toggleSelect = (id: string) => {
    if (isDeleting) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (isDeleting) return;
    if (selectedIds.size === learnedMemories.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(learnedMemories.map((m) => m.id)));
    }
  };

  const handlePressDelete = () => {
    if (selectedIds.size === 0 || isDeleting) return;
    triggerHaptic(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); });
    setShowModal(true);
  };

  // Called when user confirms the modal — timed to dissolve animation end
  const executePermanentMemoryDeletion = () => {
    setShowModal(false);
    const targetIds = Array.from(selectedIds);
    setIsDeleting(true);
    setDeletionError(null);

    // Phase 1: particle dissolve animation (0–700ms visible, delays push to ~1400ms)
    setDissolving(true);
    const chars = '세준서영기억벡터데이터학습메모리파기삭제010101'.split('');
    setParticles(
      Array.from({ length: 40 }, (_, i) => ({
        id: String(i),
        x: Math.random() * (SCREEN_W - 80),
        y: Math.random() * 120,
        char: chars[i % chars.length],
        delay: i * 30,
      })),
    );

    // Phase 2: fire API call timed to animation end
    setTimeout(async () => {
      setApiPending(true);
      try {
        await deleteMemoriesPermanently(targetIds);
        // Success — physically purge from local state (true hard-delete confirmed)
        setLearnedMemories((prev) => prev.filter((m) => !targetIds.includes(m.id)));
        setSelectedIds(new Set());
        triggerHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
      } catch {
        // Failure — rollback: items reappear since we never removed them optimistically
        setDeletionError('기억을 지우는 과정에서 안개가 꼈어요 🌫️ 잠시 후 다시 파기해 주세요.');
        triggerHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
      } finally {
        setApiPending(false);
        setDissolving(false);
        setIsDeleting(false);
      }
    }, 1400);
  };

  const canDelete = selectedIds.size > 0 && !isDeleting;

  return (
    <View style={[styles.dangerCard, { backgroundColor: t.card }]}>
      <LinearGradient
        colors={['rgba(80,70,100,0.08)', 'rgba(80,70,100,0.02)']}
        style={StyleSheet.absoluteFill}
      />

      {/* ── Header ────────────────────────────────────────────────── */}
      <View style={styles.dangerHeader}>
        <View style={styles.dangerBadge}>
          <Text style={styles.dangerBadgeText}>🧹 기억 지우개 구역</Text>
        </View>
        <Text style={[styles.cardTitle, { color: t.text }]}>AI가 기억하는 것들 🌌</Text>
        <Text style={[styles.cardSub, { color: t.textSecondary }]}>
          AI가 학습한 임베딩 벡터를 선택해 벡터 DB에서 영구 파기해요.
        </Text>
      </View>

      {/* ── Body ──────────────────────────────────────────────────── */}
      {isLoading ? (
        <View style={meS.loadingBox}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={[meS.skeletonRow, { backgroundColor: t.cardBorder }]} />
          ))}
        </View>
      ) : fetchError ? (
        <View style={meS.infoBox}>
          <Text style={meS.errorText}>{fetchError}</Text>
        </View>
      ) : isClean ? (
        <Animated.View style={[meS.cleanBox, auroraStyle]}>
          <LinearGradient
            colors={['#7C3AED22', '#D946EF11', '#38BDF811']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={meS.cleanGradient}
          >
            <Text style={meS.cleanEmoji}>🌌</Text>
            <Text style={meS.cleanTitle}>트윈이의 기억이 맑게 비어 있어요</Text>
            <Text style={[meS.cleanSub, { color: t.textSecondary }]}>
              아직 학습된 기억이 없어요.{'\n'}채팅에서 대화를 나누거나 카카오톡을 업로드하면{'\n'}트윈이가 두 분만의 이야기를 기억하기 시작해요 💌
            </Text>
            <Pressable
              style={meS.cleanCTA}
              onPress={() => router.push('/(tabs)/chat' as any)}
              hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
            >
              <Text style={meS.cleanCTAText}>채팅 탭에서 시작하기 →</Text>
            </Pressable>
          </LinearGradient>
        </Animated.View>
      ) : dissolving ? (
        <View style={styles.dissolveZone}>
          {!apiPending && particles.map((p) => (
            <DissolveParticle key={p.id} {...p} />
          ))}
          {apiPending && (
            <View style={meS.apiPendingBox}>
              <ActivityIndicator size="small" color="#EF4444" />
              <Text style={meS.apiPendingText}>벡터 DB에서 임베딩 소각 중...</Text>
            </View>
          )}
        </View>
      ) : (
        <>
          {/* Select-all header */}
          <Pressable style={meS.selectAllRow} onPress={toggleSelectAll} disabled={isDeleting} hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}>
            <View style={[
              meS.checkbox,
              selectedIds.size === learnedMemories.length && selectedIds.size > 0
                ? meS.checkboxActive
                : { borderColor: t.textMuted },
            ]}>
              {selectedIds.size === learnedMemories.length && selectedIds.size > 0 && (
                <Text style={meS.checkmark}>✓</Text>
              )}
            </View>
            <Text style={[meS.selectAllText, { color: t.textSecondary }]}>
              전체 선택 ({learnedMemories.length}개)
            </Text>
            {selectedIds.size > 0 && (
              <Text style={meS.selectedCount}>{selectedIds.size}개 선택됨</Text>
            )}
          </Pressable>

          {/* Memory item list */}
          <View style={styles.memoryList}>
            {learnedMemories.map((mem) => {
              const isSelected = selectedIds.has(mem.id);
              const meta = CATEGORY_META[mem.category] ?? CATEGORY_META.custom;
              return (
                <Pressable
                  key={mem.id}
                  style={[
                    meS.memItemRow,
                    {
                      backgroundColor: isSelected ? 'rgba(239,68,68,0.10)' : 'transparent',
                      borderColor: isSelected ? 'rgba(239,68,68,0.35)' : t.cardBorder,
                    },
                  ]}
                  onPress={() => toggleSelect(mem.id)}
                  disabled={isDeleting}
                  hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
                >
                  <View style={[
                    meS.checkbox,
                    isSelected ? meS.checkboxActive : { borderColor: t.textMuted },
                  ]}>
                    {isSelected && <Text style={meS.checkmark}>✓</Text>}
                  </View>
                  <View style={[meS.catIcon, { backgroundColor: meta.color + '22' }]}>
                    <Text style={meS.catIconText}>{meta.icon}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[meS.memContent, { color: t.text }]} numberOfLines={1}>
                      {mem.content}
                    </Text>
                    <View style={meS.memMetaRow}>
                      {mem.vectorCount !== undefined && (
                        <Text style={[meS.metaTag, { color: meta.color }]}>
                          벡터 {mem.vectorCount.toLocaleString()}개
                        </Text>
                      )}
                      <Text style={[meS.metaDate, { color: t.textMuted }]}>
                        {formatLearnedAt(mem.learnedAt)}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* Deletion rollback error snackbar */}
      {deletionError && (
        <View style={meS.errorSnack}>
          <Text style={meS.errorSnackText}>{deletionError}</Text>
        </View>
      )}

      {/* Extra bottom padding so last item stays visible under sticky footer */}
      {canDelete && <View style={{ height: 80 }} />}

      {/* ── 스티키 푸터 — Modal transparent로 화면 레벨 고정 ─────────── */}
      <Modal
        visible={canDelete && !dissolving}
        transparent
        animationType="none"
        statusBarTranslucent
      >
        <View style={meS.stickyFooterWrapper} pointerEvents="box-none">
          <Pressable style={meS.stickyFooterBar} onPress={handlePressDelete} pointerEvents="auto">
            <LinearGradient
              colors={['#EF4444', '#DC2626']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={meS.stickyFooterGrad}
            >
              <Text style={meS.stickyFooterText}>
                {`${selectedIds.size}개의 기억 선택됨 · 🔥 파기하기`}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </Modal>

      {/* ── 하프 바텀시트 확인 ──────────────────────────────────────────── */}
      <Modal visible={showModal} transparent animationType="slide" statusBarTranslucent>
        <View style={meS.halfSheetOverlay}>
          <View style={[meS.halfSheet, { backgroundColor: t.card }]}>
            <View style={meS.halfSheetHandle} />
            <Text style={meS.halfSheetEmoji}>🔥</Text>
            <Text style={[meS.halfSheetTitle, { color: t.text }]}>
              정말 영구 파기할까요?
            </Text>
            <Text style={[meS.halfSheetDesc, { color: t.textSecondary }]}>
              선택한 기억들을 정말 영구 파기할까요?{'\n'}이 작업은 되돌릴 수 없습니다.
            </Text>
            <Pressable
              style={[meS.halfSheetDeleteBtn, isDeleting && { opacity: 0.6 }]}
              onPress={executePermanentMemoryDeletion}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={meS.halfSheetDeleteText}>{selectedIds.size}개 영구 파기</Text>
              )}
            </Pressable>
            <Pressable
              style={meS.halfSheetCancelBtn}
              onPress={() => setShowModal(false)}
              disabled={isDeleting}
            >
              <Text style={[meS.halfSheetCancelText, { color: t.textMuted }]}>취소</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Memory Eraser Styles ─────────────────────────────────────────────────────

const meS = StyleSheet.create({
  loadingBox: { gap: 10 },
  skeletonRow: {
    height: 44,
    borderRadius: Radius.md,
    opacity: 0.4,
  },
  infoBox: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
  },
  errorText: {
    color: Colors.ALERT_SIREN_RED,
    fontSize: FontSize.sm,
    lineHeight: 18,
  },
  cleanBox: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  cleanGradient: {
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cleanEmoji: { fontSize: 40 },
  cleanTitle: {
    color: '#7C3AED',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
  },
  cleanSub: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  cleanCTA: {
    marginTop: 16,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.50)',
    backgroundColor: 'rgba(124,58,237,0.12)',
  },
  cleanCTAText: {
    color: '#C4B5FD',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
  apiPendingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  apiPendingText: {
    color: '#EF4444',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  selectedCount: {
    marginLeft: 'auto',
    color: Colors.ALERT_SIREN_RED,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: Colors.ALERT_SIREN_RED,
    borderColor: Colors.ALERT_SIREN_RED,
  },
  checkmark: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  selectAllText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  memItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  catIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catIconText: { fontSize: 16 },
  memContent: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  memMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaTag: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
  },
  metaDate: {
    fontSize: 11,
  },
  eraseButtonDisabled: { opacity: 0.4 },
  errorSnack: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  errorSnackText: {
    color: Colors.ALERT_SIREN_RED,
    fontSize: FontSize.sm,
    lineHeight: 18,
  },
  // ── 스티키 푸터 ──────────────────────────────────────────────────────────
  stickyFooterWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: TabBar.height + 16,
  },
  stickyFooterBar: {
    marginHorizontal: 16,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  stickyFooterGrad: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyFooterText: {
    color: '#FFFFFF',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.2,
  },
  // ── 하프 바텀시트 ─────────────────────────────────────────────────────────
  halfSheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(10,13,26,0.55)',
  },
  halfSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(239,68,68,0.20)',
    paddingHorizontal: Spacing.xl,
    paddingTop: 20,
    paddingBottom: 44,
    alignItems: 'center',
    gap: Spacing.md,
  },
  halfSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 4,
  },
  halfSheetEmoji: { fontSize: 36 },
  halfSheetTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
  },
  halfSheetDesc: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 21,
  },
  halfSheetDeleteBtn: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: Radius.lg,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    marginTop: 4,
  },
  halfSheetDeleteText: {
    color: '#FFFFFF',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  halfSheetCancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    width: '100%',
  },
  halfSheetCancelText: {
    fontSize: FontSize.base,
  },
});

// ─── Subscription Store ───────────────────────────────────────────────────────

const PLANS = [
  {
    id: 'coffee' as PlanId,
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
    id: 'deep' as PlanId,
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

// ─── IAP Snackbar ─────────────────────────────────────────────────────────────

function IAPSnackbar({ message, visible }: { message: string; visible: boolean }) {
  const ty      = useSharedValue(80);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      ty.value      = withSpring(0, { damping: 20, stiffness: 280 });
      opacity.value = withTiming(1, { duration: 180 });
    } else {
      ty.value      = withTiming(80, { duration: 240, easing: Easing.in(Easing.quad) });
      opacity.value = withTiming(0, { duration: 180 });
    }
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[iapSnkS.bar, animStyle]} pointerEvents="none">
      <Text style={iapSnkS.icon}>💳</Text>
      <Text style={iapSnkS.text}>{message}</Text>
    </Animated.View>
  );
}

const iapSnkS = StyleSheet.create({
  bar: {
    position: 'absolute',
    bottom: TabBar.height + 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(15,10,30,0.96)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.45)',
    zIndex: 9999,
    shadowColor: '#7C3AED',
    shadowRadius: 18,
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  icon: { fontSize: 18 },
  text: {
    flex: 1,
    color: '#C4B5FD',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    lineHeight: 18,
  },
});

// ─── Button Skeleton Shimmer ──────────────────────────────────────────────────

function BuyButtonSkeleton() {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 700, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.45 + pulse.value * 0.35,
  }));

  return (
    <View style={styles.buyGradient}>
      <Animated.View style={[skeletonS.row, pulseStyle]}>
        <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
        <Text style={skeletonS.text}>결제 처리 중...</Text>
      </Animated.View>
    </View>
  );
}

const skeletonS = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
  },
});

// ─── Plan Card ────────────────────────────────────────────────────────────────

interface PlanCardProps {
  plan: typeof PLANS[number];
  purchasingPlanId: PlanId | null;
  onPurchase: (planId: PlanId) => void;
}

function PlanCard({ plan, purchasingPlanId, onPurchase }: PlanCardProps) {
  const { subscriptionStatus, themeTokens } = useAppContext();
  const isLight = themeTokens.isLight;
  const scale   = useSharedValue(1);
  const shimmer = useSharedValue(0);

  const isThisPurchasing  = purchasingPlanId === plan.id;
  const isAnyPurchasing   = purchasingPlanId !== null;
  const isSubscribedToThis = subscriptionStatus.isPremium && subscriptionStatus.planId === plan.id;

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

  // Aurora gold-violet border pulses faster when actively purchasing
  const auroraShimmer = useSharedValue(0);
  useEffect(() => {
    if (isThisPurchasing) {
      auroraShimmer.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 500, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 500, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    } else {
      auroraShimmer.value = withTiming(0, { duration: 300 });
    }
  }, [isThisPurchasing]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const borderStyle = useAnimatedStyle(() => ({
    opacity: isSubscribedToThis
      ? 0.9 + auroraShimmer.value * 0.1   // bright, steady when subscribed
      : 0.5 + shimmer.value * 0.5,
  }));

  const handleBuy = () => {
    if (isAnyPurchasing || isSubscribedToThis) return;

    scale.value = withSequence(
      withTiming(0.94, { duration: 60, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 14, stiffness: 800 }),
    );
    triggerHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    onPurchase(plan.id);
  };

  // Aurora border: violet-gold on success, standard violet-pink otherwise
  const borderColors: readonly [string, string, string] = isSubscribedToThis
    ? (['#7C3AED', '#D946EF', '#F59E0B'] as const)
    : (['#7C3AED', '#D946EF', '#FF6B8B'] as const);

  return (
    <Animated.View style={[styles.planCardWrapper, cardStyle]}>
      <Animated.View style={[StyleSheet.absoluteFill, borderStyle]}>
        <LinearGradient
          colors={borderColors}
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

        {isSubscribedToThis && (
          <LinearGradient
            colors={['#7C3AED', '#F59E0B']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.featuredBadge}
          >
            <Text style={styles.featuredText}>💎 구독 활성화됨</Text>
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
          style={[
            styles.buyButton,
            (isSubscribedToThis || (isAnyPurchasing && !isThisPurchasing)) && styles.buyButtonDone,
          ]}
          onPress={handleBuy}
          disabled={isAnyPurchasing || isSubscribedToThis}
        >
          {isThisPurchasing ? (
            <LinearGradient
              colors={isLight ? ['#FFB7CE', '#B39DDB'] : ['#7C3AED', '#D946EF', '#FF6B8B']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.buyGradient}
            >
              <BuyButtonSkeleton />
            </LinearGradient>
          ) : (
            <LinearGradient
              colors={
                isSubscribedToThis
                  ? (isLight ? (['#FFB7CE', '#B39DDB'] as const) : (['#7C3AED', '#F59E0B'] as const))
                  : (isLight ? (['#FFB7CE', '#B39DDB'] as const) : (['#7C3AED', '#D946EF', '#FF6B8B'] as const))
              }
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.buyGradient}
            >
              <Text style={[
                styles.buyText,
                isLight
                  ? { color: '#2D1B5A' }
                  : { color: '#fff', textShadowColor: 'rgba(15, 23, 42, 0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
              ]}>
                {isSubscribedToThis ? '✅ 구독 중' : '구독 시작하기'}
              </Text>
            </LinearGradient>
          )}
        </Pressable>
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Subscription Store container ─────────────────────────────────────────────

function SubscriptionStore() {
  const { setSubscriptionStatus } = useAppContext();

  const [purchasingPlanId, setPurchasingPlanId] = useState<PlanId | null>(null);
  const [snackbarMsg, setSnackbarMsg]           = useState('');
  const [snackbarVisible, setSnackbarVisible]   = useState(false);

  const breathProgress = useSharedValue(0);

  // Initialize IAP connection when the store section mounts
  useEffect(() => {
    initIAP().catch(() => {
      // Fails silently in simulators / dev without native build
    });
    return () => {
      teardownIAP();
    };
  }, []);

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

  function showSnackbar(msg: string) {
    setSnackbarMsg(msg);
    setSnackbarVisible(true);
    setTimeout(() => setSnackbarVisible(false), 3200);
  }

  const handlePurchase = async (planId: PlanId) => {
    setPurchasingPlanId(planId);
    try {
      const status = await purchaseSubscription(planId);
      setSubscriptionStatus(status);
      triggerHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    } catch (err) {
      const isCancelled = (err as { userCancelled?: boolean }).userCancelled === true;
      if (!isCancelled) {
        showSnackbar('결제가 완료되지 않았어요. 스토어 계정 상태를 확인해 주세요 💳');
        triggerHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
      }
    } finally {
      setPurchasingPlanId(null);
    }
  };

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
          <PlanCard
            key={plan.id}
            plan={plan}
            purchasingPlanId={purchasingPlanId}
            onPurchase={handlePurchase}
          />
        ))}
      </View>

      <IAPSnackbar message={snackbarMsg} visible={snackbarVisible} />
    </View>
  );
}

// ─── Luxury Particle Aura (Step #40) ─────────────────────────────────────────
// Gold/violet sparkle particles that float & pulse around the profile card
// when the user has an active premium subscription.

const PARTICLE_DEFS = [
  { x: 52, y: 8,  size: 5, color: '#F59E0B', delay: 0,    duration: 1800 },
  { x: 80, y: 44, size: 4, color: '#7C3AED', delay: 300,  duration: 2200 },
  { x: 20, y: 22, size: 3, color: '#D946EF', delay: 600,  duration: 1600 },
  { x: 38, y: 62, size: 4, color: '#F59E0B', delay: 900,  duration: 2000 },
  { x: 14, y: 48, size: 3, color: '#FF6B8B', delay: 450,  duration: 1900 },
  { x: 65, y: 18, size: 5, color: '#D946EF', delay: 150,  duration: 2100 },
] as const;

function LuxuryParticleAura({ visible }: { visible: boolean }) {
  const particles = PARTICLE_DEFS.map((def, i) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const scale = useSharedValue(0.4);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const opacity = useSharedValue(0);

    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      if (!visible) {
        scale.value = withTiming(0.4, { duration: 300 });
        opacity.value = withTiming(0, { duration: 300 });
        return;
      }
      const startDelay = def.delay;
      opacity.value = withDelay(
        startDelay,
        withRepeat(
          withSequence(
            withTiming(0.85, { duration: def.duration * 0.45 }),
            withTiming(0.2, { duration: def.duration * 0.55 }),
          ),
          -1,
          false,
        ),
      );
      scale.value = withDelay(
        startDelay,
        withRepeat(
          withSequence(
            withTiming(1.2, { duration: def.duration * 0.45 }),
            withTiming(0.6, { duration: def.duration * 0.55 }),
          ),
          -1,
          false,
        ),
      );
    }, [visible]);

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const animStyle = useAnimatedStyle(() => ({
      opacity: opacity.value,
      transform: [{ scale: scale.value }],
    }));

    return (
      <Animated.View
        key={i}
        style={[
          pS.particle,
          {
            left: def.x,
            top: def.y,
            width: def.size,
            height: def.size,
            borderRadius: def.size / 2,
            backgroundColor: def.color,
            shadowColor: def.color,
          },
          animStyle,
        ]}
        pointerEvents="none"
      />
    );
  });

  if (!visible) return null;

  return <View style={pS.container} pointerEvents="none">{particles}</View>;
}

const pS = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 96,
    height: 80,
    zIndex: 2,
  },
  particle: {
    position: 'absolute',
    shadowOpacity: 0.9,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
});

// ─── Profile Header ───────────────────────────────────────────────────────────

// ── 소셜 배지 정의 ──────────────────────────────────────────────────────────────
const SOCIAL_BADGES: {
  provider: 'GOOGLE' | 'KAKAO' | 'NAVER' | 'APPLE';
  label: string;
  activeBg: string;
  activeText: string;
}[] = [
  { provider: 'GOOGLE', label: 'G', activeBg: '#4285F4', activeText: '#FFF' },
  { provider: 'KAKAO', label: 'K', activeBg: '#FEE500', activeText: '#3C1E1E' },
  { provider: 'NAVER', label: 'N', activeBg: '#03C75A', activeText: '#FFF' },
  { provider: 'APPLE', label: '🍎', activeBg: '#1D1D1F', activeText: '#FFF' },
];

function ProfileHeader({ t }: { t: ThemeTokens }) {
  const { myProfile, setMyProfile, subscriptionStatus, userAccount } = useAppContext();
  const { isPremium, hasLuxuryUI } = usePremiumGate();
  const router = useRouter();
  const displayName = myProfile?.name ?? 'Twin.me 사용자';

  const [isImageLoading, setIsImageLoading] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showPermModal, setShowPermModal] = useState(false);

  const avatarScale  = useSharedValue(1);
  const auroraRotate = useSharedValue(0);

  // Aurora gradient rotates continuously when premium is active
  useEffect(() => {
    if (isPremium) {
      auroraRotate.value = withRepeat(
        withTiming(1, { duration: 3000, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      auroraRotate.value = withTiming(0, { duration: 400 });
    }
  }, [isPremium]);

  const avatarAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: avatarScale.value }],
  }));

  // Outer glow pulsing when premium
  const auroraGlowStyle = useAnimatedStyle(() => ({
    opacity: isPremium ? 0.7 + (Math.sin(auroraRotate.value * Math.PI * 2) + 1) * 0.15 : 0,
    transform: [{ rotate: `${auroraRotate.value * 360}deg` }],
  }));

  const handleUpdateAvatar = async () => {
    triggerHaptic(() => Haptics.selectionAsync());

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setShowPermModal(true);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as ImagePicker.MediaType[],
      allowsEditing: true,
      aspect: [1, 1] as [number, number],
      quality: 0.85,
    });

    if (result.canceled) return;

    const newUri = result.assets[0].uri;
    avatarScale.value = withSequence(
      withTiming(0.9, { duration: 80 }),
      withSpring(1, { damping: 14, stiffness: 500 }),
    );

    setIsUploading(true);
    try {
      // 실제 서비스에서는 여기서 스토리지 API에 업로드
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      setMyProfile({ ...myProfile, avatarUrl: newUri });
      setImageLoadFailed(false);
    } catch {
      Alert.alert(
        '업로드 실패',
        '이미지를 저장하지 못했어요.\n잠시 후 다시 시도해 주세요.',
        [{ text: '확인', style: 'default' }],
      );
    } finally {
      setIsUploading(false);
    }
  };

  const hasAvatar = !!myProfile?.avatarUrl && !imageLoadFailed;

  return (
    <View style={[styles.profileHeader, { position: 'relative' }]}>
      {/* Luxury particle aura — only visible for premium subscribers */}
      <LuxuryParticleAura visible={hasLuxuryUI} />

      <TouchableOpacity onPress={handleUpdateAvatar} activeOpacity={0.82}>
        <Animated.View style={[styles.profileAvatarWrapper, avatarAnimStyle]}>
          {/* Premium aurora outer glow — violet-gold rotating halo */}
          {isPremium && (
            <Animated.View style={[StyleSheet.absoluteFill, auroraGlowStyle, { borderRadius: 999 }]}>
              <LinearGradient
                colors={['#7C3AED', '#F59E0B', '#D946EF', '#7C3AED']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ flex: 1, borderRadius: 999, margin: -4 }}
              />
            </Animated.View>
          )}
          <LinearGradient
            colors={
              isPremium
                ? (['#7C3AED', '#F59E0B', '#D946EF'] as const)
                : (['#7C3AED', '#D946EF', '#FF6B8B'] as const)
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.profileRing}
          >
            <View style={[styles.profileInner, { backgroundColor: hasAvatar ? 'transparent' : t.avatarInner }]}>
              {hasAvatar ? (
                <>
                  <Image
                    source={{ uri: myProfile.avatarUrl }}
                    style={styles.profileImage}
                    onLoadStart={() => setIsImageLoading(true)}
                    onLoadEnd={() => setIsImageLoading(false)}
                    onError={() => {
                      setImageLoadFailed(true);
                      setIsImageLoading(false);
                    }}
                  />
                  {isImageLoading && (
                    <View style={styles.profileImageOverlay}>
                      <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>···</Text>
                    </View>
                  )}
                </>
              ) : (
                <LinearGradient
                  colors={['#7C3AED', '#D946EF', '#FF6B8B']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.profilePlaceholder}
                >
                  <Text style={styles.profileInitial}>
                    {(displayName || 'U').charAt(0).toUpperCase()}
                  </Text>
                </LinearGradient>
              )}
              {isUploading && (
                <View style={styles.profileImageOverlay}>
                  <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '700', textAlign: 'center' }}>
                    저장중{'\n'}···
                  </Text>
                </View>
              )}
            </View>
          </LinearGradient>
          <View style={styles.profileCamBadge}>
            <Text style={{ fontSize: 9 }}>📷</Text>
          </View>
        </Animated.View>
      </TouchableOpacity>

      <View style={{ flex: 1, gap: 3 }}>
        {/* Name row — gold shield badge appears when premium */}
        <View style={phS.nameRow}>
          <Text style={[styles.profileName, { color: t.text }]}>{displayName} AI 관리 센터</Text>
          {isPremium && (
            <LinearGradient
              colors={['#F59E0B', '#7C3AED']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={phS.goldBadge}
            >
              <Text style={phS.goldBadgeText}>💎 PRO</Text>
            </LinearGradient>
          )}
        </View>
        <Text style={[styles.profileSub, { color: t.textSecondary }]}>
          {isPremium ? '프리미엄 플랜 구독 중 ✨' : '마이 트윈 데이터 제어 패널'}
        </Text>

        {/* ── 소셜 연동 배지 행 — 원탭으로 account-link 직행 ────────────── */}
        <Pressable
          style={phS.socialBadgeRow}
          onPress={() => {
            triggerHaptic(() => Haptics.selectionAsync());
            router.push('/settings/account-link' as any);
          }}
          hitSlop={4}
        >
          {SOCIAL_BADGES.map(({ provider, label, activeBg, activeText }) => {
            const linked = userAccount.linkedProviders.includes(provider);
            return (
              <View key={provider} style={phS.socialBadgeWrap}>
                <View
                  style={[
                    phS.socialBadge,
                    linked
                      ? { backgroundColor: activeBg }
                      : { backgroundColor: 'rgba(160,160,160,0.12)' },
                  ]}
                >
                  <Text
                    style={[
                      phS.socialBadgeLabel,
                      { color: linked ? activeText : 'rgba(160,160,160,0.45)' },
                    ]}
                  >
                    {label}
                  </Text>
                </View>
                {!linked && (
                  <View style={phS.socialPlusDot}>
                    <Text style={phS.socialPlusText}>+</Text>
                  </View>
                )}
              </View>
            );
          })}
          <Text style={[phS.socialBadgeHint, { color: t.textMuted }]}>›</Text>
        </Pressable>
      </View>

      <Modal visible={showPermModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: t.card }]}>
            <Text style={styles.modalEmoji}>📸</Text>
            <Text style={[styles.modalTitle, { color: t.text }]}>갤러리 접근 권한 필요</Text>
            <Text style={[styles.modalDesc, { color: t.textSecondary }]}>
              프로필 사진을 바꾸려면{'\n'}갤러리 접근 권한이 필요해요 📸
            </Text>
            <Pressable
              style={[styles.modalConfirmBtn, { backgroundColor: '#7C3AED' }]}
              onPress={() => {
                setShowPermModal(false);
                Linking.openSettings();
              }}
            >
              <Text style={styles.modalConfirmText}>설정 열기</Text>
            </Pressable>
            <Pressable style={styles.modalCancelBtn} onPress={() => setShowPermModal(false)}>
              <Text style={[styles.modalCancelText, { color: t.textMuted }]}>취소</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const phS = StyleSheet.create({
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
  },
  goldBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'center',
  },
  goldBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
  // ── 소셜 배지 행 ────────────────────────────────────────────────────────
  socialBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  socialBadgeWrap: {
    position: 'relative',
  },
  socialBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialBadgeLabel: {
    fontSize: 11,
    fontWeight: '800' as const,
    lineHeight: 14,
    textAlign: 'center',
  },
  socialPlusDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: 'rgba(124,58,237,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialPlusText: {
    fontSize: 8,
    color: '#FFF',
    fontWeight: '900' as const,
    lineHeight: 11,
    textAlign: 'center',
  },
  socialBadgeHint: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginLeft: 1,
  },
});

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
    {
      id: 'account-link',
      emoji: '🔗',
      bg: 'rgba(167,139,250,0.15)',
      label: '소셜 계정 연동',
      desc: 'Google · Kakao · Naver · Apple 연동 및 데이터 동기화',
      route: '/settings/account-link',
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
            triggerHaptic(() => Haptics.selectionAsync());
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
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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

function SupportLegalSection({
  t,
  onHelpCenterPress,
}: {
  t: ThemeTokens;
  onHelpCenterPress: () => void;
}) {
  const router = useRouter();

  const items = [
    {
      id: 'help',
      emoji: '❓',
      bg: 'rgba(74,222,128,0.15)',
      label: '도움말 센터',
      desc: '자주 묻는 질문 및 고객 지원',
      external: false,
      onPress: () => {
        triggerHaptic(() => Haptics.selectionAsync());
        onHelpCenterPress();
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
        triggerHaptic(() => Haptics.selectionAsync());
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
        triggerHaptic(() => Haptics.selectionAsync());
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

// ─── KakaoSync Section (Step #50) ─────────────────────────────────────────────

function KakaoSyncSection({ t }: { t: ThemeTokens }) {
  const { addMemorySentences, lastKakaoSyncTimestamp, setLastKakaoSyncTimestamp, memorySentences } = useAppContext();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const syncPulse = useSharedValue(1);

  useEffect(() => {
    if (isSyncing) {
      syncPulse.value = withRepeat(
        withSequence(
          withTiming(0.35, { duration: 450 }),
          withTiming(1, { duration: 450 }),
        ),
        -1,
        false,
      );
    } else {
      syncPulse.value = withTiming(1, { duration: 200 });
    }
  }, [isSyncing]);

  const syncStyle = useAnimatedStyle(() => ({ opacity: syncPulse.value }));

  const handleSyncPress = async () => {
    if (isSyncing) return;
    triggerHaptic(() => Haptics.selectionAsync());

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      setIsSyncing(true);
      setLastResult(null);

      let content: string;
      if (Platform.OS === 'web') {
        const res = await fetch(asset.uri);
        content = await res.text();
      } else {
        content = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }

      if (!content || content.trim().length === 0) {
        setLastResult('파일이 비어 있어요. 카카오톡 .txt 파일을 선택해주세요.');
        return;
      }

      const { newRecords, newLastTs, deltaCount } = await runKakaoSyncPipeline(
        content,
        lastKakaoSyncTimestamp,
      );

      if (newLastTs) setLastKakaoSyncTimestamp(newLastTs);

      if (newRecords.length > 0) {
        addMemorySentences(newRecords);
        triggerHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
        setLastResult(`✅ 신규 ${deltaCount}건 → 감동 순간 ${newRecords.length}개 추가됨`);
      } else if (deltaCount === 0) {
        setLastResult('✅ 이미 최신 상태 — 새 대화 없음');
      } else {
        setLastResult(`📊 신규 ${deltaCount}건 분석 완료 — 선별된 순간 없음`);
      }
    } catch {
      setLastResult('⚠️ 파일 분석 중 오류가 발생했어요');
    } finally {
      setIsSyncing(false);
    }
  };

  const lastSyncDisplay = lastKakaoSyncTimestamp
    ? lastKakaoSyncTimestamp.replace('T', ' ').slice(0, 16)
    : '없음';

  return (
    <View style={[ksS.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
      <View style={ksS.header}>
        <LinearGradient
          colors={['#7C3AED', '#D946EF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={ksS.iconBadge}
        >
          <Text style={ksS.iconBadgeText}>💬</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={[ksS.title, { color: t.text }]}>추억 데이터 동기화</Text>
          <Text style={[ksS.sub, { color: t.textSecondary }]}>카카오톡 대화 파일로 감동 순간 학습</Text>
        </View>
        <View style={[ksS.countBadge, { backgroundColor: 'rgba(217,70,239,0.14)', borderColor: 'rgba(217,70,239,0.35)' }]}>
          <Text style={ksS.countText}>{memorySentences.length}개</Text>
        </View>
      </View>

      <View style={[ksS.infoRow, { borderColor: t.cardBorder }]}>
        <Text style={[ksS.infoLabel, { color: t.textMuted }]}>마지막 동기화</Text>
        <Text style={[ksS.infoValue, { color: t.textSecondary }]}>{lastSyncDisplay}</Text>
      </View>

      {lastResult && (
        <View style={ksS.resultBanner}>
          <Text style={ksS.resultText}>{lastResult}</Text>
        </View>
      )}

      <Pressable
        onPress={handleSyncPress}
        disabled={isSyncing}
        style={({ pressed }) => [ksS.syncBtn, (pressed || isSyncing) && { opacity: 0.65 }]}
      >
        <LinearGradient
          colors={['#7C3AED', '#D946EF', '#FF6B8B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={ksS.syncBtnInner}
        >
          {isSyncing ? (
            <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, syncStyle]}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={ksS.syncBtnText}>카카오톡 대화 분석 중...</Text>
            </Animated.View>
          ) : (
            <Text style={ksS.syncBtnText}>📂 카카오톡 파일 업로드</Text>
          )}
        </LinearGradient>
      </Pressable>

      <Text style={[ksS.hint, { color: t.textMuted }]}>
        카카오톡 → 채팅방 → 더보기 → 대화 내보내기 (.txt)
      </Text>
    </View>
  );
}

const ksS = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadgeText: { fontSize: 18 },
  title: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  sub: { fontSize: FontSize.xs, marginTop: 2 },
  countBadge: {
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  countText: { color: '#D946EF', fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  infoValue: { fontSize: FontSize.xs },
  resultBanner: {
    backgroundColor: 'rgba(74,222,128,0.1)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.3)',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  resultText: { color: '#4ADE80', fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  syncBtn: { borderRadius: Radius.xl, overflow: 'hidden' },
  syncBtnInner: { paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  syncBtnText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
  hint: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
});

// ─── Account Deletion Server Placeholder ─────────────────────────────────────

async function requestAccountDeletionToServer(): Promise<void> {
  // TODO: wire to DELETE /api/v1/users/me — returns 204 on success
  console.log('[AccountPurge] Permanent account deletion request dispatched to server.');
}

// ─── Settings Footer ──────────────────────────────────────────────────────────

function SettingsFooter({ t }: { t: ThemeTokens }) {
  const { resetSession, purgeAccount } = useAppContext();
  const router = useRouter();

  const [isLoggingOut, setIsLoggingOut]   = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting]          = useState(false);

  const executeLogout = async () => {
    setShowLogoutConfirm(false);
    setIsLoggingOut(true);
    await Promise.allSettled([logoutFromServer(), clearLocalAuthData()]);
    resetSession();
    router.replace('/(auth)/splash');
  };

  const handleAccountPurge = async () => {
    setShowDeleteModal(false);
    setIsDeleting(true);
    try {
      await requestAccountDeletionToServer();
    } catch {
      // Server failure is non-blocking — local purge proceeds regardless
    }
    purgeAccount();
    router.replace('/(auth)/splash');
  };

  return (
    <View style={ftS.container}>
      <Text style={[ftS.version, { color: t.textMuted }]}>Twin.me version 2.4.0</Text>

      {/* ── 구분선 ───────────────────────────────────────────────────── */}
      <View style={[ftS.hr, { backgroundColor: t.cardBorder }]} />

      {/* ── 로그아웃 버튼 — slate gray ───────────────────────────────── */}
      <Pressable
        style={({ pressed }) => [
          ftS.logoutBtn,
          pressed && !isLoggingOut && { opacity: 0.7 },
          isLoggingOut && { opacity: 0.5 },
        ]}
        onPress={() => {
          if (isLoggingOut || isDeleting) return;
          triggerHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
          setShowLogoutConfirm(true);
        }}
        disabled={isLoggingOut || isDeleting}
      >
        {isLoggingOut ? (
          <ActivityIndicator size="small" color="#94A3B8" />
        ) : (
          <Text style={ftS.logoutText}>로그아웃</Text>
        )}
      </Pressable>

      {/* ── 계정 삭제 버튼 — neon natural red #FF4D4D ───────────────── */}
      <Pressable
        style={({ pressed }) => [
          ftS.deleteBtn,
          pressed && !isDeleting && { opacity: 0.7 },
          isDeleting && { opacity: 0.5 },
        ]}
        onPress={() => {
          if (isLoggingOut || isDeleting) return;
          triggerHaptic(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); });
          setShowDeleteModal(true);
        }}
        disabled={isLoggingOut || isDeleting}
      >
        <Text style={ftS.deleteText}>계정 삭제</Text>
      </Pressable>

      {/* ── 로그아웃 확인 커스텀 모달 ───────────────────────────────── */}
      <Modal visible={showLogoutConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: t.card, borderColor: 'rgba(124,58,237,0.22)' }]}>
            <Text style={styles.modalEmoji}>🌙</Text>
            <Text style={[styles.modalTitle, { color: t.text }]}>잠깐 나갔다 올게요</Text>
            <Text style={[styles.modalDesc, { color: t.textSecondary }]}>
              로그아웃하면 트윈이가 잠시 잠들어요.{'\n'}연인과의 실시간 연결도 일시 중지돼요. 🌙
            </Text>
            <Pressable style={ftS.logoutConfirmBtn} onPress={executeLogout}>
              <Text style={ftS.logoutConfirmText}>네, 잠깐 나갔다 올게요</Text>
            </Pressable>
            <Pressable style={styles.modalCancelBtn} onPress={() => setShowLogoutConfirm(false)}>
              <Text style={[styles.modalCancelText, { color: t.textMuted }]}>아니요, 계속 함께할게요</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── 계정 삭제 단일 감성 모달 ──────────────────────────────────── */}
      <Modal visible={showDeleteModal} transparent animationType="slide">
        <View style={ftS.deleteModalOverlay}>
          <View style={[ftS.deleteModalSheet, { backgroundColor: t.card, borderColor: 'rgba(255,77,77,0.20)' }]}>
            <Text style={ftS.deleteModalEmoji}>💔</Text>
            <Text style={[ftS.deleteModalTitle, { color: t.text }]}>잠깐만요 💔</Text>
            <View style={ftS.deleteWarnBox}>
              <Text style={[ftS.deleteWarnText, { color: t.textSecondary }]}>
                두 분이 함께 만든 지도 핀, 주고받은 말들, 연애 DNA 기록이 전부 사라져요. 한 번 지우면 돌아올 수 없어요.
              </Text>
            </View>

            {/* 이탈 억제 — 가장 눈에 띄는 프리미엄 CTA */}
            <LinearGradient
              colors={['#7C3AED', '#D946EF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={ftS.deleteStayBtnGrad}
            >
              <Pressable
                style={ftS.deleteStayBtn}
                onPress={() => setShowDeleteModal(false)}
                disabled={isDeleting}
              >
                <Text style={ftS.deleteStayText}>아니요, 남아 있을게요</Text>
              </Pressable>
            </LinearGradient>

            {/* 삭제 강행 — 톤 다운 */}
            <Pressable
              style={[ftS.deleteConfirmBtn, isDeleting && { opacity: 0.5 }]}
              onPress={handleAccountPurge}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color="#FF4D4D" />
              ) : (
                <Text style={ftS.deleteConfirmText}>💀 모든 기억을 영구 삭제할게요</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── 로그아웃 진행 오버레이 ───────────────────────────────────── */}
      <Modal visible={isLoggingOut} transparent animationType="fade" statusBarTranslucent>
        <View style={[ftS.logoutOverlay, { backgroundColor: t.isLight ? 'rgba(255,255,255,0.88)' : 'rgba(10,13,26,0.88)' }]}>
          <View style={[ftS.logoutCard, { backgroundColor: t.card, borderColor: t.isLight ? 'rgba(114,84,119,0.28)' : 'rgba(124,58,237,0.35)', shadowColor: t.isLight ? '#725477' : '#7C3AED' }]}>
            <ActivityIndicator size="large" color={t.isLight ? t.secondary : '#7C3AED'} />
            <Text style={[ftS.logoutOverlayTitle, { color: t.text }]}>잠시만요...</Text>
            <Text style={[ftS.logoutOverlayDesc, { color: t.textSecondary }]}>안전하게 세션을 종료하고 있어요</Text>
          </View>
        </View>
      </Modal>
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
  hr: {
    width: '100%',
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  // ── 로그아웃 버튼 — slate gray minimal ───────────────────────────────
  logoutBtn: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
    backgroundColor: 'rgba(148,163,184,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  logoutText: {
    color: '#94A3B8',
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.3,
  },
  // ── 계정 삭제 버튼 — neon natural red ───────────────────────────────
  deleteBtn: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,77,77,0.28)',
    backgroundColor: 'rgba(255,77,77,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  deleteText: {
    color: '#FF4D4D',
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.3,
  },
  // ── 로그아웃 확인 모달 내 버튼 ──────────────────────────────────────
  logoutConfirmBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(148,163,184,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    alignItems: 'center',
  },
  logoutConfirmText: {
    color: '#94A3B8',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  // ── 단일 감성 삭제 모달 ─────────────────────────────────────────────
  deleteModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(10,13,26,0.60)',
  },
  deleteModalSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: 40,
    alignItems: 'center',
    gap: Spacing.md,
  },
  deleteModalEmoji: { fontSize: 40, marginBottom: 4 },
  deleteModalTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  deleteWarnBox: {
    backgroundColor: 'rgba(255,77,77,0.06)',
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,77,77,0.22)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    width: '100%',
  },
  deleteWarnText: {
    fontSize: FontSize.sm,
    lineHeight: 21,
    textAlign: 'center',
  },
  // 이탈 억제 버튼 (프리미엄 그라데이션)
  deleteStayBtnGrad: {
    width: '100%',
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginTop: 4,
  },
  deleteStayBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteStayText: {
    color: '#FFFFFF',
    fontSize: FontSize.base,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  // 삭제 강행 버튼 — 매트 다크 레드
  deleteConfirmBtn: {
    width: '100%',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(127,29,29,0.88)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(220,38,38,0.45)',
    marginTop: 4,
  },
  deleteConfirmText: {
    color: 'rgba(255,200,200,0.92)',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.15,
  },
  // ── 로그아웃 진행 오버레이 ───────────────────────────────────────────
  logoutOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingVertical: 36,
    paddingHorizontal: 40,
    alignItems: 'center',
    gap: Spacing.md,
    minWidth: 220,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 16,
  },
  logoutOverlayTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.2,
  },
  logoutOverlayDesc: {
    fontSize: FontSize.sm,
    letterSpacing: 0.1,
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { themeTokens, themeMode, setThemeMode } = useAppContext();
  const t = themeTokens;

  const [privacySyncError, setPrivacySyncError] = useState(false);
  const [showThemeShop, setShowThemeShop] = useState(false);
  const [showHelpCenter, setShowHelpCenter] = useState(false);
  const { shouldShow, markDone } = useTutorialGuard('settings');

  // Tutorial spotlight refs
  const refProfile = useRef<View>(null);
  const refPrivacy = useRef<View>(null);
  const refKakaoSync = useRef<View>(null);
  const refPremium = useRef<View>(null);

  const tutorialSteps: TutorialStep[] = [
    {
      targetRef: refProfile,
      title: '👤 내 프로필',
      description: '이름, MBTI, 애니어그램을 설정하면 AI가 당신의 말투를 더 정확하게 학습해요.',
      arrowDir: 'below',
      pad: 12,
    },
    {
      targetRef: refPrivacy,
      title: '🔒 프라이버시 레벨',
      description: '슬라이더로 AI 데이터 활용 범위를 조절하세요. 언제든 변경 가능해요.',
      arrowDir: 'below',
      pad: 10,
    },
    {
      targetRef: refKakaoSync,
      title: '🔄 추억 동기화',
      description: '카카오톡 대화 파일을 업로드하면 AI가 감동 순간을 자동으로 선별해요.',
      arrowDir: 'above',
      pad: 10,
    },
    {
      targetRef: refPremium,
      title: '✨ 프리미엄 플랜',
      description: '무제한 AI 답장, 주간 리포트, 위기 감지 등 프리미엄 기능을 해금하세요.',
      arrowDir: 'above',
      pad: 12,
    },
  ];

  // Auto-dismiss snackbar after 3.5 s
  useEffect(() => {
    if (!privacySyncError) return;
    const timer = setTimeout(() => setPrivacySyncError(false), 3500);
    return () => clearTimeout(timer);
  }, [privacySyncError]);

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: t.bg }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!shouldShow}
      >
        <View ref={refProfile} collapsable={false}>
          <ProfileHeader t={t} />
        </View>

        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: t.textMuted }]}>화면 테마</Text>
          <ThemeToggleSection t={t} themeMode={themeMode} onChangeTheme={setThemeMode} />
        </View>

        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: t.textMuted }]}>커스텀 테마</Text>
          <ThemeShopEntryCard t={t} onPress={() => setShowThemeShop(true)} />
        </View>

        <View ref={refPrivacy} collapsable={false} style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: t.textMuted }]}>프라이버시</Text>
          <PrivacySlider t={t} onSyncError={() => setPrivacySyncError(true)} />
        </View>

        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: t.textMuted }]}>데이터 주권</Text>
          <MemoryEraser t={t} />
        </View>

        <View ref={refKakaoSync} collapsable={false} style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: t.textMuted }]}>추억 동기화</Text>
          <KakaoSyncSection t={t} />
        </View>

        <View ref={refPremium} collapsable={false} style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: t.textMuted }]}>프리미엄 플랜</Text>
          <SubscriptionStore />
        </View>

        <View style={styles.sectionBlock}>
          <AccountCenterSection t={t} />
        </View>

        <View style={styles.sectionBlock}>
          <SupportLegalSection t={t} onHelpCenterPress={() => setShowHelpCenter(true)} />
        </View>

        <View style={styles.sectionBlock}>
          <SettingsFooter t={t} />
        </View>
      </ScrollView>

      {/* Floating error snackbar — absolute within SafeAreaView, above TabBar */}
      <PrivacySnackbar visible={privacySyncError} />

      {/* Custom theme shop modal */}
      <ThemeShop visible={showThemeShop} onClose={() => setShowThemeShop(false)} t={t} />

      {/* In-app Help Center modal (Step #42) */}
      <HelpCenter visible={showHelpCenter} onClose={() => setShowHelpCenter(false)} t={t} />

      {/* ── 신규 유저 스포트라이트 튜토리얼 ── */}
      <TabTutorialOverlay
        steps={tutorialSteps}
        visible={shouldShow}
        onDone={markDone}
      />
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

  profileAvatarWrapper: {
    position: 'relative',
    shadowColor: '#D946EF',
    shadowRadius: 14,
    shadowOpacity: 0.65,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  profileImage: {
    width: 49,
    height: 49,
    borderRadius: 24.5,
  },
  profilePlaceholder: {
    width: 49,
    height: 49,
    borderRadius: 24.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    fontSize: 28,
    color: '#FFFFFF',
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  profileImageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 24.5,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCamBadge: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    borderColor: 'rgba(124,58,237,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },

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

  levelInfoBadge: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    marginTop: -4,
  },
  levelInfoText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    lineHeight: 16,
    letterSpacing: 0.1,
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(239,68,68,0.25)',
    padding: Spacing.md,
    gap: Spacing.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  dangerHeader: { gap: Spacing.xs },
  dangerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(100,80,120,0.18)',
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(140,110,160,0.28)',
  },
  dangerBadgeText: {
    color: '#A89BBE',
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
    fontSize: 11,
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
