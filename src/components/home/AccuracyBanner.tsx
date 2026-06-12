import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  Colors,
  FontSize,
  FontWeight,
  Gradients,
  Radius,
  Spacing,
  ThemeTokens,
} from '../../styles/theme';

const ACCURACY = 50;

interface Props {
  myName: string;
  onDismiss: () => void;
  t: ThemeTokens;
}

export default function AccuracyBanner({ myName, onDismiss, t }: Props) {
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

  // 인터뷰 완료 시 배너가 연기처럼 증발하는 연출
  const handleInterviewPress = () => {
    dismissOpacity.value = withTiming(0, { duration: 480, easing: Easing.in(Easing.quad) });
    dismissTranslateY.value = withTiming(-24, { duration: 460, easing: Easing.out(Easing.quad) });
    dismissScale.value = withTiming(0.88, { duration: 460, easing: Easing.in(Easing.quad) });
    setTimeout(onDismiss, 500);
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
            <Text style={[styles.accuracyText, { color: t.text }]}>{ACCURACY}%</Text>
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

      <View style={[styles.gaugeTrack, { backgroundColor: t.divider }]}>
        <LinearGradient
          colors={t.gradientColors}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.gaugeFill, { width: `${ACCURACY}%` }]}
        />
      </View>

      <Text style={[styles.nudge, { color: t.textMuted }]}>
        ⚡ 10분 인터뷰로 정확도 95% 올리기
      </Text>
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
    lineHeight: 24,
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
  },
  nudge: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: 2,
  },
});
