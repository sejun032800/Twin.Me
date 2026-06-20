// ─── AI 코스 플래너 타임라인 UI (FUN-HIS-006) ────────────────────────────────
//
// 등록된 데이트 코스를 카테고리 + 거리 기반으로 자동 정렬해 타임라인으로 시각화.
// [✨ AI 동선 자동 최적화] 버튼 → 300ms 셔플 → 최적 순서 착착 정렬.
// 다크/라이트 테마 완전 호환.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { FontSize, FontWeight, Radius, Spacing } from '../../styles/theme';
import type { DateCourse } from '../../context/AppContext';
import {
  optimizeDateCourse,
  OptimizedCourse,
  CATEGORY_COLOR,
  CATEGORY_LABEL,
} from '../../utils/courseOptimizer';

// ── Status badge toggle ───────────────────────────────────────────────────────

function StatusBadge({
  isVisited,
  onToggle,
  isLight,
}: {
  isVisited: boolean;
  onToggle: () => void;
  isLight: boolean;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    scale.value = withSequence(withTiming(0.88, { duration: 80 }), withSpring(1, { damping: 10 }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle();
  };

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={handlePress}
        style={[
          badgeS.root,
          isVisited
            ? (isLight ? badgeS.visitedLight : badgeS.visitedDark)
            : (isLight ? badgeS.pendingLight  : badgeS.pendingDark),
        ]}
      >
        <Text style={[badgeS.txt, { color: isVisited ? (isLight ? '#15803D' : '#4ADE80') : (isLight ? '#B45309' : '#FBBF24') }]}>
          {isVisited ? '✓ 방문완료' : '· 예정'}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const badgeS = StyleSheet.create({
  root: { borderRadius: Radius.pill, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  visitedDark:  { backgroundColor: 'rgba(74,222,128,0.12)', borderColor: 'rgba(74,222,128,0.35)' },
  visitedLight: { backgroundColor: 'rgba(21,128,61,0.1)',   borderColor: 'rgba(21,128,61,0.3)' },
  pendingDark:  { backgroundColor: 'rgba(251,191,36,0.10)', borderColor: 'rgba(251,191,36,0.3)' },
  pendingLight: { backgroundColor: 'rgba(180,83,9,0.08)',   borderColor: 'rgba(180,83,9,0.25)' },
  txt: { fontSize: 10, fontWeight: FontWeight.bold },
});

// ── Timeline item ─────────────────────────────────────────────────────────────

function TimelineItem({
  item,
  index,
  total,
  isLight,
  visited,
  onToggleVisited,
  animIndex,
}: {
  item: OptimizedCourse;
  index: number;
  total: number;
  isLight: boolean;
  visited: boolean;
  onToggleVisited: () => void;
  animIndex: number;
}) {
  const catColor = CATEGORY_COLOR[item.timeCategory];
  const translateX = useSharedValue(-30);
  const opacity    = useSharedValue(0);

  useEffect(() => {
    const delay = animIndex * 60;
    translateX.value = withDelay(delay, withSpring(0, { damping: 16, stiffness: 200 }));
    opacity.value    = withDelay(delay, withTiming(1, { duration: 250 }));
  }, [animIndex, translateX, opacity]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  const isLast = index === total - 1;

  return (
    <Animated.View style={[itemS.wrapper, animStyle]}>
      {/* Left: number badge + connector line */}
      <View style={itemS.leftCol}>
        <View style={[itemS.numBadge, { backgroundColor: catColor + '22', borderColor: catColor }]}>
          <Text style={[itemS.numText, { color: catColor }]}>{item.planOrder}</Text>
        </View>
        {!isLast && (
          <View style={itemS.connectorWrap}>
            {[...Array(6)].map((_, i) => (
              <View key={i} style={[itemS.dot, { backgroundColor: catColor + '55' }]} />
            ))}
          </View>
        )}
      </View>

      {/* Right: card */}
      <View style={[itemS.card, isLight ? itemS.cardLight : itemS.cardDark]}>
        {/* Time + category */}
        <View style={itemS.cardTop}>
          <Text style={[itemS.timeText, { color: catColor }]}>{item.estimatedStartTime}</Text>
          <View style={[itemS.catChip, { backgroundColor: catColor + '18', borderColor: catColor + '44' }]}>
            <Text style={[itemS.catText, { color: catColor }]}>
              {CATEGORY_LABEL[item.timeCategory].split(' · ')[1]}
            </Text>
          </View>
        </View>
        {/* Title + status */}
        <View style={itemS.cardBody}>
          <Text style={[itemS.title, { color: isLight ? '#1E1035' : '#F1F5F9' }]} numberOfLines={1}>
            {item.title}
          </Text>
          <StatusBadge
            isVisited={visited}
            onToggle={onToggleVisited}
            isLight={isLight}
          />
        </View>
        {/* Date */}
        <Text style={itemS.date}>{item.date}</Text>
      </View>
    </Animated.View>
  );
}

const itemS = StyleSheet.create({
  wrapper: { flexDirection: 'row', gap: 10, marginBottom: 2 },
  leftCol: { width: 32, alignItems: 'center' },
  numBadge: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  numText: { fontSize: 12, fontWeight: FontWeight.extrabold },
  connectorWrap: { flex: 1, alignItems: 'center', paddingVertical: 4, gap: 3 },
  dot: { width: 3, height: 3, borderRadius: 1.5 },
  card: {
    flex: 1, borderRadius: Radius.lg, padding: Spacing.sm,
    borderWidth: 1, gap: 4, marginBottom: Spacing.sm,
  },
  cardDark:  { backgroundColor: 'rgba(10,13,26,0.75)', borderColor: 'rgba(255,255,255,0.08)' },
  cardLight: { backgroundColor: 'rgba(255,255,255,0.82)', borderColor: 'rgba(0,0,0,0.08)' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeText: { fontSize: 10, fontWeight: FontWeight.bold },
  catChip: { borderRadius: Radius.pill, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  catText: { fontSize: 9, fontWeight: FontWeight.semibold },
  cardBody: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  title: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  date: { color: '#64748B', fontSize: 9 },
});

// ── Shuffle animation ─────────────────────────────────────────────────────────

function useShuffleAnim() {
  const progress = useSharedValue(0);

  const trigger = useCallback(() => {
    progress.value = withSequence(
      withTiming(1, { duration: 150 }),
      withTiming(0, { duration: 150 }),
    );
  }, [progress]);

  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 0.5, 1], [1, 0.94, 1]) }],
    opacity: interpolate(progress.value, [0, 0.5, 1], [1, 0.7, 1]),
  }));

  return { trigger, btnStyle };
}

// ── CoursePlanner (main component) ───────────────────────────────────────────

export interface CoursePlannerProps {
  visible: boolean;
  onClose: () => void;
  courses: DateCourse[];
  isLight: boolean;
  /** Called with final ordered courses + route coordinates for map binding */
  onOptimized: (ordered: OptimizedCourse[]) => void;
}

export function CoursePlanner({ visible, onClose, courses, isLight, onOptimized }: CoursePlannerProps) {
  const [optimized, setOptimized]       = useState<OptimizedCourse[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [visitedIds, setVisitedIds]     = useState<Set<string>>(new Set());
  const [animKey, setAnimKey]           = useState(0);
  const { trigger: triggerShuffle, btnStyle: shuffleBtnStyle } = useShuffleAnim();

  // Slide-up animation
  const slideY   = useSharedValue(600);
  const opacity  = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 220 });
      slideY.value  = withSpring(0, { damping: 20, stiffness: 160 });
      // Initial sort on open
      if (courses.length > 0 && optimized.length === 0) {
        const result = optimizeDateCourse(courses);
        setOptimized(result);
        onOptimized(result);
        // Pre-populate visited set from existing ratings
        const vis = new Set<string>();
        result.forEach((c) => { if (c.myRating > 0) vis.add(c.id); });
        setVisitedIds(vis);
      }
    } else {
      opacity.value = withTiming(0, { duration: 180 });
      slideY.value  = withTiming(600, { duration: 260 });
    }
  }, [visible, courses, opacity, slideY]);

  const sheetStyle  = useAnimatedStyle(() => ({ transform: [{ translateY: slideY.value }], opacity: opacity.value }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const handleOptimize = () => {
    if (isOptimizing || courses.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    triggerShuffle();
    setIsOptimizing(true);

    setTimeout(() => {
      const result = optimizeDateCourse(courses);
      setOptimized(result);
      setAnimKey((k) => k + 1);
      onOptimized(result);
      setIsOptimizing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 300);
  };

  const toggleVisited = (id: string) => {
    setVisitedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, panelS.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Panel */}
      <Animated.View style={[panelS.sheet, isLight ? panelS.sheetLight : panelS.sheetDark, sheetStyle]}>
        {/* Header gradient */}
        <LinearGradient
          colors={isLight
            ? ['rgba(114,84,119,0.08)', 'transparent']
            : ['rgba(124,58,237,0.15)', 'transparent']}
          style={panelS.headerGrad}
        />

        {/* Header row */}
        <View style={panelS.header}>
          <View style={panelS.headerLeft}>
            <Text style={[panelS.headerTitle, { color: isLight ? '#1E1035' : '#F1F5F9' }]}>
              🗺️ AI 코스 플래너
            </Text>
            <Text style={panelS.headerSub}>
              {optimized.length}개 장소 · {courses.length > 0 ? '최적 동선 계산 완료' : '장소를 먼저 등록하세요'}
            </Text>
          </View>
          <Pressable onPress={onClose} style={panelS.closeBtn} hitSlop={8}>
            <Text style={panelS.closeTxt}>✕</Text>
          </Pressable>
        </View>

        {/* AI optimize button */}
        <View style={panelS.optimizeBtnWrap}>
          <Animated.View style={[{ flex: 1 }, shuffleBtnStyle]}>
            <TouchableOpacity
              style={panelS.optimizeBtn}
              onPress={handleOptimize}
              activeOpacity={0.83}
              disabled={isOptimizing || courses.length === 0}
            >
              <LinearGradient
                colors={['#7C3AED', '#D946EF', '#FF6B8B']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={panelS.optimizeBtnGrad}
              >
                {isOptimizing ? (
                  <View style={panelS.optimizingRow}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={panelS.optimizeBtnTxt}>  동선 최적화 중...</Text>
                  </View>
                ) : (
                  <Text style={panelS.optimizeBtnTxt}>✨ AI 동선 자동 최적화</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Timeline list */}
        {courses.length === 0 ? (
          <View style={panelS.emptyWrap}>
            <Text style={panelS.emptyIcon}>📍</Text>
            <Text style={[panelS.emptyTitle, { color: isLight ? '#3B1F5E' : '#E2D9FF' }]}>
              등록된 장소가 없어요
            </Text>
            <Text style={panelS.emptySub}>
              지도 위에 핀을 꽂거나 장소를 검색해{'\n'}코스를 먼저 등록해 보세요!
            </Text>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={panelS.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {optimized.map((item, idx) => (
              <TimelineItem
                key={`${item.id}-${animKey}`}
                item={item}
                index={idx}
                total={optimized.length}
                isLight={isLight}
                visited={visitedIds.has(item.id)}
                onToggleVisited={() => toggleVisited(item.id)}
                animIndex={idx}
              />
            ))}
            <View style={{ height: 24 }} />
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const panelS = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(10,13,26,0.72)' },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    maxHeight: '88%',
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  sheetDark: {
    backgroundColor: 'rgba(10,13,26,0.98)',
    borderColor: 'rgba(124,58,237,0.35)',
  },
  sheetLight: {
    backgroundColor: 'rgba(248,245,255,0.98)',
    borderColor: 'rgba(114,84,119,0.25)',
  },
  headerGrad: { ...StyleSheet.absoluteFill, height: 80 },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.sm,
  },
  headerLeft: { flex: 1, gap: 2 },
  headerTitle: { fontSize: FontSize.base, fontWeight: FontWeight.extrabold },
  headerSub: { color: '#64748B', fontSize: FontSize.xs },
  closeBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeTxt: { color: '#94A3B8', fontSize: 14 },
  optimizeBtnWrap: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md },
  optimizeBtn: { borderRadius: Radius.pill, overflow: 'hidden' },
  optimizeBtnGrad: { paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  optimizingRow: { flexDirection: 'row', alignItems: 'center' },
  optimizeBtnTxt: { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold, letterSpacing: 0.2 },
  scrollContent: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 10 },
  emptyIcon: { fontSize: 42 },
  emptyTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  emptySub: { color: '#64748B', fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
});
