/**
 * 홈 탭: 연애 대시보드
 *
 * 컴포넌트 배치 순서 (탑다운):
 *  0. OverflowBanner    — overflowStatus !== 'NONE' 시 최상단 조건부 노출 (FUN-HOM-002)
 *  1. AccuracyBanner    — hasCompletedInterview === false 시에만 렌더 (accuracyBannerVisible로 관리)
 *  2. DNAScoreCard      — 연애 DNA 일치율 서클 + 10단계 티어 (FUN-HOM-003)
 *  3. MemoryRingSection
 *  4. MoodTemperatureSection
 *  5. MetricsGrid (채팅 지수 & 감정 싱크로율)
 *  6. AICoachingCard
 *  7. SloganFooter
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { purchaseOneTimeProduct } from '../../src/services/iapService';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import AccuracyBanner from '../../src/components/home/AccuracyBanner';
import AICoachingCard from '../../src/components/home/AICoachingCard';
import AIMemoryRingSection from '../../src/components/home/AIMemoryRingSection';
import MemoryRingSection from '../../src/components/home/MemoryRingSection';
import MetricsGrid from '../../src/components/home/MetricsGrid';
import MoodTemperatureSection from '../../src/components/home/MoodTemperatureSection';
import { useAppContext } from '../../src/context/AppContext';
import { useCustomTheme } from '../../src/context/CustomThemeContext';
import {
  Colors,
  FontSize,
  FontWeight,
  Radius,
  Spacing,
  TabBar,
} from '../../src/styles/theme';
import { OCEAN_THEME_ID, OceanTokens } from '../../src/styles/ocean';
import { SAVANNAH_THEME_ID, SavannahTokens } from '../../src/styles/savannah';
import { PASTEL_PINK_THEME_ID, PastelPinkTokens } from '../../src/styles/pastelPink';
import TabTutorialOverlay, { TutorialStep } from '../../src/components/onboarding/TabTutorialOverlay';
import { useTutorialGuard } from '../../src/hooks/useTutorialGuard';
import { useWrappedScheduler } from '../../src/hooks/useWrappedScheduler';
import { CoupleWrappedModal } from '../../src/components/wrapped/CoupleWrappedModal';
import {
  formatScore,
  getRelationshipTier,
  type OverflowStatus,
} from '../../src/utils/scoreCalculator';
import type { OverflowSeverity } from '../../src/engine/metrics';

// ─── FUN-HOM-002: 오버플로우 배너 ───────────────────────────────────────────────

function OverflowBanner({
  status,
  severity,
  onPressCritical,
  onPressExcess,
  onPressUnlockHighlight,
  highlightUnlocking,
  highlightUnlocked,
}: {
  status: OverflowStatus;
  severity?: OverflowSeverity;
  onPressCritical: () => void;
  onPressExcess: () => void;
  onPressUnlockHighlight: () => void;
  highlightUnlocking: boolean;
  highlightUnlocked: boolean;
}) {
  const pulseOpacity = useSharedValue(1);
  const isCriticalSeverity = severity === 'CRITICAL';

  useEffect(() => {
    if (status === 'EXCESS_GAIN' || isCriticalSeverity) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.45, { duration: isCriticalSeverity ? 420 : 750 }),
          withTiming(1.0, { duration: isCriticalSeverity ? 420 : 750 }),
        ),
        -1,
        false,
      );
    } else {
      pulseOpacity.value = 1;
    }
  }, [status, isCriticalSeverity]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  if (status === 'CRITICAL_LOSS') {
    // v2.2 §4.3.2: MINOR(옅은 펄스) / MAJOR(그라데이션 보더) / CRITICAL(전면 글래스모피즘+햅틱)
    return (
      <Animated.View
        entering={FadeInDown.duration(380)}
        exiting={FadeOut.duration(250)}
        style={[s.bannerWine, isCriticalSeverity && s.bannerWineCritical]}
      >
        <LinearGradient
          colors={['rgba(153,27,27,0.92)', 'rgba(127,29,29,0.95)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        {/* 네온 와인 보더 라인 — MAJOR/CRITICAL일수록 두껍고 선명하게 */}
        <Animated.View style={[s.bannerWineBorder, isCriticalSeverity && s.bannerWineBorderCritical, isCriticalSeverity && pulseStyle]} />
        {severity && severity !== 'MINOR' && (
          <Text style={s.bannerSeverityTag}>
            {severity === 'CRITICAL' ? '🚨 CRITICAL' : '⚠️ MAJOR'}
          </Text>
        )}
        <Text style={s.bannerWineText}>
          오늘 두 분의 대화 온도는 임계점을 넘었습니다.{'\n'}
          시스템이 관계의 급격한 균열을 막기 위해 브레이크를 밟았으니,{' '}
          지금 즉시 반성의 거울을 켜세요.
        </Text>
        <TouchableOpacity
          style={s.bannerBtn}
          onPress={onPressCritical}
          activeOpacity={0.82}
        >
          <Text style={s.bannerBtnText}>🪞 내 대화 복기하기</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  if (status === 'EXCESS_GAIN') {
    return (
      <Animated.View
        entering={FadeInDown.duration(380)}
        exiting={FadeOut.duration(250)}
        style={s.bannerPink}
      >
        <LinearGradient
          colors={['rgba(236,72,153,0.15)', 'rgba(244,114,182,0.20)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View style={pulseStyle}>
          <Text style={s.bannerPinkText}>
            오늘 두 분의 다정함이 일일 학습 한도를 초과했습니다! 💖{'\n'}
            묵직하게 쌓인 오늘의 예쁜 대화들을 추억 월에 박제해 보세요.
          </Text>
        </Animated.View>
        <TouchableOpacity
          style={[s.bannerBtn, s.bannerBtnPink]}
          onPress={onPressExcess}
          activeOpacity={0.82}
        >
          <Text style={[s.bannerBtnText, { color: '#EC4899' }]}>
            📸 예쁜 말 수집하러 가기
          </Text>
        </TouchableOpacity>
        {/* FUN-PAY-001 §3: 실시간 단건 결제 모먼트 — 주간 결제 의존도 탈피 */}
        {(severity === 'MAJOR' || severity === 'CRITICAL') && !highlightUnlocked && (
          <TouchableOpacity
            style={s.bannerUnlockBtn}
            onPress={onPressUnlockHighlight}
            activeOpacity={0.82}
            disabled={highlightUnlocking}
          >
            <Text style={s.bannerUnlockBtnText}>
              {highlightUnlocking ? '언락 처리 중...' : '⚡ 하이라이트 카드 즉시 언락'}
            </Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    );
  }

  return null;
}

// ─── FUN-HOM-003: DNA 일치율 서클 카드 ──────────────────────────────────────────

function DNAScoreCard() {
  const { currentScore, sLive, themeTokens } = useAppContext();
  const { activeTheme } = useCustomTheme();
  const isOcean = activeTheme?.id === OCEAN_THEME_ID;
  const isSavannah = activeTheme?.id === SAVANNAH_THEME_ID;
  const isPastel = activeTheme?.id === PASTEL_PINK_THEME_ID;
  const t = themeTokens;

  // v2.2: 게이지는 S_Live(실시간 표시 전용), 티어·테마는 S_Current(공식 일치율) 기준
  const tier = getRelationshipTier(currentScore);
  const displayScore = formatScore(sLive);

  // 글로우 펄스 애니메이션
  const glowScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.55);

  useEffect(() => {
    glowScale.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 1400 }),
        withTiming(1.0, { duration: 1400 }),
      ),
      -1,
      false,
    );
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.80, { duration: 1400 }),
        withTiming(0.40, { duration: 1400 }),
      ),
      -1,
      false,
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: glowOpacity.value,
  }));

  return (
    <Animated.View entering={FadeIn.duration(500)} style={s.dnaCard}>
      {/* 티어 테마 배경 */}
      <LinearGradient
        colors={tier.theme.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.dnaCardBg}
      />
      <View style={[s.dnaCardInner, {
        borderColor: isOcean
          ? OceanTokens.LAGOON_TEAL + '55'
          : isSavannah
            ? SavannahTokens.BURNING_SUN + '55'
            : isPastel
              ? PastelPinkTokens.BUBBLE_PINK + '66'
              : tier.theme.borderColor,
        backgroundColor: isOcean
          ? OceanTokens.DEEP_OCEAN
          : isSavannah
            ? SavannahTokens.DUSK_DEEP
            : isPastel
              ? (t.isLight ? PastelPinkTokens.MILKY_CREAM : PastelPinkTokens.DEEP_MIDNIGHT)
              : (t.isLight ? 'rgba(255,255,255,0.88)' : 'rgba(10,13,26,0.88)'),
      }]}>
        {/* 상단 라벨 */}
        <Text style={[s.dnaLabel, { color: t.textSecondary }]}>
          연애 DNA 일치율
        </Text>

        {/* 스코어 서클 */}
        <View style={s.scoreCircleWrap}>
          {/* 네온 글로우 헤일로 */}
          <Animated.View
            style={[
              s.glowHalo,
              { backgroundColor: tier.theme.glowColor },
              glowStyle,
            ]}
          />
          {/* 그라데이션 링 */}
          <LinearGradient
            colors={tier.theme.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.scoreRingGrad}
          />
          {/* 중앙 원 */}
          <View style={[s.scoreCircleInner, {
            backgroundColor: isOcean
              ? OceanTokens.DEEP_OCEAN
              : isSavannah
                ? SavannahTokens.DUSK_DEEP
                : isPastel
                  ? (t.isLight ? PastelPinkTokens.MILKY_CREAM : PastelPinkTokens.DEEP_MIDNIGHT)
                  : (t.isLight ? '#FFFFFF' : '#0A0D1A'),
          }]}>
            <Text style={[s.scoreNum, {
              color: isOcean
                ? OceanTokens.COASTAL_SAND
                : isSavannah
                  ? SavannahTokens.BURNING_SUN
                  : isPastel
                    ? PastelPinkTokens.BUBBLE_PINK
                    : tier.theme.textColor,
            }]}>
              {displayScore}%
            </Text>
          </View>
        </View>

        {/* 티어 타이틀 & 설명 */}
        <View style={s.tierBlock}>
          <Text style={[s.tierTitle, { color: tier.theme.textColor }]}>
            {tier.emoji} {tier.title}
          </Text>
          <Text style={[s.tierDesc, { color: t.textMuted }]} numberOfLines={2}>
            {tier.description}
          </Text>
        </View>

        {/* 하단 그라데이션 심머 라인 */}
        <LinearGradient
          colors={tier.theme.gradient}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={s.dnaShimmerLine}
        />
      </View>
    </Animated.View>
  );
}

// ─── 홈 스크린 ────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const {
    accuracyBannerVisible,
    dismissAccuracyBanner,
    myProfile,
    partnerProfile,
    themeTokens,
    overflowStatus,
    overflowSeverity,
    setTriggerMirrorMode,
    oneTimeHighlightUnlocked,
    setOneTimeHighlightUnlocked,
  } = useAppContext();

  const t = themeTokens;
  const { shouldShow, markDone } = useTutorialGuard('home');
  const [highlightUnlocking, setHighlightUnlocking] = useState(false);
  const { wrappedData, visible: wrappedVisible, dismiss: dismissWrapped } = useWrappedScheduler();

  // 아코디언 & 링 탭 상태
  const [accordionOpen, setAccordionOpen] = useState(false);
  const [activeRingTab, setActiveRingTab] = useState<'ai' | 'memory'>('ai');

  // Tutorial spotlight target refs
  const refMemoryRing = useRef<View>(null);
  const refMoodTemp = useRef<View>(null);
  const refMetrics = useRef<View>(null);
  const refCoaching = useRef<View>(null);

  const tutorialSteps: TutorialStep[] = [
    {
      targetRef: refMemoryRing,
      title: '💍 추억 링',
      description: '함께한 날들이 링으로 쌓여요. 탭하면 특별한 순간을 확인할 수 있어요.',
      arrowDir: 'below',
      pad: 14,
    },
    {
      targetRef: refMoodTemp,
      title: '🌡️ 오늘의 분위기',
      description: '파트너와 나의 감정 온도를 실시간으로 측정해드려요.',
      arrowDir: 'below',
      pad: 14,
    },
    {
      targetRef: refMetrics,
      title: '📊 채팅 지수',
      description: '대화 패턴 분석으로 우리 관계의 건강 지표를 확인하세요.',
      arrowDir: 'above',
      pad: 12,
    },
    {
      targetRef: refCoaching,
      title: '🔮 AI 코칭',
      description: 'Twin AI가 오늘의 연애 조언을 카드로 띄워드려요. 매일 업데이트돼요!',
      arrowDir: 'above',
      pad: 12,
    },
  ];

  // FUN-HOM-002: CRITICAL_LOSS → 채팅 탭 + FUN-CHA-003 강제 트리거
  const handleCriticalLossCTA = useCallback(() => {
    setTriggerMirrorMode(true);
    router.navigate('/chat' as any);
  }, [router, setTriggerMirrorMode]);

  // FUN-HOM-002: EXCESS_GAIN → 추억 탭 폴라로이드 뷰
  const handleExcessGainCTA = useCallback(() => {
    router.navigate('/history' as any);
  }, [router]);

  // FUN-PAY-001 §3: 실시간 EXCESS_GAIN 단건 결제 모먼트 — 하이라이트 카드 즉시 언락
  const handleUnlockHighlightCTA = useCallback(async () => {
    if (highlightUnlocking || oneTimeHighlightUnlocked) return;
    setHighlightUnlocking(true);
    try {
      await purchaseOneTimeProduct('highlight_unlock_single');
      setOneTimeHighlightUnlocked(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      const isCancelled = (err as { userCancelled?: boolean }).userCancelled === true;
      if (!isCancelled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setHighlightUnlocking(false);
    }
  }, [highlightUnlocking, oneTimeHighlightUnlocked, setOneTimeHighlightUnlocked]);

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: t.bg }]}>

      {/* ── 0순위: 오버플로우 경고 배너 (FUN-HOM-002) ── */}
      {overflowStatus !== 'NONE' && (
        <OverflowBanner
          status={overflowStatus}
          severity={overflowSeverity}
          onPressCritical={handleCriticalLossCTA}
          onPressExcess={handleExcessGainCTA}
          onPressUnlockHighlight={handleUnlockHighlightCTA}
          highlightUnlocking={highlightUnlocking}
          highlightUnlocked={oneTimeHighlightUnlocked}
        />
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!shouldShow}
      >
        {/* ── ① 오늘의 연애 현황 아코디언 카드 ──────────────────────────── */}
        <View>
          {/* DNA 스코어 카드 — 항상 노출 */}
          <DNAScoreCard />

          {/* 인라인 슬로건 배지 */}
          <Text style={[s.sloganBadge, { color: t.textMuted }]}>
            "내가 없는 순간에도, 너를 가장 나답게 사랑할 또 하나의 나."
          </Text>

          {/* 아코디언 토글 버튼 */}
          <Pressable
            style={s.accordionToggle}
            onPress={() => setAccordionOpen(o => !o)}
            hitSlop={8}
          >
            <Text style={[s.accordionToggleText, { color: t.textMuted }]}>
              {accordionOpen ? '▲ 간략히 보기' : '▼ 자세히 보기'}
            </Text>
          </Pressable>

          {/* 접힘 확장 영역 — FadeInDown */}
          {accordionOpen && (
            <Animated.View entering={FadeInDown.duration(240)} exiting={FadeOut.duration(160)}>
              {accuracyBannerVisible && (
                <AccuracyBanner
                  myName={myProfile.name}
                  onDismiss={dismissAccuracyBanner}
                  t={t}
                />
              )}
              <View ref={refMetrics} collapsable={false}>
                <MetricsGrid t={t} />
              </View>
            </Animated.View>
          )}
        </View>

        {/* ── ② 링 섹션 세그먼트 탭 ────────────────────────────────────── */}
        <View ref={refMemoryRing} collapsable={false}>
          {/* 탭 토글 */}
          <View style={[s.ringTabRow, { backgroundColor: t.isLight ? 'rgba(124,58,237,0.06)' : 'rgba(124,58,237,0.10)' }]}>
            <Pressable
              style={[s.ringTab, activeRingTab === 'ai' && s.ringTabActive]}
              onPress={() => setActiveRingTab('ai')}
            >
              <Text style={[s.ringTabText, { color: activeRingTab === 'ai' ? '#A78BFA' : t.textMuted }]}>
                🧠 AI 메모리
              </Text>
            </Pressable>
            <Pressable
              style={[s.ringTab, activeRingTab === 'memory' && s.ringTabActive]}
              onPress={() => setActiveRingTab('memory')}
            >
              <Text style={[s.ringTabText, { color: activeRingTab === 'memory' ? '#A78BFA' : t.textMuted }]}>
                💍 일반 메모리
              </Text>
            </Pressable>
          </View>

          {/* 탭 콘텐츠 */}
          {activeRingTab === 'ai' ? (
            <Animated.View key="ai" entering={FadeIn.duration(200)}>
              <AIMemoryRingSection t={t} />
            </Animated.View>
          ) : (
            <Animated.View key="memory" entering={FadeIn.duration(200)}>
              <MemoryRingSection t={t} />
            </Animated.View>
          )}
        </View>

        {/* ── ③ 오늘의 분위기 & 온도 ───────────────────────────────────── */}
        <View ref={refMoodTemp} collapsable={false}>
          <MoodTemperatureSection partnerName={partnerProfile.name} t={t} />
        </View>

        {/* ── ④ AI 코칭 한마디 ────────────────────────────────────────── */}
        <View ref={refCoaching} collapsable={false}>
          <AICoachingCard partnerName={partnerProfile.name} t={t} />
        </View>
      </ScrollView>

      {/* ── 신규 유저 스포트라이트 튜토리얼 ── */}
      <TabTutorialOverlay
        steps={tutorialSteps}
        visible={shouldShow}
        onDone={markDone}
      />

      {/* ── FUN-REP-003: 커플 Wrapped & 기념일 결산 (연말/D+100/D+365 자동 트리거) ── */}
      <CoupleWrappedModal
        visible={wrappedVisible}
        data={wrappedData}
        myName={myProfile.name}
        partnerName={partnerProfile.name}
        onClose={dismissWrapped}
      />
    </SafeAreaView>
  );
}

// ─── 스타일 ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Spacing.lg,
    paddingBottom: TabBar.height + 32,
    gap: Spacing.xl,
  },
});

const s = StyleSheet.create({
  // ── OverflowBanner ──────────────────────────────────────────────────────────
  bannerWine: {
    marginHorizontal: Spacing.base,
    marginTop: Spacing.xs,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    padding: Spacing.base,
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderColor: 'rgba(220,38,38,0.55)',
  },
  bannerWineBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#DC2626',
    opacity: 0.9,
  },
  // v2.2 §4.3.2 CRITICAL 심각도 — 전면 글래스모피즘 강조
  bannerWineCritical: {
    borderWidth: 2,
    borderColor: 'rgba(252,165,165,0.85)',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    elevation: 12,
  },
  bannerWineBorderCritical: {
    height: 3,
    backgroundColor: '#FCA5A5',
  },
  bannerSeverityTag: {
    color: '#FCA5A5',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 0.6,
  },
  bannerWineText: {
    color: '#FCA5A5',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    lineHeight: 19,
  },
  bannerPink: {
    marginHorizontal: Spacing.base,
    marginTop: Spacing.xs,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    padding: Spacing.base,
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderColor: 'rgba(236,72,153,0.45)',
  },
  bannerPinkText: {
    color: '#F9A8D4',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    lineHeight: 19,
  },
  bannerBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: 'rgba(220,38,38,0.22)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.45)',
  },
  bannerBtnPink: {
    backgroundColor: 'rgba(236,72,153,0.14)',
    borderColor: 'rgba(236,72,153,0.40)',
  },
  bannerBtnText: {
    color: '#FCA5A5',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  bannerUnlockBtn: {
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: 'rgba(245,158,11,0.16)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(245,158,11,0.5)',
  },
  bannerUnlockBtnText: {
    color: '#FBBF24',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },

  // ── 아코디언 & 슬로건 배지 ───────────────────────────────────────────────────
  sloganBadge: {
    fontSize: FontSize.xs,
    fontStyle: 'italic',
    textAlign: 'center',
    opacity: 0.5,
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.xs,
    letterSpacing: 0.2,
    lineHeight: 17,
  },
  accordionToggle: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
  },
  accordionToggleText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.4,
    opacity: 0.6,
  },

  // ── 링 세그먼트 탭 ──────────────────────────────────────────────────────────
  ringTabRow: {
    flexDirection: 'row',
    borderRadius: Radius.lg,
    padding: 4,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    gap: 4,
  },
  ringTab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  ringTabActive: {
    backgroundColor: 'rgba(124,58,237,0.22)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(124,58,237,0.38)',
  },
  ringTabText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.2,
  },

  // ── DNAScoreCard ────────────────────────────────────────────────────────────
  dnaCard: {
    marginHorizontal: Spacing.base,
    borderRadius: Radius['2xl'],
    overflow: 'hidden',
  },
  dnaCardBg: {
    ...{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    opacity: 0.28,
  },
  dnaCardInner: {
    borderRadius: Radius['2xl'],
    borderWidth: 1.5,
    padding: Spacing.lg,
    gap: Spacing.md,
    alignItems: 'center',
    overflow: 'hidden',
  },
  dnaLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  scoreCircleWrap: {
    width: 148,
    height: 148,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowHalo: {
    position: 'absolute',
    width: 148,
    height: 148,
    borderRadius: 74,
    opacity: 0.55,
    // blur 효과는 네이티브에서 elevation으로 근사
    elevation: 20,
  },
  scoreRingGrad: {
    position: 'absolute',
    width: 148,
    height: 148,
    borderRadius: 74,
  },
  scoreCircleInner: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNum: {
    fontSize: 32,
    fontWeight: '900' as const,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  tierBlock: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.base,
  },
  tierTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
  },
  tierDesc: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 18,
  },
  dnaShimmerLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    opacity: 0.70,
  },
});
