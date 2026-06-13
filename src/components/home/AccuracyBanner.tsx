import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { TrainingResult, useAppContext } from '../../context/AppContext';
import InterviewCallModal from './InterviewCallModal';
import {
  Colors,
  FontSize,
  FontWeight,
  Gradients,
  Radius,
  Spacing,
  ThemeTokens,
} from '../../styles/theme';

// ── Scoring weights ────────────────────────────────────────────────────────────
// W_BASE:        30%  — account created + basic profile filled
// W_KAKAO_MAX:   45%  — from KakaoTalk chat analysis (proportional to message volume)
// W_INTERVIEW:   20%  — 10-min AI interview completed
// Hard ceiling:  95%  — 100% is reserved for full multi-source AI confidence
const W_BASE = 30;
const W_KAKAO_MAX = 45;
const W_INTERVIEW = 20;
// Own-message count at which the kakao score reaches its maximum weight
const KAKAO_LINE_SATURATION = 2000;

/**
 * Derives a real-time accuracy score [0, 95] from onboarding pipeline state.
 *
 * Priority chain:
 *  1. Base weight (always granted once profile is in context)
 *  2. Kakao weight: full parse result → proportional by myLineCount;
 *                   file loaded but not parsed → flat 40% of max (progress proxy)
 *  3. Interview weight: binary on/off
 */
function calculateRealtimeAccuracy(
  trainingResult: TrainingResult | null,
  rawKakaoText: string | null,
  hasCompletedInterview: boolean,
): number {
  let score = W_BASE;

  if (trainingResult !== null && trainingResult.myLineCount > 0) {
    // Full parse complete — scale linearly up to saturation, then clamp
    const ratio = Math.min(1, trainingResult.myLineCount / KAKAO_LINE_SATURATION);
    score += ratio * W_KAKAO_MAX;
  } else if (rawKakaoText !== null && rawKakaoText.length > 0) {
    // File is loaded in memory but parsing hasn't finished yet — partial credit
    score += W_KAKAO_MAX * 0.4;
  }

  if (hasCompletedInterview) {
    score += W_INTERVIEW;
  }

  return Math.min(95, Math.max(0, Math.round(score)));
}

// Reanimated-powered TextInput lets us animate text on the UI thread
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface Props {
  myName: string;
  onDismiss: () => void;
  t: ThemeTokens;
}

export default function AccuracyBanner({ myName, onDismiss, t }: Props) {
  const { trainingResult, rawKakaoText, hasCompletedInterview, setHasCompletedInterview } =
    useAppContext();
  const [showInterviewModal, setShowInterviewModal] = useState(false);

  const targetAccuracy = useMemo(
    () => calculateRealtimeAccuracy(trainingResult, rawKakaoText, hasCompletedInterview),
    [trainingResult, rawKakaoText, hasCompletedInterview],
  );

  // Animated values
  const animatedCount = useSharedValue(0);
  const breathProgress = useSharedValue(0);
  const dismissOpacity = useSharedValue(1);
  const dismissTranslateY = useSharedValue(0);
  const dismissScale = useSharedValue(1);

  // Counter: reset to 0 and count up to targetAccuracy whenever it changes
  useEffect(() => {
    animatedCount.value = 0;
    animatedCount.value = withTiming(targetAccuracy, {
      duration: 1600,
      easing: Easing.out(Easing.cubic),
    });
  }, [targetAccuracy]);

  // Breathing border glow (independent loop)
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

  // Animated text props — drives the UI-thread counter text
  const animatedTextProps = useAnimatedProps(
    () =>
      ({
        text: `${Math.round(animatedCount.value)}%`,
        defaultValue: `${targetAccuracy}%`,
      } as any),
  );

  // Gauge fill width — runs on UI thread alongside counter
  const gaugeStyle = useAnimatedStyle(() => ({
    width: `${animatedCount.value}%` as any,
  }));

  const borderAnim = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      breathProgress.value,
      [0, 1],
      ['rgba(124,58,237,0.2)', 'rgba(124,58,237,0.9)'],
    ),
    shadowOpacity: breathProgress.value * 0.5,
  }));

  const dissolveAnim = useAnimatedStyle(() => ({
    opacity: dismissOpacity.value,
    transform: [
      { translateY: dismissTranslateY.value },
      { scale: dismissScale.value },
    ],
  }));

  // Open the interview modal instead of dismissing
  const handleInterviewPress = () => {
    setShowInterviewModal(true);
  };

  // Called when the voice interview completes successfully
  const handleInterviewCompleted = () => {
    setHasCompletedInterview(true);
    // Dissolve the banner upward (same animation as before, now post-interview)
    dismissOpacity.value = withTiming(0, { duration: 480, easing: Easing.in(Easing.quad) });
    dismissTranslateY.value = withTiming(-24, { duration: 460, easing: Easing.out(Easing.quad) });
    dismissScale.value = withTiming(0.88, { duration: 460, easing: Easing.in(Easing.quad) });
    setTimeout(onDismiss, 500);
  };

  // Called when the modal finishes closing (accept or decline)
  const handleModalClose = () => {
    setShowInterviewModal(false);
  };

  return (
    <Animated.View style={[styles.wrapper, borderAnim, dissolveAnim, { backgroundColor: t.card }]}>
      <View style={styles.topRow}>
        <View style={styles.left}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <View>
            <Text style={[styles.subtitle, { color: t.textSecondary }]}>
              현재 {myName} AI 정확도
            </Text>
            {/* AnimatedTextInput renders the animated counter on the UI thread */}
            <AnimatedTextInput
              animatedProps={animatedTextProps}
              editable={false}
              underlineColorAndroid="transparent"
              style={[styles.accuracyText, { color: Colors.GRADIENT_START }]}
            />
          </View>
        </View>

        <Pressable
          onPress={handleInterviewPress}
          style={styles.btn}
          android_ripple={{ color: 'rgba(255,255,255,0.1)', borderless: false }}
        >
          <LinearGradient
            colors={t.gradientColors}
            start={Gradients.TWIN_PRIMARY.start}
            end={Gradients.TWIN_PRIMARY.end}
            style={styles.btnInner}
          >
            <Text style={styles.btnText}>🎙️ 95%로 올리기 →</Text>
          </LinearGradient>
        </Pressable>
      </View>

      {/* Gauge track */}
      <View style={[styles.gaugeTrack, { backgroundColor: t.divider }]}>
        <Animated.View style={[styles.gaugeFill, gaugeStyle]}>
          <LinearGradient
            colors={t.gradientColors}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>

      <Text style={[styles.nudge, { color: t.textMuted }]}>
        ⚡ 10분 인터뷰로 정확도 95% 올리기
      </Text>

      <InterviewCallModal
        visible={showInterviewModal}
        onCompleted={handleInterviewCompleted}
        onClose={handleModalClose}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: Spacing.base,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    padding: Spacing.md,
    gap: Spacing.sm,
    shadowColor: Colors.GRADIENT_START,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 14,
    elevation: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  warningIcon: { fontSize: 18 },
  subtitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  accuracyText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.extrabold,
    lineHeight: 28,
    // Neon violet — matches brand GRADIENT_START for striking readability
    padding: 0,
    margin: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    minWidth: 60,
  },
  btn: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  btnInner: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    color: '#FFF',
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
    overflow: 'hidden',
  },
  nudge: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: 2,
  },
});
