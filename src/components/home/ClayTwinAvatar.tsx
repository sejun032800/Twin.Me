// ─── 점토 성장 4단계 트윈 아바타 (§1.3) ─────────────────────────────────────
// 0 무정형 점토 → 1 쿠키 실루엣 → 2 입체화 → 3 나의 트윈.
// pulseSignal이 증가할 때마다 "빛 입자를 흡수하며 부푸는" 리액션을 재생한다.

import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { AuraVector, ClayStage } from '../../types/genesis';
import { auraChannelToCss } from '../../engine/auraEngine';
import { Colors, Gradients } from '../../styles/theme';

interface Props {
  stage: ClayStage;
  pulseSignal?: number;
  auraVector?: AuraVector | null;
  size?: number;
}

const STAGE_META: Record<ClayStage, { emoji: string; label: string }> = {
  0: { emoji: '🫧', label: '무정형 점토' },
  1: { emoji: '🐣', label: '쿠키 실루엣' },
  2: { emoji: '✨', label: '입체화' },
  3: { emoji: '🤖', label: '나의 트윈' },
};

export default function ClayTwinAvatar({ stage, pulseSignal = 0, auraVector, size = 116 }: Props) {
  const scale = useSharedValue(1);
  const stageScale = useSharedValue(0.7 + stage * 0.1);

  useEffect(() => {
    // 빛 입자 흡수 리액션 — 답변이 accept될 때마다 살짝 부풀었다 가라앉음
    scale.value = withSequence(
      withTiming(1.16, { duration: 180, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 8, stiffness: 160 }),
    );
  }, [pulseSignal]);

  useEffect(() => {
    stageScale.value = withSpring(0.7 + stage * 0.1, { damping: 12, stiffness: 140 });
  }, [stage]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * stageScale.value }],
  }));

  const meta = STAGE_META[stage];
  const gradientColors: readonly [string, string, ...string[]] =
    stage >= 3 && auraVector
      ? ([
          auraChannelToCss(auraVector.meshStops[0]),
          auraChannelToCss(auraVector.meshStops[Math.floor(auraVector.meshStops.length / 2)]),
          auraChannelToCss(auraVector.meshStops[auraVector.meshStops.length - 1]),
        ] as const)
      : stage >= 2
      ? Gradients.TWIN_PRIMARY.colors
      : (['rgba(148,163,184,0.35)', 'rgba(100,116,139,0.35)'] as const);

  return (
    <View style={[styles.wrapper, { width: size, height: size }]}>
      <Animated.View style={[containerStyle, { width: size, height: size }]}>
        <LinearGradient
          colors={gradientColors}
          start={Gradients.TWIN_PRIMARY.start}
          end={Gradients.TWIN_PRIMARY.end}
          style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }]}
        >
          <View
            style={[
              styles.inner,
              {
                width: size - 6,
                height: size - 6,
                borderRadius: (size - 6) / 2,
                backgroundColor: stage === 0 ? 'rgba(30,35,55,0.9)' : Colors.CARD_DARK_SLATE,
                borderWidth: stage === 1 ? 1.5 : 0,
                borderStyle: stage === 1 ? 'dashed' : 'solid',
                borderColor: 'rgba(226,232,240,0.4)',
              },
            ]}
          >
            <Text style={{ fontSize: size * 0.42 }}>{meta.emoji}</Text>
          </View>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', justifyContent: 'center' },
  ring: { padding: 3, alignItems: 'center', justifyContent: 'center' },
  inner: { alignItems: 'center', justifyContent: 'center' },
});
