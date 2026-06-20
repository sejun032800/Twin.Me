import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useAppContext } from '../../context/AppContext';
import {
  FALLBACK_MOOD_TAGS,
  PartnerAiMoodTag,
  syncPartnerAiMoodTags,
} from '../../services/partnerMoodService';
import {
  Colors,
  FontSize,
  FontWeight,
  Radius,
  Spacing,
  ThemeTokens,
} from '../../styles/theme';

// ── Animated TextInput for UI-thread number rolling ───────────────────────────
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

// ── Temperature engine ────────────────────────────────────────────────────────
// Piecewise linear: score 0→50 maps to 10.0→36.5°C, score 50→100 maps to 36.5→99.9°C
function convertToTemperature(score: number): number {
  const s = Math.max(0, Math.min(100, score));
  return s <= 50
    ? 10.0 + (s / 50) * 26.5
    : 36.5 + ((s - 50) / 50) * 63.4;
}

// Normalise temperature to [0,1] gauge fill ratio
function tempToFillRatio(temp: number): number {
  return Math.max(0, Math.min(1, (temp - 10.0) / 89.9));
}

// ── Zone configuration ────────────────────────────────────────────────────────
interface ZoneConfig {
  label: string;
  emoji: string;
  hex: string;
  rgb: string; // "R,G,B" for rgba() usage
}

const ZONE_COLD: ZoneConfig = { label: '냉전기', emoji: '🧊', hex: '#38BDF8', rgb: '56,189,248'  };
const ZONE_WARM: ZoneConfig = { label: '안정적', emoji: '💙', hex: '#7C3AED', rgb: '124,58,237'  };
const ZONE_HOT:  ZoneConfig = { label: '열정적', emoji: '🔥', hex: '#FF6B8B', rgb: '255,107,139' };

function getZone(temp: number): ZoneConfig {
  if (temp < 30)  return ZONE_COLD;
  if (temp <= 50) return ZONE_WARM;
  return ZONE_HOT;
}

// ── Delta text builder ────────────────────────────────────────────────────────
function buildDeltaInfo(
  deltaT: number,
  isLight: boolean,
): { text: string; color: string } {
  const abs = Math.abs(deltaT).toFixed(1);
  if (deltaT > 0.05) {
    return {
      text: `지난주보다 ${abs}°C 상승했어요! 📈`,
      color: isLight ? '#D946EF' : '#FF6B8B',
    };
  }
  if (deltaT < -0.05) {
    return {
      text: `지난주보다 ${abs}°C 하락했어요... 📉`,
      color: '#38BDF8',
    };
  }
  return {
    text: '지난주와 동일하게 온도를 유지 중이에요! 💎',
    color: isLight ? '#7C3AED' : '#34D399',
  };
}

// ── Neon palette for mood chips ───────────────────────────────────────────────
const NEON_RGB: Record<PartnerAiMoodTag['type'], [number, number, number]> = {
  romantic:  [255, 107, 139],
  sensitive: [250, 204,  21],
  cozy:      [ 52, 211, 153],
  warning:   [248, 113, 113],
};

function chipNeonStyle(
  type: PartnerAiMoodTag['type'],
  intensity: number,
  isLight: boolean,
) {
  const [r, g, b] = NEON_RGB[type];
  return {
    borderColor:     `rgba(${r},${g},${b},${isLight ? 0.50 : 0.55 + intensity * 0.45})`,
    backgroundColor: `rgba(${r},${g},${b},${isLight ? 0.09 : 0.11 + intensity * 0.10})`,
    shadowColor:     `rgb(${r},${g},${b})`,
    shadowOffset:    { width: 0, height: 0 } as const,
    shadowOpacity:   isLight ? 0 : 0.28 + intensity * 0.48,
    shadowRadius:    isLight ? 0 : 5 + intensity * 7,
    elevation:       isLight ? 0 : Math.ceil(intensity * 5),
  };
}

interface Props {
  partnerName: string;
  t: ThemeTokens;
}

const POLL_MS = 30_000;

export default function MoodTemperatureSection({ partnerName, t }: Props) {
  const { coupleId, partnerAiMood, setPartnerAiMood, weeklyMetrics } = useAppContext();
  const [isLoading, setIsLoading] = useState(true);

  // ── Derived temperature values (JS-level, not animated) ───────────────────
  const currentTemp = useMemo(
    () => convertToTemperature(weeklyMetrics.currentScore),
    [weeklyMetrics.currentScore],
  );
  const prevTemp = useMemo(
    () => convertToTemperature(weeklyMetrics.prevScore),
    [weeklyMetrics.prevScore],
  );
  const deltaTemp = currentTemp - prevTemp;
  const zone      = getZone(currentTemp);
  const deltaInfo = buildDeltaInfo(deltaTemp, t.isLight);
  const fillRatio = tempToFillRatio(currentTemp);
  const gaugePct  = Math.round(fillRatio * 100);

  // ── Reanimated shared values ───────────────────────────────────────────────
  const gaugeProgress = useSharedValue(0);
  const displayTemp   = useSharedValue(10.0);
  const dotOpacity    = useSharedValue(1);

  // Kick off thermometer fill + rolling counter on mount / metrics change
  useEffect(() => {
    gaugeProgress.value = withTiming(fillRatio, {
      duration: 1800,
      easing: Easing.out(Easing.cubic),
    });
    displayTemp.value = withTiming(currentTemp, {
      duration: 1800,
      easing: Easing.out(Easing.cubic),
    });
  }, [currentTemp, fillRatio]);

  // Pulsing live dot for mood section
  useEffect(() => {
    dotOpacity.value = withRepeat(
      withSequence(
        withTiming(0.2, { duration: 900 }),
        withTiming(1.0, { duration: 900 }),
      ),
      -1,
      false,
    );
  }, []);

  // ── Animated styles / props ────────────────────────────────────────────────
  const gaugeBarStyle = useAnimatedStyle(() => ({
    width: `${gaugeProgress.value * 100}%` as any,
  }));

  const animatedTempProps = useAnimatedProps(
    () => ({
      text: `${displayTemp.value.toFixed(1)}°C`,
      defaultValue: `${currentTemp.toFixed(1)}°C`,
    } as any),
  );

  const dotStyle = useAnimatedStyle(() => ({ opacity: dotOpacity.value }));

  // ── A2A mood sync ──────────────────────────────────────────────────────────
  const fetchTags = useCallback(
    async (signal?: AbortSignal) => {
      const tags = await syncPartnerAiMoodTags(coupleId, signal);
      setPartnerAiMood(tags);
      setIsLoading(false);
    },
    [coupleId],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchTags(controller.signal);
    const timer = setInterval(() => fetchTags(controller.signal), POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [fetchTags]);

  const displayTags = partnerAiMood.length > 0 ? partnerAiMood : FALLBACK_MOOD_TAGS;

  // ── Zone-aware card styling ────────────────────────────────────────────────
  const cardStyle = {
    backgroundColor: t.isLight
      ? 'rgba(255,255,255,0.80)'
      : 'rgba(30,41,59,0.80)',
    borderColor: `rgba(${zone.rgb},${t.isLight ? 0.22 : 0.35})`,
    shadowColor: zone.hex,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: t.isLight ? 0.10 : 0.32,
    shadowRadius: 14,
    elevation: t.isLight ? 2 : 6,
  };

  return (
    <View style={styles.container}>
      {/* ── 오늘의 분위기 ──────────────────────────────────────────────────── */}
      <View style={styles.moodBlock}>
        <View style={styles.headerRow}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>오늘의 분위기</Text>
          <View style={styles.liveBadge}>
            <Animated.View style={[styles.liveDot, dotStyle]} />
            <Text style={styles.liveText}>AI 실시간</Text>
          </View>
        </View>

        <Text style={[styles.partnerSub, { color: t.textSecondary }]}>
          {partnerName}님의 현재 맥락
          {isLoading ? ' · 동기화 중…' : null}
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          decelerationRate="fast"
        >
          {displayTags.map((tag, index) => (
            <Animated.View
              key={tag.id}
              entering={FadeInDown.delay(index * 65).springify().damping(16)}
              exiting={FadeOutUp.duration(180)}
            >
              <View
                style={[
                  styles.chip,
                  chipNeonStyle(tag.type, tag.intensity, t.isLight),
                ]}
              >
                <Text style={[styles.chipText, { color: t.text }]}>{tag.text}</Text>
              </View>
            </Animated.View>
          ))}
        </ScrollView>
      </View>

      {/* ── 우리 관계의 온도 카드 ─────────────────────────────────────────── */}
      <View style={[styles.tempCard, cardStyle]}>
        {/* Top shimmer line */}
        <LinearGradient
          colors={t.gradientColors}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.shimmerLine}
        />

        <View style={styles.tempContent}>
          <View style={styles.tempInfo}>
            <Text style={[styles.tempLabel, { color: t.textSecondary }]}>
              우리 관계의 온도
            </Text>

            {/* Rolling temperature counter + zone label */}
            <View style={styles.tempValueRow}>
              <AnimatedTextInput
                animatedProps={animatedTempProps}
                editable={false}
                caretHidden
                underlineColorAndroid="transparent"
                style={[styles.tempValueInput, { color: zone.hex }]}
              />
              <Text style={[styles.tempZoneLabel, { color: zone.hex }]}>
                {zone.label} {zone.emoji}
              </Text>
            </View>

            {/* Dynamic delta text */}
            <Text style={[styles.tempDelta, { color: deltaInfo.color }]}>
              {deltaInfo.text}
            </Text>
          </View>

          {/* Heart circle — zone gradient overlay */}
          <LinearGradient
            colors={t.gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heartCircle}
          >
            <Text style={styles.heartEmoji}>💜</Text>
          </LinearGradient>
        </View>

        {/* ── Thermometer gauge bar ─────────────────────────────────────── */}
        <View style={styles.gaugeRow}>
          <Text style={styles.gaugeIcon}>🌡️</Text>
          <View style={[styles.gaugeTrack, { backgroundColor: t.isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' }]}>
            <Animated.View
              style={[
                styles.gaugeFill,
                gaugeBarStyle,
                { backgroundColor: zone.hex },
              ]}
            />
          </View>
          <Text style={[styles.gaugePct, { color: t.textMuted }]}>{gaugePct}%</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.base,
    gap: Spacing.md,
  },

  // ── 분위기 ────────────────────────────────────────────────────────────────
  moodBlock: {
    gap: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(56,189,248,0.10)',
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.25)',
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.BADGE_AI_BLUE,
  },
  liveText: {
    color: Colors.BADGE_AI_BLUE,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  partnerSub: {
    fontSize: FontSize.sm,
  },
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

  // ── 온도 카드 ──────────────────────────────────────────────────────────────
  tempCard: {
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    padding: Spacing.base,
    gap: Spacing.md,
  },
  shimmerLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    opacity: 0.80,
  },
  tempContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.xs,
  },
  tempInfo: {
    flex: 1,
    gap: 4,
  },
  tempLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  tempValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 2,
  },
  tempValueInput: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.extrabold,
    letterSpacing: -0.3,
    padding: 0,
    margin: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    minWidth: 80,
    // Neon text shadow for glow effect
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 0 },
    textShadowColor: 'transparent', // overridden inline via zone color
  },
  tempZoneLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    marginBottom: 1,
  },
  tempDelta: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    marginTop: 2,
  },
  heartCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.md,
  },
  heartEmoji: {
    fontSize: 24,
  },

  // ── 온도계 게이지 ──────────────────────────────────────────────────────────
  gaugeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  gaugeIcon: {
    fontSize: 14,
  },
  gaugeTrack: {
    flex: 1,
    height: 6,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
  gaugePct: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    minWidth: 30,
    textAlign: 'right',
  },
});
