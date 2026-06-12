import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Colors,
  FontSize,
  FontWeight,
  Radius,
  Spacing,
  ThemeTokens,
} from '../../styles/theme';

interface Props {
  partnerName: string;
  t: ThemeTokens;
}

export default function AICoachingCard({ partnerName, t }: Props) {
  const glass = {
    backgroundColor: t.isLight ? 'rgba(255,255,255,0.72)' : 'rgba(30,41,59,0.72)',
    borderColor: t.isLight ? 'rgba(200,160,180,0.35)' : 'rgba(255,255,255,0.08)',
  };

  const coachingText = `${partnerName}님이 지금 업무로 많이 지쳐 보여요. 저녁에 가벼운 위로의 메시지를 보내보는 건 어떨까요?`;

  return (
    <View style={[styles.card, glass]}>
      {/* 글래스모피즘 상단 광택 그라데이션 라인 */}
      <LinearGradient
        colors={t.gradientColors}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.shimmerLine}
      />

      <View style={styles.header}>
        <LinearGradient
          colors={t.gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconCircle}
        >
          <Text style={styles.icon}>💡</Text>
        </LinearGradient>
        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, { color: t.text }]}>분석가 트윈이의 한마디</Text>
          <Text style={[styles.headerSub, { color: t.textMuted }]}>오늘의 AI 코칭</Text>
        </View>
      </View>

      <Text style={[styles.coachingBody, { color: t.textSecondary }]}>
        "{coachingText}"
      </Text>

      <View style={styles.footer}>
        <View style={styles.aiBadge}>
          <View style={styles.aiDot} />
          <Text style={styles.aiLabel}>트윈 AI 분석</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.base,
    borderRadius: Radius.xl,
    borderWidth: 1,
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
    opacity: 0.75,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: 4,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 20 },
  headerText: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  headerSub: {
    fontSize: FontSize.xs,
  },
  coachingBody: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
    lineHeight: FontSize.base * 1.65,
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
  },
  aiBadge: {
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
  aiDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.BADGE_AI_BLUE,
  },
  aiLabel: {
    color: Colors.BADGE_AI_BLUE,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
});
