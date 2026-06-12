import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  FontSize,
  FontWeight,
  Radius,
  Spacing,
  ThemeTokens,
} from '../../styles/theme';

interface Props {
  t: ThemeTokens;
}

function ChatIndexCard({ t }: { t: ThemeTokens }) {
  const levels = [
    { label: 'High', fill: 0.72, active: true },
    { label: 'Mid', fill: 0.45, active: false },
    { label: 'Low', fill: 0.2, active: false },
  ];

  const glass = {
    backgroundColor: t.isLight ? 'rgba(255,255,255,0.72)' : 'rgba(30,41,59,0.72)',
    borderColor: t.isLight ? 'rgba(200,160,180,0.35)' : 'rgba(255,255,255,0.08)',
  };

  return (
    <View style={[styles.card, glass]}>
      <LinearGradient
        colors={t.gradientColors}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.shimmerLine}
      />
      <Text style={[styles.cardLabel, { color: t.textSecondary }]}>채팅 지수</Text>
      <Text style={[styles.cardValue, { color: t.text }]}>High ↑</Text>
      <View style={styles.levelBars}>
        {levels.map(({ label, fill, active }) => (
          <View key={label} style={styles.levelRow}>
            <Text style={[styles.levelText, { color: active ? t.text : t.textMuted }]}>
              {label}
            </Text>
            <View style={[styles.barTrack, { backgroundColor: t.divider }]}>
              {active ? (
                <LinearGradient
                  colors={t.gradientColors}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[styles.barFill, { width: `${fill * 100}%` }]}
                />
              ) : (
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${fill * 100}%`,
                      backgroundColor: t.isLight
                        ? 'rgba(180,140,160,0.3)'
                        : 'rgba(255,255,255,0.12)',
                    },
                  ]}
                />
              )}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function SyncRateCard({ t }: { t: ThemeTokens }) {
  const syncPct = 82;

  const glass = {
    backgroundColor: t.isLight ? 'rgba(255,255,255,0.72)' : 'rgba(30,41,59,0.72)',
    borderColor: t.isLight ? 'rgba(200,160,180,0.35)' : 'rgba(255,255,255,0.08)',
  };

  return (
    <View style={[styles.card, glass]}>
      <LinearGradient
        colors={t.gradientColors}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.shimmerLine}
      />
      <Text style={[styles.cardLabel, { color: t.textSecondary }]}>감정 싱크로율</Text>
      <Text style={[styles.syncBigValue, { color: t.text }]}>{syncPct}%</Text>
      <View style={[styles.syncTrack, { backgroundColor: t.divider }]}>
        <LinearGradient
          colors={t.gradientColors}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.syncFill, { width: `${syncPct}%` }]}
        />
      </View>
      <Text style={[styles.syncSub, { color: t.textMuted }]}>
        이번 주 최고 기록 🔥
      </Text>
    </View>
  );
}

export default function MetricsGrid({ t }: Props) {
  return (
    <View style={styles.container}>
      <ChatIndexCard t={t} />
      <SyncRateCard t={t} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.base,
    gap: Spacing.md,
  },
  card: {
    flex: 1,
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
    width: 26,
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
  },
  syncSub: {
    fontSize: FontSize.xs,
  },
});
