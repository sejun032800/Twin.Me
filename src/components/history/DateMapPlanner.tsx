/**
 * DateMapPlanner.tsx
 *
 * Two exports:
 *   LayerFilterChips — floating toggle chips rendered inside the map canvas
 *   DateMapPlanner   — bottom sheet with budget slider, timeline slots, and A/B/C candidate carousel
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { DateCourse } from '../../context/AppContext';
import { useAppContext } from '../../context/AppContext';
import { FontSize, FontWeight, Radius, Spacing } from '../../styles/theme';
import type { BudgetRange, CandidatePlace } from '../../utils/courseRecommendation';
import { BudgetRangeSlider } from '../ui/BudgetRangeSlider';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── LayerFilterChips ─────────────────────────────────────────────────────────
// Floating overlay chips in the top-left corner of the map canvas.
// Layer 1 (pending)  — neon pink  (#FF6B8B): upcoming date courses
// Layer 2 (archive)  — purple     (#A855F7): past dated courses with memories

export interface LayerFilterChipsProps {
  pending: boolean;
  archive: boolean;
  onChange: (pending: boolean, archive: boolean) => void;
}

export function LayerFilterChips({ pending, archive, onChange }: LayerFilterChipsProps) {
  const { themeTokens } = useAppContext();
  return (
    <View style={layerS.wrap} pointerEvents="box-none">
      <View style={layerS.chips}>
        <Pressable
          style={[
            layerS.chip,
            pending && { borderColor: themeTokens.primary + 'A5', backgroundColor: themeTokens.primary + '1E' },
          ]}
          onPress={() => onChange(!pending, archive)}
          accessibilityLabel="예정된 코스 레이어 토글"
        >
          <View style={[layerS.dot, { backgroundColor: themeTokens.primary, shadowColor: themeTokens.primary }]} />
          <Text style={[layerS.chipTxt, pending && layerS.chipTxtOn]}>✈️ 예정</Text>
        </Pressable>

        <Pressable
          style={[
            layerS.chip,
            archive && { borderColor: themeTokens.secondary + 'A5', backgroundColor: themeTokens.secondary + '1E' },
          ]}
          onPress={() => onChange(pending, !archive)}
          accessibilityLabel="추억 아카이브 레이어 토글"
        >
          <View style={[layerS.dot, { backgroundColor: themeTokens.secondary, shadowColor: themeTokens.secondary }]} />
          <Text style={[layerS.chipTxt, archive && layerS.chipTxtOn]}>💜 추억</Text>
        </Pressable>
      </View>
    </View>
  );
}

const layerS = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 25,
  },
  chips: {
    gap: 7,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(10,13,26,0.84)',
    borderRadius: Radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderWidth: 1.2,
    borderColor: 'rgba(148,163,184,0.18)',
  },
  chipPink: {
    borderColor: 'rgba(255,107,139,0.65)',
    backgroundColor: 'rgba(255,107,139,0.12)',
  },
  chipPurple: {
    borderColor: 'rgba(168,85,247,0.65)',
    backgroundColor: 'rgba(168,85,247,0.12)',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 4,
  },
  chipTxt: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 0.2,
  },
  chipTxtOn: { color: '#F1F5F9' },
});

// ─── TimelineSlotCard ─────────────────────────────────────────────────────────

function TimelineSlotCard({ course, index }: { course: DateCourse; index: number }) {
  const { themeTokens } = useAppContext();
  const isAnchor = index === 0;
  const gradColors: [string, string] = isAnchor
    ? [themeTokens.primary, themeTokens.secondary]
    : ['#4ADE80', '#22D3EE'];

  return (
    <View style={tlS.row}>
      {index > 0 && <View style={tlS.connector} />}

      <View style={tlS.badgeWrap}>
        <LinearGradient colors={gradColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={tlS.badge}>
          <Text style={tlS.badgeTxt}>{isAnchor ? '📍' : String(index + 1)}</Text>
        </LinearGradient>
      </View>

      <View style={[tlS.card, isAnchor && { borderColor: themeTokens.primary + '66', backgroundColor: themeTokens.primary + '14' }]}>
        <Text style={tlS.cardTitle} numberOfLines={1}>{course.title}</Text>
        <Text style={tlS.cardDate}>{course.date}</Text>
        {isAnchor && <Text style={[tlS.anchorLabel, { color: themeTokens.primary }]}>시작 앵커</Text>}
      </View>
    </View>
  );
}

const tlS = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  connector: {
    position: 'absolute',
    left: 15,
    top: -8,
    width: 2,
    height: 8,
    backgroundColor: 'rgba(74,222,128,0.35)',
  },
  badgeWrap: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden' },
  badge: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { color: '#fff', fontSize: 11, fontWeight: '800' as const },
  card: {
    flex: 1,
    backgroundColor: 'rgba(30,41,59,0.7)',
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(100,116,139,0.22)',
    gap: 2,
  },
  cardAnchor: { borderColor: 'rgba(255,107,139,0.4)', backgroundColor: 'rgba(255,107,139,0.08)' },
  cardTitle: { color: '#F1F5F9', fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  cardDate: { color: '#64748B', fontSize: 10 },
  anchorLabel: { color: '#FF6B8B', fontSize: 10, fontWeight: '700' as const, marginTop: 1 },
});

// ─── CandidateCard ────────────────────────────────────────────────────────────

const CAND_COLORS = {
  A: { accent: '#4ADE80', border: 'rgba(74,222,128,0.38)',  bg: 'rgba(74,222,128,0.10)'  },
  B: { accent: '#FBBF24', border: 'rgba(251,191,36,0.38)',  bg: 'rgba(251,191,36,0.10)'  },
  C: { accent: '#34D399', border: 'rgba(52,211,153,0.38)',  bg: 'rgba(52,211,153,0.10)'  },
};

function fmtBudget(val: number): string {
  if (val === 0) return '무료';
  if (val < 10_000) return `₩${val.toLocaleString('ko-KR')}`;
  return `₩${(val / 10_000).toFixed(0)}만원`;
}

function CandidateCard({
  candidate,
  onConfirm,
  disabled,
}: {
  candidate: CandidatePlace;
  onConfirm: (c: CandidatePlace) => void;
  disabled: boolean;
}) {
  const { accent, border, bg } = CAND_COLORS[candidate.label];
  const isWalkable = candidate.distance <= 800;

  return (
    <View style={[candS.card, { borderColor: border, backgroundColor: bg }]}>
      {/* Label circle */}
      <View style={[candS.labelCircle, { backgroundColor: accent, shadowColor: accent }]}>
        <Text style={candS.labelTxt}>{candidate.label}</Text>
      </View>

      {/* Info */}
      <Text style={candS.title} numberOfLines={2}>{candidate.title}</Text>
      <Text style={candS.category} numberOfLines={1}>{candidate.category}</Text>

      {/* Distance */}
      <View style={candS.distRow}>
        <Text style={[candS.distPrimary, { color: accent }]}>
          {isWalkable
            ? `🚶 도보 ${candidate.walkMinutes}분`
            : `🚗 차량 ${candidate.driveMinutes}분`}
        </Text>
        <Text style={candS.distM}>{candidate.distance}m</Text>
      </View>

      {/* Budget chip */}
      <View style={candS.budgetChip}>
        <Text style={candS.budgetTxt}>💰 인당 평균 {fmtBudget(candidate.estimatedBudget)}</Text>
      </View>

      {/* CTA */}
      <Pressable
        style={({ pressed }) => [candS.cta, { borderColor: border }, pressed && candS.ctaPressed]}
        onPress={() => onConfirm(candidate)}
        disabled={disabled}
      >
        <Text style={[candS.ctaTxt, { color: accent }]}>이 코스 추가하기 ✓</Text>
      </Pressable>
    </View>
  );
}

const candS = StyleSheet.create({
  card: {
    width: 196,
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.md,
    gap: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 8,
  },
  labelCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 10,
    elevation: 10,
  },
  labelTxt: { color: '#0A0D1A', fontSize: 15, fontWeight: '900' as const },
  title: { color: '#F1F5F9', fontSize: FontSize.sm, fontWeight: FontWeight.bold, lineHeight: 18 },
  category: { color: '#64748B', fontSize: 10 },
  distRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  distPrimary: { fontSize: 11, fontWeight: '700' as const },
  distM: { color: '#475569', fontSize: 10 },
  budgetChip: {
    backgroundColor: 'rgba(251,191,36,0.10)',
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.28)',
    alignSelf: 'flex-start',
  },
  budgetTxt: { color: '#FBBF24', fontSize: 10, fontWeight: '700' as const },
  cta: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 2,
  },
  ctaPressed: { opacity: 0.6 },
  ctaTxt: { fontSize: 12, fontWeight: '800' as const },
});

// ─── DateMapPlanner (Bottom Sheet) ───────────────────────────────────────────

export interface DateMapPlannerProps {
  visible: boolean;
  onClose: () => void;
  anchor: DateCourse | null;
  plannerSlots: DateCourse[];
  candidates: CandidatePlace[];
  isLoadingCandidates: boolean;
  onCandidateConfirm: (candidate: CandidatePlace) => void;
  // Budget filter
  budgetRange: BudgetRange;
  onBudgetChange: (min: number, max: number) => void;
  totalConfirmedBudget: number;
}

export default function DateMapPlanner({
  visible,
  onClose,
  anchor,
  plannerSlots,
  candidates,
  isLoadingCandidates,
  onCandidateConfirm,
  budgetRange,
  onBudgetChange,
  totalConfirmedBudget,
}: DateMapPlannerProps) {
  const { themeTokens } = useAppContext();
  const slideY = useSharedValue(500);
  const prevSlotsLen = useRef(plannerSlots.length);

  useEffect(() => {
    slideY.value = visible
      ? withSpring(0, { damping: 22, stiffness: 200 })
      : withTiming(500, { duration: 280 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Spring-animate each new slot addition
  useEffect(() => {
    if (plannerSlots.length > prevSlotsLen.current) {
      LayoutAnimation.configureNext(
        LayoutAnimation.create(
          340,
          LayoutAnimation.Types.spring,
          LayoutAnimation.Properties.scaleY,
        ),
      );
    }
    prevSlotsLen.current = plannerSlots.length;
  }, [plannerSlots.length]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideY.value }],
  }));

  if (!visible) return null;

  const hasConfirmedCost = plannerSlots.length > 1 && totalConfirmedBudget > 0;

  return (
    <>
      {/* Dimmed backdrop */}
      <Pressable style={plannerS.backdrop} onPress={onClose} />

      {/* Sliding sheet */}
      <Animated.View style={[plannerS.sheet, sheetStyle]}>
        <LinearGradient
          colors={themeTokens.gradients.mapBottomSheet}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={plannerS.inner}
        >
          <View style={plannerS.handle} />

          {/* Header */}
          <View style={plannerS.headerRow}>
            <LinearGradient
              colors={themeTokens.gradients.primaryToSecondary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={plannerS.headerBadge}
            >
              <Text style={plannerS.headerEmoji}>📋</Text>
              <Text style={plannerS.headerText}>데이트 코스 플래너</Text>
            </LinearGradient>
            <Pressable onPress={onClose} hitSlop={12} style={plannerS.closeBtn}>
              <Text style={plannerS.closeTxt}>✕</Text>
            </Pressable>
          </View>

          {/* ── Budget filter slider ── */}
          <View style={plannerS.budgetSection}>
            <Text style={plannerS.sectionLabel}>💰 예산 필터 (인당)</Text>
            <BudgetRangeSlider
              minValue={budgetRange.min}
              maxValue={budgetRange.max}
              onValuesChangeFinish={onBudgetChange}
            />
          </View>

          {/* ── Timeline ── */}
          <Text style={plannerS.sectionLabel}>📍 오늘의 타임라인</Text>

          {plannerSlots.length === 0 ? (
            <View style={plannerS.emptyBox}>
              <Text style={plannerS.emptyTxt}>
                지도에서 장소를 롱프레스하거나{'\n'}기존 핀을 탭해 코스를 시작하세요 ✋
              </Text>
            </View>
          ) : (
            <ScrollView
              style={plannerS.tlScroll}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              {plannerSlots.map((slot, i) => (
                <TimelineSlotCard key={slot.id} course={slot} index={i} />
              ))}
            </ScrollView>
          )}

          {/* ── Candidate carousel — only shown when anchor is set ── */}
          {anchor !== null && (
            <>
              <Text style={plannerS.sectionLabel}>
                {isLoadingCandidates ? '🔍 다음 코스 후보 탐색 중...' : '✨ AI 추천 후보 A / B / C'}
              </Text>

              {isLoadingCandidates ? (
                <View style={plannerS.loadRow}>
                  <ActivityIndicator color="#4ADE80" size="small" />
                  <Text style={plannerS.loadTxt}>시공간 + 예산 가중치 알고리즘 계산 중...</Text>
                </View>
              ) : candidates.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={plannerS.candRow}
                  nestedScrollEnabled
                >
                  {candidates.map((c) => (
                    <CandidateCard
                      key={c.id}
                      candidate={c}
                      onConfirm={onCandidateConfirm}
                      disabled={isLoadingCandidates}
                    />
                  ))}
                </ScrollView>
              ) : (
                <View style={plannerS.emptyBox}>
                  <Text style={plannerS.emptyTxt}>
                    해당 예산 범위의 추천 장소를 찾지 못했어요 😢{'\n'}예산 범위를 넓혀보세요
                  </Text>
                </View>
              )}
            </>
          )}

          {/* ── Total confirmed budget footer ── */}
          {hasConfirmedCost && (
            <View style={plannerS.totalWrap}>
              <LinearGradient
                colors={['rgba(251,191,36,0.16)', 'rgba(251,191,36,0.06)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={plannerS.totalGrad}
              >
                <Text style={plannerS.totalLabel}>💳 총 예상 데이트 비용</Text>
                <Text style={plannerS.totalValue}>
                  ₩{totalConfirmedBudget.toLocaleString('ko-KR')}
                </Text>
              </LinearGradient>
            </View>
          )}
        </LinearGradient>
      </Animated.View>
    </>
  );
}

const plannerS = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.44)',
    zIndex: 40,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    overflow: 'hidden',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(74,222,128,0.38)',
    maxHeight: '82%',
  },
  inner: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: 44,
    gap: Spacing.md,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(148,163,184,0.28)',
    alignSelf: 'center',
    marginBottom: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  headerEmoji: { fontSize: 16 },
  headerText: { color: '#0A0D1A', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  closeBtn: { padding: 8 },
  closeTxt: { color: '#64748B', fontSize: 16 },

  budgetSection: {
    backgroundColor: 'rgba(20,28,50,0.72)',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.18)',
  },

  sectionLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  tlScroll: { maxHeight: 140 },
  emptyBox: { alignItems: 'center', paddingVertical: Spacing.lg },
  emptyTxt: { color: '#475569', fontSize: FontSize.sm, textAlign: 'center', lineHeight: 18 },
  loadRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  loadTxt: { color: '#64748B', fontSize: FontSize.sm },
  candRow: { gap: 10, paddingRight: Spacing.md, paddingBottom: 6 },

  totalWrap: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.32)',
  },
  totalGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: 12,
  },
  totalLabel: { color: '#94A3B8', fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  totalValue: { color: '#FBBF24', fontSize: FontSize.base, fontWeight: FontWeight.extrabold, letterSpacing: -0.5 },
});
