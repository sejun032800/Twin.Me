// ─── Aura Mesh Background — 6색 성향 테마 엔진의 단일 루트 렌더러 ───────────────
// docs/genesis_interview.md §6.2(연출) + 신규 테마 엔진 스펙(구조색-분위기색 2층 분리,
// 앰비언트 메시 그라데이션, 탭 연속성, 4대 모션 패턴)의 렌더링 구현체.
//
// 구조색/분위기색 분리 불변식: 이 컴포넌트는 배경 틴트(분위기색)만 그린다.
// 텍스트·아이콘·뱃지 등 구조색은 절대 이 컴포넌트를 거치지 않고 ThemeTokens에서
// 직접 온다 — 호출부는 이 위에 화면 컨텐츠를 "투명 배경"으로 얹기만 하면 된다.
//
// 단일 루트 레이어: app/_layout.tsx에 정확히 1회 마운트되어 앱 전역 생명주기 동안
// 유지된다. 탭 스와이프/화면 전환 시 리마운트되지 않으므로 오라가 끊기거나
// 리셋되지 않는다(탭 연속성 보장).

import { LinearGradient } from 'expo-linear-gradient';
import { usePathname } from 'expo-router';
import React, { useEffect, useMemo, useRef } from 'react';
import { Dimensions, Platform, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useAppContext } from '../../context/AppContext';
import type { AuraChannel } from '../../types/genesis';
import { AURA_AXES } from '../../types/genesis';
import {
  computeAuraOpacity,
  defaultNeutralMeshStops,
  etaToTimingDurationMs,
  NEUTRAL_CLAY_CHANNEL,
  resolveAuraScreenKey,
} from '../../engine/auraThemeEngine';
import { MUTE_PASTEL_GATE } from '../../engine/auraThemeEngine';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// 저사양 기기 가드: 이 리포지토리는 expo-blur/react-native-svg를 쓰지 않는 컨벤션이라
// (grep 결과) 실제 블러 대신 반투명 그라데이션 블롭을 겹쳐 메시처럼 보이게 한다.
// Android는 기기 스펙 편차가 커 디바이스 등급 라이브러리 없이는 정밀 감지가 어려우므로,
// 보수적으로 연속 루프 애니메이션(Breathing/Drift)만 비활성화하는 "정적 스냅샷" 폴백을 기본 적용한다.
const ENABLE_CONTINUOUS_MOTION_BY_DEFAULT = Platform.OS !== 'android';

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number) => lN - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(255 * x).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function boostSaturation(c: AuraChannel, delta: number): AuraChannel {
  return { ...c, saturation: Math.min(MUTE_PASTEL_GATE.saturationCap, c.saturation + delta) };
}

// 블롭 배치 — 6개 정지점을 화면에 고르게 흩뿌리는 결정론적 좌표(뮤트 파스텔이므로
// 정확한 랜덤성보다 "겹쳐서 섞이는" 배치가 중요).
const BLOB_LAYOUT = [
  { xr: 0.08, yr: 0.05 },
  { xr: 0.62, yr: 0.02 },
  { xr: -0.05, yr: 0.42 },
  { xr: 0.55, yr: 0.38 },
  { xr: 0.15, yr: 0.72 },
  { xr: 0.6, yr: 0.68 },
] as const;

interface BlobProps {
  fullHex: string;
  neutralHex: string;
  colorMix: SharedValue<number>;
  breathEnabled: boolean;
  driftEnabled: boolean;
  index: number;
  size: number;
}

function AuraBlob({ fullHex, neutralHex, colorMix, breathEnabled, driftEnabled, index, size }: BlobProps) {
  const breath = useSharedValue(0);
  const drift = useSharedValue(0);

  useEffect(() => {
    if (breathEnabled) {
      breath.value = withRepeat(
        withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      );
    } else {
      breath.value = 0;
    }
  }, [breathEnabled]);

  useEffect(() => {
    if (driftEnabled) {
      drift.value = withRepeat(
        withTiming(1, { duration: 11000 + index * 1700, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      drift.value = 0;
    }
  }, [driftEnabled, index]);

  // Breathing은 opacity 미세 진동으로 근사(4초 주기). 실제 색상(채도) 전환은
  // AuraBlobGradient의 colorMix 브릿지가 Bloom/Dissolve 전용으로 전담한다 —
  // LinearGradient의 colors는 네이티브 뷰 prop이라 워클릿 스타일로 직접 구동할 수 없다.
  const style = useAnimatedStyle(() => {
    const angle = drift.value * Math.PI * 2;
    const translateX = driftEnabled ? Math.sin(angle) * 16 : 0;
    const translateY = driftEnabled ? Math.cos(angle * 0.8) * 12 : 0;
    return {
      transform: [{ translateX }, { translateY }],
      opacity: breathEnabled ? 0.85 + breath.value * 0.15 : 1,
    };
  });

  const layout = BLOB_LAYOUT[index % BLOB_LAYOUT.length];

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: SCREEN_W * layout.xr,
          top: SCREEN_H * layout.yr,
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <AuraBlobGradient fullHex={fullHex} neutralHex={neutralHex} colorMix={colorMix} index={index} />
    </Animated.View>
  );
}

// LinearGradient의 colors prop은 애니메이션 스타일로 직접 넘길 수 없으므로,
// 색만 별도 useAnimatedProps 대신 useDerivedValue 기반 리렌더가 아닌 정적 근사를 쓴다:
// colorMix 전환 시점(Bloom/Dissolve)에만 JS 스레드에서 재계산해 리렌더하면 충분히 부드럽다
// (연속 루프가 아니라 이벤트성 전환이므로 60fps 워클릿까지는 불필요).
function AuraBlobGradient({ fullHex, neutralHex, colorMix, index }: {
  fullHex: string; neutralHex: string; colorMix: SharedValue<number>; index: number;
}) {
  const [hex, setHex] = React.useState(fullHex);

  useAnimatedReaction(
    () => colorMix.value,
    (mix, prevMix) => {
      if (prevMix !== null && Math.abs(mix - prevMix) < 0.005) return;
      runOnJS(setHex)(mixHex(fullHex, neutralHex, Math.max(0, Math.min(1, mix))));
    },
    [fullHex, neutralHex],
  );

  const angle = (index * 47) % 360;
  const rad = (angle * Math.PI) / 180;
  const start = { x: 0.5 - Math.cos(rad) * 0.5, y: 0.5 - Math.sin(rad) * 0.5 };
  const end = { x: 0.5 + Math.cos(rad) * 0.5, y: 0.5 + Math.sin(rad) * 0.5 };

  return (
    <LinearGradient
      colors={[hex, `${hex}00`]}
      start={start}
      end={end}
      style={StyleSheet.absoluteFill}
    />
  );
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bch = Math.round(ab + (bb - ab) * t);
  return `#${[r, g, bch].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export default function AuraMeshBackground() {
  const pathname = usePathname();
  const { themeTokens: t, personaMatrix, auraScreenVariant, reduceAuraMotion, overflowStatus } = useAppContext();

  const hasAura = !!personaMatrix?.auraVector;
  const rawMeshStops = personaMatrix?.auraVector?.meshStops ?? defaultNeutralMeshStops(AURA_AXES.length);

  // v2.2 오버플로우 채도 피드백 — 경고 자체는 항상 구조색 레드로 별도 배너가 담당하고,
  // 여기서는 분위기색 채도만 미세 변조한다(EXCESS_GAIN↑ / CRITICAL_LOSS↓).
  const feedbackDelta = overflowStatus === 'EXCESS_GAIN' ? 10 : overflowStatus === 'CRITICAL_LOSS' ? -12 : 0;
  const meshStops = useMemo(
    () => rawMeshStops.map((c) => boostSaturation(c, feedbackDelta)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(rawMeshStops), feedbackDelta],
  );

  const screenKey = resolveAuraScreenKey(pathname);
  const isHelixView = auraScreenVariant === 'helix';
  const isTwinRoom = auraScreenVariant === 'twinRoom';
  const targetOpacity = computeAuraOpacity(t.isLight, screenKey, { isHelixView, isTwinRoom }, reduceAuraMotion);

  const displayOpacity = useSharedValue(targetOpacity);
  useEffect(() => {
    displayOpacity.value = withTiming(targetOpacity, {
      duration: etaToTimingDurationMs(),
      easing: Easing.out(Easing.cubic), // §3.2 감속 추종(Universal Easing)
    });
  }, [targetOpacity]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: displayOpacity.value }));

  // Bloom(0→컬러) / Dissolve(0→무채색) — colorMix: 0=페르소나 컬러, 1=무채색 점토.
  const colorMix = useSharedValue(hasAura ? 0 : 1);
  const prevHasAuraRef = useRef(hasAura);
  useEffect(() => {
    if (prevHasAuraRef.current === hasAura) return;
    if (hasAura) {
      // Bloom: 인터뷰 완료 직후 성향이 처음 드러나는 순간 — 스밈(soak-in)
      colorMix.value = withTiming(0, { duration: 900, easing: Easing.out(Easing.exp) });
    } else {
      // Dissolve: 재인터뷰 리셋 — 점토로 풀어짐
      colorMix.value = withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) });
    }
    prevHasAuraRef.current = hasAura;
  }, [hasAura]);

  const enableContinuousMotion = !reduceAuraMotion && ENABLE_CONTINUOUS_MOTION_BY_DEFAULT;

  const blobs = useMemo(() => {
    const size = SCREEN_W * 0.95;
    return meshStops.map((channel, i) => ({
      key: `${i}-${channel.hue}`,
      fullHex: hslToHex(channel.hue, channel.saturation, channel.lightness),
      neutralHex: hslToHex(
        (NEUTRAL_CLAY_CHANNEL.hue + i * 12) % 360,
        NEUTRAL_CLAY_CHANNEL.saturation,
        NEUTRAL_CLAY_CHANNEL.lightness,
      ),
      size,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(meshStops)]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* 베이스 레이어 — 구조색 배경(기존 화면 배경색을 그대로 승계, 무결성 유지) */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg }]} />
      {/* 분위기색 레이어 — 오라 메시(항상 렌더하되 opacity로 통제, reduceAuraMotion=0) */}
      <Animated.View style={[StyleSheet.absoluteFill, containerStyle]}>
        {blobs.map((b, i) => (
          <AuraBlob
            key={b.key}
            fullHex={b.fullHex}
            neutralHex={b.neutralHex}
            colorMix={colorMix}
            breathEnabled={enableContinuousMotion}
            driftEnabled={enableContinuousMotion}
            index={i}
            size={b.size}
          />
        ))}
      </Animated.View>
    </View>
  );
}
