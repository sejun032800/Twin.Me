// ─── 6색 성향 테마 엔진 (Aura Theme Engine) — 합성/모션/컨텍스트 레이어 ───────────
// docs/genesis_interview.md §6(6색 성향 색 시스템)의 렌더링 보강 스펙.
//
// 무결성 대조 메모 (인터페이스 검증):
//   genesis_interview.md §6.1의 6축 라벨(애착 안정성/갈등 반응/사랑의 표현/정서 강도/
//   관계 주도성/신뢰 기질)은 이미 구현된 src/types/genesis.ts의 AURA_AXES
//   (attachmentSecurity/conflictResponse/expressiveness/independence/spontaneity/trustPace)
//   와 축 개수(6)·"베이지안 점수에서 결정론적 산출"이라는 불변식은 일치하나 라벨 매핑이
//   1:1로 정확히 대응하지 않는다(예: "관계 주도성" ≈ independence, "정서 강도" ≈
//   expressiveness가 가장 가까운 대응). 이미 genesisInference/genesisBlending/
//   auraStoryPool·twin-ai.tsx UI가 기존 축 이름으로 전면 연동되어 있으므로, 축 정의를
//   다시 쓰지 않고 기존 AuraVector를 단일 진실 공급원으로 재사용한다. 본 파일은 그 위에
//   앰비언트 렌더링(메시 합성/모션/화면별 가중치/뮤트 파스텔 게이트)만 추가한다.

import type { AuraChannel, AuraVector } from '../types/genesis';
import type { OverflowStatus } from '../utils/scoreCalculator';

// ── 1. 뮤트 파스텔 게이트 (§2.2 — 원색/형광 노출 차단) ───────────────────────────
// auraEngine.scoreToChannel이 이미 saturation ≤90 / lightness 47~71 범위로 산출하지만,
// 오버플로우 피드백(§4)이 값을 밀어올릴 때도 이 캡을 넘지 않도록 명시적으로 강제한다.
export const MUTE_PASTEL_GATE = {
  saturationCap: 92,
  lightnessMin: 40,
  lightnessMax: 72,
} as const;

export function clampToMutePastelGate(channel: AuraChannel): AuraChannel {
  return {
    hue: ((channel.hue % 360) + 360) % 360,
    saturation: Math.min(MUTE_PASTEL_GATE.saturationCap, Math.max(0, channel.saturation)),
    lightness: Math.min(MUTE_PASTEL_GATE.lightnessMax, Math.max(MUTE_PASTEL_GATE.lightnessMin, channel.lightness)),
  };
}

// ── 2. 화면별 가중치 (§4.1 — contextMultiplier 라우팅) ───────────────────────────
export type AuraScreenKey = 'main' | 'chat' | 'historyMap' | 'helix' | 'settings' | 'other';

const BASE_CONTEXT_MULTIPLIER: Record<AuraScreenKey, number> = {
  main: 1.0,
  chat: 0.6,
  historyMap: 0.5,
  helix: 1.3,
  settings: 0.8,
  other: 0.0, // (auth) 등 온보딩 화면은 오라 미노출 — 완성 전 인터뷰 몰입 방해 방지
};

const CHAT_TWIN_ROOM_BOOST = 1.2; // "트윈방"(Self-AI/분석가) 진입 시 ×1.2

/** 경로 세그먼트 → AuraScreenKey. app/_layout.tsx 루트에서 usePathname()과 함께 사용. */
export function resolveAuraScreenKey(pathname: string): AuraScreenKey {
  if (pathname === '/' || pathname === '/index') return 'main';
  if (pathname.startsWith('/chat')) return 'chat';
  if (pathname.startsWith('/history')) return 'historyMap'; // history.tsx가 세부 variant로 재정의(helix)
  if (pathname.startsWith('/settings')) return 'settings';
  return 'other';
}

export interface ContextMultiplierOptions {
  /** 채팅 탭에서 룸1(연인)이 아닌 룸(Self-AI/분석가 '트윈')에 들어와 있는지 */
  isTwinRoom?: boolean;
  /** 역사 탭에서 나선(DNA Helix) 뷰가 활성인지 — true면 historyMap 대신 helix 가중치 사용 */
  isHelixView?: boolean;
}

export function computeContextMultiplier(screenKey: AuraScreenKey, opts: ContextMultiplierOptions = {}): number {
  const resolvedKey: AuraScreenKey = screenKey === 'historyMap' && opts.isHelixView ? 'helix' : screenKey;
  let multiplier = BASE_CONTEXT_MULTIPLIER[resolvedKey];
  if (resolvedKey === 'chat' && opts.isTwinRoom) multiplier *= CHAT_TWIN_ROOM_BOOST;
  return multiplier;
}

// ── 3. 전역 불투명도 (§3.1 — auraOpacity = base_opacity × contextMultiplier) ─────
export const AURA_BASE_OPACITY = { dark: 0.12, light: 0.08 } as const;

export function computeAuraOpacity(
  isLight: boolean,
  screenKey: AuraScreenKey,
  opts: ContextMultiplierOptions = {},
  reduceAuraMotion = false,
): number {
  if (reduceAuraMotion) return 0;
  const base = isLight ? AURA_BASE_OPACITY.light : AURA_BASE_OPACITY.dark;
  return Math.max(0, Math.min(1, base * computeContextMultiplier(screenKey, opts)));
}

// ── 4. 추종 보간 (§3.2 — Universal Easing) ──────────────────────────────────────
// value_display ← value_display + η·(value_target − value_display), η = 0.08~0.12.
// Reanimated의 withTiming 기반 애니메이션에서는 프레임 루프 대신 "체감상 동등한"
// duration으로 근사한다: 지수감쇠가 자연스러운 정지에 도달하는 시간(≈ -1/ln(1-η) 프레임)을
// 60fps 기준 ms로 환산.
export const AURA_FOLLOW_ETA = 0.1; // 0.08~0.12 권장 범위의 중앙값

export function etaToTimingDurationMs(eta: number = AURA_FOLLOW_ETA): number {
  const framesTo95Percent = Math.log(0.05) / Math.log(1 - eta); // ~99% 근접까지 프레임 수
  return Math.round((framesTo95Percent * 1000) / 60);
}

/** 단발 추종(비-worklet 컨텍스트). worklet 내부에서는 withTiming(target, {duration: etaToTimingDurationMs()})을 직접 사용할 것. */
export function followEasingStep(current: number, target: number, eta: number = AURA_FOLLOW_ETA): number {
  return current + eta * (target - current);
}

// ── 5. v2.2 엔진 연동 — 오버플로우 채도 피드백 (§4.1) ────────────────────────────
// 경고 자체는 항상 구조색 레드(#EF4444)로만 수행하고, 여기서는 "분위기색"만 미세 변조한다.
const OVERFLOW_SATURATION_DELTA = { EXCESS_GAIN: 1.12, CRITICAL_LOSS: 0.82, NONE: 1.0 } as const;

export function applyOverflowSaturationFeedback(vector: AuraVector, overflowStatus: OverflowStatus): AuraVector {
  const factor = OVERFLOW_SATURATION_DELTA[overflowStatus] ?? 1.0;
  if (factor === 1.0) return vector;
  const scaleChannel = (c: AuraChannel): AuraChannel =>
    clampToMutePastelGate({ ...c, saturation: c.saturation * factor });
  const channels = Object.fromEntries(
    Object.entries(vector.channels).map(([axis, c]) => [axis, scaleChannel(c as AuraChannel)]),
  ) as AuraVector['channels'];
  return { ...vector, channels, meshStops: vector.meshStops.map(scaleChannel) };
}

// ── 6. Dissolve — 재인터뷰/리셋 시 무채색 점토로 (§4.3 4대 모션 중 Dissolve) ──────
export const NEUTRAL_CLAY_CHANNEL: AuraChannel = { hue: 230, saturation: 6, lightness: 55 };

/** t=0(현재 색상) → t=1(무채색 점토)로 보간한 메시 정지점. Reanimated interpolateColor와 함께 사용. */
export function dissolveMeshStops(meshStops: AuraChannel[], t: number): AuraChannel[] {
  const clamped = Math.max(0, Math.min(1, t));
  return meshStops.map((c) => ({
    hue: c.hue,
    saturation: c.saturation + (NEUTRAL_CLAY_CHANNEL.saturation - c.saturation) * clamped,
    lightness: c.lightness + (NEUTRAL_CLAY_CHANNEL.lightness - c.lightness) * clamped,
  }));
}

export function defaultNeutralMeshStops(count = 6): AuraChannel[] {
  return Array.from({ length: count }, (_, i) => ({
    ...NEUTRAL_CLAY_CHANNEL,
    hue: (NEUTRAL_CLAY_CHANNEL.hue + i * 12) % 360,
  }));
}
