// ─── 6색 오라 매핑 엔진 (성향 → AuraVector) ─────────────────────────────────
// 애착 안정성/갈등 반응/감정 표현성/자율성/즉흥성/신뢰 형성 속도 6개 축 점수를
// 결정론적 hue/채도/명도로 환산해 메시 그라데이션 오라 객체를 생성한다.
// 축 점수는 베이지안 확률 벡터 전체의 가중합으로 계산되므로, 인터뷰가 진행될수록
// (특정 유형으로 확률이 수렴할수록) 오라 색이 부드럽게 그라데이션되며 또렷해진다.

import { ENNEAGRAM_TYPES, AURA_AXES, AuraAxis, AuraAxisScores, AuraChannel, AuraVector, ProbabilityVector, ScoreBand } from '../types/genesis';

// 각 축이 표현하는 두 방향(direction A ↔ B). score -1(A) ~ +1(B).
export const AURA_AXIS_DIRECTIONS: Record<AuraAxis, { a: string; b: string }> = {
  attachmentSecurity: { a: '신중하게 곁을 내주는', b: '단단하게 곁을 지키는' },
  conflictResponse: { a: '갈등 앞에서 여백을 두는', b: '갈등 앞에서 직진하는' },
  expressiveness: { a: '감정을 차분히 담아두는', b: '감정을 풍부하게 표현하는' },
  independence: { a: '함께하는 시간을 우선하는', b: '자기만의 시간을 우선하는' },
  spontaneity: { a: '꼼꼼하게 계획하는', b: '자유롭게 즉흥적인' },
  trustPace: { a: '천천히 마음을 여는', b: '빠르게 마음을 여는' },
};

// 유형별 6축 성향 점수 — 모두 강점 프레임 어휘로만 해설되도록 방향을 설계함.
const TYPE_AURA_AXIS_SCORES: Record<string, AuraAxisScores> = {
  '1': { attachmentSecurity: 0.3, conflictResponse: 0.4, expressiveness: -0.3, independence: 0.2, spontaneity: -0.7, trustPace: -0.3 },
  '2': { attachmentSecurity: -0.2, conflictResponse: -0.5, expressiveness: 0.6, independence: -0.6, spontaneity: 0.2, trustPace: 0.5 },
  '3': { attachmentSecurity: 0.4, conflictResponse: 0.3, expressiveness: 0.2, independence: 0.3, spontaneity: 0.1, trustPace: 0.1 },
  '4': { attachmentSecurity: -0.3, conflictResponse: -0.2, expressiveness: 0.8, independence: 0.3, spontaneity: 0.4, trustPace: -0.2 },
  '5': { attachmentSecurity: 0.1, conflictResponse: -0.4, expressiveness: -0.7, independence: 0.8, spontaneity: -0.3, trustPace: -0.7 },
  '6': { attachmentSecurity: -0.4, conflictResponse: -0.3, expressiveness: 0.1, independence: -0.3, spontaneity: -0.5, trustPace: -0.4 },
  '7': { attachmentSecurity: 0.3, conflictResponse: -0.6, expressiveness: 0.7, independence: 0.4, spontaneity: 0.9, trustPace: 0.6 },
  '8': { attachmentSecurity: 0.5, conflictResponse: 0.9, expressiveness: 0.3, independence: 0.7, spontaneity: 0.3, trustPace: 0.2 },
  '9': { attachmentSecurity: 0.2, conflictResponse: -0.8, expressiveness: -0.4, independence: -0.1, spontaneity: 0.2, trustPace: 0.0 },
};

const DEFAULT_AXIS_SCORES: AuraAxisScores = {
  attachmentSecurity: 0, conflictResponse: 0, expressiveness: 0, independence: 0, spontaneity: 0, trustPace: 0,
};

// 축별 기준 색상(hue) — 서로 시각적으로 구분되도록 60도 간격에 가깝게 배치.
const AXIS_BASE_HUE: Record<AuraAxis, number> = {
  attachmentSecurity: 210, // blue — 안정/신뢰
  conflictResponse: 15,    // red-orange — 갈등/에너지
  expressiveness: 320,     // magenta/pink — 감정
  independence: 165,       // teal — 자율
  spontaneity: 45,         // gold — 즉흥/유희
  trustPace: 265,          // violet — 브랜드 톤과 정합, 신뢰 형성
};

/** 베이지안 확률 벡터 전체를 가중합해 6축 점수를 계산한다 (인터뷰 진행 중에도 부드럽게 갱신). */
export function computeAuraAxisScores(probabilities: ProbabilityVector | null): AuraAxisScores {
  if (!probabilities) return { ...DEFAULT_AXIS_SCORES };

  const result = { ...DEFAULT_AXIS_SCORES };
  for (const axis of AURA_AXES) {
    let weighted = 0;
    for (const type of ENNEAGRAM_TYPES) {
      const p = probabilities[type] ?? 0;
      weighted += p * (TYPE_AURA_AXIS_SCORES[type]?.[axis] ?? 0);
    }
    result[axis] = Math.max(-1, Math.min(1, weighted));
  }
  return result;
}

function scoreToChannel(axis: AuraAxis, score: number): AuraChannel {
  const clamped = Math.max(-1, Math.min(1, score));
  const hue = (AXIS_BASE_HUE[axis] + clamped * 15 + 360) % 360;
  const saturation = 55 + Math.abs(clamped) * 35; // 0(중립) → 55%, 극단 → 90%
  const lightness = 55 + clamped * 8;             // 방향에 따라 살짝 톤 변화
  return {
    hue: Math.round(hue),
    saturation: Math.round(Math.max(0, Math.min(100, saturation))),
    lightness: Math.round(Math.max(0, Math.min(100, lightness))),
  };
}

/** 3구간 스코어밴드 — Why My Aura 카피 풀 매핑 키. low=A극 우세 / mid=균형 / high=B극 우세. */
export function toScoreBand(score: number): ScoreBand {
  if (score <= -0.33) return 'low';
  if (score >= 0.33) return 'high';
  return 'mid';
}

export function buildAuraVector(probabilities: ProbabilityVector | null): AuraVector {
  const axisScores = computeAuraAxisScores(probabilities);
  const channels = {} as Record<AuraAxis, AuraChannel>;
  for (const axis of AURA_AXES) {
    channels[axis] = scoreToChannel(axis, axisScores[axis]);
  }
  // 메시 그라데이션 정지점 — 축 순서대로 나열(렌더러가 순환 그라데이션으로 소비)
  const meshStops = AURA_AXES.map((axis) => channels[axis]);

  return {
    axisScores,
    channels,
    meshStops,
    generatedAt: new Date().toISOString(),
  };
}

export function auraChannelToCss({ hue, saturation, lightness }: AuraChannel): string {
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
