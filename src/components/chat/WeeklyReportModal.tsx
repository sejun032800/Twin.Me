import React, { createElement, useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Colors, FontSize, FontWeight, Radius, Shadows, Spacing } from '../../styles/theme';
import { useAppContext } from '../../context/AppContext';
import type {
  AuditLogEntry,
  BestMomentLog,
  MatchStats,
  TopicItem,
  WeeklyReportData,
} from '../../services/weeklyReportService';

// ── SVG helpers (web only) ────────────────────────────────────────────────────

function svgEl(
  tag: string,
  props: Record<string, unknown>,
  ...children: React.ReactNode[]
): React.ReactElement | null {
  if (Platform.OS !== 'web') return null;
  return createElement(tag, props, ...children) as React.ReactElement;
}

// ── Donut Chart ───────────────────────────────────────────────────────────────

function DonutChartWeb({ topics, overallScore, size }: { topics: TopicItem[]; overallScore: number; size: number }) {
  const total = topics.reduce((s, t) => s + t.value, 0) || 1;
  const cx = size / 2; const cy = size / 2;
  const R = size * 0.38; const strokeW = R * 0.52; const circ = 2 * Math.PI * R;
  let offset = -circ * 0.25;
  const GAP = 2;
  const segs = topics.map((t) => {
    const frac = t.value / total;
    const dash = circ * frac - GAP;
    const segOffset = -offset;
    const el = svgEl('circle', { key: t.label, cx, cy, r: R, fill: 'none', stroke: t.color, strokeWidth: strokeW, strokeDasharray: `${dash} ${circ - dash}`, strokeDashoffset: segOffset });
    offset -= circ * frac;
    return el;
  });
  const svg = svgEl('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` },
    svgEl('circle', { cx, cy, r: R, fill: 'none', stroke: 'rgba(255,255,255,0.06)', strokeWidth: strokeW }),
    ...segs,
    svgEl('text', { x: cx, y: cy - 6, textAnchor: 'middle', fill: '#F1F5F9', fontSize: 20, fontWeight: 'bold' }, `${overallScore.toFixed(1)}`),
    svgEl('text', { x: cx, y: cy + 13, textAnchor: 'middle', fill: '#94A3B8', fontSize: 9 }, '점'),
  ) as React.ReactElement;
  return <View style={{ alignItems: 'center' }}>{svg}</View>;
}

function DonutChartNative({ topics, overallScore, size }: { topics: TopicItem[]; overallScore: number; size: number }) {
  const total = topics.reduce((s, t) => s + t.value, 0) || 1;
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <View style={[rStyles.nativeDonutRing, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={rStyles.nativeDonutScore}>{overallScore.toFixed(1)}</Text>
        <Text style={rStyles.nativeDonutLabel}>점</Text>
      </View>
      <View style={rStyles.legendCol}>
        {topics.map((t) => (
          <View key={t.label} style={rStyles.legendRow}>
            <View style={[rStyles.legendDot, { backgroundColor: t.color }]} />
            <Text style={rStyles.legendText}>{t.label} {(t.value / total * 100).toFixed(1)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function DonutChart({ topics, overallScore }: { topics: TopicItem[]; overallScore: number }) {
  const size = 140;
  if (Platform.OS === 'web') return <DonutChartWeb topics={topics} overallScore={overallScore} size={size} />;
  return <DonutChartNative topics={topics} overallScore={overallScore} size={size} />;
}

// ── Top 3 Topic Legend ────────────────────────────────────────────────────────

function TopicLegend({ topics }: { topics: TopicItem[] }) {
  const total = topics.reduce((s, t) => s + t.value, 0) || 1;
  return (
    <View style={rStyles.topicLegend}>
      {topics.map((t) => (
        <View key={t.label} style={rStyles.topicLegendRow}>
          <View style={[rStyles.topicDot, { backgroundColor: t.color }]} />
          <Text style={rStyles.topicLegendLabel}>{t.label}</Text>
          <Text style={[rStyles.topicLegendPct, { color: t.color }]}>
            {(t.value / total * 100).toFixed(1)}%
          </Text>
        </View>
      ))}
    </View>
  );
}

// ── Hard Lock Section ─────────────────────────────────────────────────────────
// Renders blurred content with a lock overlay for non-premium users.
// The overlay fades/dissolves when unlockProgress animates to 1.

type LockDomain = 'date_satisfaction' | 'match_stats' | 'audit_log';

function HardLockSection({
  isPremium,
  blur,
  domain,
  onPressLocked,
  title,
  unlockAnim,
  children,
}: {
  isPremium: boolean;
  blur: number;
  domain: LockDomain;
  onPressLocked: (domain: LockDomain) => void;
  title: string;
  unlockAnim: ReturnType<typeof useSharedValue<number>>;
  children: React.ReactNode;
}) {
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(unlockAnim.value, [0, 1], [1, 0]),
  }));
  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(unlockAnim.value, [0, 1], [1, 0.94]) }],
    opacity: interpolate(unlockAnim.value, [0, 1], [0.12, 1]),
  }));

  const webBlurStyle = Platform.OS === 'web'
    ? ({ filter: `blur(${isPremium ? 0 : blur}px)`, transition: 'filter 0.15s ease' } as object)
    : {};

  return (
    <View style={rStyles.sectionCard}>
      <Text style={rStyles.sectionTitle}>{title}</Text>
      {/* Content — blurred when locked */}
      <Animated.View style={scaleStyle}>
        <View style={webBlurStyle}>{children}</View>
      </Animated.View>
      {/* Lock overlay — fades out on premium unlock */}
      {!isPremium && (
        <Animated.View
          style={[StyleSheet.absoluteFill, rStyles.lockOverlay, overlayStyle]}
          pointerEvents={isPremium ? 'none' : 'box-none'}
        >
          <Pressable
            style={rStyles.lockOverlayInner}
            onPress={() => onPressLocked(domain)}
          >
            <Text style={rStyles.lockIcon}>🔒</Text>
            <Text style={rStyles.lockText}>프리미엄 전용</Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

// ── Section 1: Topics ─────────────────────────────────────────────────────────

function TopicsSection({
  r,
  isPremium,
  unlockAnim,
  onPressLocked,
}: {
  r: WeeklyReportData;
  isPremium: boolean;
  unlockAnim: ReturnType<typeof useSharedValue<number>>;
  onPressLocked: (domain: LockDomain) => void;
}) {
  if (!isPremium) {
    // Free tier: TOP 3 text list + blinded quest question
    return (
      <View style={rStyles.sectionCard}>
        <Text style={rStyles.sectionTitle}>💬 최근 대화 주제 분석</Text>
        <Text style={rStyles.freeTierSubtitle}>이번 주 TOP 3 대화 키워드</Text>
        {r.topTopics.length > 0 ? (
          r.topTopics.map((topic, i) => (
            <View key={topic} style={rStyles.topicTextRow}>
              <View style={[rStyles.topicRank, { backgroundColor: ['#D946EF', '#7C3AED', '#38BDF8'][i] + '22' }]}>
                <Text style={[rStyles.topicRankText, { color: ['#D946EF', '#7C3AED', '#38BDF8'][i] }]}>{i + 1}위</Text>
              </View>
              <Text style={rStyles.topicTextLabel}>{topic}</Text>
            </View>
          ))
        ) : (
          <Text style={rStyles.emptyCardText}>대화 데이터 분석 중이에요</Text>
        )}
        {/* Quest question — blurred */}
        <Pressable onPress={() => onPressLocked('audit_log')} style={rStyles.questBlurWrap}>
          <View style={Platform.OS === 'web' ? { filter: 'blur(6px)' } as object : { opacity: 0.1 }}>
            <Text style={rStyles.questBlurText}>
              최근 두 분 사이에 서운함 토픽이 평소보다 22.4% 상승했어요.
              오늘 밤엔 "자기야, 요즘 내가 무심코 던진 말 중에 마음에 걸렸던 게 있었어?"
              라고 먼저 따뜻하게 물어보는 건 어떨까요?
            </Text>
          </View>
          <View style={rStyles.questBlurOverlay}>
            <Text style={rStyles.questBlurIcon}>🔒</Text>
            <Text style={rStyles.questBlurLabel}>트윈이 맞춤 퀘스트 질문 잠금 해제</Text>
          </View>
        </Pressable>
      </View>
    );
  }

  // Premium tier: full pie chart + legend + quest question
  return (
    <View style={rStyles.sectionCard}>
      <Text style={rStyles.sectionTitle}>💬 최근 대화 주제 분석</Text>
      {r.topics.length > 0 ? (
        <View style={rStyles.donutRow}>
          <DonutChart topics={r.topics} overallScore={r.overallScore} />
          <TopicLegend topics={r.topics} />
        </View>
      ) : (
        <Text style={rStyles.emptyCardText}>대화 데이터 분석 중이에요</Text>
      )}
      {r.questQuestion && (
        <View style={rStyles.questCard}>
          <LinearGradient
            colors={['rgba(124,58,237,0.18)', 'rgba(217,70,239,0.10)']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={rStyles.questIcon}>🎯</Text>
          <Text style={rStyles.questTitle}>분석가 트윈이의 이번 주 맞춤 퀘스트</Text>
          <Text style={rStyles.questText}>{r.questQuestion}</Text>
        </View>
      )}
    </View>
  );
}

// ── Section 2: Best Moment ────────────────────────────────────────────────────

function BestMomentSection({
  r,
  isPremium,
  partnerName,
}: {
  r: WeeklyReportData;
  isPremium: boolean;
  partnerName: string;
}) {
  if (!isPremium) {
    return (
      <View style={rStyles.sectionCard}>
        <Text style={rStyles.sectionTitle}>💫 티키타카 Best 모먼트</Text>
        <View style={rStyles.bestMomentFree}>
          <Text style={rStyles.bestMomentQuote}>"</Text>
          <Text style={rStyles.bestMomentText}>{r.bestMomentText || '이번 주에도 사랑스러운 순간들이 가득했어요 💕'}</Text>
          <Text style={rStyles.bestMomentQuote}>"</Text>
        </View>
        <Text style={rStyles.bestMomentEncouragement}>
          트윈이가 이 순간을 기억해 뒀어요 🤍{'\n'}
          프리미엄으로 업그레이드하면 대화방 그대로 재현한 그래픽 모먼트를 볼 수 있어요!
        </Text>
      </View>
    );
  }

  const logs: BestMomentLog[] = r.bestMomentChatLogs ?? [];
  return (
    <View style={rStyles.sectionCard}>
      <Text style={rStyles.sectionTitle}>💫 티키타카 Best 모먼트</Text>
      <Text style={rStyles.bestMomentSubtitle}>이번 주 감정 동기화 최고점 구간을 재현했어요</Text>
      <View style={rStyles.bubbleFrame}>
        <LinearGradient
          colors={['rgba(255,107,139,0.12)', 'rgba(217,70,239,0.08)', 'rgba(124,58,237,0.06)']}
          style={StyleSheet.absoluteFill}
        />
        {logs.map((log, i) => {
          const isMe = log.role === 'me';
          return (
            <View key={i} style={[rStyles.bubbleRow, isMe ? rStyles.bubbleRowMe : rStyles.bubbleRowPartner]}>
              {!isMe && (
                <View style={rStyles.partnerBubbleAvatar}>
                  <Text style={rStyles.partnerBubbleAvatarText}>
                    {partnerName.charAt(0)}
                  </Text>
                </View>
              )}
              <View>
                <View style={[rStyles.chatBubble, isMe ? rStyles.chatBubbleMe : rStyles.chatBubblePartner]}>
                  <Text style={[rStyles.chatBubbleText, isMe ? rStyles.chatBubbleTextMe : rStyles.chatBubbleTextPartner]}>
                    {log.text}
                  </Text>
                </View>
                <Text style={[rStyles.bubbleTime, isMe ? rStyles.bubbleTimeMe : rStyles.bubbleTimePartner]}>
                  {log.time}
                </Text>
              </View>
            </View>
          );
        })}
        {/* Official cert badge */}
        <View style={rStyles.certBadge}>
          <Text style={rStyles.certBadgeText}>✦ 트윈이 공식 인증 Best 모먼트</Text>
        </View>
      </View>
    </View>
  );
}

// ── Section 3: Date Satisfaction (premium only) ───────────────────────────────

function DateSatisfactionContent({ r }: { r: WeeklyReportData }) {
  const radarValues = r.radarValues;
  const radarAxes = r.radarAxes;
  const avgSat = radarValues.length > 0
    ? radarValues.reduce((a, b) => a + b, 0) / radarValues.length
    : 0;
  return (
    <View style={rStyles.dateSatWrap}>
      {radarAxes.map((ax, i) => (
        <View key={ax} style={rStyles.dateSatRow}>
          <Text style={rStyles.dateSatLabel}>{ax}</Text>
          <View style={rStyles.dateSatTrack}>
            <LinearGradient
              colors={['#7C3AED', '#D946EF', '#FF6B8B']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[rStyles.dateSatFill, { width: `${(radarValues[i] * 100).toFixed(1)}%` as any }]}
            />
          </View>
          <Text style={rStyles.dateSatPct}>{(radarValues[i] * 100).toFixed(1)}%</Text>
        </View>
      ))}
      <View style={rStyles.dateSatSummary}>
        <Text style={rStyles.dateSatSummaryText}>
          이번 주 종합 만족도: <Text style={rStyles.dateSatScore}>{(avgSat * 100).toFixed(1)}점</Text>
        </Text>
      </View>
    </View>
  );
}

// ── Section 4: Match Stats (premium only) ────────────────────────────────────

function MatchStatsBar({
  label, meVal, partnerVal, unit, meColor, partnerColor, myName, partnerName,
}: {
  label: string; meVal: number; partnerVal: number; unit: string;
  meColor: string; partnerColor: string; myName: string; partnerName: string;
}) {
  const total = meVal + partnerVal || 1;
  const mePct = (meVal / total * 100).toFixed(1);
  const partnerPct = (partnerVal / total * 100).toFixed(1);
  return (
    <View style={msStyles.statRow}>
      <View style={msStyles.statSide}>
        <Text style={msStyles.statValue}>{meVal.toFixed(0)}{unit}</Text>
        <Text style={msStyles.statName}>{myName}</Text>
      </View>
      <View style={msStyles.statCenter}>
        <Text style={msStyles.statLabel}>{label}</Text>
        <View style={msStyles.statBarWrap}>
          <View style={[msStyles.statBarLeft, { width: `${mePct}%` as any, backgroundColor: meColor }]} />
          <View style={[msStyles.statBarRight, { width: `${partnerPct}%` as any, backgroundColor: partnerColor }]} />
        </View>
        <View style={msStyles.statPctRow}>
          <Text style={[msStyles.statPct, { color: meColor }]}>{mePct}%</Text>
          <Text style={[msStyles.statPct, { color: partnerColor }]}>{partnerPct}%</Text>
        </View>
      </View>
      <View style={msStyles.statSide}>
        <Text style={msStyles.statValue}>{partnerVal.toFixed(0)}{unit}</Text>
        <Text style={msStyles.statName}>{partnerName}</Text>
      </View>
    </View>
  );
}

function MatchStatsContent({
  stats, myName, partnerName,
}: {
  stats: MatchStats; myName: string; partnerName: string;
}) {
  const handleShare = () => {
    const text = [
      `⚽ ${myName} vs ${partnerName} 이번 주 연애 전선 리포트`,
      `💖 애정표현 점유율: ${stats.possession.me.toFixed(1)}% vs ${stats.possession.partner.toFixed(1)}%`,
      `😂 웃기기 유효슈팅: ${stats.shotsOnTarget.me}회 vs ${stats.shotsOnTarget.partner}회`,
      `⚠️ 공감 차단 반칙: ${stats.fouls.me}회 vs ${stats.fouls.partner}회`,
      `📝 총 활동량: ${stats.distanceCovered.me}자 vs ${stats.distanceCovered.partner}자`,
      `\nby Twin.me 🧬`,
    ].join('\n');
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(text);
        Alert.alert('클립보드 복사 완료', '인스타 스토리에 붙여넣으세요!');
      }
    } else {
      Share.share({ message: text });
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <View>
      <View style={msStyles.vsRow}>
        <View style={msStyles.vsTeam}>
          <Text style={msStyles.vsEmoji}>🙋</Text>
          <Text style={msStyles.vsName}>{myName}</Text>
        </View>
        <LinearGradient
          colors={['#7C3AED', '#D946EF']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={msStyles.vsBadge}
        >
          <Text style={msStyles.vsText}>VS</Text>
        </LinearGradient>
        <View style={msStyles.vsTeam}>
          <Text style={msStyles.vsEmoji}>💕</Text>
          <Text style={msStyles.vsName}>{partnerName}</Text>
        </View>
      </View>

      <MatchStatsBar
        label="애정표현 점유율"
        meVal={stats.possession.me} partnerVal={stats.possession.partner}
        unit="%" myName={myName} partnerName={partnerName}
        meColor="#D946EF" partnerColor="#38BDF8"
      />
      <MatchStatsBar
        label="웃기기 유효슈팅"
        meVal={stats.shotsOnTarget.me} partnerVal={stats.shotsOnTarget.partner}
        unit="회" myName={myName} partnerName={partnerName}
        meColor="#FF6B8B" partnerColor="#A78BFA"
      />
      <MatchStatsBar
        label="공감 차단 반칙"
        meVal={stats.fouls.me} partnerVal={stats.fouls.partner}
        unit="회" myName={myName} partnerName={partnerName}
        meColor="#EF4444" partnerColor="#F97316"
      />
      <MatchStatsBar
        label="총 활동량"
        meVal={stats.distanceCovered.me} partnerVal={stats.distanceCovered.partner}
        unit="자" myName={myName} partnerName={partnerName}
        meColor="#7C3AED" partnerColor="#06B6D4"
      />

      <TouchableOpacity style={msStyles.shareBtn} onPress={handleShare} activeOpacity={0.82}>
        <LinearGradient
          colors={['#FF6B8B', '#D946EF', '#7C3AED']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={msStyles.shareBtnGrad}
        >
          <Text style={msStyles.shareBtnText}>📸 인스타 스토리로 공유하기</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const msStyles = StyleSheet.create({
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.base },
  vsTeam: { alignItems: 'center', gap: 3 },
  vsEmoji: { fontSize: 28 },
  vsName: { color: '#E2D9FF', fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  vsBadge: { borderRadius: Radius.pill, paddingHorizontal: Spacing.base, paddingVertical: 5 },
  vsText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.extrabold, letterSpacing: 1.5 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.md },
  statSide: { width: 52, alignItems: 'center' },
  statValue: { color: '#F1F5F9', fontSize: 13, fontWeight: FontWeight.bold },
  statName: { color: '#64748B', fontSize: 9, textAlign: 'center' },
  statCenter: { flex: 1, gap: 3 },
  statLabel: { color: '#94A3B8', fontSize: 10, textAlign: 'center', fontWeight: FontWeight.medium },
  statBarWrap: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)' },
  statBarLeft: { height: '100%', borderRadius: 4 },
  statBarRight: { height: '100%', borderRadius: 4 },
  statPctRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statPct: { fontSize: 9, fontWeight: FontWeight.bold },
  shareBtn: { borderRadius: Radius.pill, overflow: 'hidden', marginTop: Spacing.md },
  shareBtnGrad: { paddingVertical: 13, alignItems: 'center' },
  shareBtnText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold, letterSpacing: 0.2 },
});

// ── Section 5: DNA Audit Log ──────────────────────────────────────────────────

function AuditLogContent({ logs }: { logs: AuditLogEntry[] }) {
  const netDelta = logs.reduce((sum, l) => {
    const num = parseFloat(l.delta.replace('%', '').replace('+', ''));
    return sum + (isNaN(num) ? 0 : num);
  }, 0);
  return (
    <View>
      <View style={auditStyles.summaryRow}>
        <Text style={auditStyles.summaryLabel}>이번 주 순 변동</Text>
        <Text style={[auditStyles.summaryDelta, { color: netDelta >= 0 ? '#4ADE80' : '#EF4444' }]}>
          {netDelta >= 0 ? '+' : ''}{netDelta.toFixed(1)}%
        </Text>
      </View>
      {logs.map((log, i) => (
        <View key={i} style={[auditStyles.logCard, { borderLeftColor: log.isPositive ? '#4ADE80' : '#EF4444' }]}>
          <View style={auditStyles.logHeader}>
            <Text style={auditStyles.logDatetime}>{log.datetime}</Text>
            <Text style={[auditStyles.logDelta, { color: log.isPositive ? '#4ADE80' : '#EF4444' }]}>
              {log.delta}
            </Text>
          </View>
          <View style={auditStyles.logBody}>
            <View style={[auditStyles.codePill, { backgroundColor: log.isPositive ? 'rgba(74,222,128,0.12)' : 'rgba(239,68,68,0.12)' }]}>
              <Text style={[auditStyles.codeText, { color: log.isPositive ? '#4ADE80' : '#EF4444' }]}>{log.code}</Text>
            </View>
            <Text style={auditStyles.logLabel}>{log.label}</Text>
            <Text style={auditStyles.logSender}>{log.sender}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const auditStyles = StyleSheet.create({
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md, paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  summaryLabel: { color: '#94A3B8', fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  summaryDelta: { fontSize: FontSize.lg, fontWeight: FontWeight.extrabold },
  logCard: { borderLeftWidth: 3, paddingLeft: Spacing.md, paddingVertical: 8, marginBottom: Spacing.sm, borderRadius: 3 },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  logDatetime: { color: '#64748B', fontSize: 10 },
  logDelta: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  logBody: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  codePill: { borderRadius: Radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  codeText: { fontSize: 9, fontWeight: FontWeight.bold },
  logLabel: { flex: 1, color: '#CBD5E1', fontSize: FontSize.xs },
  logSender: { color: '#64748B', fontSize: 9 },
});

// ── Paywall Nudge Modal ───────────────────────────────────────────────────────

const PAYWALL_COPY: Record<LockDomain, { title: string; body: string; icon: string }> = {
  date_satisfaction: {
    icon: '📈',
    title: '이번 주 데이트 만족도 분석 해제',
    body: '만족도가 낮았던 데이트의 원인을 AI가 분석하고, 완벽한 반전 코스 3곳을 추천받아 보세요!',
  },
  match_stats: {
    icon: '⚽',
    title: '우리의 진짜 애정 표현 점유율은 몇 %?',
    body: '축구 경기 스탯으로 두 분의 연애 전선을 낱낱이 확인하고 인스타에 자랑해 보세요!',
  },
  audit_log: {
    icon: '🧬',
    title: '가·감산 비밀 오디팅 로그 해제',
    body: '연인의 어떤 말에 서운해서 내 점수가 깎였는지, 내가 어떤 실수를 범했는지 비밀 로그를 낱낱이 해제해 보세요.',
  },
};

function PaywallNudgeModal({
  visible,
  domain,
  onClose,
  onVirtualPurchase,
}: {
  visible: boolean;
  domain: LockDomain;
  onClose: () => void;
  onVirtualPurchase: () => void;
}) {
  const scale = useSharedValue(0.88);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      scale.value = withSpring(1, { damping: 16, stiffness: 240 });
      opacity.value = withTiming(1, { duration: 180 });
    } else {
      scale.value = withTiming(0.88, { duration: 140 });
      opacity.value = withTiming(0, { duration: 140 });
    }
  }, [visible, scale, opacity]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;
  const copy = PAYWALL_COPY[domain];

  return (
    <View style={pwStyles.backdrop} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View style={[pwStyles.card, cardStyle]}>
        <LinearGradient
          colors={['rgba(124,58,237,0.2)', 'rgba(217,70,239,0.12)', 'rgba(255,107,139,0.06)']}
          style={StyleSheet.absoluteFill}
        />
        {/* Top gradient accent */}
        <View style={pwStyles.accentBar} />
        <Text style={pwStyles.iconText}>{copy.icon}</Text>
        <Text style={pwStyles.title}>{copy.title}</Text>
        <Text style={pwStyles.body}>{copy.body}</Text>

        <View style={pwStyles.planRow}>
          {(['Coffee Break ☕', 'Deep Talk Night 🌙'] as const).map((label, i) => (
            <View key={i} style={pwStyles.planChip}>
              <Text style={pwStyles.planName}>{label}</Text>
              <Text style={pwStyles.planPrice}>{i === 0 ? '₩9,900/월' : '₩29,900/월'}</Text>
            </View>
          ))}
        </View>

        {/* Virtual purchase CTA */}
        <TouchableOpacity
          style={pwStyles.ctaBtn}
          onPress={onVirtualPurchase}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={['#7C3AED', '#D946EF', '#FF6B8B']}
            start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
            style={pwStyles.ctaGrad}
          >
            <Text style={pwStyles.ctaText}>🔓 지금 바로 구독 · 즉시 잠금 해제</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity style={pwStyles.closeBtn} onPress={onClose}>
          <Text style={pwStyles.closeBtnText}>다음에 할게요</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const pwStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(5,3,18,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 9999,
  },
  card: {
    width: '100%',
    backgroundColor: 'rgba(15,10,40,0.98)',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(217,70,239,0.45)',
    paddingHorizontal: 24,
    paddingBottom: 24,
    overflow: 'hidden',
    shadowColor: '#D946EF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 28,
    elevation: 22,
  },
  accentBar: { height: 3, backgroundColor: '#D946EF', marginBottom: 22, opacity: 0.85 },
  iconText: { fontSize: 42, textAlign: 'center', marginBottom: 10 },
  title: { color: '#F1F5F9', fontSize: FontSize.lg, fontWeight: FontWeight.extrabold, textAlign: 'center', letterSpacing: -0.3, marginBottom: 12, lineHeight: 26 },
  body: { color: '#94A3B8', fontSize: FontSize.sm, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  planRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  planChip: {
    flex: 1, backgroundColor: 'rgba(124,58,237,0.12)', borderRadius: Radius.lg,
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.3)', padding: 10, alignItems: 'center', gap: 3,
  },
  planName: { color: '#A78BFA', fontSize: 11, fontWeight: FontWeight.semibold },
  planPrice: { color: '#E2D9FF', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  ctaBtn: { borderRadius: Radius.pill, overflow: 'hidden', marginBottom: 12 },
  ctaGrad: { paddingVertical: 16, alignItems: 'center' },
  ctaText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold, letterSpacing: 0.3 },
  closeBtn: { alignItems: 'center', paddingVertical: 8 },
  closeBtnText: { color: '#64748B', fontSize: FontSize.sm },
});

// ── Loading / Empty states ────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <View style={rStyles.skeletonWrap}>
      <Text style={rStyles.skeletonTitle}>🔬 데이터 분석 중...</Text>
      <Text style={rStyles.skeletonSub}>채팅 기록을 집계하고{'\n'}AI 리포트를 생성하고 있어요</Text>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={rStyles.skeletonWrap}>
      <Text style={rStyles.skeletonTitle}>📊 리포트 준비 중</Text>
      <Text style={rStyles.skeletonSub}>
        카카오톡 파일을 업로드하면{'\n'}주간 연애 리포트가 자동으로 생성돼요!{'\n\n'}
        매주 일요일 밤 10시에 새 리포트를 드려요 🌙
      </Text>
    </View>
  );
}

// ── Main WeeklyReportModal ────────────────────────────────────────────────────

interface WeeklyReportModalProps {
  visible: boolean;
  onClose: () => void;
}

export function WeeklyReportModal({ visible, onClose }: WeeklyReportModalProps) {
  const { weeklyReportData, myProfile, partnerProfile, subscriptionStatus, setSubscriptionStatus } = useAppContext();
  const isPremium = subscriptionStatus.isPremium;
  const r: WeeklyReportData | null = weeklyReportData;

  // Paywall state
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [paywallDomain, setPaywallDomain] = useState<LockDomain>('match_stats');

  // Animated premium unlock progress (0 = locked, 1 = unlocked)
  const unlockAnim = useSharedValue(isPremium ? 1 : 0);
  useEffect(() => {
    unlockAnim.value = withSpring(isPremium ? 1 : 0, { damping: 20, stiffness: 200, mass: 0.8 });
  }, [isPremium, unlockAnim]);

  // Modal slide-up animation
  const overlayOpacity = useSharedValue(0);
  const cardTranslateY = useSharedValue(80);
  const cardScale = useSharedValue(0.94);
  const cardOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      overlayOpacity.value = withTiming(1, { duration: 260 });
      cardOpacity.value = withTiming(1, { duration: 300 });
      cardTranslateY.value = withSpring(0, { damping: 18, stiffness: 140 });
      cardScale.value = withSpring(1, { damping: 16, stiffness: 140 });
    } else {
      overlayOpacity.value = withTiming(0, { duration: 220 });
      cardOpacity.value = withTiming(0, { duration: 200 });
      cardTranslateY.value = withTiming(80, { duration: 260 });
      cardScale.value = withTiming(0.94, { duration: 260 });
    }
  }, [visible, overlayOpacity, cardTranslateY, cardScale, cardOpacity]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslateY.value }, { scale: cardScale.value }],
  }));

  const openPaywall = (domain: LockDomain) => {
    if (isPremium) return;
    setPaywallDomain(domain);
    setPaywallVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleVirtualPurchase = () => {
    setPaywallVisible(false);
    setSubscriptionStatus({ isPremium: true, planId: 'coffee', expiresAt: null });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, mStyles.root]} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, mStyles.overlay, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[mStyles.modal, cardStyle]}>
        {/* Header */}
        <View style={mStyles.header}>
          <LinearGradient
            colors={['rgba(124,58,237,0.18)', 'rgba(217,70,239,0.08)', 'transparent']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={mStyles.headerGrad}
          />
          <View style={mStyles.headerBadge}>
            <Text style={mStyles.headerBadgeText}>📊 주간 연애 리포트</Text>
          </View>
          {isPremium && (
            <View style={mStyles.premiumBadge}>
              <Text style={mStyles.premiumBadgeText}>✦ PREMIUM</Text>
            </View>
          )}
          <Pressable onPress={onClose} style={mStyles.closeBtn}>
            <Text style={mStyles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        {r && !r.isLoading && (
          <View style={mStyles.weekRow}>
            <Text style={mStyles.weekLabel}>{r.weekLabel}</Text>
            <Text style={mStyles.weatherLabel}>{r.weatherLabel}</Text>
          </View>
        )}

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={mStyles.scrollContent}
          bounces
        >
          {(!r || r.isLoading) ? (
            r?.isLoading ? <LoadingSkeleton /> : <EmptyState />
          ) : (
            <>
              {/* ── Section 1: Topics ──────────────────────────────────── */}
              <TopicsSection
                r={r}
                isPremium={isPremium}
                unlockAnim={unlockAnim}
                onPressLocked={openPaywall}
              />

              {/* ── Section 2: Best Moment ─────────────────────────────── */}
              <BestMomentSection
                r={r}
                isPremium={isPremium}
                partnerName={partnerProfile.name}
              />

              {/* ── Section 3: Date Satisfaction (hard locked) ─────────── */}
              <HardLockSection
                isPremium={isPremium}
                blur={8}
                domain="date_satisfaction"
                onPressLocked={openPaywall}
                title="📈 주간 데이트 만족도 분석"
                unlockAnim={unlockAnim}
              >
                <DateSatisfactionContent r={r} />
              </HardLockSection>

              {/* ── Section 4: Match Stats (hard locked) ───────────────── */}
              <HardLockSection
                isPremium={isPremium}
                blur={8}
                domain="match_stats"
                onPressLocked={openPaywall}
                title="⚽ 연애 전선 리포트"
                unlockAnim={unlockAnim}
              >
                {r.matchStats ? (
                  <MatchStatsContent
                    stats={r.matchStats}
                    myName={myProfile.name}
                    partnerName={partnerProfile.name}
                  />
                ) : (
                  <Text style={rStyles.emptyCardText}>데이터 집계 중이에요</Text>
                )}
              </HardLockSection>

              {/* ── Section 5: DNA Audit Log (blur 12 + CTA) ───────────── */}
              <View style={rStyles.sectionCard}>
                <Text style={rStyles.sectionTitle}>🧬 연애 DNA 매칭률 로그</Text>
                {!isPremium ? (
                  <View>
                    {/* Heavily blurred preview */}
                    <View
                      style={Platform.OS === 'web'
                        ? [rStyles.auditBlurPreview, { filter: 'blur(12px)' } as object]
                        : [rStyles.auditBlurPreview, { opacity: 0.05 }]
                      }
                      pointerEvents="none"
                    >
                      {[1,2,3,4].map((i) => (
                        <View key={i} style={rStyles.auditFakeRow}>
                          <View style={[rStyles.auditFakeBar, { width: `${60 + i * 10}%` as any }]} />
                        </View>
                      ))}
                    </View>
                    {/* CTA button overlay */}
                    <TouchableOpacity
                      style={rStyles.auditCtaBtn}
                      onPress={() => openPaywall('audit_log')}
                      activeOpacity={0.85}
                    >
                      <LinearGradient
                        colors={['rgba(124,58,237,0.25)', 'rgba(217,70,239,0.2)']}
                        style={StyleSheet.absoluteFill}
                      />
                      <Text style={rStyles.auditCtaIcon}>🔒</Text>
                      <Text style={rStyles.auditCtaText}>이번 주 가·감산 비밀 로그 확인하기</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  r.auditLogs && r.auditLogs.length > 0 ? (
                    <AuditLogContent logs={r.auditLogs} />
                  ) : (
                    <Text style={rStyles.emptyCardText}>이번 주 이벤트 로그가 없어요</Text>
                  )
                )}
              </View>

              {/* Analyst comment */}
              <View style={rStyles.sectionCard}>
                <Text style={rStyles.sectionTitle}>✍️ 트윈이의 감성 한줄평</Text>
                <View style={rStyles.analystCard}>
                  <Text style={rStyles.analystAvatar}>🔬</Text>
                  <View style={rStyles.analystBubble}>
                    <Text style={rStyles.analystText}>{r.analystComment}</Text>
                  </View>
                </View>
              </View>
            </>
          )}

          <Pressable style={rStyles.bottomClose} onPress={onClose}>
            <Text style={rStyles.bottomCloseText}>리포트 닫기</Text>
          </Pressable>
        </ScrollView>
      </Animated.View>

      {/* Paywall Nudge Modal */}
      {paywallVisible && (
        <PaywallNudgeModal
          visible={paywallVisible}
          domain={paywallDomain}
          onClose={() => setPaywallVisible(false)}
          onVirtualPurchase={handleVirtualPurchase}
        />
      )}
    </View>
  );
}

// ── Report Card Bubble (in analyst chat) ─────────────────────────────────────

interface ReportCardBubbleProps {
  onPress: () => void;
}

export function ReportCardBubble({ onPress }: ReportCardBubbleProps) {
  const { weeklyReportData } = useAppContext();
  const r = weeklyReportData;
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 1800 }), withTiming(0, { duration: 1800 })),
      -1, false,
    );
  }, [pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + pulse.value * 0.4,
  }));

  return (
    <TouchableOpacity onPress={onPress} style={rStyles.reportCard} activeOpacity={0.85}>
      {/* Breathing glow border */}
      <Animated.View style={[StyleSheet.absoluteFill, rStyles.reportCardGlow, glowStyle]} pointerEvents="none">
        <LinearGradient
          colors={['#7C3AED', '#D946EF', '#FF6B8B']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ flex: 1, borderRadius: Radius.xl, opacity: 0.28 }}
        />
      </Animated.View>
      <View style={rStyles.reportCardHeader}>
        <Text style={rStyles.reportCardHeaderIcon}>📊</Text>
        <Text style={rStyles.reportCardHeaderText}>주간 연애 리포트 도착</Text>
      </View>
      <View style={rStyles.reportCardDivider} />
      <View style={rStyles.reportCardBody}>
        <View>
          <Text style={rStyles.reportCardWeek}>
            {r && !r.isLoading ? r.weekLabel : '리포트 생성 중...'}
          </Text>
          <Text style={rStyles.reportCardWeather}>
            {r && !r.isLoading ? r.weatherLabel : '🔮 분석 중'}
          </Text>
        </View>
        {r && !r.isLoading ? (
          <View style={rStyles.reportCardScore}>
            <Text style={rStyles.reportCardScoreNum}>{r.overallScore.toFixed(1)}</Text>
            <Text style={rStyles.reportCardScoreLabel}>점</Text>
          </View>
        ) : null}
      </View>
      <View style={rStyles.reportCardTap}>
        <Text style={rStyles.reportCardTapText}>탭하여 전체 리포트 보기 →</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const mStyles = StyleSheet.create({
  root: { zIndex: 9998 },
  overlay: { backgroundColor: 'rgba(5,3,18,0.84)' },
  modal: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    maxHeight: '95%',
    backgroundColor: 'rgba(12,9,30,0.98)',
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(217,70,239,0.20)',
    overflow: 'hidden',
    ...Shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
    overflow: 'hidden',
  },
  headerGrad: { ...StyleSheet.absoluteFill },
  headerBadge: {
    backgroundColor: 'rgba(124,58,237,0.20)',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.base,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.38)',
    flex: 1,
  },
  headerBadgeText: { color: '#A78BFA', fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  premiumBadge: {
    backgroundColor: 'rgba(255,107,139,0.15)',
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,107,139,0.35)',
  },
  premiumBadgeText: { color: '#FF6B8B', fontSize: 9, fontWeight: FontWeight.extrabold, letterSpacing: 1 },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { color: '#94A3B8', fontSize: 16 },
  weekRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md,
  },
  weekLabel: { color: '#64748B', fontSize: FontSize.xs },
  weatherLabel: { color: '#A78BFA', fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  scrollContent: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing['4xl'],
    gap: Spacing.md,
    paddingTop: Spacing.sm,
  },
});

const rStyles = StyleSheet.create({
  // Section card wrapper
  sectionCard: {
    backgroundColor: 'rgba(26,18,50,0.72)',
    borderRadius: Radius.xl,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    gap: Spacing.md,
    overflow: 'hidden',
  },
  sectionTitle: {
    color: '#F1F5F9', fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold, letterSpacing: 0.3,
  },
  emptyCardText: { color: '#64748B', fontSize: FontSize.sm, textAlign: 'center', paddingVertical: Spacing.md },

  // Loading / empty
  skeletonWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing['3xl'], gap: Spacing.md },
  skeletonTitle: { color: '#F1F5F9', fontSize: FontSize.lg, fontWeight: FontWeight.bold, textAlign: 'center' },
  skeletonSub: { color: '#64748B', fontSize: FontSize.sm, textAlign: 'center', lineHeight: 22 },

  // Lock overlay
  lockOverlay: {
    backgroundColor: 'rgba(12,9,30,0.80)',
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockOverlayInner: { alignItems: 'center', gap: 6 },
  lockIcon: { fontSize: 32 },
  lockText: { color: '#64748B', fontSize: FontSize.xs },

  // Free tier topics
  freeTierSubtitle: { color: '#64748B', fontSize: FontSize.xs },
  topicTextRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topicRank: { borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  topicRankText: { fontSize: 10, fontWeight: FontWeight.bold },
  topicTextLabel: { color: '#E2D9FF', fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  // Quest blur (free)
  questBlurWrap: { position: 'relative', borderRadius: Radius.lg, overflow: 'hidden', marginTop: 4 },
  questBlurText: { color: '#C084FC', fontSize: FontSize.xs, lineHeight: 20, padding: 12, backgroundColor: 'rgba(124,58,237,0.12)', borderRadius: Radius.lg },
  questBlurOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(12,9,30,0.72)', borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', gap: 4, flexDirection: 'row' },
  questBlurIcon: { fontSize: 14 },
  questBlurLabel: { color: '#7C3AED', fontSize: 11, fontWeight: FontWeight.semibold },

  // Quest card (premium)
  questCard: {
    borderRadius: Radius.lg, padding: Spacing.base,
    overflow: 'hidden', gap: 6,
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.28)',
  },
  questIcon: { fontSize: 20 },
  questTitle: { color: '#A78BFA', fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  questText: { color: '#CBD5E1', fontSize: FontSize.sm, lineHeight: 22 },

  // Donut + legend
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base },
  topicLegend: { flex: 1, gap: 7 },
  topicLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  topicDot: { width: 8, height: 8, borderRadius: 4 },
  topicLegendLabel: { flex: 1, color: '#94A3B8', fontSize: FontSize.xs },
  topicLegendPct: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, minWidth: 36, textAlign: 'right' },

  // Native donut
  nativeDonutRing: {
    borderWidth: 12, borderColor: '#7C3AED',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(124,58,237,0.08)',
  },
  nativeDonutScore: { color: '#F1F5F9', fontSize: FontSize.xl, fontWeight: FontWeight.extrabold },
  nativeDonutLabel: { color: '#94A3B8', fontSize: FontSize.xs },
  legendCol: { gap: 5, marginTop: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 9, color: '#64748B', minWidth: 80 },

  // Best Moment free
  bestMomentFree: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  bestMomentQuote: { color: '#D946EF', fontSize: 28, lineHeight: 34, fontWeight: FontWeight.extrabold },
  bestMomentText: { flex: 1, color: '#E2D9FF', fontSize: FontSize.sm, lineHeight: 22, paddingTop: 6 },
  bestMomentEncouragement: { color: '#64748B', fontSize: FontSize.xs, lineHeight: 20, textAlign: 'center' },

  // Best Moment premium bubble frame
  bestMomentSubtitle: { color: '#64748B', fontSize: FontSize.xs },
  bubbleFrame: {
    borderRadius: Radius.xl, overflow: 'hidden',
    padding: Spacing.base, gap: Spacing.sm,
    borderWidth: 1, borderColor: 'rgba(255,107,139,0.3)',
    minHeight: 160,
  },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  bubbleRowMe: { justifyContent: 'flex-end' },
  bubbleRowPartner: { justifyContent: 'flex-start' },
  partnerBubbleAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(217,70,239,0.3)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  partnerBubbleAvatarText: { color: '#fff', fontSize: 12, fontWeight: FontWeight.bold },
  chatBubble: { maxWidth: 220, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  chatBubbleMe: { backgroundColor: 'rgba(217,70,239,0.25)', borderBottomRightRadius: 4, borderWidth: 1, borderColor: 'rgba(255,107,139,0.45)' },
  chatBubblePartner: { backgroundColor: 'rgba(30,41,59,0.85)', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: 'rgba(124,58,237,0.30)' },
  chatBubbleText: { fontSize: FontSize.sm, lineHeight: 20 },
  chatBubbleTextMe: { color: '#FFE0EC' },
  chatBubbleTextPartner: { color: '#E2D9FF' },
  bubbleTime: { fontSize: 9, color: '#64748B', marginTop: 2 },
  bubbleTimeMe: { textAlign: 'right' },
  bubbleTimePartner: { textAlign: 'left', marginLeft: 34 },
  certBadge: {
    alignSelf: 'center', backgroundColor: 'rgba(255,107,139,0.12)',
    borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(255,107,139,0.35)', marginTop: 4,
  },
  certBadgeText: { color: '#FF6B8B', fontSize: 9, fontWeight: FontWeight.semibold },

  // Date satisfaction
  dateSatWrap: { gap: Spacing.sm },
  dateSatRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateSatLabel: { color: '#94A3B8', fontSize: FontSize.xs, width: 44 },
  dateSatTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  dateSatFill: { height: '100%', borderRadius: 4 },
  dateSatPct: { color: '#A78BFA', fontSize: FontSize.xs, width: 38, textAlign: 'right', fontWeight: FontWeight.bold },
  dateSatSummary: { paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)', marginTop: 4 },
  dateSatSummaryText: { color: '#64748B', fontSize: FontSize.xs, textAlign: 'center' },
  dateSatScore: { color: '#FF6B8B', fontWeight: FontWeight.extrabold },

  // Audit log
  auditBlurPreview: { gap: 8, marginBottom: 10 },
  auditFakeRow: { height: 36, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8 },
  auditFakeBar: { height: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 5, marginTop: 13 },
  auditCtaBtn: {
    borderRadius: Radius.xl, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.4)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16,
    marginTop: 4,
  },
  auditCtaIcon: { fontSize: 18 },
  auditCtaText: { color: '#A78BFA', fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  // Analyst comment
  analystCard: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  analystAvatar: { fontSize: 28, width: 36 },
  analystBubble: {
    flex: 1, backgroundColor: 'rgba(56,189,248,0.07)',
    borderRadius: Radius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: 'rgba(56,189,248,0.2)',
  },
  analystText: { color: '#CBD5E1', fontSize: FontSize.sm, lineHeight: 22 },

  // Bottom close
  bottomClose: {
    marginTop: Spacing.md, alignSelf: 'center',
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xl,
    backgroundColor: 'rgba(124,58,237,0.15)',
    borderRadius: Radius.pill,
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.3)',
  },
  bottomCloseText: { color: '#A78BFA', fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  // Report Card Bubble
  reportCard: {
    backgroundColor: 'rgba(124,58,237,0.10)',
    borderRadius: Radius.xl, padding: Spacing.base,
    borderWidth: 1.5, borderColor: 'rgba(124,58,237,0.35)',
    maxWidth: 260, gap: 8, overflow: 'hidden',
  },
  reportCardGlow: { borderRadius: Radius.xl },
  reportCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reportCardHeaderIcon: { fontSize: 16 },
  reportCardHeaderText: { color: '#A78BFA', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  reportCardDivider: { height: 1, backgroundColor: 'rgba(124,58,237,0.25)' },
  reportCardBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reportCardWeek: { color: '#94A3B8', fontSize: FontSize.xs },
  reportCardWeather: { color: '#C084FC', fontSize: FontSize.xs, marginTop: 3 },
  reportCardScore: { alignItems: 'center' },
  reportCardScoreNum: { color: '#FF6B8B', fontSize: FontSize['2xl'], fontWeight: FontWeight.extrabold },
  reportCardScoreLabel: { color: '#94A3B8', fontSize: FontSize.xs, marginTop: -4 },
  reportCardTap: { paddingTop: 4, borderTopWidth: 1, borderTopColor: 'rgba(124,58,237,0.2)', alignItems: 'center' },
  reportCardTapText: { color: '#7C3AED', fontSize: FontSize.xs, fontWeight: FontWeight.medium },
});
