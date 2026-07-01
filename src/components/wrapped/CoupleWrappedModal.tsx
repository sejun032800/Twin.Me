// ─── FUN-REP-003: 커플 Wrapped & 기념일 결산 리포트 ───────────────────────────
//
// Spotify Wrapped 스타일 9:16 풀스크린 스와이프 스토리 카드 시퀀스.
// 주간 리포트와 완전히 독립적인 시즌성 바이럴 모듈 — useWrappedScheduler가
// 연말/기념일 트리거를 감지하면 이 모달을 띄운다.
//
// 프라이버시 수사학: 카드에는 집계·이모지 중심 수치와 이미 온디바이스에서
// 요약된 하이라이트 발췌(kakaoHighlightService)만 노출한다. 원문 대화 전체는
// 이 컴포넌트가 절대 참조하지 않는다.

import React, { useRef, useState } from 'react';
import {
  Dimensions,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { FontSize, FontWeight, Radius, Spacing } from '../../styles/theme';
import { formatScore } from '../../utils/scoreCalculator';
import type { WrappedData } from '../../services/coupleWrappedService';

const { width: SCREEN_W } = Dimensions.get('window');

interface CoupleWrappedModalProps {
  visible: boolean;
  data: WrappedData | null;
  myName: string;
  partnerName: string;
  onClose: () => void;
}

function formatPeakDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m, 10)}월 ${parseInt(d, 10)}일`;
}

export function CoupleWrappedModal({ visible, data, myName, partnerName, onClose }: CoupleWrappedModalProps) {
  const [page, setPage] = useState(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.96);

  React.useEffect(() => {
    if (visible) {
      setPage(0);
      opacity.value = withTiming(1, { duration: 260 });
      scale.value = withSpring(1, { damping: 18, stiffness: 160 });
    } else {
      opacity.value = withTiming(0, { duration: 180 });
    }
  }, [visible]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));

  if (!visible || !data) return null;

  const pages = buildPages(data, myName, partnerName);
  const total = pages.length;

  const goTo = (next: number) => {
    if (next < 0) return;
    if (next >= total) {
      onClose();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPage(next);
  };

  const handleShare = () => {
    const text = buildShareText(data, myName, partnerName);
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(text);
      }
    } else {
      Share.share({ message: text });
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const current = pages[page];

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, rootStyle]}>
      <LinearGradient colors={current.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.glowOrb} pointerEvents="none" />

      {/* IG 스토리 스타일 상단 세그먼트 진행바 */}
      <View style={styles.progressRow}>
        {pages.map((_, i) => (
          <View key={i} style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: i <= page ? '100%' : '0%' }]} />
          </View>
        ))}
      </View>

      <Pressable style={styles.closeBtn} onPress={onClose}>
        <Text style={styles.closeBtnText}>✕</Text>
      </Pressable>

      {/* 탭 존: 좌측 = 이전, 우측 = 다음 */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Pressable style={styles.tapLeft} onPress={() => goTo(page - 1)} />
        <Pressable style={styles.tapRight} onPress={() => goTo(page + 1)} />
      </View>

      <Animated.View key={page} entering={FadeIn.duration(320)} style={styles.pageContent}>
        <Text style={styles.badge}>{data.milestoneLabel}</Text>
        <Text style={styles.pageEmoji}>{current.emoji}</Text>
        <Text style={styles.pageTitle}>{current.title}</Text>
        <Text style={styles.pageBody}>{current.body}</Text>
        {current.footnote && <Text style={styles.pageFootnote}>{current.footnote}</Text>}

        {current.isShareCard && (
          <Pressable style={styles.shareBtn} onPress={handleShare}>
            <LinearGradient
              colors={['#FF6B8B', '#D946EF', '#7C3AED']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.shareBtnGrad}
            >
              <Text style={styles.shareBtnText}>📤 공유 요약 카드 보내기</Text>
            </LinearGradient>
          </Pressable>
        )}
      </Animated.View>

      <Text style={styles.swipeHint}>탭해서 다음으로 →</Text>
    </Animated.View>
  );
}

// ── 카드 시퀀스 구성 ───────────────────────────────────────────────────────────

interface WrappedPage {
  emoji: string;
  title: string;
  body: string;
  footnote?: string;
  gradient: readonly [string, string, string];
  isShareCard?: boolean;
}

function buildPages(data: WrappedData, myName: string, partnerName: string): WrappedPage[] {
  const pages: WrappedPage[] = [];

  // 1. 티어 기반 칭호 표지
  pages.push({
    emoji: data.tier.emoji,
    title: data.tier.title,
    body: `${myName} & ${partnerName}\n${formatScore(data.currentScore)}% 일치율`,
    gradient: data.tier.theme.gradient,
  });

  // 2. S_Current 최고점 일자
  pages.push({
    emoji: '📈',
    title: '올해 최고의 순간',
    body: data.peakDay
      ? `${formatPeakDate(data.peakDay.date)}, 우리 일치율이\n${formatScore(data.peakDay.score)}%까지 올랐어요!`
      : '이제 막 우리의 기록을 쌓아가는 중이에요',
    gradient: ['#7C3AED', '#D946EF', '#FF6B8B'],
  });

  // 3. G-HUM 최다 유발 드립 TOP 3
  pages.push({
    emoji: '😂',
    title: '우리를 웃게 한 드립 TOP 3',
    body: data.topFunnyLines.length > 0
      ? data.topFunnyLines.map((l, i) => `${i + 1}. "${l.text}"`).join('\n\n')
      : '아직 웃긴 순간이 충분히 쌓이지 않았어요',
    gradient: ['#FBBF24', '#F97316', '#7C3AED'],
  });

  // 4. 다정했던 한마디
  pages.push({
    emoji: '💌',
    title: '가장 다정했던 한마디',
    body: data.sweetestLine ? `"${data.sweetestLine.text}"` : '앞으로 더 다정한 순간을 쌓아가요',
    gradient: ['#F472B6', '#D946EF', '#7C3AED'],
  });

  // 5. 회복 서사(C-ARC) 극복 횟수
  pages.push({
    emoji: '🌱',
    title: '우리가 함께 극복한 순간',
    body: `갈등 후 서로에게 먼저 손 내민 순간이\n${data.recoveryCount}번 있었어요`,
    footnote: '싸운 뒤에도 다시 다가간 용기가 우리 관계를 더 단단하게 만들었어요',
    gradient: ['#34D399', '#7C3AED', '#0F172A'],
  });

  // 6. 공유 요약 카드
  pages.push({
    emoji: data.tier.emoji,
    title: `${data.milestoneLabel} 우리의 기록`,
    body: `${formatScore(data.currentScore)}% · ${data.tier.title}\n드립 ${data.topFunnyLines.length}개 · 극복 ${data.recoveryCount}회`,
    footnote: '민감한 원문 대신 집계 수치만 공유돼요',
    gradient: ['#0F172A', '#4C1D95', '#7C3AED'],
    isShareCard: true,
  });

  return pages;
}

function buildShareText(data: WrappedData, myName: string, partnerName: string): string {
  return [
    `🎉 ${data.milestoneLabel} — ${myName} & ${partnerName}의 연애 결산`,
    `${data.tier.emoji} ${data.tier.title} (${formatScore(data.currentScore)}%)`,
    data.peakDay ? `📈 최고의 날: ${formatPeakDate(data.peakDay.date)} (${formatScore(data.peakDay.score)}%)` : '',
    `😂 웃긴 드립 ${data.topFunnyLines.length}개 · 🌱 극복한 순간 ${data.recoveryCount}회`,
    '\nby Twin.me 🧬',
  ].filter(Boolean).join('\n');
}

const styles = StyleSheet.create({
  root: { zIndex: 10000, backgroundColor: '#0A0D1A' },
  glowOrb: {
    position: 'absolute', top: -80, right: -60,
    width: 260, height: 260, borderRadius: 130,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  progressRow: {
    position: 'absolute', top: Platform.OS === 'ios' ? 54 : 24, left: 12, right: 12,
    flexDirection: 'row', gap: 4, zIndex: 5,
  },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#fff' },
  closeBtn: {
    position: 'absolute', top: Platform.OS === 'ios' ? 66 : 36, right: 14, zIndex: 6,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { color: '#fff', fontSize: 16 },
  tapLeft: { position: 'absolute', top: 0, bottom: 0, left: 0, width: SCREEN_W * 0.35 },
  tapRight: { position: 'absolute', top: 0, bottom: 0, right: 0, width: SCREEN_W * 0.65 },
  pageContent: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.xl, gap: Spacing.md,
  },
  badge: {
    position: 'absolute', top: Platform.OS === 'ios' ? 100 : 70,
    color: 'rgba(255,255,255,0.75)', fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 1,
  },
  pageEmoji: { fontSize: 64 },
  pageTitle: {
    color: '#fff', fontSize: FontSize['2xl'], fontWeight: FontWeight.extrabold,
    textAlign: 'center', letterSpacing: -0.3,
  },
  pageBody: {
    color: 'rgba(255,255,255,0.92)', fontSize: FontSize.base, lineHeight: 26,
    textAlign: 'center', fontWeight: FontWeight.medium,
  },
  pageFootnote: {
    color: 'rgba(255,255,255,0.55)', fontSize: FontSize.xs, textAlign: 'center', marginTop: Spacing.sm,
  },
  shareBtn: { borderRadius: Radius.pill, overflow: 'hidden', marginTop: Spacing.lg, width: '100%' },
  shareBtnGrad: { paddingVertical: 15, alignItems: 'center' },
  shareBtnText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
  swipeHint: {
    position: 'absolute', bottom: 28, alignSelf: 'center',
    color: 'rgba(255,255,255,0.5)', fontSize: FontSize.xs,
  },
});
