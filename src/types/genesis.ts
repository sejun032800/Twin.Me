// ─── 트윈 제네시스 인터뷰 엔진 — 공유 타입 (FUN-HOM-001 Override) ───────────────
// docs/Twin.me.md FUN-HOM-001 §"10분 인터뷰 퀘스트"의 확장 스펙.
// User_Persona_Matrix / AuraVector 스키마는 여기서 정의되어
// AppContext, genesisInference, genesisBlending, auraEngine이 공유한다.

export const ENNEAGRAM_TYPES = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
export type EnneagramType = (typeof ENNEAGRAM_TYPES)[number];

export const ENNEAGRAM_TYPE_NAME: Record<EnneagramType, string> = {
  '1': '개혁가', '2': '조력가', '3': '성취가', '4': '개인주의자', '5': '탐구자',
  '6': '충성가', '7': '열정가', '8': '도전자', '9': '평화주의자',
};

export type MbtiType = string; // e.g. 'ENFJ'. 빈 문자열/'모름'은 균등 사전확률로 폴백.

export type ProbabilityVector = Record<EnneagramType, number>;

// 인터뷰 4막
export type GenesisAct = 1 | 2 | 3 | 4;

// 점토 성장 4단계 — §1.3
export type ClayStage = 0 | 1 | 2 | 3;
export const CLAY_STAGE_LABEL: Record<ClayStage, string> = {
  0: '무정형 점토',
  1: '쿠키 실루엣',
  2: '입체화',
  3: '나의 트윈',
};

// 입력 모드 — 음성 우선 + 무음 폴백
export type GenesisInputMode = 'voice' | 'typing';

// ── 베이지안 추론 상태 ────────────────────────────────────────────────────────
export interface BayesianState {
  probabilities: ProbabilityVector;
  topType: EnneagramType;
  secondType: EnneagramType;
  confidence: number; // 1 - H/log(9)
  margin: number;      // p(1st) - p(2nd)
  topTypeHistory: EnneagramType[]; // 매 갱신 시점의 1위 유형 기록 (가설 스위치 판정용)
  askedQuestionIds: string[];
}

// ── 3채널 차등 블렌딩 — §4 ───────────────────────────────────────────────────
export type BlendChannel = 'tone' | 'emotion' | 'attitude';

export interface PersonaTraitChannel {
  curiosity: number;      // 0~1, 잔향 하한 0.15
  warmth: number;         // 0~1
  playfulness: number;    // 0~1
  directness: number;     // 0~1
  affection: number;      // 0~1, 바닥선 1.0 (무조건적 애정)
  reassurance: number;    // 0~1
}

export interface PersonaBlend {
  tone: PersonaTraitChannel;
  emotion: PersonaTraitChannel;
  attitude: PersonaTraitChannel;
}

// ── 6색 성향 매핑 — AuraVector ───────────────────────────────────────────────
export const AURA_AXES = [
  'attachmentSecurity',   // 애착 안정성
  'conflictResponse',     // 갈등 반응 (회피↔직면)
  'expressiveness',       // 감정 표현성
  'independence',         // 자율성/의존성
  'spontaneity',          // 즉흥성/계획성
  'trustPace',            // 신뢰 형성 속도
] as const;
export type AuraAxis = (typeof AURA_AXES)[number];

export type AuraAxisScores = Record<AuraAxis, number>; // 각 -1(방향A) ~ +1(방향B)

export interface AuraChannel {
  hue: number;        // 0-360
  saturation: number; // 0-100
  lightness: number;  // 0-100
}

export interface AuraVector {
  axisScores: AuraAxisScores;
  channels: Record<AuraAxis, AuraChannel>;
  meshStops: AuraChannel[]; // 그라데이션 렌더용 정렬된 색상 정지점
  generatedAt: string;
}

// scoreBand: 축 점수를 3구간으로 양자화 — Why My Aura 카피 매칭 키
export type ScoreBand = 'low' | 'mid' | 'high';

// ── User_Persona_Matrix (docs/Twin.me.md §"PM의 DB 설계 제언") ──────────────
export interface UserPersonaMatrix {
  enneagramType: EnneagramType | null;
  bayesian: BayesianState;
  auraVector: AuraVector | null;
  blend: PersonaBlend;
  accuracyUnlocked: boolean; // true → 50% 배너 소멸, 95%로 전환
  completedAt: string | null;
  clayStage: ClayStage;
}

export function createDefaultPersonaTraitChannel(): PersonaTraitChannel {
  return { curiosity: 0.15, warmth: 0.4, playfulness: 0.4, directness: 0.4, affection: 1.0, reassurance: 0.4 };
}

export function createDefaultPersonaBlend(): PersonaBlend {
  return {
    tone: createDefaultPersonaTraitChannel(),
    emotion: createDefaultPersonaTraitChannel(),
    attitude: createDefaultPersonaTraitChannel(),
  };
}

// ── 시드 질문 세트 (§3, §"4막") ───────────────────────────────────────────────
export type GenesisQuestionCategory =
  | 'icebreak'            // 1막 — 잡담/캘리브레이션
  | 'core-motive'         // 2막 — 에니어그램 핵심 동기/두려움
  | 'romantic-confirm'    // 3막 — 1위 가설 확증
  | 'romantic-disconfirm' // 3막 — 1위 가설 반증
  | 'romantic-common';    // 3막 — 공통(탐색)

export interface GenesisAnswerArchetype {
  id: string;
  label: string;      // 되짚기 확인용 짧은 패러프레이즈 ("아, ~라는 거지?")
  keywords: string[]; // 발화/타이핑 텍스트 매칭용 키워드
  likelihood: Partial<Record<EnneagramType, number>>; // L(r|type_i), 희소맵(미기재=1.0)
}

export interface GenesisQuestion {
  id: string;
  act: GenesisAct;
  category: GenesisQuestionCategory;
  targetType?: EnneagramType; // core-motive/romantic-* 질문이 겨냥하는 가설 유형
  prompt: string;             // 트윈이 건네는 질문 (제안+확인 톤)
  archetypes: GenesisAnswerArchetype[];
}
