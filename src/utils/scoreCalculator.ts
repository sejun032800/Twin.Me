// ─── DNA 일치율 코어 엔진 (Twin.me 2.0) ────────────────────────────────────────
// SRS §1 정규분포 기반 기준 점수 + §2 24개 마이크로 이벤트 + §3 클램프 필터

// ── 24개 마이크로 이벤트 코드 타입 ──────────────────────────────────────────────
export type MicroEventCode =
  | 'G-CON-001' | 'G-CON-002' | 'G-CON-003' | 'G-CON-004'
  | 'G-REG-001' | 'G-REG-002' | 'G-REG-003' | 'G-REG-004' | 'G-REG-005' | 'G-REG-006'
  | 'L-MIC-001' | 'L-MIC-002' | 'L-MIC-003' | 'L-MIC-004' | 'L-MIC-005' | 'L-MIC-006'
  | 'L-CRU-001' | 'L-CRU-002' | 'L-CRU-003' | 'L-CRU-004' | 'L-CRU-005' | 'L-CRU-006';

export type OverflowStatus = 'CRITICAL_LOSS' | 'EXCESS_GAIN' | 'NONE';
export type CompatibilityGrade = 'IDEAL' | 'AVERAGE' | 'COLLISION';

// ── 24개 마이크로 이벤트 변동치 딕셔너리 (δ, %) ────────────────────────────────
export const MICRO_EVENT_DELTAS: Record<MicroEventCode, number> = {
  // 관계 회복 및 대화 교정 군 (+)
  'G-CON-001': 0.25,
  'G-CON-002': 0.25,
  'G-CON-003': 0.20,
  'G-CON-004': 0.30,
  // 다정함 및 동기화 수집 군 (+)
  'G-REG-001': 0.10,
  'G-REG-002': 0.10,
  'G-REG-003': 0.05,
  'G-REG-004': 0.05,
  'G-REG-005': 0.15,
  'G-REG-006': 0.05,
  // 소통 저해 및 매너리즘 군 (-)
  'L-MIC-001': -0.15,
  'L-MIC-002': -0.10,
  'L-MIC-003': -0.05,
  'L-MIC-004': -0.10,
  'L-MIC-005': -0.05,
  'L-MIC-006': -0.10,
  // 관계 균열 및 의도적 파괴 군 (-)
  'L-CRU-001': -0.30,
  'L-CRU-002': -0.30,
  'L-CRU-003': -0.25,
  'L-CRU-004': -0.25,
  'L-CRU-005': -0.20,
  'L-CRU-006': -0.20,
};

// ── 물리 상수 ──────────────────────────────────────────────────────────────────
const CLAMP_MIN = -1.0;
const CLAMP_MAX = 1.0;
const SCORE_FLOOR = 50.5;
const SCORE_PRE_INTERVIEW_CEILING = 89.5;
const INTERVIEW_MAX_BONUS = 5.0;

// ── Z-Score 상성 등급 매핑 ───────────────────────────────────────────────────
const GRADE_TO_Z: Record<CompatibilityGrade, number> = {
  IDEAL: 2.5,
  AVERAGE: 0.0,
  COLLISION: -2.5,
};

// ── MBTI 상성 등급 추론 ──────────────────────────────────────────────────────
export function getMBTICompatibilityGrade(
  myMbti: string,
  partnerMbti: string,
): CompatibilityGrade {
  if (!myMbti || !partnerMbti || myMbti.length < 4 || partnerMbti.length < 4) return 'AVERAGE';
  const a = myMbti.toUpperCase();
  const b = partnerMbti.toUpperCase();

  const IDEAL_PAIRS: [string, string][] = [
    ['ENFJ', 'INFP'], ['INFP', 'ENFJ'],
    ['ENFJ', 'INTJ'], ['INTJ', 'ENFJ'],
    ['ENTP', 'INFJ'], ['INFJ', 'ENTP'],
    ['ENTJ', 'INFP'], ['INFP', 'ENTJ'],
    ['ISFJ', 'ESFP'], ['ESFP', 'ISFJ'],
    ['ISTJ', 'ESFP'], ['ESFP', 'ISTJ'],
    ['ENFP', 'INTJ'], ['INTJ', 'ENFP'],
    ['INFJ', 'ENFP'], ['ENFP', 'INFJ'],
    ['ISFP', 'ESFJ'], ['ESFJ', 'ISFP'],
  ];

  const COLLISION_PAIRS: [string, string][] = [
    ['ESTJ', 'INFP'], ['INFP', 'ESTJ'],
    ['ENTJ', 'ISFP'], ['ISFP', 'ENTJ'],
    ['ISTJ', 'ENFP'], ['ENFP', 'ISTJ'],
    ['ESTP', 'INFJ'], ['INFJ', 'ESTP'],
    ['INTJ', 'ESFP'], ['ESFP', 'INTJ'],
  ];

  if (IDEAL_PAIRS.some(([x, y]) => x === a && y === b)) return 'IDEAL';
  if (COLLISION_PAIRS.some(([x, y]) => x === a && y === b)) return 'COLLISION';

  // Heuristic: 반대 E/I + 같은 N/S + 같은 T/F → 보완적 관계 = IDEAL
  const oppEI = a[0] !== b[0];
  const sameNS = a[1] === b[1];
  const sameTF = a[2] === b[2];
  if (oppEI && sameNS && sameTF) return 'IDEAL';

  // 완전 반대 N/S AND T/F → COLLISION
  if (!sameNS && !sameTF) return 'COLLISION';

  return 'AVERAGE';
}

// ── [수식 1-2] S_Base 정규분포 변환형 기준 점수 ────────────────────────────────
// S_Base = 70 + (Z_Total × 7.81)
// Z_Total = (0.4 × Z_MBTI) + (0.6 × Z_Enneagram)
export function generateBaseScore(
  mbtiGrade: CompatibilityGrade,
  enneagramGrade: CompatibilityGrade,
): number {
  const zMbti = GRADE_TO_Z[mbtiGrade];
  const zEnneagram = GRADE_TO_Z[enneagramGrade];
  const zTotal = 0.4 * zMbti + 0.6 * zEnneagram;
  const sBase = 70 + zTotal * 7.81;
  // 극단 케이스 가드: 50.5%(하방) ~ 89.5%(상방 인터뷰 전)
  return Math.max(SCORE_FLOOR, Math.min(SCORE_PRE_INTERVIEW_CEILING, sBase));
}

// ── [수식 §1.2] S_Master_Base = S_Base + Bonus_Interview (최대 +5.0%) ──────────
export function computeMasterBase(sBase: number, interviewBonus: number): number {
  const clampedBonus = Math.max(0, Math.min(INTERVIEW_MAX_BONUS, interviewBonus));
  return sBase + clampedBonus;
}

// ── [수식 3-2] 하루 등락폭 Clamp 필터 + 오버플로우 감지 ─────────────────────────
export function computeDailyDelta(events: MicroEventCode[]): {
  rawSum: number;
  clamped: number;
  overflowStatus: OverflowStatus;
} {
  const rawSum = events.reduce((acc, code) => acc + MICRO_EVENT_DELTAS[code], 0);
  const clamped = Math.max(CLAMP_MIN, Math.min(CLAMP_MAX, rawSum));

  let overflowStatus: OverflowStatus = 'NONE';
  if (rawSum < CLAMP_MIN) overflowStatus = 'CRITICAL_LOSS';
  else if (rawSum > CLAMP_MAX) overflowStatus = 'EXCESS_GAIN';

  return { rawSum, clamped, overflowStatus };
}

// ── 현재 스코어에 일일 delta 적용 (바닥·천장 가드 포함) ────────────────────────
export function applyScoreDelta(currentScore: number, delta: number): number {
  return Math.max(SCORE_FLOOR, Math.min(100, currentScore + delta));
}

// ── 전체 앱 UI 포맷 함수: 소수점 한 자리 고정 ────────────────────────────────
export function formatScore(score: number): string {
  return score.toFixed(1);
}

// ── 10단계 티어 타입 ────────────────────────────────────────────────────────────
export interface TierTheme {
  gradient: readonly [string, string, string];
  glowColor: string;
  borderColor: string;
  textColor: string;
  bgColor: string;
}

export interface RelationshipTier {
  emoji: string;
  title: string;
  description: string;
  theme: TierTheme;
}

const TIER_THEMES = {
  GOLD_AURORA: {
    gradient: ['#FFD700', '#FFA500', '#FF8C00'] as const,
    glowColor: '#FFD700',
    borderColor: 'rgba(255,215,0,0.60)',
    textColor: '#FFD700',
    bgColor: 'rgba(255,215,0,0.08)',
  },
  NEON_VIOLET: {
    gradient: ['#7C3AED', '#9333EA', '#A855F7'] as const,
    glowColor: '#9333EA',
    borderColor: 'rgba(147,51,234,0.60)',
    textColor: '#C084FC',
    bgColor: 'rgba(147,51,234,0.10)',
  },
  DEEP_PURPLE: {
    gradient: ['#4C1D95', '#6D28D9', '#7C3AED'] as const,
    glowColor: '#7C3AED',
    borderColor: 'rgba(124,58,237,0.55)',
    textColor: '#A78BFA',
    bgColor: 'rgba(124,58,237,0.10)',
  },
  LAVENDER_HEART: {
    gradient: ['#9F7AEA', '#B794F4', '#D6BCFA'] as const,
    glowColor: '#B794F4',
    borderColor: 'rgba(183,148,244,0.50)',
    textColor: '#B794F4',
    bgColor: 'rgba(183,148,244,0.10)',
  },
  BRIGHT_PASTEL_PINK: {
    gradient: ['#F9A8D4', '#FB7185', '#F43F5E'] as const,
    glowColor: '#FB7185',
    borderColor: 'rgba(251,113,133,0.50)',
    textColor: '#FB7185',
    bgColor: 'rgba(249,168,212,0.10)',
  },
  SOFT_SHELL_PINK: {
    gradient: ['#FECDD3', '#FDA4AF', '#FB7185'] as const,
    glowColor: '#FDA4AF',
    borderColor: 'rgba(253,164,175,0.45)',
    textColor: '#FDA4AF',
    bgColor: 'rgba(253,205,211,0.10)',
  },
  SOFT_YELLOW: {
    gradient: ['#FDE68A', '#FCD34D', '#FBBF24'] as const,
    glowColor: '#FBBF24',
    borderColor: 'rgba(251,191,36,0.45)',
    textColor: '#D97706',
    bgColor: 'rgba(253,230,138,0.12)',
  },
  SILVER_GRAY: {
    gradient: ['#CBD5E1', '#94A3B8', '#64748B'] as const,
    glowColor: '#94A3B8',
    borderColor: 'rgba(148,163,184,0.40)',
    textColor: '#94A3B8',
    bgColor: 'rgba(203,213,225,0.08)',
  },
  DIM_CHARCOAL: {
    gradient: ['#475569', '#334155', '#1E293B'] as const,
    glowColor: '#475569',
    borderColor: 'rgba(71,85,105,0.40)',
    textColor: '#64748B',
    bgColor: 'rgba(71,85,105,0.10)',
  },
  GLASSMORPHISM_WINE: {
    gradient: ['#7F1D1D', '#991B1B', '#B91C1C'] as const,
    glowColor: '#DC2626',
    borderColor: 'rgba(220,38,38,0.45)',
    textColor: '#FCA5A5',
    bgColor: 'rgba(127,29,29,0.15)',
  },
} as const;

// ── [FUN-HOM-003] 5% 격차 10단계 마스터 티어 매퍼 ────────────────────────────
export function getRelationshipTier(score: number): RelationshipTier {
  if (score >= 95.0) return {
    emoji: '🏆', title: '환상 속의 신화적 결합',
    description: '대화 호흡과 어휘 동기화가 신의 경지에 이른 기적적 상태',
    theme: TIER_THEMES.GOLD_AURORA,
  };
  if (score >= 90.0) return {
    emoji: '🧬', title: '영혼까지 닮은 도플갱어',
    description: '문체와 말버릇, 이모티콘 칩셋까지 완벽 대칭인 축복 구간',
    theme: TIER_THEMES.NEON_VIOLET,
  };
  if (score >= 85.0) return {
    emoji: '💖', title: '기적의 소울메이트',
    description: '성격 상성 최상 및 지속적 다정함 수집으로 한계령을 돌파한 워너비',
    theme: TIER_THEMES.DEEP_PURPLE,
  };
  if (score >= 80.0) return {
    emoji: '✨', title: '눈빛만 봐도 아는 사이',
    description: '단어 몇 개, 이모지 하나로도 속마음을 100% 관통하는 상태',
    theme: TIER_THEMES.LAVENDER_HEART,
  };
  if (score >= 75.0) return {
    emoji: '🍃', title: '달달한 핑크빛 로맨스',
    description: '평수기 평균 이상. 서로에 대한 지지와 예쁜 리액션이 당연한 상태',
    theme: TIER_THEMES.BRIGHT_PASTEL_PINK,
  };
  if (score >= 70.0) return {
    emoji: '🌸', title: '다정다감한 모범 커플',
    description: '서로가 1순위인 모범 지점. 큰 풍파 없이 예쁜 대화의 정석을 지키는 상태',
    theme: TIER_THEMES.SOFT_SHELL_PINK,
  };
  if (score >= 65.0) return {
    emoji: '🎭', title: '평소엔 연인, 싸울 땐 웬수',
    description: '대한민국 커플 80%가 머무는 현실 지대. 삐끗하면 단답형 빌런으로 돌변',
    theme: TIER_THEMES.SOFT_YELLOW,
  };
  if (score >= 60.0) return {
    emoji: '📉', title: '아슬아슬한 밀당 권태기',
    description: '읽씹/안읽씹이 길어지고 업무형 연락이 고착화되기 시작한 징후',
    theme: TIER_THEMES.SILVER_GRAY,
  };
  if (score >= 55.0) return {
    emoji: '⚡', title: '말 한마디가 시한폭탄',
    description: '날카로운 비난이나 억압 표현이 자주 탐지되어 사소한 톡에도 크게 터질 위기',
    theme: TIER_THEMES.DIM_CHARCOAL,
  };
  return {
    emoji: '🚨', title: '살얼음판 위 대치 상황',
    description: '대화 단절이 3시간을 넘어 바닥 가드라인(50.5%)까지 추락한 파국 직전 상태',
    theme: TIER_THEMES.GLASSMORPHISM_WINE,
  };
}
