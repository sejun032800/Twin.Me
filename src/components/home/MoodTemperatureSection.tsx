import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Colors,
  FontSize,
  FontWeight,
  Radius,
  Spacing,
  ThemeTokens,
} from '../../styles/theme';

const MOOD_TAGS = [
  '#오늘부장님잔소리폭발',
  '#당충전시급',
  '#퇴근후치맥땡김',
  '#내일데이트설렘',
  '#피곤해보임',
  '#주말기대중',
];

interface Props {
  partnerName: string;
  t: ThemeTokens;
}

export default function MoodTemperatureSection({ partnerName, t }: Props) {
  const glassCard = {
    backgroundColor: t.isLight
      ? 'rgba(255,255,255,0.72)'
      : 'rgba(30,41,59,0.72)',
    borderColor: t.isLight
      ? 'rgba(200,160,180,0.35)'
      : 'rgba(255,255,255,0.08)',
  };

  return (
    <View style={styles.container}>
      {/* 오늘의 분위기 */}
      <View style={styles.moodBlock}>
        <View style={styles.headerRow}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>오늘의 분위기</Text>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>AI 실시간</Text>
          </View>
        </View>
        <Text style={[styles.partnerSub, { color: t.textSecondary }]}>
          {partnerName}님의 현재 맥락
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          decelerationRate="fast"
        >
          {MOOD_TAGS.map((tag) => (
            <View
              key={tag}
              style={[
                styles.chip,
                { backgroundColor: t.chipBg, borderColor: t.chipBorder },
              ]}
            >
              <Text style={[styles.chipText, { color: t.text }]}>{tag}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* 우리 관계의 온도 카드 */}
      <View style={[styles.tempCard, glassCard]}>
        {/* 글래스모피즘 상단 광택 라인 */}
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
            <Text style={[styles.tempValue, { color: t.text }]}>
              36.5°C 따뜻함 🌡️
            </Text>
            <Text style={[styles.tempDelta, { color: t.gradientColors[0] }]}>
              지난주보다 0.5°C 상승했어요!
            </Text>
          </View>

          <LinearGradient
            colors={t.gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heartCircle}
          >
            <Text style={styles.heartEmoji}>💜</Text>
          </LinearGradient>
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

  // ── 분위기 ──
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
    backgroundColor: 'rgba(56,189,248,0.1)',
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

  // ── 온도 카드 ──
  tempCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    padding: Spacing.base,
  },
  shimmerLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    opacity: 0.75,
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
  tempValue: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.extrabold,
    letterSpacing: -0.3,
    marginTop: 2,
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
});
