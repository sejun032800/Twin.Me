import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useAppContext } from '../../context/AppContext';
import {
  FontSize,
  FontWeight,
  Radius,
  Shadows,
  Spacing,
  ThemeTokens,
} from '../../styles/theme';

interface Props {
  t: ThemeTokens;
}

// ── Calculation Engines ────────────────────────────────────────────────────────

type DensityLabel = 'Low' | 'Medium' | 'High' | 'Intense';

/**
 * Returns 0–1 chat density fill and a tier label from weekly conversation data.
 * Weights: message volume 50% + reply speed 30% + hourly frequency 20%.
 */
function calculateChatDensity(
  weeklyMessageCount: number,
  avgReplyTimeMin: number,
  hourlyFrequency?: number,
): { fill: number; label: DensityLabel } {
  const msgs = Math.max(0, weeklyMessageCount ?? 0);
  const reply = Math.max(0.1, avgReplyTimeMin ?? 30);
  const freq = hourlyFrequency ?? msgs / 112; // 7 days × 16 active hours

  const volumeScore = Math.min(msgs / 200, 1);        // 200 msgs/week = saturated
  const speedScore = Math.max(0, 1 - reply / 30);     // <1 min→1.0, 30 min→0.0
  const freqScore = Math.min(freq / 2, 1);            // 2 msgs/hr = saturated

  const fill = Math.min(
    1,
    0.5 * volumeScore + 0.3 * speedScore + 0.2 * freqScore,
  );

  const label: DensityLabel =
    fill >= 0.85 ? 'Intense'
    : fill >= 0.6 ? 'High'
    : fill >= 0.3 ? 'Medium'
    : 'Low';

  return { fill, label };
}

/**
 * Returns 0–100 emotional sync percentage.
 * Weights: sentiment closeness 70% + both-positive level alignment 30%.
 */
function calculateEmotionalSync(
  myScore: number,
  partnerScore: number,
): { pct: number; sublabel: string } {
  const a = Math.max(0, Math.min(100, myScore ?? 50));
  const b = Math.max(0, Math.min(100, partnerScore ?? 50));

  const similarity = 1 - Math.abs(a - b) / 100;
  const levelAlign = (a + b) / 200;
  const pct = Math.round(Math.min(1, similarity * 0.7 + levelAlign * 0.3) * 100);

  const sublabel =
    pct >= 90 ? '소울메이트 수준 ✨'
    : pct >= 75 ? '이번 주 최고 기록 🔥'
    : pct >= 60 ? '좋은 흐름이에요 💕'
    : pct >= 40 ? '감정 맞춰가는 중 🌿'
    : '서로 다른 파장 🌊';

  return { pct, sublabel };
}

// ── Tier display config ────────────────────────────────────────────────────────

const TIERS: { label: DensityLabel; refFill: number; delay: number }[] = [
  { label: 'Intense', refFill: 0.94, delay: 200 },
  { label: 'High',    refFill: 0.72, delay: 300 },
  { label: 'Medium',  refFill: 0.46, delay: 400 },
  { label: 'Low',     refFill: 0.20, delay: 500 },
];

// ── ChatIndexCard ──────────────────────────────────────────────────────────────

function ChatIndexCard({ t }: { t: ThemeTokens }) {
  const { weeklyMetrics } = useAppContext();
  const density = calculateChatDensity(
    weeklyMetrics.weeklyMessageCount,
    weeklyMetrics.avgReplyTimeMin,
  );

  const [trackW, setTrackW] = useState(0);

  // One shared value per tier bar (hooks must not be inside loops)
  const anim0 = useSharedValue(0);
  const anim1 = useSharedValue(0);
  const anim2 = useSharedValue(0);
  const anim3 = useSharedValue(0);

  const style0 = useAnimatedStyle(() => ({ width: anim0.value }));
  const style1 = useAnimatedStyle(() => ({ width: anim1.value }));
  const style2 = useAnimatedStyle(() => ({ width: anim2.value }));
  const style3 = useAnimatedStyle(() => ({ width: anim3.value }));
  const tierAnimStyles = [style0, style1, style2, style3];

  useEffect(() => {
    if (trackW <= 0) return;
    const svs = [anim0, anim1, anim2, anim3];
    TIERS.forEach((tier, i) => {
      // Active tier shows real computed density; others show representative fill
      const targetFill = tier.label === density.label ? density.fill : tier.refFill;
      svs[i].value = withDelay(
        tier.delay,
        withTiming(targetFill * trackW, { duration: 800, easing: Easing.out(Easing.cubic) }),
      );
    });
  }, [trackW, density.fill, density.label, anim0, anim1, anim2, anim3]);

  const trend = density.fill >= 0.6 ? '↑' : density.fill <= 0.3 ? '↓' : '→';

  return (
    <View style={[styles.cardShadow, !t.isLight && Shadows.glow]}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: t.isLight ? 'rgba(255,255,255,0.90)' : 'rgba(30,41,59,0.90)',
            borderColor: t.isLight ? 'rgba(200,160,180,0.35)' : 'rgba(124,58,237,0.50)',
          },
        ]}
      >
        <LinearGradient
          colors={t.gradientColors}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.shimmerLine}
        />
        <Text style={[styles.cardLabel, { color: t.textSecondary }]}>채팅 지수</Text>
        <Text style={[styles.cardValue, { color: t.text }]}>
          {density.label} {trend}
        </Text>

        <View style={styles.levelBars}>
          {TIERS.map((tier, i) => {
            const isActive = tier.label === density.label;
            return (
              <View key={tier.label} style={styles.levelRow}>
                <Text
                  style={[
                    styles.levelText,
                    { color: isActive ? t.text : t.textMuted },
                    isActive && { fontWeight: FontWeight.bold },
                  ]}
                >
                  {tier.label}
                </Text>
                <View
                  style={[styles.barTrack, { backgroundColor: t.divider }]}
                  onLayout={
                    i === 0
                      ? (e: LayoutChangeEvent) =>
                          setTrackW(e.nativeEvent.layout.width)
                      : undefined
                  }
                >
                  {isActive ? (
                    <Animated.View style={[styles.barFill, tierAnimStyles[i]]}>
                      <LinearGradient
                        colors={t.gradientColors}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={StyleSheet.absoluteFill}
                      />
                    </Animated.View>
                  ) : (
                    <Animated.View
                      style={[
                        styles.barFill,
                        tierAnimStyles[i],
                        {
                          backgroundColor: t.isLight
                            ? 'rgba(180,140,160,0.28)'
                            : 'rgba(255,255,255,0.10)',
                        },
                      ]}
                    />
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ── SyncRateCard ───────────────────────────────────────────────────────────────

function SyncRateCard({ t }: { t: ThemeTokens }) {
  const { weeklyMetrics } = useAppContext();
  const sync = calculateEmotionalSync(
    weeklyMetrics.currentScore,
    weeklyMetrics.partnerScore,
  );

  const [trackW, setTrackW] = useState(0);
  const syncAnim = useSharedValue(0);
  const syncBarStyle = useAnimatedStyle(() => ({ width: syncAnim.value }));

  useEffect(() => {
    if (trackW <= 0) return;
    syncAnim.value = withDelay(
      500,
      withTiming((sync.pct / 100) * trackW, {
        duration: 1000,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [trackW, sync.pct, syncAnim]);

  return (
    <View style={[styles.cardShadow, !t.isLight && Shadows.glow]}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: t.isLight ? 'rgba(255,255,255,0.90)' : 'rgba(30,41,59,0.90)',
            borderColor: t.isLight ? 'rgba(200,160,180,0.35)' : 'rgba(124,58,237,0.50)',
          },
        ]}
      >
        <LinearGradient
          colors={t.gradientColors}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.shimmerLine}
        />
        <Text style={[styles.cardLabel, { color: t.textSecondary }]}>감정 싱크로율</Text>
        <Text style={[styles.syncBigValue, { color: t.text }]}>{sync.pct}%</Text>
        <View
          style={[styles.syncTrack, { backgroundColor: t.divider }]}
          onLayout={(e: LayoutChangeEvent) =>
            setTrackW(e.nativeEvent.layout.width)
          }
        >
          <Animated.View style={[styles.syncFill, syncBarStyle]}>
            <LinearGradient
              colors={t.gradientColors}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>
        <Text style={[styles.syncSub, { color: t.textMuted }]}>{sync.sublabel}</Text>
      </View>
    </View>
  );
}

// ── Export ─────────────────────────────────────────────────────────────────────

export default function MetricsGrid({ t }: Props) {
  return (
    <View style={styles.container}>
      <ChatIndexCard t={t} />
      <SyncRateCard t={t} />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.base,
    gap: Spacing.md,
  },
  // Shadow wrapper: overflow visible so the glow bleeds outside card bounds
  cardShadow: {
    flex: 1,
    borderRadius: Radius.xl,
  },
  // Inner card: overflow hidden to clip shimmer line & gradient bars
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  shimmerLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    opacity: 0.7,
  },
  cardLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    marginTop: 4,
  },
  cardValue: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.extrabold,
  },
  levelBars: {
    gap: 7,
    marginTop: 2,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  levelText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    width: 44,
  },
  barTrack: {
    flex: 1,
    height: 5,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  syncBigValue: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.extrabold,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  syncTrack: {
    width: '100%',
    height: 8,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    marginTop: 2,
  },
  syncFill: {
    height: '100%',
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  syncSub: {
    fontSize: FontSize.xs,
  },
});
