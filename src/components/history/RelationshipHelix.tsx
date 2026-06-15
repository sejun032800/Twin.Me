// Step #33 — 3D DNA 나선 타워 (RelationshipHelix)
// 투시변환(Perspective Projection) + Reanimated 4 UI-thread worklet 기반 60fps 3D.
// three.js/expo-gl 불필요 — 기존 reanimated + gesture-handler 활용.
// GestureHandlerRootView는 app/_layout.tsx에 이미 존재하므로 중복 래핑 불필요.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import type { SharedValue } from 'react-native-reanimated';

import type { MemoryNode } from '../../hooks/useMemoryWall';
import { FontSize, FontWeight, Radius, Spacing } from '../../styles/theme';

// ── 화면 치수 ──────────────────────────────────────────────────────────────────
const { width: SW } = Dimensions.get('window');

// ── 나선 매개변수 ──────────────────────────────────────────────────────────────
// DNA 이중나선: x(t) = R·cos(t), z(t) = R·sin(t), y(t) = t·pitch
const FOCAL   = 370;                    // 투시 초점거리 (world unit)
const RADIUS  = 68;                     // 나선 반지름
const PITCH   = 19;                     // 라디안당 y 상승량
const TURNS   = 3.8;                    // 회전 수
const T_MAX   = TURNS * Math.PI * 2;
const N_PTS   = 32;                     // 가닥당 점 개수 (×2 = 64 노드)
const HALF_H  = (T_MAX * PITCH) / 2;   // 나선 중심 기준점
const CX      = SW / 2;                // 씬 X축 중앙

// 염기쌍 브리지 인덱스 (9개, 나선 전체에 균등 배치)
const BRIDGE_IDXS: readonly number[] = Array.from(
  { length: 9 },
  (_, k) => Math.round(((k + 0.5) / 9) * N_PTS),
);

// ── 색상 팔레트 ────────────────────────────────────────────────────────────────
// Strand A: 감정 리본 (violet → orchid → pink)
// Strand B: 세레니티 리본 (navy → sky → teal)
const PALETTE_A: readonly string[] = ['#7C3AED', '#A855F7', '#D946EF', '#FF6B8B'];
const PALETTE_B: readonly string[] = ['#1E3A8A', '#3B82F6', '#38BDF8', '#2DD4BF'];

function paletteColor(stops: readonly string[], t: number): string {
  const n = stops.length - 1;
  const i = Math.min(Math.floor(t * n), n - 1);
  const f = t * n - i;
  const ch = (hex: string, off: number) => parseInt(hex.slice(1 + off * 2, 3 + off * 2), 16);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * f);
  return (
    `rgb(${mix(ch(stops[i], 0), ch(stops[i + 1], 0))},` +
    `${mix(ch(stops[i], 1), ch(stops[i + 1], 1))},` +
    `${mix(ch(stops[i], 2), ch(stops[i + 1], 2))})`
  );
}

// ── 정적 나선 기하 (모듈 로드 시 1회 계산) ────────────────────────────────────
interface Pt3D { x: number; y: number; z: number; progress: number }

function buildStrand(phase: number): Pt3D[] {
  return Array.from({ length: N_PTS + 1 }, (_, i) => {
    const t = (i / N_PTS) * T_MAX;
    return {
      x: RADIUS * Math.cos(t + phase),
      y: t * PITCH - HALF_H,
      z: RADIUS * Math.sin(t + phase),
      progress: i / N_PTS,
    };
  });
}

const STRAND_A = buildStrand(0);
const STRAND_B = buildStrand(Math.PI);   // 반대편 가닥 (π 위상 차)

// ── 워크릿: 3D → 2D 투시변환 ──────────────────────────────────────────────────
// Y축 회전(방위각) 후 투시 나눗셈으로 스크린 좌표 획득.
function project(
  wx: number, wy: number, wz: number,
  az: number,
  cy: number,
): { sx: number; sy: number; depth: number; sc: number } {
  'worklet';
  const ca = Math.cos(az);
  const sa = Math.sin(az);
  // Y축 회전
  const rx = wx * ca - wz * sa;
  const rz = wx * sa + wz * ca;
  // 투시 분할
  const d = FOCAL + rz;
  const sc = d > 1 ? FOCAL / d : 0.5;
  return { sx: rx * sc + CX, sy: -wy * sc + cy, depth: rz, sc };
}

// ─── HelixNode ─────────────────────────────────────────────────────────────────
// 각 가닥의 구형 마디. 깊이에 따라 크기·불투명도가 변화 → 입체감.
function HelixNode({
  pt, azimuth, cy, color,
}: {
  pt: Pt3D;
  azimuth: SharedValue<number>;
  cy: SharedValue<number>;
  color: string;
}) {
  const s = useAnimatedStyle(() => {
    'worklet';
    const { sx, sy, depth, sc } = project(pt.x, pt.y, pt.z, azimuth.value, cy.value);
    const size = Math.max(3.5, 11 * sc);
    const opacity = depth > -FOCAL * 0.8
      ? Math.max(0.08, Math.min(1, sc * 1.4))
      : 0.03;
    return {
      left: sx - size / 2,
      top: sy - size / 2,
      width: size,
      height: size,
      borderRadius: size / 2,
      opacity,
      zIndex: Math.round((depth + 500) * 5),
    };
  });
  return <Animated.View style={[hxS.node, { backgroundColor: color }, s]} />;
}

// ─── BridgeNode ────────────────────────────────────────────────────────────────
// 두 가닥을 잇는 염기쌍 브리지 (DNA 가로선).
// 두 끝점의 스크린 좌표에서 선분 길이·각도를 계산해 회전된 직사각형으로 렌더링.
function BridgeNode({
  ptA, ptB, azimuth, cy,
}: {
  ptA: Pt3D;
  ptB: Pt3D;
  azimuth: SharedValue<number>;
  cy: SharedValue<number>;
}) {
  const s = useAnimatedStyle(() => {
    'worklet';
    const pA = project(ptA.x, ptA.y, ptA.z, azimuth.value, cy.value);
    const pB = project(ptB.x, ptB.y, ptB.z, azimuth.value, cy.value);
    const dx = pB.sx - pA.sx;
    const dy = pB.sy - pA.sy;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const mx = (pA.sx + pB.sx) / 2;
    const my = (pA.sy + pB.sy) / 2;
    const avgSc = (pA.sc + pB.sc) / 2;
    const opacity = Math.max(0.05, Math.min(0.65, avgSc * 0.95));
    return {
      position: 'absolute' as const,
      left: mx - len / 2,
      top: my - 1.5,
      width: len,
      height: 3,
      opacity,
      zIndex: Math.round(((pA.depth + pB.depth) / 2 + 500) * 5),
      transform: [{ rotate: `${angle}deg` }] as const,
    };
  });
  return <Animated.View style={[hxS.bridge, s]} />;
}

// ─── MemoryAnchor ──────────────────────────────────────────────────────────────
// 추억 노드 카드. 가닥 A의 특정 위치에 앵커링되어 깊이에 따라 크기·투명도 변화.
const CARD_BASE_W = 108;

function MemoryAnchor({
  node, pt, azimuth, cy, onPress,
}: {
  node: MemoryNode;
  pt: Pt3D;
  azimuth: SharedValue<number>;
  cy: SharedValue<number>;
  onPress: (n: MemoryNode) => void;
}) {
  const pressSv = useSharedValue(1);

  const s = useAnimatedStyle(() => {
    'worklet';
    const { sx, sy, depth, sc } = project(pt.x, pt.y, pt.z, azimuth.value, cy.value);
    const w = CARD_BASE_W * Math.max(0.52, sc);
    const opacity = depth > -FOCAL * 0.45
      ? Math.max(0.5, Math.min(1, sc * 1.25))
      : 0.1;
    return {
      position: 'absolute' as const,
      left: sx - w / 2,
      top: sy - 40 * sc,
      width: w,
      opacity,
      transform: [{ scale: pressSv.value }] as const,
      zIndex: Math.round((depth + 500) * 5 + 3000),
    };
  });

  return (
    <Animated.View style={[hxS.memCard, s]}>
      <Pressable
        onPressIn={() => { pressSv.value = withSpring(0.9, { damping: 12 }); }}
        onPressOut={() => { pressSv.value = withSpring(1, { damping: 14 }); }}
        onPress={() => onPress(node)}
      >
        <LinearGradient
          colors={['rgba(124,58,237,0.92)', 'rgba(217,70,239,0.82)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={hxS.memInner}
        >
          <Text style={hxS.memTag} numberOfLines={1}>{node.tag}</Text>
          <Text style={hxS.memQuote} numberOfLines={2}>"{node.quote}"</Text>
          <Text style={hxS.memDate}>{node.date}</Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

// ─── HelixAxisGlow ─────────────────────────────────────────────────────────────
// 나선 중심 수직 발광선 (숨쉬는 애니메이션).
function HelixAxisGlow({ height }: { height: number }) {
  const glow = useSharedValue(0.35);
  useEffect(() => {
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.18, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const gs = useAnimatedStyle(() => ({ opacity: glow.value }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        hxS.axis,
        { height: height * 0.72, top: height * 0.14 },
        gs,
      ]}
    />
  );
}

// ─── 정적 별 파티클 필드 ───────────────────────────────────────────────────────
const STARS = Array.from({ length: 44 }, (_, i) => ({
  x: Math.abs(Math.sin(i * 37.13 + 1.2)) * SW,
  y: Math.abs(Math.sin(i * 53.71 + 2.8)) * 900,   // 900 = 최대 높이 추정치
  r: 0.65 + (i % 4) * 0.5,
  o: 0.07 + (i % 6) * 0.04,
}));

function StarField({ height }: { height: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {STARS.map((s, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: s.x,
            top: s.y % Math.max(height, 1),
            width: s.r * 2,
            height: s.r * 2,
            borderRadius: s.r,
            backgroundColor: '#fff',
            opacity: s.o,
          }}
        />
      ))}
    </View>
  );
}

// ─── HelixDetailModal ──────────────────────────────────────────────────────────
// 추억 카드 탭 시 표시되는 상세 팝업 모달.
function HelixDetailModal({
  node,
  onClose,
}: {
  node: MemoryNode;
  onClose: () => void;
}) {
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={hxS.modalBg} onPress={onClose}>
        <Pressable style={hxS.modalCard} onPress={() => {}}>
          <LinearGradient
            colors={['rgba(18,6,38,0.99)', 'rgba(10,13,26,1)']}
            style={hxS.modalInner}
          >
            {/* 상단 네온 발광바 */}
            <View style={hxS.glowBar} />

            {/* 태그 + 화자 */}
            <View style={hxS.tagRow}>
              <LinearGradient
                colors={['#7C3AED', '#D946EF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={hxS.tagPill}
              >
                <Text style={hxS.tagTxt}>{node.tag}</Text>
              </LinearGradient>
              <Text style={hxS.speakerTxt}>
                {node.speaker === 'me' ? '💬 내가 한 말' : '💬 상대방이 한 말'}
              </Text>
            </View>

            {/* 인용구 */}
            <Text style={hxS.quoteTxt}>"{node.quote}"</Text>
            <Text style={hxS.dateTxt}>{node.date}</Text>

            {/* 닫기 */}
            <Pressable onPress={onClose} style={hxS.closeWrap}>
              <LinearGradient
                colors={['#7C3AED', '#D946EF', '#FF6B8B']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={hxS.closeGrad}
              >
                <Text style={hxS.closeTxt}>닫기</Text>
              </LinearGradient>
            </Pressable>
          </LinearGradient>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── MemoryFragment (새 기억 조각 파티클) ──────────────────────────────────────
// 새 기억이 DNA 나선에 결합될 때 발사되는 빛 파편 파티클 (8개).

const FRAGMENT_DEFS = [
  { dx: -60, dy: -80, color: '#D946EF', size: 7, delay: 0 },
  { dx:  60, dy: -80, color: '#7C3AED', size: 5, delay: 60 },
  { dx:  90, dy:   0, color: '#FF6B8B', size: 6, delay: 30 },
  { dx: -90, dy:   0, color: '#38BDF8', size: 4, delay: 90 },
  { dx: -50, dy:  70, color: '#D946EF', size: 5, delay: 45 },
  { dx:  50, dy:  70, color: '#7C3AED', size: 7, delay: 75 },
  { dx:   0, dy: -100, color: '#F59E0B', size: 6, delay: 15 },
  { dx:   0, dy:  100, color: '#4ADE80', size: 4, delay: 105 },
] as const;

function MemoryFragment({
  cx, cy, def,
}: {
  cx: number;
  cy: number;
  def: typeof FRAGMENT_DEFS[number];
}) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.3);

  useEffect(() => {
    tx.value = withDelay(def.delay, withTiming(def.dx, { duration: 700, easing: Easing.out(Easing.quad) }));
    ty.value = withDelay(def.delay, withTiming(def.dy, { duration: 700, easing: Easing.out(Easing.quad) }));
    opacity.value = withDelay(
      def.delay,
      withSequence(
        withTiming(1, { duration: 120 }),
        withTiming(1, { duration: 400 }),
        withTiming(0, { duration: 180 }),
      ),
    );
    scale.value = withDelay(
      def.delay,
      withSequence(
        withSpring(1.4, { damping: 10, stiffness: 300 }),
        withTiming(0.4, { duration: 400 }),
      ),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: cx - def.size / 2 + tx.value,
    top: cy - def.size / 2 + ty.value,
    width: def.size,
    height: def.size,
    borderRadius: def.size / 2,
    backgroundColor: def.color,
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
    shadowColor: def.color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 20,
  }));

  return <Animated.View style={style} pointerEvents="none" />;
}

// ─── NewMemoryGlow ──────────────────────────────────────────────────────────────
// 최상단 MemoryAnchor에 고정되는 네온 글로우 링 (새 기억 결합 시 1회 발광).

function NewMemoryGlow({
  cx, cy,
}: {
  cx: number;
  cy: number;
}) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withSequence(
      withSpring(1.8, { damping: 8, stiffness: 200 }),
      withTiming(2.6, { duration: 600, easing: Easing.out(Easing.quad) }),
    );
    opacity.value = withSequence(
      withTiming(0.9, { duration: 100 }),
      withTiming(0.6, { duration: 300 }),
      withTiming(0, { duration: 500 }),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: cx - 28,
    top: cy - 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2.5,
    borderColor: '#D946EF',
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
    shadowColor: '#D946EF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 30,
  }));

  return <Animated.View style={style} pointerEvents="none" />;
}

// ─── RelationshipHelix (공개 API) ──────────────────────────────────────────────
export function RelationshipHelix({
  memories,
  height,
  newMemoryCount = 0,
}: {
  memories: MemoryNode[];
  height: number;
  newMemoryCount?: number;
}) {
  const azimuth = useSharedValue(0);
  const savedAz = useSharedValue(0);
  // 씬 중심 Y: 높이 변화에 반응하는 공유값 (worklet에서 직접 접근)
  const cy = useSharedValue(height * 0.48);
  const [focusedNode, setFocusedNode] = useState<MemoryNode | null>(null);
  const [burstKey, setBurstKey] = useState(0);
  const [showBurst, setShowBurst] = useState(false);
  const prevCountRef = useRef(newMemoryCount);

  useEffect(() => {
    cy.value = height * 0.48;
  }, [height, cy]);

  // Detect new memories and fire burst animation
  useEffect(() => {
    if (newMemoryCount > prevCountRef.current && prevCountRef.current >= 0) {
      prevCountRef.current = newMemoryCount;
      setShowBurst(false);
      setBurstKey((k) => k + 1);
      // Brief delay so state update is clean before showing burst
      const t = setTimeout(() => {
        setShowBurst(true);
        // Auto-hide after animation completes (~900ms)
        setTimeout(() => setShowBurst(false), 950);
      }, 50);
      return () => clearTimeout(t);
    }
    prevCountRef.current = newMemoryCount;
  }, [newMemoryCount]);

  // 마운트 시 천천히 자동 회전
  useEffect(() => {
    azimuth.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 22000, easing: Easing.linear }),
      -1,
      false,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 팬 제스처: 좌우 드래그 → 방위각(azimuth) 제어
  const pan = Gesture.Pan()
    .onBegin(() => {
      'worklet';
      cancelAnimation(azimuth);
      savedAz.value = azimuth.value;
    })
    .onUpdate((e) => {
      'worklet';
      azimuth.value = savedAz.value + e.translationX * 0.0082;
    })
    .onEnd((e) => {
      'worklet';
      // 손가락 속도 기반 관성 감속
      azimuth.value = withDecay({ velocity: e.velocityX * 0.0082 });
    });

  const handlePress = useCallback((n: MemoryNode) => setFocusedNode(n), []);

  // 추억 카드를 가닥 A 위에 균등 배치
  const anchors = memories.map((m, i) => {
    const frac = memories.length > 1 ? i / (memories.length - 1) : 0.5;
    return { node: m, pt: STRAND_A[Math.round(frac * N_PTS)] };
  });

  // 파티클 폭발 중심 — 나선 상단 고정
  const burstCX = CX;
  const burstCY = height * 0.22; // 나선 상단 추정 위치

  return (
    <View style={[hxS.root, { height }]}>
      {/* 우주 배경 그라데이션 */}
      <LinearGradient
        colors={['#000000', '#030014', '#010010', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* 별 파티클 필드 */}
      <StarField height={height} />

      {/* 중심 수직 발광선 */}
      <HelixAxisGlow height={height} />

      {/* 헤더 배지 */}
      <View style={hxS.header} pointerEvents="none">
        <LinearGradient
          colors={['#7C3AED', '#D946EF', '#FF6B8B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={hxS.headerBadge}
        >
          <Text style={hxS.headerTitle}>🧬  관계 DNA 나선</Text>
        </LinearGradient>
        <Text style={hxS.headerSub}>
          좌우 드래그 회전 · 카드 터치로 추억 열기
        </Text>
      </View>

      {/* 3D 씬 + 팬 제스처 레이어 */}
      <GestureDetector gesture={pan}>
        <View style={StyleSheet.absoluteFill}>

          {/* 가닥 A: violet → orchid → pink */}
          {STRAND_A.map((pt, i) => (
            <HelixNode
              key={`a${i}`}
              pt={pt}
              azimuth={azimuth}
              cy={cy}
              color={paletteColor(PALETTE_A, pt.progress)}
            />
          ))}

          {/* 가닥 B: navy → sky → teal */}
          {STRAND_B.map((pt, i) => (
            <HelixNode
              key={`b${i}`}
              pt={pt}
              azimuth={azimuth}
              cy={cy}
              color={paletteColor(PALETTE_B, pt.progress)}
            />
          ))}

          {/* 염기쌍 브리지 (가로 연결선) */}
          {BRIDGE_IDXS.map((idx) => (
            <BridgeNode
              key={`br${idx}`}
              ptA={STRAND_A[idx]}
              ptB={STRAND_B[idx]}
              azimuth={azimuth}
              cy={cy}
            />
          ))}

          {/* 추억 카드 앵커 (가닥 A 위치에 고정) */}
          {anchors.map(({ node, pt }) => (
            <MemoryAnchor
              key={node.id}
              node={node}
              pt={pt}
              azimuth={azimuth}
              cy={cy}
              onPress={handlePress}
            />
          ))}

          {/* 새 기억 결합 파티클 폭발 — 신규 memorySentences 추가 시 발동 */}
          {showBurst && FRAGMENT_DEFS.map((def, i) => (
            <MemoryFragment
              key={`${burstKey}-frag-${i}`}
              cx={burstCX}
              cy={burstCY}
              def={def}
            />
          ))}

          {/* 새 기억 결합 네온 글로우 링 */}
          {showBurst && (
            <NewMemoryGlow key={`${burstKey}-glow`} cx={burstCX} cy={burstCY} />
          )}

        </View>
      </GestureDetector>

      {/* 하단 범례 */}
      <View style={hxS.legend} pointerEvents="none">
        <View style={hxS.legendRow}>
          <View style={[hxS.legendDot, { backgroundColor: '#D946EF' }]} />
          <Text style={hxS.legendTxt}>감정 리본 A</Text>
        </View>
        <View style={hxS.legendRow}>
          <View style={[hxS.legendDot, { backgroundColor: '#38BDF8' }]} />
          <Text style={hxS.legendTxt}>세레니티 리본 B</Text>
        </View>
        <View style={hxS.legendRow}>
          <View style={[hxS.legendDot, { backgroundColor: 'rgba(255,255,255,0.4)' }]} />
          <Text style={hxS.legendTxt}>염기쌍</Text>
        </View>
      </View>

      {/* 추억 상세 팝업 */}
      {focusedNode && (
        <HelixDetailModal node={focusedNode} onClose={() => setFocusedNode(null)} />
      )}
    </View>
  );
}

// ─── 스타일 ────────────────────────────────────────────────────────────────────
const hxS = StyleSheet.create({
  root: { overflow: 'hidden' },

  // 나선 마디 (구형 점)
  node: { position: 'absolute' },

  // 염기쌍 브리지 (흰색 얇은 선)
  bridge: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 2,
  },

  // 중심 수직 발광선
  axis: {
    position: 'absolute',
    left: CX - 1.5,
    width: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(124,58,237,0.55)',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 10,
  },

  // 추억 카드
  memCard: {
    position: 'absolute',
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(217,70,239,0.58)',
    shadowColor: '#D946EF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.92,
    shadowRadius: 20,
    elevation: 24,
  },
  memInner: { padding: 8, gap: 3 },
  memTag: {
    color: '#E879F9',
    fontSize: 8,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  memQuote: {
    color: '#F1F5F9',
    fontSize: 9.5,
    fontStyle: 'italic',
    lineHeight: 13,
  },
  memDate: { color: 'rgba(100,116,139,0.85)', fontSize: 8 },

  // 헤더
  header: {
    position: 'absolute',
    top: 14,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 7,
    zIndex: 500,
  },
  headerBadge: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 28,
  },
  headerTitle: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.6,
  },
  headerSub: {
    color: 'rgba(148,163,184,0.58)',
    fontSize: 10,
    textAlign: 'center',
  },

  // 하단 범례
  legend: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.base,
    zIndex: 500,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendTxt: { color: 'rgba(148,163,184,0.52)', fontSize: 9 },

  // 상세 모달
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  modalCard: {
    width: '100%',
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.52)',
    shadowColor: '#D946EF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 30,
    elevation: 30,
  },
  modalInner: { padding: Spacing.xl, gap: Spacing.md },
  glowBar: {
    height: 2,
    borderRadius: 1,
    backgroundColor: '#D946EF',
    shadowColor: '#D946EF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    marginBottom: 4,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tagPill: {
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  tagTxt: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  speakerTxt: { color: '#64748B', fontSize: FontSize.xs },
  quoteTxt: {
    color: '#F1F5F9',
    fontSize: FontSize.lg,
    fontStyle: 'italic',
    lineHeight: 28,
    letterSpacing: 0.2,
  },
  dateTxt: { color: '#475569', fontSize: FontSize.sm },
  closeWrap: { borderRadius: Radius.xl, overflow: 'hidden', marginTop: 4 },
  closeGrad: { paddingVertical: 12, alignItems: 'center' },
  closeTxt: {
    color: '#fff',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
});
