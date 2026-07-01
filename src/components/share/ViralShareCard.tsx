// ─── Viral Share Card — 9:16 Instagram Story Format ──────────────────────────
//
// Renders a portrait card optimised for Instagram Stories (9:16 ratio).
// On web, the card's DOM node can be captured by shareEngine via dom-to-image-more.
// On native, the card is displayed in a preview modal before native sharing.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../styles/theme';
import type { WeeklyReportData } from '../../services/weeklyReportService';
import { captureAndShare, getRelationshipMbti, getYellowCardLine } from '../../utils/shareEngine';

// ── Card dimensions (9:16 portrait) ──────────────────────────────────────────

const CARD_W = Math.min(300, Dimensions.get('window').width - 48);
const CARD_H = Math.round(CARD_W * (16 / 9));

// ── Radar axis colours ────────────────────────────────────────────────────────

const AXIS_COLORS = ['#FF6B8B', '#D946EF', '#7C3AED', '#38BDF8', '#4ADE80'] as const;

// ── ViralShareCard ────────────────────────────────────────────────────────────

interface ViralShareCardProps {
  reportData: WeeklyReportData;
  myName: string;
  partnerName: string;
  /** Forwarded ref — on web this resolves to the underlying DOM node for capture */
  cardRef?: React.RefObject<View | null>;
  /** 'freeHighlight' (FUN-REP-002): 워터마크 포함 무료 미리보기 — matchStats/radar 절대 미노출 */
  mode?: 'full' | 'freeHighlight';
}

export function ViralShareCard({ reportData, myName, cardRef, mode = 'full' }: ViralShareCardProps) {
  const {
    overallScore, radarAxes, radarValues, topTopics,
    matchStats, weekLabel, weatherLabel, bestMomentText,
  } = reportData;

  const isFreeHighlight = mode === 'freeHighlight';
  const mbti     = getRelationshipMbti(overallScore, topTopics);
  const fouls    = matchStats?.fouls.me ?? 0;
  const yellowCard = getYellowCardLine(fouls, myName);
  const highlightQuote = bestMomentText || '이번 주에도 사랑스러운 순간들이 가득했어요 💕';

  const scoreColor =
    overallScore >= 80 ? '#4ADE80' :
    overallScore >= 60 ? '#FF6B8B' : '#F97316';

  return (
    <View ref={cardRef} style={[cardStyles.root, { width: CARD_W, height: CARD_H }]}>
      {/* Background gradient */}
      <LinearGradient
        colors={['#050312', '#130824', '#0D1544']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Top glow orb */}
      <View style={cardStyles.glowTopRight} pointerEvents="none" />
      <View style={cardStyles.glowBottomLeft} pointerEvents="none" />

      {/* ── TOP BAR ── */}
      <View style={cardStyles.topBar}>
        <View>
          <View style={cardStyles.logoRow}>
            <Text style={cardStyles.logoMain}>Twin</Text>
            <Text style={cardStyles.logoDot}>.me</Text>
            <Text style={cardStyles.logoDna}> 🧬</Text>
          </View>
          <Text style={cardStyles.topSubtitle}>이번 주 우리의 연애 결산</Text>
        </View>
        <View style={cardStyles.weekBadge}>
          <Text style={cardStyles.weekBadgeText}>{weekLabel}</Text>
        </View>
      </View>

      {/* ── SCORE RING ── */}
      <View style={[cardStyles.scoreRingWrap, { shadowColor: scoreColor }]}>
        <View style={[cardStyles.scoreRing, { borderColor: scoreColor }]}>
          <Text style={[cardStyles.scoreNum, { color: scoreColor }]}>
            {overallScore.toFixed(1)}
          </Text>
          <Text style={cardStyles.scoreLabel}>애정 지수</Text>
        </View>
        <Text style={cardStyles.weatherBadge}>{weatherLabel}</Text>
      </View>

      {/* ── COPY PILLS ── */}
      <View style={cardStyles.copyBlock}>
        <View style={cardStyles.copyPill}>
          <Text style={cardStyles.copyPillLabel}>우리의 연애 MBTI</Text>
          <Text style={cardStyles.copyPillValue}>{mbti}</Text>
        </View>
        <View style={cardStyles.copyPill}>
          <Text style={cardStyles.copyPillLabel}>{isFreeHighlight ? '이번 주 다정 발췌' : '이번 주 판정'}</Text>
          <Text style={cardStyles.copyPillValue}>{isFreeHighlight ? `"${highlightQuote}"` : yellowCard}</Text>
        </View>
      </View>

      {/* ── RADAR BARS (premium) / 워터마크 리본 (무료 하이라이트) ── */}
      {isFreeHighlight ? (
        <View style={cardStyles.watermarkRibbon}>
          <Text style={cardStyles.watermarkRibbonText}>🔓 무료 미리보기 · 전체 리포트는 프리미엄에서</Text>
        </View>
      ) : (
        <View style={cardStyles.barsSection}>
          {radarAxes.map((ax, i) => {
            const pct = Math.round((radarValues[i] ?? 0) * 100);
            const color = AXIS_COLORS[i % AXIS_COLORS.length];
            return (
              <View key={ax} style={cardStyles.barRow}>
                <Text style={cardStyles.barLabel}>{ax}</Text>
                <View style={cardStyles.barTrack}>
                  <LinearGradient
                    colors={[color, color + '88']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={[cardStyles.barFill, { width: `${pct}%` as any }]}
                  />
                </View>
                <Text style={[cardStyles.barPct, { color }]}>{pct}%</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* ── FOOTER ── */}
      <View style={cardStyles.footer}>
        <View style={cardStyles.footerDivider} />
        <Text style={cardStyles.footerCta}>
          나도 내 연인과 분석해보기{' '}
          <Text style={cardStyles.footerArrow}>➔</Text>
        </Text>
        <Text style={cardStyles.footerBrand}>TWIN.ME · AI 연애 분석 서비스</Text>
      </View>
    </View>
  );
}

// ── ViralShareModal ───────────────────────────────────────────────────────────

interface ViralShareModalProps {
  visible: boolean;
  onClose: () => void;
  reportData: WeeklyReportData | null;
  myName: string;
  partnerName: string;
  /** 'freeHighlight' (FUN-REP-002): 워터마크 포함 무료 미리보기 카드 */
  mode?: 'full' | 'freeHighlight';
}

export function ViralShareModal({
  visible, onClose, reportData, myName, partnerName, mode = 'full',
}: ViralShareModalProps) {
  const isFreeHighlight = mode === 'freeHighlight';
  const [capturing, setCapturing] = useState(false);

  const overlayOpacity  = useSharedValue(0);
  const cardTranslateY  = useSharedValue(60);
  const cardOpacity     = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      overlayOpacity.value = withTiming(1, { duration: 220 });
      cardOpacity.value    = withTiming(1, { duration: 280 });
      cardTranslateY.value = withSpring(0, { damping: 18, stiffness: 140 });
    } else {
      overlayOpacity.value = withTiming(0, { duration: 200 });
      cardOpacity.value    = withTiming(0, { duration: 180 });
      cardTranslateY.value = withTiming(60, { duration: 240 });
    }
  }, [visible, overlayOpacity, cardOpacity, cardTranslateY]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const cardStyle    = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslateY.value }],
  }));

  // Web DOM capture ref
  const cardRef = useRef<View>(null);

  const handleCapture = useCallback(async () => {
    if (!reportData) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCapturing(true);
    try {
      let domRef: Element | null = null;

      if (Platform.OS === 'web' && cardRef.current) {
        // On React Native Web, View ref resolves to the underlying DOM element
        domRef = cardRef.current as unknown as Element;
      }

      await captureAndShare({ domRef, reportData, myName, partnerName, mode });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert('오류', '이미지 생성에 실패했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setCapturing(false);
    }
  }, [reportData, myName, partnerName, mode]);

  if (!visible || !reportData) return null;

  return (
    <View style={[StyleSheet.absoluteFill, shareModalStyles.root]} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, shareModalStyles.backdrop, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Modal content */}
      <Animated.View style={[shareModalStyles.modal, cardStyle]}>
        {/* Modal header */}
        <View style={shareModalStyles.header}>
          <LinearGradient
            colors={['rgba(255,107,139,0.14)', 'rgba(217,70,239,0.08)', 'transparent']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={shareModalStyles.headerLeft}>
            <Text style={shareModalStyles.headerTitle}>{isFreeHighlight ? '💫 무료 하이라이트 카드' : '✨ 이주의 연애 카드'}</Text>
            <Text style={shareModalStyles.headerSub}>
              {isFreeHighlight ? '워터마크 포함 무료 미리보기예요!' : '인스타 스토리에 자랑해 보세요!'}
            </Text>
          </View>
          <Pressable onPress={onClose} style={shareModalStyles.closeBtn}>
            <Text style={shareModalStyles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        {/* Card preview */}
        <View style={shareModalStyles.cardWrap}>
          <ViralShareCard
            cardRef={cardRef}
            reportData={reportData}
            myName={myName}
            mode={mode}
            partnerName={partnerName}
          />
          {/* Neon frame border glow */}
          <View style={shareModalStyles.cardGlowBorder} pointerEvents="none" />
        </View>

        {/* Action buttons */}
        <View style={shareModalStyles.actions}>
          <TouchableOpacity
            style={[shareModalStyles.actionBtn, capturing && shareModalStyles.actionBtnDisabled]}
            onPress={handleCapture}
            activeOpacity={0.82}
            disabled={capturing}
          >
            <LinearGradient
              colors={['#FF6B8B', '#D946EF', '#7C3AED']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={shareModalStyles.actionBtnGrad}
            >
              {capturing ? (
                <View style={shareModalStyles.loadingRow}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={shareModalStyles.actionBtnText}>  카드 생성 중...</Text>
                </View>
              ) : (
                <Text style={shareModalStyles.actionBtnText}>
                  {Platform.OS === 'web' ? '📥 이미지 저장 (PNG)' : '📤 공유하기'}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={shareModalStyles.cancelBtn}
            onPress={onClose}
            activeOpacity={0.75}
          >
            <Text style={shareModalStyles.cancelBtnText}>다음에 할게요</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const cardStyles = StyleSheet.create({
  root: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    padding: 20,
    gap: 14,
    justifyContent: 'space-between',
    shadowColor: '#D946EF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 18,
  },
  glowTopRight: {
    position: 'absolute', top: -50, right: -40,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(124,58,237,0.22)',
  },
  glowBottomLeft: {
    position: 'absolute', bottom: -60, left: -40,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(217,70,239,0.15)',
  },
  topBar: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  logoRow: { flexDirection: 'row', alignItems: 'baseline' },
  logoMain: { color: '#E2D9FF', fontSize: 16, fontWeight: FontWeight.extrabold, letterSpacing: -0.3 },
  logoDot:  { color: '#D946EF', fontSize: 16, fontWeight: FontWeight.extrabold },
  logoDna:  { fontSize: 13 },
  topSubtitle: { color: '#64748B', fontSize: 9, marginTop: 2 },
  weekBadge: {
    backgroundColor: 'rgba(124,58,237,0.25)',
    borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.45)',
  },
  weekBadgeText: { color: '#A78BFA', fontSize: 8, fontWeight: FontWeight.bold },
  scoreRingWrap: { alignItems: 'center', gap: 6, shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 0 } },
  scoreRing: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: 'rgba(124,58,237,0.10)',
    borderWidth: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  scoreNum:   { fontSize: 28, fontWeight: FontWeight.extrabold, lineHeight: 34 },
  scoreLabel: { color: '#94A3B8', fontSize: 9, marginTop: 1 },
  weatherBadge: { color: '#A78BFA', fontSize: 10, fontWeight: FontWeight.medium },
  copyBlock: { gap: 8 },
  copyPill: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  copyPillLabel: { color: '#64748B', fontSize: 8, fontWeight: FontWeight.semibold, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 },
  copyPillValue: { color: '#F1F5F9', fontSize: 12, fontWeight: FontWeight.bold, lineHeight: 17 },
  watermarkRibbon: {
    backgroundColor: 'rgba(217,70,239,0.14)',
    borderRadius: Radius.md, borderWidth: 1, borderStyle: 'dashed',
    borderColor: 'rgba(217,70,239,0.5)', padding: 10, alignItems: 'center',
  },
  watermarkRibbonText: { color: '#D946EF', fontSize: 10, fontWeight: FontWeight.bold, textAlign: 'center' },
  barsSection: { gap: 7 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  barLabel: { color: '#94A3B8', fontSize: 9, width: 34 },
  barTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  barPct: { fontSize: 9, fontWeight: FontWeight.bold, width: 28, textAlign: 'right' },
  footer: { gap: 5, alignItems: 'center' },
  footerDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', width: '100%', marginBottom: 4 },
  footerCta: { color: '#E2D9FF', fontSize: 10, fontWeight: FontWeight.semibold },
  footerArrow: { color: '#D946EF' },
  footerBrand: { color: '#475569', fontSize: 8, letterSpacing: 0.5 },
});

const shareModalStyles = StyleSheet.create({
  root: { zIndex: 9999 },
  backdrop: { backgroundColor: 'rgba(5,3,18,0.92)' },
  modal: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(12,9,30,0.99)',
    borderTopLeftRadius: Radius['2xl'], borderTopRightRadius: Radius['2xl'],
    borderWidth: 1, borderColor: 'rgba(255,107,139,0.20)',
    paddingBottom: 36,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.md,
    overflow: 'hidden',
  },
  headerLeft: { flex: 1, gap: 2 },
  headerTitle: { color: '#F1F5F9', fontSize: FontSize.base, fontWeight: FontWeight.bold },
  headerSub: { color: '#64748B', fontSize: FontSize.xs },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { color: '#94A3B8', fontSize: 16 },
  cardWrap: {
    alignItems: 'center',
    paddingVertical: Spacing.base,
  },
  cardGlowBorder: {
    position: 'absolute',
    borderRadius: Radius.xl + 2,
    top: Spacing.base - 3,
    bottom: Spacing.base - 3,
    left: (Dimensions.get('window').width - CARD_W) / 2 - 3,
    right: (Dimensions.get('window').width - CARD_W) / 2 - 3,
    borderWidth: 1.5,
    borderColor: 'rgba(217,70,239,0.45)',
    shadowColor: '#D946EF',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  actions: { paddingHorizontal: Spacing.xl, gap: Spacing.sm, marginTop: Spacing.sm },
  actionBtn: { borderRadius: Radius.pill, overflow: 'hidden' },
  actionBtnDisabled: { opacity: 0.65 },
  actionBtnGrad: { paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  loadingRow: { flexDirection: 'row', alignItems: 'center' },
  actionBtnText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold, letterSpacing: 0.3 },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelBtnText: { color: '#64748B', fontSize: FontSize.sm },
});
