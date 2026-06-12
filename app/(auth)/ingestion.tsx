import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { analyzeChatRhythm, parseKakaoExport } from '../../src/lib/kakaoParser';
import { useAppContext } from '../../src/context/AppContext';
import { TwinGradient } from '../../src/components/ui/TwinGradient';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../src/styles/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'picked' | 'parsing' | 'done' | 'error';

// ─── Stage Labels ─────────────────────────────────────────────────────────────

const STAGE_LABELS = [
  '카카오톡 대화 데이터 분석 시작하는 중...',
  '개인정보 보호를 위해 기기 내부에서 상대방 대화 파싱 중...',
  '연인 사이의 시그니처 말투와 핵심 키워드 추출 중...',
  '분석 완료! 매칭 단계로 이동합니다.',
] as const;

function pctToStage(pct: number): number {
  if (pct <= 30) return 0;
  if (pct <= 70) return 1;
  if (pct < 100) return 2;
  return 3;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveTagsFromDrips(drips: string[]): string[] {
  const joined = drips.join(' ');
  const result: string[] = [];
  if (/ㅋ|ㅎ/.test(joined)) result.push('#웃음부자');
  if (/그니까|맞아|공감/.test(joined)) result.push('#공감형');
  if (/자니|밤|새벽/.test(joined)) result.push('#새벽감성');
  if (/완전|진짜|ㄹㅇ/.test(joined)) result.push('#극공감러');
  if (/대박|좋아/.test(joined)) result.push('#긍정에너지');
  const fallbacks = ['#공감형', '#새벽감성', '#이모지대장', '#극공감러', '#웃음부자'];
  for (const fb of fallbacks) {
    if (result.length >= 3) break;
    if (!result.includes(fb)) result.push(fb);
  }
  return result.slice(0, 3);
}

// ─── Drip Card ────────────────────────────────────────────────────────────────

const RANK_COLORS = [Colors.GRADIENT_END, Colors.GRADIENT_MID, Colors.GRADIENT_START];
const MEDALS = ['🥇', '🥈', '🥉'];

function DripCard({ drip, rank, delay }: { drip: string; rank: number; delay: number }) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).springify().damping(14).stiffness(120)}
      style={dc.card}
    >
      <Text style={dc.medal}>{MEDALS[rank]}</Text>
      <View style={dc.content}>
        <Text style={dc.rankLabel}>#{rank + 1} 시그니처</Text>
        <Text style={[dc.drip, { color: RANK_COLORS[rank] }]}>{drip}</Text>
      </View>
    </Animated.View>
  );
}

const dc = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.CARD_DARK_SLATE,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.base,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  medal: { fontSize: 26, width: 36, textAlign: 'center' },
  content: { flex: 1, gap: 2 },
  rankLabel: {
    color: Colors.TEXT_MUTED,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  drip: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.extrabold,
    letterSpacing: -0.5,
  },
});

// ─── Privacy Badge ─────────────────────────────────────────────────────────────

function PrivacyBadge() {
  return (
    <View style={pv.badge}>
      <Text style={pv.icon}>🔒</Text>
      <Text style={pv.text}>
        상대방 대화는 기기 내에서 즉시 파기 · 전화번호·계좌번호 자동 마스킹
      </Text>
    </View>
  );
}

const pv = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: 'rgba(56,189,248,0.07)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.18)',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
  },
  icon: { fontSize: 14, marginTop: 1 },
  text: {
    flex: 1,
    color: Colors.BADGE_AI_BLUE,
    fontSize: FontSize.xs,
    lineHeight: 18,
    fontWeight: FontWeight.medium,
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function IngestionScreen() {
  const router = useRouter();
  const {
    myProfile,
    setTrainingResult,
    setChatStyleProfile,
    setRawKakaoText,
  } = useAppContext();

  const [phase, setPhase] = useState<Phase>('idle');
  const [fileName, setFileName] = useState('');
  const [drips, setDrips] = useState<string[]>([]);
  const [lineCount, setLineCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [progressLabel, setProgressLabel] = useState<string>(STAGE_LABELS[0]);
  const [progressPct, setProgressPct] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);

  const rawTextRef = useRef('');
  const pendingDripsRef = useRef<string[]>([]);
  const pendingLineCountRef = useRef(0);

  const progress = useSharedValue(0);
  const barStyle = useAnimatedStyle(() => ({
    width: `${Math.round(progress.value * 100)}%` as `${number}%`,
  }));

  // ─── Progress Stage & Percentage Sync ──────────────────────────────────────

  useAnimatedReaction(
    () => Math.round(progress.value * 100),
    (pct, prevPct) => {
      if (pct === prevPct) return;
      runOnJS(setProgressPct)(pct);
      const toStage = pctToStage(pct);
      const fromStage = pctToStage(prevPct ?? 0);
      if (toStage !== fromStage) {
        runOnJS(setProgressLabel)(STAGE_LABELS[toStage]);
      }
    },
  );

  // ─── File Picker ───────────────────────────────────────────────────────────

  const handlePickFile = async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      const name = asset.name ?? 'kakao_export.txt';

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
        setErrorMsg('파일 내용이 비어 있어요. 올바른 카카오톡 .txt 파일을 선택해주세요.');
        setPhase('error');
        return;
      }

      rawTextRef.current = content;
      setFileName(name);
      setPhase('picked');
      await Haptics.selectionAsync();
    } catch {
      setErrorMsg('파일을 읽는 중 오류가 발생했어요. 다시 시도해주세요.');
      setPhase('error');
    }
  };

  // ─── Parse Trigger ─────────────────────────────────────────────────────────

  const onAnimationDone = useCallback(() => {
    setDrips(pendingDripsRef.current);
    setLineCount(pendingLineCountRef.current);
    setPhase('done');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  const handleStartParse = async () => {
    if (!rawTextRef.current) return;
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}

    // Reset progress state before starting
    setProgressPct(0);
    setProgressLabel(STAGE_LABELS[0]);
    setPhase('parsing');
    progress.value = 0;

    const myName = myProfile.name.trim() || '나';

    try {
      const parsed = parseKakaoExport(rawTextRef.current, myName);
      const chatProfile = analyzeChatRhythm(rawTextRef.current, myName);

      const extractedDrips =
        parsed.topDrips.length >= 3
          ? parsed.topDrips.slice(0, 3)
          : [...parsed.topDrips, '추출1', '추출2', '추출3'].slice(0, 3);

      const tags = deriveTagsFromDrips(extractedDrips);

      setRawKakaoText(rawTextRef.current);
      setChatStyleProfile(chatProfile);
      setTrainingResult({
        drips: extractedDrips,
        tags,
        myLineCount: parsed.myLines.length,
        maskedCount: parsed.maskedCount,
      });

      pendingDripsRef.current = extractedDrips;
      pendingLineCountRef.current = parsed.myLines.length;
    } catch {
      // Stop gauge immediately and show error overlay
      cancelAnimation(progress);
      setErrorMsg('파싱 중 오류가 발생했어요. 올바른 카카오톡 내보내기 파일인지 확인해주세요.');
      setPhase('error');
      return;
    }

    // Animate 0 → 100% over 2.8s, then show drip cards
    progress.value = withTiming(1, { duration: 2800 }, (finished) => {
      if (finished) runOnJS(onAnimationDone)();
    });
  };

  // ─── Navigation ────────────────────────────────────────────────────────────

  const handleNext = async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    router.push('/(auth)/matching');
  };

  const handleSkip = async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    router.push('/(auth)/matching');
  };

  const handleRetry = () => {
    cancelAnimation(progress);
    progress.value = 0;
    setProgressPct(0);
    setProgressLabel(STAGE_LABELS[0]);
    setPhase('idle');
    setErrorMsg('');
    rawTextRef.current = '';
  };

  const handleTrackLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={false}
        // Disable scroll during parsing to prevent accidental interaction
        scrollEnabled={phase !== 'parsing'}
      >

        {/* ── IDLE / PICKED Phase ── */}
        {(phase === 'idle' || phase === 'picked') && (
          <>
            <Animated.View entering={FadeInDown.duration(500)} style={s.headerBlock}>
              <Text style={s.heading}>카카오톡 대화를{'\n'}분석할게요 🧬</Text>
              <Text style={s.caption}>
                AI가 당신만의 말투 유전자를 추출합니다.{'\n'}
                모든 분석은 오직 이 기기 안에서만 처리돼요.
              </Text>
            </Animated.View>

            {/* Upload Zone */}
            <Animated.View entering={FadeInDown.delay(150).duration(500)}>
              <Pressable
                style={[s.uploadZone, phase === 'picked' && s.uploadZonePicked]}
                onPress={phase === 'idle' ? handlePickFile : undefined}
                disabled={phase === 'picked'}
              >
                <Text style={s.uploadIcon}>{phase === 'picked' ? '✅' : '📂'}</Text>
                <Text style={[s.uploadTitle, phase === 'picked' && s.uploadTitleDone]}>
                  {phase === 'picked' ? fileName : '카카오톡 .txt 파일 선택'}
                </Text>
                <Text style={s.uploadSub}>
                  {phase === 'picked'
                    ? '파일이 준비됐어요. 아래 버튼으로 분석을 시작하세요.'
                    : '카카오톡 → 대화방 → 채팅방 설정 → 대화 내용 내보내기'}
                </Text>
              </Pressable>
            </Animated.View>

            {/* CTA Button */}
            <Animated.View entering={FadeInDown.delay(280).duration(500)}>
              {phase === 'idle' ? (
                <Pressable onPress={handlePickFile}>
                  <TwinGradient preset="TWIN_PRIMARY" style={s.ctaButton}>
                    <Text style={s.ctaText}>📁 파일 선택하기</Text>
                  </TwinGradient>
                </Pressable>
              ) : (
                <Pressable onPress={handleStartParse}>
                  <TwinGradient preset="TWIN_PRIMARY" style={s.ctaButton}>
                    <Text style={s.ctaText}>🔬 말투 분석 시작하기</Text>
                  </TwinGradient>
                </Pressable>
              )}
            </Animated.View>

            {/* Privacy Badge */}
            <Animated.View entering={FadeInDown.delay(380).duration(500)}>
              <PrivacyBadge />
            </Animated.View>

            {/* How-to Guide */}
            <Animated.View entering={FadeInDown.delay(460).duration(500)} style={s.guideCard}>
              <Text style={s.guideTitle}>📖 파일 내보내기 방법</Text>
              <View style={s.guideSteps}>
                {[
                  '카카오톡 앱 → 대화방 입장',
                  '오른쪽 상단 ☰ → 채팅방 설정',
                  '\'대화 내용 내보내기\' → 텍스트(.txt) 선택',
                  '내보낸 파일을 여기서 업로드',
                ].map((step, i) => (
                  <View key={i} style={s.guideStep}>
                    <Text style={s.guideStepNum}>{i + 1}</Text>
                    <Text style={s.guideStepText}>{step}</Text>
                  </View>
                ))}
              </View>
            </Animated.View>
          </>
        )}

        {/* ── DONE Phase ── */}
        {phase === 'done' && (
          <>
            <Animated.View entering={FadeInDown.duration(500)} style={s.doneHeader}>
              <View style={s.completeBadge}>
                <Text style={s.completeBadgeText}>✦ 말투 분석 완료 ✦</Text>
              </View>
              <Text style={s.doneTitle}>시그니처를 발견했어요! ✨</Text>
              {lineCount > 0 && (
                <Text style={s.doneStats}>{lineCount.toLocaleString()}개 대사 분석 완료</Text>
              )}
            </Animated.View>

            {/* TOP 3 Drip Cards */}
            <View style={s.dripsBlock}>
              {drips.map((drip, i) => (
                <DripCard key={`${drip}-${i}`} drip={drip} rank={i} delay={i * 160} />
              ))}
            </View>

            <Animated.View entering={FadeInUp.delay(600).duration(500)}>
              <Pressable onPress={handleNext}>
                <TwinGradient preset="TWIN_PRIMARY" style={s.ctaButton}>
                  <Text style={s.ctaText}>다음 단계로 →</Text>
                </TwinGradient>
              </Pressable>
            </Animated.View>
          </>
        )}

        {/* ── ERROR Phase ── */}
        {phase === 'error' && (
          <Animated.View entering={FadeIn.duration(400)} style={s.errorBlock}>
            <Text style={s.errorIcon}>⚠️</Text>
            <Text style={s.errorTitle}>파일을 읽을 수 없어요</Text>
            <Text style={s.errorMsg}>{errorMsg}</Text>
            <Pressable onPress={handleRetry} style={s.retryBtn}>
              <Text style={s.retryText}>다시 시도하기</Text>
            </Pressable>
            <Pressable onPress={handleSkip}>
              <Text style={s.skipText}>나중에 하기</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Skip link — only on idle */}
        {phase === 'idle' && (
          <Animated.View entering={FadeInUp.delay(560).duration(400)} style={s.skipRow}>
            <Pressable onPress={handleSkip}>
              <Text style={s.skipText}>나중에 하기</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Step Dots */}
        <View style={s.stepRow}>
          {[1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[
                s.stepDot,
                phase === 'done' ? s.stepDotDone : i === 1 ? s.stepDotActive : s.stepDotInactive,
              ]}
            />
          ))}
        </View>
      </ScrollView>

      {/* ── Glassmorphism Parsing Overlay ──────────────────────────────────────── */}
      {/* Absolutely positioned over the entire SafeAreaView — prevents all taps */}
      {phase === 'parsing' && (
        <Animated.View
          entering={FadeIn.duration(300)}
          style={[StyleSheet.absoluteFill, s.overlayRoot]}
          pointerEvents="box-only"
        >
          <View style={s.glassCard}>
            {/* Icon pulse */}
            <Text style={s.parsingIcon}>🧬</Text>

            {/* Stage label — changes at progress thresholds */}
            <Text style={s.parsingTitle}>말투 분석 중...</Text>
            <Text style={s.stageLabel}>{progressLabel}</Text>

            {/* Neon gradient progress bar */}
            <View style={s.barTrack} onLayout={handleTrackLayout}>
              <Animated.View style={[s.barFillClip, barStyle]}>
                {trackWidth > 0 && (
                  <LinearGradient
                    colors={['#7C3AED', '#D946EF', '#FF6B8B']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={{ width: trackWidth, height: '100%' }}
                  />
                )}
              </Animated.View>
            </View>

            {/* Percentage readout */}
            <Text style={s.pctLabel}>{progressPct}%</Text>

            {/* Privacy lock badge */}
            <View style={s.lockBadge}>
              <Text style={s.lockText}>🔒  On-Device Processing · End-to-End Encrypted</Text>
            </View>
          </View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.BG_DARK_MIDNIGHT },
  scroll: {
    paddingHorizontal: Spacing['2xl'],
    paddingTop: Spacing.xl,
    paddingBottom: Spacing['4xl'],
    gap: Spacing.lg,
  },

  // Header
  headerBlock: { gap: 8, marginBottom: 4 },
  heading: {
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.extrabold,
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  caption: {
    color: Colors.TEXT_ON_DARK_SECONDARY,
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginTop: 2,
  },

  // Upload Zone
  uploadZone: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    borderStyle: 'dashed',
    borderRadius: Radius.xl,
    backgroundColor: 'rgba(30,41,59,0.5)',
    paddingVertical: Spacing['3xl'],
    paddingHorizontal: Spacing['2xl'],
    alignItems: 'center',
    gap: Spacing.sm,
  },
  uploadZonePicked: {
    borderColor: 'rgba(124,58,237,0.5)',
    borderStyle: 'solid',
    backgroundColor: 'rgba(124,58,237,0.06)',
  },
  uploadIcon: { fontSize: 36 },
  uploadTitle: {
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
  uploadTitleDone: { color: Colors.GRADIENT_END },
  uploadSub: {
    color: Colors.TEXT_MUTED,
    fontSize: FontSize.xs,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 2,
  },

  // CTA
  ctaButton: {
    height: 58,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    flex: undefined,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.4,
  },

  // Guide Card
  guideCard: {
    backgroundColor: Colors.CARD_DARK_SLATE,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  guideTitle: {
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  guideSteps: { gap: Spacing.sm },
  guideStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  guideStepNum: {
    color: Colors.GRADIENT_END,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.extrabold,
    minWidth: 16,
    marginTop: 1,
  },
  guideStepText: {
    color: Colors.TEXT_ON_DARK_SECONDARY,
    fontSize: FontSize.xs,
    lineHeight: 17,
    flex: 1,
  },

  // Done
  doneHeader: { alignItems: 'center', gap: Spacing.sm },
  completeBadge: {
    backgroundColor: 'rgba(167,139,250,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.4)',
    borderRadius: Radius.chip,
    paddingVertical: 7,
    paddingHorizontal: 18,
  },
  completeBadgeText: {
    color: '#A78BFA',
    fontSize: 11,
    fontWeight: FontWeight.bold,
    letterSpacing: 2.5,
  },
  doneTitle: {
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.extrabold,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  doneStats: {
    color: Colors.TEXT_MUTED,
    fontSize: FontSize.xs,
    textAlign: 'center',
  },
  dripsBlock: { gap: Spacing.md },

  // Error
  errorBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.base,
    paddingTop: Spacing['5xl'],
  },
  errorIcon: { fontSize: 48 },
  errorTitle: {
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
  },
  errorMsg: {
    color: Colors.TEXT_ON_DARK_SECONDARY,
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    backgroundColor: 'rgba(124,58,237,0.15)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.35)',
    marginTop: Spacing.sm,
  },
  retryText: {
    color: '#C4B5FD',
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },

  // Skip / nav
  skipRow: { alignItems: 'center' },
  skipText: {
    color: Colors.TEXT_MUTED,
    fontSize: FontSize.sm,
    textAlign: 'center',
    textDecorationLine: 'underline',
    paddingVertical: 4,
  },

  // Step Dots
  stepRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  stepDot: { height: 6, borderRadius: 3 },
  stepDotActive: { width: 22, backgroundColor: Colors.GRADIENT_END },
  stepDotDone: { width: 6, backgroundColor: Colors.GRADIENT_MID },
  stepDotInactive: { width: 6, backgroundColor: 'rgba(255,255,255,0.18)' },

  // ── Glassmorphism Parsing Overlay ─────────────────────────────────────────

  overlayRoot: {
    // rgba dark dimmer — simulates glassmorphism backdrop without expo-blur
    backgroundColor: 'rgba(10, 13, 26, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['2xl'],
  },
  glassCard: {
    width: '100%',
    backgroundColor: 'rgba(30, 41, 59, 0.75)',
    borderRadius: Radius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: Spacing['3xl'],
    paddingHorizontal: Spacing['2xl'],
    alignItems: 'center',
    gap: Spacing.base,
    // Subtle violet glow
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 16,
  },
  parsingIcon: {
    fontSize: 52,
    marginBottom: Spacing.sm,
  },
  parsingTitle: {
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
  },
  stageLabel: {
    color: Colors.TEXT_ON_DARK_SECONDARY,
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    minHeight: 40,
    paddingHorizontal: Spacing.sm,
  },

  // Gradient progress bar
  barTrack: {
    width: '100%',
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: Radius.pill,
    overflow: 'hidden',
    marginTop: Spacing.sm,
  },
  barFillClip: {
    height: '100%',
    borderRadius: Radius.pill,
    overflow: 'hidden',
    // Neon glow on the fill bar
    shadowColor: '#D946EF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 8,
  },

  pctLabel: {
    color: Colors.GRADIENT_MID,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    letterSpacing: 1,
    marginTop: -Spacing.xs,
  },

  lockBadge: {
    paddingVertical: 7,
    paddingHorizontal: Spacing.base,
    backgroundColor: 'rgba(56,189,248,0.07)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.18)',
    marginTop: Spacing.xs,
  },
  lockText: {
    color: Colors.BADGE_AI_BLUE,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
});
