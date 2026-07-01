// ─── 베이지안 성향 추론 엔진 (트윈 제네시스 인터뷰 엔진 — 성향 판단의 심장) ─────
// FUN-HOM-001 Override. 순수 수학 연산만 사용 (외부 라이브러리 의존성 없음).
//
// 1) Prior:  p_i^(0) = softmax(beta * affinity(MBTI_self, type_i))
// 2) Posterior: p_i <- p_i * L(r|type_i) / Z
// 3) Confidence: H = -Σ p_i·log(p_i), Confidence = 1 - H/log(9)
// 4) Margin: p_(1st) - p_(2nd)
// 5) 조기 종료: Confidence >= θ_confidence(0.85) && Margin >= θ_margin(0.25)

import { BayesianState, ENNEAGRAM_TYPES, EnneagramType, MbtiType, ProbabilityVector } from '../types/genesis';

const LOG9 = Math.log(9);

// ── Affinity(MBTI, Enneagram) — 4개 MBTI 축(E/I,S/N,T/F,J/P)에 대한
// 유형별 경향치(leaning)의 내적으로 산출한다. 144칸을 손으로 채우는 대신
// "유형이 어떤 축으로 기우는가"라는 하나의 작은 테이블만 유지하면 되므로
// 유지보수가 쉽고, 그 자체로 결정론적 수식이다.
interface AxisLeaning {
  EI: number; // -1(I) ~ +1(E)
  SN: number; // -1(S) ~ +1(N)
  TF: number; // -1(T) ~ +1(F)
  JP: number; // -1(J) ~ +1(P)
}

const TYPE_AXIS_LEANING: Record<EnneagramType, AxisLeaning> = {
  '1': { EI: -0.1, SN: -0.1, TF: -0.3, JP: -0.7 }, // 개혁가: 원칙주의, 계획적
  '2': { EI: 0.4, SN: 0.1, TF: 0.6, JP: 0.1 },      // 조력가: 관계지향, 공감
  '3': { EI: 0.6, SN: 0.2, TF: -0.2, JP: -0.5 },    // 성취가: 목표지향, 실행력
  '4': { EI: -0.3, SN: 0.6, TF: 0.5, JP: 0.3 },     // 개인주의자: 감성, 개성
  '5': { EI: -0.7, SN: 0.5, TF: -0.6, JP: 0.2 },    // 탐구자: 관찰, 논리
  '6': { EI: -0.2, SN: -0.2, TF: 0.2, JP: -0.5 },   // 충성가: 신중, 대비
  '7': { EI: 0.7, SN: 0.5, TF: 0.2, JP: 0.7 },      // 열정가: 즉흥, 낙관
  '8': { EI: 0.5, SN: -0.2, TF: -0.5, JP: -0.3 },   // 도전자: 주도, 직설
  '9': { EI: -0.3, SN: -0.1, TF: 0.2, JP: 0.5 },    // 평화주의자: 수용, 여유
};

const MBTI_RE = /^[EI][SN][TF][JP]$/;

function axisLetterValue(letter: string): number {
  return letter === 'E' || letter === 'N' || letter === 'F' || letter === 'P' ? 1 : -1;
}

/**
 * affinity(MBTI_self, type_i) ∈ [-1, 1].
 * MBTI 4글자를 각 축의 +1/-1로 사영하고, 유형의 축 경향치와 내적한 뒤 4로 정규화한다.
 */
export function affinity(mbti: MbtiType, type: EnneagramType): number {
  const normalized = (mbti ?? '').toUpperCase();
  if (!MBTI_RE.test(normalized)) return 0; // '모름'/미입력 → 무영향(사전확률 균등화)

  const leaning = TYPE_AXIS_LEANING[type];
  const [ei, sn, tf, jp] = normalized.split('');
  const dot =
    axisLetterValue(ei) * leaning.EI +
    axisLetterValue(sn) * leaning.SN +
    axisLetterValue(tf) * leaning.TF +
    axisLetterValue(jp) * leaning.JP;
  return dot / 4;
}

function softmax(scores: number[]): number[] {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/**
 * 사전 확률 p_i^(0) = softmax(beta * affinity(MBTI, type_i))
 * beta: 상성이 사전확률에 얼마나 강하게 반영될지(선명도). 기본 2.2.
 */
export function computeAffinityPrior(mbti: MbtiType, beta = 2.2): ProbabilityVector {
  const scores = ENNEAGRAM_TYPES.map((type) => beta * affinity(mbti, type));
  const probs = softmax(scores);
  const result = {} as ProbabilityVector;
  ENNEAGRAM_TYPES.forEach((type, i) => {
    result[type] = probs[i];
  });
  return result;
}

function entropy(p: ProbabilityVector): number {
  return -ENNEAGRAM_TYPES.reduce((sum, type) => {
    const pi = p[type];
    if (pi <= 0) return sum;
    return sum + pi * Math.log(pi);
  }, 0);
}

export function computeConfidence(p: ProbabilityVector): number {
  const H = entropy(p);
  return Math.max(0, Math.min(1, 1 - H / LOG9));
}

function rankedTypes(p: ProbabilityVector): EnneagramType[] {
  return [...ENNEAGRAM_TYPES].sort((a, b) => p[b] - p[a]);
}

export function computeMargin(p: ProbabilityVector): number {
  const [first, second] = rankedTypes(p);
  return p[first] - p[second];
}

function deriveState(probabilities: ProbabilityVector, priorHistory: EnneagramType[], askedQuestionIds: string[]): BayesianState {
  const [first, second] = rankedTypes(probabilities);
  return {
    probabilities,
    topType: first,
    secondType: second,
    confidence: computeConfidence(probabilities),
    margin: computeMargin(probabilities),
    topTypeHistory: [...priorHistory, first],
    askedQuestionIds,
  };
}

export function initBayesianState(mbti: MbtiType): BayesianState {
  const prior = computeAffinityPrior(mbti);
  return deriveState(prior, [], []);
}

/**
 * 사후 갱신: p_i <- p_i * L(r|type_i) / Z
 * likelihood는 희소 맵(sparse) 허용 — 명시되지 않은 유형은 기저우도 1.0(무정보)로 취급한다.
 */
export function updatePosterior(
  state: BayesianState,
  likelihood: Partial<Record<EnneagramType, number>>,
  questionId: string,
): BayesianState {
  const unnormalized = {} as ProbabilityVector;
  let Z = 0;
  for (const type of ENNEAGRAM_TYPES) {
    const L = likelihood[type] ?? 1.0;
    const value = state.probabilities[type] * L;
    unnormalized[type] = value;
    Z += value;
  }

  const normalized = {} as ProbabilityVector;
  for (const type of ENNEAGRAM_TYPES) {
    normalized[type] = Z > 0 ? unnormalized[type] / Z : 1 / ENNEAGRAM_TYPES.length;
  }

  return deriveState(normalized, state.topTypeHistory, [...state.askedQuestionIds, questionId]);
}

/** 직전 1위 유형 대비 현재 1위 유형이 바뀌었는가 — 가설 스위치 트리거 */
export function didHypothesisSwitch(state: BayesianState): boolean {
  const history = state.topTypeHistory;
  if (history.length < 2) return false;
  return history[history.length - 1] !== history[history.length - 2];
}

export interface EarlyStopThresholds {
  confidence: number;
  margin: number;
}

export const DEFAULT_STOP_THRESHOLDS: EarlyStopThresholds = { confidence: 0.85, margin: 0.25 };

/** 조기 종료(θ_stop): Confidence ≥ 0.85 && Margin ≥ 0.25 */
export function shouldStopEarly(
  state: BayesianState,
  thresholds: EarlyStopThresholds = DEFAULT_STOP_THRESHOLDS,
): boolean {
  return state.confidence >= thresholds.confidence && state.margin >= thresholds.margin;
}
