import React, { createElement, useEffect } from 'react';
import {
  ActivityIndicator,
  Platform,
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
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Colors, FontSize, FontWeight, Radius, Shadows, Spacing } from '../../styles/theme';
import { useAppContext } from '../../context/AppContext';
import type { WeeklyReportData, TopicItem } from '../../services/weeklyReportService';

// ─── SVG helpers (web only) ────────────────────────────────────────────────────

function svgEl(
  tag: string,
  props: Record<string, unknown>,
  ...children: React.ReactNode[]
): React.ReactElement | null {
  if (Platform.OS !== 'web') return null;
  return createElement(tag, props, ...children) as React.ReactElement;
}

// ─── Donut Chart ─────────────────────────────────────────────────────────────

function DonutChartWeb({
  topics,
  overallScore,
  size,
}: {
  topics: TopicItem[];
  overallScore: number;
  size: number;
}) {
  const total = topics.reduce((s, t) => s + t.value, 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.38;
  const strokeW = R * 0.52;
  const circ = 2 * Math.PI * R;
  let offset = -circ * 0.25;
  const GAP = 2;

  const segs = topics.map((t) => {
    const frac = t.value / total;
    const dash = circ * frac - GAP;
    const segOffset = -offset;
    const el = svgEl('circle', {
      key: t.label,
      cx, cy, r: R,
      fill: 'none',
      stroke: t.color,
      strokeWidth: strokeW,
      strokeDasharray: `${dash} ${circ - dash}`,
      strokeDashoffset: segOffset,
      style: { transition: 'stroke-dasharray 0.6s ease' },
    });
    offset -= circ * frac;
    return el;
  });

  const svg = svgEl(
    'svg',
    { width: size, height: size, viewBox: `0 0 ${size} ${size}` },
    svgEl('circle', {
      cx, cy, r: R,
      fill: 'none',
      stroke: 'rgba(255,255,255,0.06)',
      strokeWidth: strokeW,
    }),
    ...segs,
    svgEl('text', {
      x: cx, y: cy - 6,
      textAnchor: 'middle',
      fill: '#F1F5F9',
      fontSize: 20,
      fontWeight: 'bold',
    }, `${overallScore}`),
    svgEl('text', {
      x: cx, y: cy + 13,
      textAnchor: 'middle',
      fill: '#94A3B8',
      fontSize: 9,
    }, '점'),
  ) as React.ReactElement;

  return <View style={{ alignItems: 'center' }}>{svg}</View>;
}

function DonutChartNative({
  topics,
  overallScore,
  size,
}: {
  topics: TopicItem[];
  overallScore: number;
  size: number;
}) {
  const total = topics.reduce((s, t) => s + t.value, 0) || 1;
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <View
        style={[
          styles.nativeDonutRing,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        <Text style={styles.nativeDonutScore}>{overallScore}</Text>
        <Text style={styles.nativeDonutLabel}>점</Text>
      </View>
      <View style={styles.legendCol}>
        {topics.map((t) => (
          <View key={t.label} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: t.color }]} />
            <View
              style={[
                styles.legendBar,
                { width: `${(t.value / total) * 160}` as any },
              ]}
            >
              <View
                style={[
                  styles.legendBarFill,
                  {
                    width: `${(t.value / total) * 100}%`,
                    backgroundColor: t.color,
                  },
                ]}
              />
            </View>
            <Text style={styles.legendText}>
              {t.label} {t.value}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function DonutChart({
  topics,
  overallScore,
}: {
  topics: TopicItem[];
  overallScore: number;
}) {
  const size = 140;
  if (Platform.OS === 'web')
    return <DonutChartWeb topics={topics} overallScore={overallScore} size={size} />;
  return <DonutChartNative topics={topics} overallScore={overallScore} size={size} />;
}

// ─── Emotion Line Chart ────────────────────────────────────────────────────────

function EmotionLineChartWeb({
  data,
  labels,
  width,
  height,
}: {
  data: number[];
  labels: string[];
  width: number;
  height: number;
}) {
  const padding = { top: 12, bottom: 22, left: 10, right: 10 };
  const cw = width - padding.left - padding.right;
  const ch = height - padding.top - padding.bottom;
  const min = Math.min(...data) - 5;
  const max = Math.max(...data) + 5;
  const range = max - min || 1;

  const pts = data.map((v, i) => ({
    x: padding.left + (i / (data.length - 1)) * cw,
    y: padding.top + (1 - (v - min) / range) * ch,
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = [
    `M${pts[0].x},${padding.top + ch}`,
    ...pts.map((p) => `L${p.x},${p.y}`),
    `L${pts[pts.length - 1].x},${padding.top + ch}`,
    'Z',
  ].join(' ');

  const gradId = `lineGrad_${data.join('')}`;

  const svg = svgEl(
    'svg',
    { width, height, viewBox: `0 0 ${width} ${height}` },
    svgEl(
      'defs',
      {},
      svgEl(
        'linearGradient',
        { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 },
        svgEl('stop', { offset: '0%', stopColor: '#D946EF', stopOpacity: 0.35 }),
        svgEl('stop', { offset: '100%', stopColor: '#D946EF', stopOpacity: 0.02 }),
      ),
    ),
    ...[0.25, 0.5, 0.75, 1.0].map((f, i) =>
      svgEl('line', {
        key: `grid-${i}`,
        x1: padding.left,
        y1: padding.top + ch * (1 - f),
        x2: padding.left + cw,
        y2: padding.top + ch * (1 - f),
        stroke: 'rgba(255,255,255,0.05)',
        strokeWidth: 1,
      }),
    ),
    svgEl('path', { d: areaPath, fill: `url(#${gradId})` }),
    svgEl('path', {
      d: linePath,
      fill: 'none',
      stroke: '#D946EF',
      strokeWidth: 2.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
    ...pts.map((p, i) =>
      svgEl('circle', {
        key: `dot-${i}`,
        cx: p.x,
        cy: p.y,
        r: 3.5,
        fill: i === pts.length - 1 ? '#FF6B8B' : '#7C3AED',
        stroke: 'rgba(15,10,40,0.8)',
        strokeWidth: 1.5,
      }),
    ),
    ...labels.map((l, i) =>
      svgEl('text', {
        key: `lbl-${i}`,
        x: padding.left + (i / (data.length - 1)) * cw,
        y: height - 4,
        textAnchor: 'middle',
        fill: '#64748B',
        fontSize: 9,
      }, l),
    ),
  ) as React.ReactElement;

  return <View>{svg}</View>;
}

function EmotionLineChartNative({
  data,
  labels,
  width,
  height,
}: {
  data: number[];
  labels: string[];
  width: number;
  height: number;
}) {
  const pad = 12;
  const cw = width - pad * 2;
  const ch = height - 28;
  const min = Math.min(...data) - 5;
  const max = Math.max(...data) + 5;
  const range = max - min || 1;

  const pts = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * cw,
    y: pad + (1 - (v - min) / range) * ch,
  }));

  return (
    <View style={{ width, height }}>
      {pts.slice(0, -1).map((p1, i) => {
        const p2 = pts[i + 1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        return (
          <View
            key={`line-${i}`}
            style={{
              position: 'absolute',
              left: (p1.x + p2.x) / 2 - len / 2,
              top: (p1.y + p2.y) / 2 - 1,
              width: len,
              height: 2.5,
              backgroundColor: '#D946EF',
              opacity: 0.7,
              transform: [{ rotate: `${angle}deg` }],
            }}
          />
        );
      })}
      {pts.map((p, i) => (
        <View
          key={`dot-${i}`}
          style={{
            position: 'absolute',
            left: p.x - 4,
            top: p.y - 4,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: i === pts.length - 1 ? '#FF6B8B' : '#7C3AED',
            borderWidth: 1.5,
            borderColor: 'rgba(15,10,40,0.8)',
          }}
        />
      ))}
      {labels.map((l, i) => (
        <Text
          key={`lbl-${i}`}
          style={{
            position: 'absolute',
            left: pad + (i / (data.length - 1)) * cw - 8,
            top: ch + pad + 6,
            fontSize: 9,
            color: '#64748B',
            width: 16,
            textAlign: 'center',
          }}
        >
          {l}
        </Text>
      ))}
    </View>
  );
}

function EmotionLineChart({
  data,
  labels,
}: {
  data: number[];
  labels: string[];
}) {
  const W = 260;
  const H = 90;
  if (Platform.OS === 'web')
    return <EmotionLineChartWeb data={data} labels={labels} width={W} height={H} />;
  return <EmotionLineChartNative data={data} labels={labels} width={W} height={H} />;
}

// ─── Radar Chart ──────────────────────────────────────────────────────────────

function RadarChartWeb({
  axes,
  values,
  size,
}: {
  axes: string[];
  values: number[];
  size: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.35;
  const n = axes.length;

  const pt = (idx: number, radius: number) => {
    const a = (idx * 2 * Math.PI) / n - Math.PI / 2;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  };

  const gridLevels = [0.3, 0.6, 1.0];
  const gridPaths = gridLevels.map((lv) => {
    const ps = axes.map((_, i) => pt(i, r * lv));
    return ps.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + 'Z';
  });

  const axisLines = axes.map((_, i) => ({ from: { x: cx, y: cy }, to: pt(i, r) }));
  const valuePts = values.map((v, i) => pt(i, r * v));
  const valuePath =
    valuePts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + 'Z';
  const labelPts = axes.map((lbl, i) => ({ lbl, ...pt(i, r + 16) }));
  const gradId = 'radarGrad';

  const svg = svgEl(
    'svg',
    { width: size, height: size, viewBox: `0 0 ${size} ${size}` },
    svgEl(
      'defs',
      {},
      svgEl(
        'linearGradient',
        { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 },
        svgEl('stop', { offset: '0%', stopColor: '#7C3AED', stopOpacity: 0.5 }),
        svgEl('stop', { offset: '100%', stopColor: '#FF6B8B', stopOpacity: 0.25 }),
      ),
    ),
    ...gridPaths.map((d, i) =>
      svgEl('path', {
        key: `grid-${i}`,
        d,
        fill: 'none',
        stroke: 'rgba(255,255,255,0.07)',
        strokeWidth: 1,
      }),
    ),
    ...axisLines.map((l, i) =>
      svgEl('line', {
        key: `axis-${i}`,
        x1: l.from.x,
        y1: l.from.y,
        x2: l.to.x,
        y2: l.to.y,
        stroke: 'rgba(255,255,255,0.1)',
        strokeWidth: 1,
      }),
    ),
    svgEl('path', {
      d: valuePath,
      fill: `url(#${gradId})`,
      stroke: '#D946EF',
      strokeWidth: 2,
      strokeLinejoin: 'round',
    }),
    ...valuePts.map((p, i) =>
      svgEl('circle', { key: `vdot-${i}`, cx: p.x, cy: p.y, r: 4, fill: '#FF6B8B' }),
    ),
    ...labelPts.map((l, i) =>
      svgEl('text', {
        key: `lbl-${i}`,
        x: l.x,
        y: l.y,
        textAnchor: 'middle',
        dominantBaseline: 'middle',
        fill: 'rgba(241,245,249,0.55)',
        fontSize: 9,
      }, l.lbl),
    ),
  ) as React.ReactElement;

  return <View style={{ alignItems: 'center' }}>{svg}</View>;
}

function RadarChartNative({
  axes,
  values,
}: {
  axes: string[];
  values: number[];
}) {
  return (
    <View style={styles.radarNativeWrap}>
      {axes.map((axis, i) => (
        <View key={axis} style={styles.radarBarRow}>
          <Text style={styles.radarBarLabel}>{axis}</Text>
          <View style={styles.radarBarTrack}>
            <View
              style={[
                styles.radarBarFill,
                {
                  width: `${values[i] * 100}%` as any,
                  backgroundColor: [
                    '#D946EF',
                    '#7C3AED',
                    '#38BDF8',
                    '#FF6B8B',
                    '#A78BFA',
                  ][i % 5],
                },
              ]}
            />
          </View>
          <Text style={styles.radarBarPct}>{Math.round(values[i] * 100)}%</Text>
        </View>
      ))}
    </View>
  );
}

function RadarChart({ axes, values }: { axes: string[]; values: number[] }) {
  const size = 180;
  if (Platform.OS === 'web')
    return <RadarChartWeb axes={axes} values={values} size={size} />;
  return <RadarChartNative axes={axes} values={values} />;
}

// ─── Section Card wrapper ─────────────────────────────────────────────────────

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

// ─── Topic legend rows (alongside donut) ──────────────────────────────────────

function TopicLegend({ topics }: { topics: TopicItem[] }) {
  const total = topics.reduce((s, t) => s + t.value, 0) || 1;
  return (
    <View style={styles.topicLegend}>
      {topics.map((t) => (
        <View key={t.label} style={styles.topicLegendRow}>
          <View style={[styles.topicDot, { backgroundColor: t.color }]} />
          <Text style={styles.topicLegendLabel}>{t.label}</Text>
          <Text style={[styles.topicLegendPct, { color: t.color }]}>
            {Math.round((t.value / total) * 100)}%
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <ActivityIndicator size="large" color="#D946EF" />
      <Text style={styles.skeletonTitle}>데이터 분석 중...</Text>
      <Text style={styles.skeletonSub}>
        채팅 기록을 집계하고{'\n'}AI 리포트를 생성하고 있어요 🔬
      </Text>
    </View>
  );
}

// ─── Empty state (no data yet) ────────────────────────────────────────────────

function EmptyState() {
  return (
    <View style={styles.skeletonWrap}>
      <Text style={styles.skeletonTitle}>📊 리포트 준비 중</Text>
      <Text style={styles.skeletonSub}>
        카카오톡 파일을 업로드하면{'\n'}주간 연애 리포트가 자동으로 생성돼요!{'\n\n'}
        매주 일요일 밤 10시에 새 리포트를 드려요 🌙
      </Text>
    </View>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface WeeklyReportModalProps {
  visible: boolean;
  onClose: () => void;
}

export function WeeklyReportModal({ visible, onClose }: WeeklyReportModalProps) {
  const { weeklyReportData } = useAppContext();

  const overlayOpacity = useSharedValue(0);
  const cardTranslateY = useSharedValue(60);
  const cardRotateY = useSharedValue(-30);
  const cardScale = useSharedValue(0.88);
  const cardOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      overlayOpacity.value = withTiming(1, { duration: 280 });
      cardOpacity.value = withTiming(1, { duration: 320 });
      cardTranslateY.value = withSpring(0, { damping: 18, stiffness: 140 });
      cardRotateY.value = withSpring(0, { damping: 14, stiffness: 110 });
      cardScale.value = withSpring(1, { damping: 16, stiffness: 140 });
    } else {
      overlayOpacity.value = withTiming(0, { duration: 220 });
      cardOpacity.value = withTiming(0, { duration: 200 });
      cardTranslateY.value = withTiming(60, { duration: 260 });
      cardRotateY.value = withTiming(30, { duration: 280 });
      cardScale.value = withTiming(0.88, { duration: 260 });
    }
  }, [visible, overlayOpacity, cardTranslateY, cardRotateY, cardScale, cardOpacity]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [
      { perspective: 1200 },
      { translateY: cardTranslateY.value },
      { rotateY: `${cardRotateY.value}deg` },
      { scale: cardScale.value },
    ],
  }));

  const sec1 = useSharedValue(0);
  const sec2 = useSharedValue(0);
  const sec3 = useSharedValue(0);
  const sec4 = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      const delays = [320, 480, 640, 780];
      [sec1, sec2, sec3, sec4].forEach((sv, i) => {
        setTimeout(() => {
          sv.value = withSpring(1, { damping: 16, stiffness: 130 });
        }, delays[i]);
      });
    } else {
      [sec1, sec2, sec3, sec4].forEach((sv) => { sv.value = 0; });
    }
  }, [visible, sec1, sec2, sec3, sec4]);

  const secStyle = (sv: typeof sec1) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedStyle(() => ({
      opacity: interpolate(sv.value, [0, 1], [0, 1]),
      transform: [{ translateY: interpolate(sv.value, [0, 1], [20, 0]) }],
    }));

  if (!visible) return null;

  const r: WeeklyReportData | null = weeklyReportData;

  return (
    <View style={[StyleSheet.absoluteFill, styles.root]} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.modal, cardStyle]}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>📊 주간 연애 리포트</Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        {r && !r.isLoading && (
          <View style={styles.weekRow}>
            <Text style={styles.weekLabel}>{r.weekLabel}</Text>
            <Text style={styles.weatherLabel}>{r.weatherLabel}</Text>
          </View>
        )}

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          bounces
        >
          {/* Loading state */}
          {(!r || r.isLoading) && (
            r?.isLoading ? <LoadingSkeleton /> : <EmptyState />
          )}

          {/* Loaded state */}
          {r && !r.isLoading && (
            <>
              {/* Section 1: Topics */}
              <Animated.View style={secStyle(sec1)}>
                <SectionCard title="💬 최근 대화 주제 TOP 5">
                  {r.topics.length > 0 ? (
                    <View style={styles.donutRow}>
                      <DonutChart
                        topics={r.topics}
                        overallScore={r.overallScore}
                      />
                      <TopicLegend topics={r.topics} />
                    </View>
                  ) : (
                    <Text style={styles.emptyCardText}>대화 데이터 분석 중이에요</Text>
                  )}
                </SectionCard>
              </Animated.View>

              {/* Section 2: Emotion timeline */}
              <Animated.View style={secStyle(sec2)}>
                <SectionCard title="💓 한 주간 감정 안정 지수">
                  <View style={styles.chartCentered}>
                    <EmotionLineChart
                      data={r.emotionData}
                      labels={r.emotionLabels}
                    />
                  </View>
                  <View style={styles.emotionLegendRow}>
                    <View style={styles.emotionLegendItem}>
                      <View style={[styles.emotionDot, { backgroundColor: '#7C3AED' }]} />
                      <Text style={styles.emotionLegendText}>안정 구간</Text>
                    </View>
                    <View style={styles.emotionLegendItem}>
                      <View style={[styles.emotionDot, { backgroundColor: '#FF6B8B' }]} />
                      <Text style={styles.emotionLegendText}>최신 감정</Text>
                    </View>
                  </View>
                </SectionCard>
              </Animated.View>

              {/* Section 3: Radar */}
              <Animated.View style={secStyle(sec3)}>
                <SectionCard title="🗺️ 관계 5차원 레이더">
                  <View style={styles.chartCentered}>
                    <RadarChart axes={r.radarAxes} values={r.radarValues} />
                  </View>
                </SectionCard>
              </Animated.View>

              {/* Section 4: Analyst comment */}
              <Animated.View style={secStyle(sec4)}>
                <SectionCard title="✍️ 트윈이의 감성 한줄평">
                  <View style={styles.analystCard}>
                    <Text style={styles.analystAvatar}>🔬</Text>
                    <View style={styles.analystBubble}>
                      <Text style={styles.analystText}>{r.analystComment}</Text>
                    </View>
                  </View>
                </SectionCard>
              </Animated.View>
            </>
          )}

          <Pressable style={styles.bottomClose} onPress={onClose}>
            <Text style={styles.bottomCloseText}>리포트 닫기</Text>
          </Pressable>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// ─── Report Card Bubble (in analyst chat) ─────────────────────────────────────

interface ReportCardBubbleProps {
  onPress: () => void;
}

export function ReportCardBubble({ onPress }: ReportCardBubbleProps) {
  const { weeklyReportData } = useAppContext();
  const r = weeklyReportData;

  return (
    <TouchableOpacity onPress={onPress} style={styles.reportCard} activeOpacity={0.85}>
      <View style={styles.reportCardHeader}>
        <Text style={styles.reportCardHeaderIcon}>📊</Text>
        <Text style={styles.reportCardHeaderText}>주간 연애 리포트 도착</Text>
      </View>
      <View style={styles.reportCardDivider} />
      <View style={styles.reportCardBody}>
        <View>
          <Text style={styles.reportCardWeek}>
            {r && !r.isLoading ? r.weekLabel : '리포트 생성 중...'}
          </Text>
          <Text style={styles.reportCardWeather}>
            {r && !r.isLoading ? r.weatherLabel : '🔮 분석 중'}
          </Text>
        </View>
        {r && !r.isLoading ? (
          <View style={styles.reportCardScore}>
            <Text style={styles.reportCardScoreNum}>{r.overallScore}</Text>
            <Text style={styles.reportCardScoreLabel}>점</Text>
          </View>
        ) : (
          <ActivityIndicator size="small" color="#FF6B8B" />
        )}
      </View>
      <View style={styles.reportCardTap}>
        <Text style={styles.reportCardTapText}>탭하여 전체 리포트 보기 →</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { zIndex: 9999 },
  overlay: {
    backgroundColor: 'rgba(5, 3, 18, 0.82)',
  },
  modal: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '92%',
    backgroundColor: 'rgba(15, 12, 35, 0.96)',
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(217,70,239,0.18)',
    ...Shadows.card,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  headerBadge: {
    backgroundColor: 'rgba(124,58,237,0.18)',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.base,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.35)',
  },
  headerBadgeText: {
    color: '#A78BFA',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { color: '#94A3B8', fontSize: 16 },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  weekLabel: { color: '#64748B', fontSize: FontSize.xs },
  weatherLabel: {
    color: '#A78BFA',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },

  scrollContent: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing['4xl'],
    gap: Spacing.md,
  },

  // Section card
  sectionCard: {
    backgroundColor: 'rgba(30,41,59,0.55)',
    borderRadius: Radius.xl,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    gap: Spacing.md,
  },
  sectionTitle: {
    color: '#F1F5F9',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.3,
  },
  emptyCardText: {
    color: '#64748B',
    fontSize: FontSize.sm,
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },

  // Loading / empty states
  skeletonWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['3xl'],
    gap: Spacing.md,
  },
  skeletonTitle: {
    color: '#F1F5F9',
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
  },
  skeletonSub: {
    color: '#64748B',
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Donut section
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base },

  // Topic legend
  topicLegend: { flex: 1, gap: 6 },
  topicLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  topicDot: { width: 8, height: 8, borderRadius: 4 },
  topicLegendLabel: { flex: 1, color: '#94A3B8', fontSize: FontSize.xs },
  topicLegendPct: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    minWidth: 28,
    textAlign: 'right',
  },

  // Native donut
  nativeDonutRing: {
    borderWidth: 12,
    borderColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(124,58,237,0.08)',
  },
  nativeDonutScore: {
    color: '#F1F5F9',
    fontSize: FontSize.xl,
    fontWeight: FontWeight.extrabold,
  },
  nativeDonutLabel: { color: '#94A3B8', fontSize: FontSize.xs },
  legendCol: { gap: 5, marginTop: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
  },
  legendBarFill: { height: '100%', borderRadius: 2 },
  legendText: { fontSize: 9, color: '#64748B', minWidth: 80 },

  // Chart centered
  chartCentered: { alignItems: 'center' },

  // Emotion legend
  emotionLegendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.lg,
    marginTop: 4,
  },
  emotionLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  emotionDot: { width: 7, height: 7, borderRadius: 3.5 },
  emotionLegendText: { color: '#64748B', fontSize: FontSize.xs },

  // Radar native
  radarNativeWrap: { gap: Spacing.sm },
  radarBarRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  radarBarLabel: { color: '#94A3B8', fontSize: FontSize.xs, width: 44 },
  radarBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  radarBarFill: { height: '100%', borderRadius: 3 },
  radarBarPct: {
    color: '#64748B',
    fontSize: FontSize.xs,
    width: 30,
    textAlign: 'right',
  },

  // Analyst comment
  analystCard: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  analystAvatar: { fontSize: 28, width: 36 },
  analystBubble: {
    flex: 1,
    backgroundColor: 'rgba(56,189,248,0.07)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.2)',
  },
  analystText: { color: '#CBD5E1', fontSize: FontSize.sm, lineHeight: 22 },

  // Bottom close
  bottomClose: {
    marginTop: Spacing.md,
    alignSelf: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    backgroundColor: 'rgba(124,58,237,0.15)',
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.3)',
  },
  bottomCloseText: {
    color: '#A78BFA',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },

  // Report Card Bubble
  reportCard: {
    backgroundColor: 'rgba(124,58,237,0.12)',
    borderRadius: Radius.xl,
    padding: Spacing.base,
    borderWidth: 1.5,
    borderColor: 'rgba(124,58,237,0.35)',
    maxWidth: 260,
    gap: 8,
  },
  reportCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reportCardHeaderIcon: { fontSize: 16 },
  reportCardHeaderText: {
    color: '#A78BFA',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  reportCardDivider: { height: 1, backgroundColor: 'rgba(124,58,237,0.25)' },
  reportCardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reportCardWeek: { color: '#94A3B8', fontSize: FontSize.xs },
  reportCardWeather: { color: '#C084FC', fontSize: FontSize.xs, marginTop: 3 },
  reportCardScore: { alignItems: 'center' },
  reportCardScoreNum: {
    color: '#FF6B8B',
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.extrabold,
  },
  reportCardScoreLabel: { color: '#94A3B8', fontSize: FontSize.xs, marginTop: -4 },
  reportCardTap: {
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(124,58,237,0.2)',
    alignItems: 'center',
  },
  reportCardTapText: {
    color: '#7C3AED',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
});
