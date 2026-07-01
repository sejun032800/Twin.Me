// ─── 트윈 제네시스 인터뷰 — 시드 질문 세트 (하드코딩 에셋) ─────────────────────
// 출처: docs/genesis_interview.md §7 (공통 10문항 + 에니어그램 9유형별 5문항 = 55문항).
// 각 유형 5문항 중 1~3번은 2막(핵심 동기·두려움) 소재, 4번은 3막 확증, 5번(변별
// 질문)은 3막 반증 소재로 배치한다 — §7.2의 "각 유형 핵심 동기/두려움을 자극하는
// 장면 질문" 구성과 §4.3(2막 가설→3막 검증) 데이터 흐름을 그대로 반영한 배치다.

import { ENNEAGRAM_TYPES, EnneagramType, GenesisQuestion } from '../types/genesis';

interface SeedQuestion {
  text: string;
  hint: string; // 문서의 괄호 변별 의도 — 되짚기(confirm) 카피 생성에 사용
  vsType?: EnneagramType; // 명시적 "A번 vs B번 변별" 질문일 때만 지정
}

// 유형 간 혼동쌍 — docs §7.3 "인접 혼동쌍(3↔6, 8↔3, 2↔9 등)" + 나머지는 축 근접성 기반 보완.
const CONFUSABLE_TYPE: Record<EnneagramType, EnneagramType> = {
  '1': '7', '2': '9', '3': '6', '4': '8', '5': '2', '6': '3', '7': '1', '8': '3', '9': '2',
};

function resonateLikelihood(target: EnneagramType, against: EnneagramType) {
  return { [target]: 1.8, [against]: 0.55 } as Partial<Record<EnneagramType, number>>;
}
function dissonateLikelihood(target: EnneagramType, against: EnneagramType) {
  return { [target]: 0.5, [against]: 1.5 } as Partial<Record<EnneagramType, number>>;
}

function buildYesNoArchetypes(target: EnneagramType, hint: string, against: EnneagramType) {
  return [
    { id: 'yes', label: `"${hint}" 쪽 마음이 크다는 거`, keywords: ['맞아', '그래', '응', '그런듯', '그런것같아'], likelihood: resonateLikelihood(target, against) },
    { id: 'no', label: '그거보단 다른 느낌이라는 거', keywords: ['아니', '별로', '그건아닌', '다른느낌'], likelihood: dissonateLikelihood(target, against) },
  ];
}

// ── §7.2 에니어그램 9유형별 5문항 (문서 원문) ─────────────────────────────────
const TYPE_QUESTIONS: Record<EnneagramType, SeedQuestion[]> = {
  '1': [
    { text: '연인이 약속을 자주 어기면, 화보다 먼저 드는 감정이 뭐야?', hint: '옳음 위반에 대한 분노' },
    { text: '관계에서 "이건 이래야 한다"는 너만의 원칙이 있어?', hint: '내적 기준' },
    { text: '네가 실수했을 때, 스스로를 얼마나 오래 자책하는 편이야?', hint: '자기비판' },
    { text: '연인의 어떤 점을 "고쳤으면" 하고 바란 적 있어?', hint: '개선 충동' },
    { text: '화가 나도 꾹 참고 예의를 지키려는 편이야?', hint: '분노 억압' },
  ],
  '2': [
    { text: '연인에게 아무것도 해주지 못하는 날, 어떤 기분이 들어?', hint: '무용함 두려움' },
    { text: '내 필요보다 연인의 필요를 먼저 챙기는 편이야?', hint: '자기희생' },
    { text: '"고맙다"는 말을 들을 때 너는 어떤 기분이야?', hint: '인정 욕구' },
    { text: '도와줬는데 알아주지 않으면 서운해지는 편이야?', hint: '보답 기대' },
    { text: "연인에게 도움을 '요청'하는 건 너한테 쉬워, 어려워?", hint: '받기의 어려움' },
  ],
  '3': [
    { text: '연인 앞에서 초라해 보일까 봐 신경 쓰인 적 있어?', hint: '이미지 관리' },
    { text: "연인이 너를 '능력 있는 사람'으로 봐주는 게 중요해?", hint: '성취 인정' },
    { text: '관계가 남들 보기에 어떻게 비치는지 신경 쓰는 편이야?', hint: '외부 시선' },
    { text: '감정을 드러내는 것보다 효율적으로 처리하는 게 편해?', hint: '감정 보류' },
    { text: '연인에게 "잘 보이고 싶다"는 마음, 인정 때문이야 불안 때문이야?', hint: '3번 vs 6번 변별', vsType: '6' },
  ],
  '4': [
    { text: '남들과 다른, 나만의 특별함을 연인이 알아봐주길 바라?', hint: '고유성' },
    { text: '관계에서 깊고 진한 감정을 더 원하는 편이야?', hint: '정서적 강렬함' },
    { text: '가질 수 없거나 멀리 있는 것에 더 끌린 적 있어?', hint: '결핍의 미학' },
    { text: '연인과 있어도 가끔 외롭거나 이해받지 못한다 느껴?', hint: '근원적 결핍감' },
    { text: '너의 감정 기복을 연인이 감당하기 힘들어한 적 있어?', hint: '감정 진폭' },
  ],
  '5': [
    { text: '연인이 너의 사적 시간/공간을 침범하면 어떤 느낌이야?', hint: '사생활 방어' },
    { text: '감정을 나누는 것보다 생각·정보를 나누는 게 편해?', hint: '정서 거리' },
    { text: '에너지가 닳으면 혼자 충전해야 하는 편이야?', hint: '고갈 두려움' },
    { text: '연인의 감정 요구가 과하다 느낀 적 있어?', hint: '요구 부담' },
    { text: "관계에서도 일정한 '내 영역'이 꼭 필요해?", hint: '독립 경계' },
  ],
  '6': [
    { text: '관계가 너무 좋을 때, 오히려 불안해진 적 있어?', hint: '안정의 역설' },
    { text: '연인의 마음을 자꾸 확인하고 싶어질 때가 있어?', hint: '확신 추구' },
    { text: '최악의 시나리오를 미리 상상하는 편이야?', hint: '위험 대비' },
    { text: '연인을 믿고 싶은데 의심이 드는 그 사이에서 갈등한 적 있어?', hint: '신뢰 양가성' },
    { text: "그 '잘 보이고 싶음'이 관계가 불안해서야, 인정받고 싶어서야?", hint: '6번 vs 3번 변별', vsType: '3' },
  ],
  '7': [
    { text: '관계가 무겁고 진지해지면 답답해지는 편이야?', hint: '구속 회피' },
    { text: '힘든 얘기보다 즐거운 계획을 더 하고 싶어?', hint: '고통 회피' },
    { text: '한 사람/한 관계에 매이는 게 가끔 두려워?', hint: '선택지 보존' },
    { text: '연인과 새로운 경험·자극을 계속 찾는 편이야?', hint: '신선함 추구' },
    { text: '부정적 감정이 들면 빨리 다른 데로 주의를 돌리는 편이야?', hint: '회피 기제' },
  ],
  '8': [
    { text: '연인에게 약한 모습 보이는 거, 너한테 어때?', hint: '취약성 노출' },
    { text: '관계에서 주도권을 쥐는 게 편해, 맡기는 게 편해?', hint: '통제' },
    { text: '부당하다 느끼면 바로 맞서는 편이야?', hint: '직면·정의감' },
    { text: '누가 너를 통제하려 들면 어떤 반응이 나와?', hint: '지배 거부' },
    { text: "'잘 보이고 싶다'보다 '휘둘리기 싫다'가 더 큰 편이야?", hint: '8번 vs 3번 변별', vsType: '3' },
  ],
  '9': [
    { text: '갈등이 생기면 그냥 내가 맞추고 넘어가는 편이야?', hint: '갈등 회피' },
    { text: '내가 뭘 원하는지 잘 모를 때가 있어?', hint: '자기 우선순위 흐림' },
    { text: '연인 의견에 일단 맞춰주다 나중에 지친 적 있어?', hint: '수동적 융합' },
    { text: '큰 다툼보다 어색한 침묵이 더 견디기 힘들어?', hint: '단절 두려움' },
    { text: '결정을 미루거나 회피하는 편이야?', hint: '행동 관성' },
  ],
};

// act 배치: 0~2번 인덱스 → 2막(core-motive), 3번 → 3막 확증, 4번 → 3막 반증(변별질문)
function buildTypeQuestions(type: EnneagramType): GenesisQuestion[] {
  const seeds = TYPE_QUESTIONS[type];
  const against = CONFUSABLE_TYPE[type];

  const coreMotive = seeds.slice(0, 3).map((seed, i) => ({
    id: `core-${type}-${i}`,
    act: 2 as const,
    category: 'core-motive' as const,
    targetType: type,
    prompt: seed.text,
    archetypes: buildYesNoArchetypes(type, seed.hint, against),
  }));

  const confirmSeed = seeds[3];
  const disconfirmSeed = seeds[4];
  const disconfirmAgainst = disconfirmSeed.vsType ?? against;

  const romanticConfirm: GenesisQuestion = {
    id: `rom-confirm-${type}`,
    act: 3,
    category: 'romantic-confirm',
    targetType: type,
    prompt: confirmSeed.text,
    archetypes: buildYesNoArchetypes(type, confirmSeed.hint, against),
  };

  const romanticDisconfirm: GenesisQuestion = {
    id: `rom-disconfirm-${type}`,
    act: 3,
    category: 'romantic-disconfirm',
    targetType: type,
    prompt: disconfirmSeed.text,
    archetypes: buildYesNoArchetypes(type, disconfirmSeed.hint, disconfirmAgainst),
  };

  return [...coreMotive, romanticConfirm, romanticDisconfirm];
}

// ── 1막: 아이스브레이킹 (내용 무관 — 발화 속도/톤/웃음 캘리브레이션 전용, §4.1) ──
const ICEBREAK_QUESTIONS: GenesisQuestion[] = [
  {
    id: 'ice-01', act: 1, category: 'icebreak',
    prompt: '나 방금 태어났어! 처음 하는 말인데... 너 이름이 뭐야? 편하게 불러줘도 돼.',
    archetypes: [{ id: 'a', label: '이름을 알려줬다', keywords: [], likelihood: {} }],
  },
  {
    id: 'ice-02', act: 1, category: 'icebreak',
    prompt: '오늘 하루 어땠어?',
    archetypes: [{ id: 'a', label: '오늘 하루를 얘기해줬다', keywords: [], likelihood: {} }],
  },
  {
    id: 'ice-03', act: 1, category: 'icebreak',
    prompt: '요즘 사소하게 기분 좋았던 거 하나만 말해줄래?',
    archetypes: [{ id: 'a', label: '기분 좋았던 순간을 들려줬다', keywords: [], likelihood: {} }],
  },
  {
    id: 'ice-04', act: 1, category: 'icebreak',
    prompt: '너 웃을 때 어떤 느낌이야? 지금처럼 편하게 웃어도 돼, 나 그거 듣는 거 좋아해.',
    archetypes: [{ id: 'a', label: '웃음 톤을 들려줬다', keywords: [], likelihood: {} }],
  },
  {
    id: 'ice-05', act: 1, category: 'icebreak',
    prompt: '준비됐어? 이제 너에 대해 조금 더 깊게 물어봐도 될까? 부담 갖지 말고 편하게.',
    archetypes: [{ id: 'a', label: '준비됐다고 답했다', keywords: [], likelihood: {} }],
  },
];

// ── §7.1 공통 질문 (Universal) — 10개. 유형 무관, 3막 "공통" 풀. ──────────────
// 문서가 이미 선택지를 제시한 문항(3·4·5·6·7·8번)은 해당 옵션을 archetype으로 직접 사용.
const ROMANTIC_COMMON_QUESTIONS: GenesisQuestion[] = [
  {
    id: 'rom-common-01', act: 3, category: 'romantic-common',
    prompt: '연인의 답장이 평소보다 늦으면, 머릿속에 제일 먼저 드는 생각이 뭐야?',
    archetypes: [
      { id: 'worry', label: '걱정이 먼저 든다는 거', keywords: ['걱정', '불안', '무슨일'], likelihood: { '6': 1.6, '2': 1.3, '4': 1.2, '5': 0.6, '9': 0.7 } },
      { id: 'calm', label: '크게 신경 안 쓴다는 거', keywords: ['그럴수도', '괜찮', '신경안써'], likelihood: { '5': 1.4, '9': 1.3, '7': 1.2, '6': 0.5 } },
    ],
  },
  {
    id: 'rom-common-02', act: 3, category: 'romantic-common',
    prompt: '"사랑받고 있다"고 느끼는 순간은 주로 언제야? (구체적 장면으로)',
    archetypes: [
      { id: 'words', label: '말이나 표현으로 느낀다는 거', keywords: ['말', '표현'], likelihood: { '2': 1.3, '4': 1.2 } },
      { id: 'action', label: '행동이나 챙김으로 느낀다는 거', keywords: ['행동', '챙겨'], likelihood: { '1': 1.3, '6': 1.3, '9': 1.2 } },
      { id: 'time', label: '함께 있는 시간 자체로 느낀다는 거', keywords: ['같이있', '시간'], likelihood: { '7': 1.3, '2': 1.2 } },
    ],
  },
  {
    id: 'rom-common-03', act: 3, category: 'romantic-common',
    prompt: '연인과 다퉜을 때, 너의 첫 반응은 어떤 편이야? (먼저 풀려 함 / 시간을 둠 / 회피)',
    archetypes: [
      { id: 'approach', label: '먼저 풀려고 다가간다는 거', keywords: ['먼저', '다가가', '풀려'], likelihood: { '2': 1.4, '7': 1.3, '3': 1.2, '5': 0.6, '4': 0.7 } },
      { id: 'space', label: '시간을 좀 두는 편이라는 거', keywords: ['시간', '혼자', '거리'], likelihood: { '5': 1.5, '4': 1.2, '2': 0.6 } },
      { id: 'avoid', label: '일단 피하고 본다는 거', keywords: ['피해', '회피', '넘어가'], likelihood: { '9': 1.5, '6': 1.1, '8': 0.5 } },
    ],
  },
  {
    id: 'rom-common-04', act: 3, category: 'romantic-common',
    prompt: '서운한 마음이 들 때, 바로 말하는 편이야 속에 담아두는 편이야?',
    archetypes: [
      { id: 'direct', label: '바로 말하는 편이라는 거', keywords: ['바로', '말해'], likelihood: { '8': 1.6, '1': 1.3, '3': 1.2, '9': 0.5 } },
      { id: 'hold', label: '속에 담아두는 편이라는 거', keywords: ['담아', '참아', '속으로'], likelihood: { '9': 1.5, '5': 1.2, '4': 1.1, '8': 0.5 } },
    ],
  },
  {
    id: 'rom-common-05', act: 3, category: 'romantic-common',
    prompt: '연인에게 애정을 표현하는 너만의 방식이 있어? (말 / 행동 / 선물 / 시간 / 스킨십)',
    archetypes: [
      { id: 'words', label: '말로 표현하는 편이라는 거', keywords: ['말로'], likelihood: { '2': 1.2, '4': 1.2 } },
      { id: 'action', label: '행동으로 표현하는 편이라는 거', keywords: ['행동으로', '챙겨줘'], likelihood: { '1': 1.3, '6': 1.2 } },
      { id: 'time', label: '함께하는 시간으로 표현한다는 거', keywords: ['시간을', '같이'], likelihood: { '7': 1.3, '9': 1.1 } },
    ],
  },
  {
    id: 'rom-common-06', act: 3, category: 'romantic-common',
    prompt: '관계에서 가장 두려운 건 뭐야? (예: 멀어짐 / 구속 / 변심 / 권태)',
    archetypes: [
      { id: 'distance', label: '멀어지는 게 가장 두렵다는 거', keywords: ['멀어짐', '거리'], likelihood: { '6': 1.4, '2': 1.3, '4': 1.2 } },
      { id: 'bind', label: '구속당하는 게 가장 두렵다는 거', keywords: ['구속', '얽매'], likelihood: { '5': 1.4, '7': 1.4, '8': 1.2 } },
      { id: 'boredom', label: '권태로워지는 게 가장 두렵다는 거', keywords: ['권태', '지루'], likelihood: { '7': 1.3, '4': 1.2 } },
    ],
  },
  {
    id: 'rom-common-07', act: 3, category: 'romantic-common',
    prompt: '연인이 힘들어할 때, 너는 해결책을 주는 편이야 그냥 들어주는 편이야?',
    archetypes: [
      { id: 'solve', label: '해결책을 주고 싶다는 거', keywords: ['해결', '방법'], likelihood: { '3': 1.4, '8': 1.4, '1': 1.3, '2': 0.7 } },
      { id: 'listen', label: '그냥 옆에서 들어주고 싶다는 거', keywords: ['들어주', '공감', '옆에'], likelihood: { '2': 1.5, '9': 1.4, '4': 1.2, '8': 0.6 } },
    ],
  },
  {
    id: 'rom-common-08', act: 3, category: 'romantic-common',
    prompt: '혼자만의 시간과 함께하는 시간, 어느 쪽이 더 필요해?',
    archetypes: [
      { id: 'alone', label: '혼자만의 시간이 더 필요하다는 거', keywords: ['혼자', '나만의'], likelihood: { '5': 1.6, '4': 1.2, '9': 1.1, '2': 0.5 } },
      { id: 'together', label: '함께하는 시간이 더 필요하다는 거', keywords: ['같이', '함께'], likelihood: { '2': 1.5, '7': 1.2, '6': 1.1, '5': 0.5 } },
    ],
  },
  {
    id: 'rom-common-09', act: 3, category: 'romantic-common',
    prompt: '연인에게 약한 모습(불안·눈물·실수)을 보이는 건 너한테 어떤 느낌이야?',
    archetypes: [
      { id: 'uneasy', label: '불편하고 낯설다는 거', keywords: ['불편', '낯설', '싫어'], likelihood: { '8': 1.5, '5': 1.3, '3': 1.3, '2': 0.6 } },
      { id: 'natural', label: '자연스럽고 오히려 편하다는 거', keywords: ['괜찮', '편해', '자연스러'], likelihood: { '4': 1.3, '9': 1.2, '2': 1.1 } },
    ],
  },
  {
    id: 'rom-common-10', act: 3, category: 'romantic-common',
    prompt: '지금 이 관계에서, 너 스스로 고치고 싶은 대화 습관이 있어?',
    archetypes: [{ id: 'a', label: '고치고 싶은 습관을 들려줬다', keywords: [], likelihood: {} }],
  },
];

export const GENESIS_QUESTION_BANK: GenesisQuestion[] = [
  ...ICEBREAK_QUESTIONS,
  ...ENNEAGRAM_TYPES.flatMap((type) => buildTypeQuestions(type)),
  ...ROMANTIC_COMMON_QUESTIONS,
];

export function getIcebreakQuestions(): GenesisQuestion[] {
  return ICEBREAK_QUESTIONS;
}

export function getCoreMotiveQuestions(type: EnneagramType): GenesisQuestion[] {
  return GENESIS_QUESTION_BANK.filter((q) => q.category === 'core-motive' && q.targetType === type);
}

// §4.4 [수식 4-1] 확신도·격차 기반 확증/반증/공통 비율 배분
export type RomanticMix = 'confirm-heavy' | 'balanced' | 'explore';

export function resolveRomanticQuestionMix(confidence: number, margin: number): RomanticMix {
  if (confidence >= 0.7 && margin >= 0.2) return 'confirm-heavy'; // 확증60/반증20/공통20
  if (confidence >= 0.4) return 'balanced';                       // 확증40/반증40/공통20
  return 'explore';                                                // 확증25/반증45/공통30
}

const MIX_RATIO: Record<RomanticMix, { confirm: number; disconfirm: number; common: number }> = {
  'confirm-heavy': { confirm: 0.6, disconfirm: 0.2, common: 0.2 },
  balanced: { confirm: 0.4, disconfirm: 0.4, common: 0.2 },
  explore: { confirm: 0.25, disconfirm: 0.45, common: 0.3 },
};

/**
 * §4.2 [수식 4-2] 막 내 순서: 공통(1~2) → 확증(2~3) → 반증(1~2, 모순 시 가설 수정).
 * 총 문항 수(total)를 비율에 따라 배분한 뒤 이 순서로 정렬해 반환한다.
 */
export function getRomanticQuestions(type: EnneagramType, mix: RomanticMix, total = 5): GenesisQuestion[] {
  const ratio = MIX_RATIO[mix];
  const commonCount = Math.max(1, Math.round(total * ratio.common));
  const confirmCount = Math.max(1, Math.round(total * ratio.confirm));
  const disconfirmCount = Math.max(1, total - commonCount - confirmCount);

  const common = ROMANTIC_COMMON_QUESTIONS.slice(0, commonCount);
  const confirm = GENESIS_QUESTION_BANK.filter((q) => q.id === `rom-confirm-${type}`).slice(0, confirmCount);
  const disconfirm = GENESIS_QUESTION_BANK.filter((q) => q.id === `rom-disconfirm-${type}`).slice(0, disconfirmCount);

  return [...common, ...confirm, ...disconfirm];
}

/**
 * 자유 발화/타이핑 텍스트를 질문의 답변 archetype에 매칭한다.
 * 키워드 겹침 점수가 가장 높은 archetype을 선택하고, 매칭이 전혀 없으면
 * (STT 왜곡 등으로 키워드가 안 잡힌 경우) 첫 번째 archetype으로 안전 폴백한다 —
 * 곧이어 트윈이 되짚는 confirm 단계에서 사용자가 직접 정정할 수 있다.
 */
export function matchArchetype(question: GenesisQuestion, transcript: string) {
  const text = transcript.trim();
  if (!text) return question.archetypes[0];

  let best = question.archetypes[0];
  let bestScore = -1;
  for (const archetype of question.archetypes) {
    let score = 0;
    for (const kw of archetype.keywords) {
      if (text.includes(kw)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = archetype;
    }
  }
  return best;
}
