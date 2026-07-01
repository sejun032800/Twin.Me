// ─── 3채널 차등 블렌딩 엔진 (성격 그라데이션) ────────────────────────────────
// 트윈 성격 = (1-w)·디폴트 + w·사용자성향,  w_channel = Confidence^γ_channel
// γ_말투(tone)=0.7 (가장 빨리 반영) < γ_감정(emotion)=1.0 < γ_태도(attitude)=1.5 (가장 보수적)
// 잔향 하한: 호기심(curiosity) ≥ 0.15 / 바닥선: 무조건적 애정(affection) = 1.0 고정.

import {
  BlendChannel,
  createDefaultPersonaTraitChannel,
  EnneagramType,
  PersonaBlend,
  PersonaTraitChannel,
} from '../types/genesis';

const CHANNEL_GAMMA: Record<BlendChannel, number> = {
  tone: 0.7,
  emotion: 1.0,
  attitude: 1.5,
};

const CURIOSITY_FLOOR = 0.15;
const AFFECTION_FLOOR = 1.0;

// 유형이 확정됐을 때 트윈 성격이 수렴해가는 목표 성향(사용자성향).
// 부정적 수치를 강점 프레임으로 번역한 결과값(예: 회피→신중)만 저장한다.
export const TYPE_TRAIT_TARGET: Record<EnneagramType, PersonaTraitChannel> = {
  '1': { curiosity: 0.5, warmth: 0.5, playfulness: 0.3, directness: 0.7, affection: 1.0, reassurance: 0.6 },
  '2': { curiosity: 0.6, warmth: 0.9, playfulness: 0.6, directness: 0.4, affection: 1.0, reassurance: 0.8 },
  '3': { curiosity: 0.6, warmth: 0.6, playfulness: 0.6, directness: 0.7, affection: 1.0, reassurance: 0.5 },
  '4': { curiosity: 0.7, warmth: 0.7, playfulness: 0.5, directness: 0.5, affection: 1.0, reassurance: 0.7 },
  '5': { curiosity: 0.9, warmth: 0.4, playfulness: 0.3, directness: 0.6, affection: 1.0, reassurance: 0.4 },
  '6': { curiosity: 0.6, warmth: 0.6, playfulness: 0.4, directness: 0.5, affection: 1.0, reassurance: 0.9 },
  '7': { curiosity: 0.8, warmth: 0.7, playfulness: 0.9, directness: 0.5, affection: 1.0, reassurance: 0.5 },
  '8': { curiosity: 0.5, warmth: 0.5, playfulness: 0.5, directness: 0.9, affection: 1.0, reassurance: 0.4 },
  '9': { curiosity: 0.5, warmth: 0.8, playfulness: 0.5, directness: 0.2, affection: 1.0, reassurance: 0.8 },
};

function blendChannel(
  channel: BlendChannel,
  confidence: number,
  target: PersonaTraitChannel,
  base: PersonaTraitChannel = createDefaultPersonaTraitChannel(),
): PersonaTraitChannel {
  const gamma = CHANNEL_GAMMA[channel];
  const w = Math.pow(Math.max(0, Math.min(1, confidence)), gamma);

  const mix = (field: keyof PersonaTraitChannel) => (1 - w) * base[field] + w * target[field];

  return {
    curiosity: Math.max(CURIOSITY_FLOOR, mix('curiosity')),
    warmth: mix('warmth'),
    playfulness: mix('playfulness'),
    directness: mix('directness'),
    affection: AFFECTION_FLOOR, // 바닥선 고정 — 인터뷰 진행도와 무관하게 항상 무조건적 애정
    reassurance: mix('reassurance'),
  };
}

/**
 * 확신도(confidence)를 변수로 3채널(말투/감정/태도)을 각기 다른 속도로
 * 사용자 성향에 수렴시킨다. type이 아직 없으면(가설 미형성) 디폴트만 반환.
 */
export function computePersonaBlend(type: EnneagramType | null, confidence: number): PersonaBlend {
  if (!type) {
    const base = createDefaultPersonaTraitChannel();
    return { tone: base, emotion: base, attitude: base };
  }

  const target = TYPE_TRAIT_TARGET[type];
  return {
    tone: blendChannel('tone', confidence, target),
    emotion: blendChannel('emotion', confidence, target),
    attitude: blendChannel('attitude', confidence, target),
  };
}

function describeLevel(value: number, low: string, mid: string, high: string): string {
  if (value < 0.4) return low;
  if (value < 0.7) return mid;
  return high;
}

/**
 * LLM 시스템 프롬프트 주입용 — PersonaBlend를 원시 숫자가 아닌 자연어 어조 지침으로 변환한다.
 * (Chat_logic.md의 buildToneVectorPromptSection과 동일한 "구조화 데이터 → 프롬프트 문장" 패턴.)
 */
export function buildPersonaBlendPromptSection(blend: PersonaBlend): string {
  const { tone, emotion, attitude } = blend;
  const lines: string[] = [];

  lines.push(
    `[말투] ${describeLevel(tone.playfulness, '차분하고 담백하게', '적당히 장난기를 섞어', '유쾌하고 장난스럽게')}, ` +
      `${describeLevel(tone.directness, '완곡하게 돌려서', '상황 봐가며 솔직하게', '직설적이고 분명하게')} 말하세요.`,
  );
  lines.push(
    `[감정] 공감할 때 ${describeLevel(emotion.warmth, '담백한 온도로', '따뜻한 온도로', '깊고 진한 온도로')} 반응하고, ` +
      `안심시켜야 할 때는 ${describeLevel(emotion.reassurance, '가볍게', '충분히', '집요할 정도로 끝까지')} 다독이세요.`,
  );
  lines.push(
    `[태도] 궁금한 게 있으면 ${describeLevel(attitude.curiosity, '필요할 때만', '자연스럽게', '적극적으로')} 되물어보고, ` +
      '어떤 순간에도 애정 어린 태도는 절대 낮추지 마세요(무조건적 애정 바닥선 고정).',
  );

  return lines.join('\n');
}
