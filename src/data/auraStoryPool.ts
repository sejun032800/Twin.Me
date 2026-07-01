// ─── AuraStory 카피 풀 — "Why My Aura" 해설 데이터 모델 ─────────────────────
// 절대 규칙: LLM 즉흥 생성 금지. 축별 scoreBand(3구간)에 사전 작성된 감성 편지를
// 엄격히 매핑·조합한다. 근거는 오직 맥락 환기("답장이 늦을 때 먼저 든 생각")만
// 허용하며, 사용자 발화 원문은 절대 노출하지 않는다(PII 온디바이스 마스킹 가드레일
// 적용 대상 — 애초에 이 풀은 원문을 참조하지 않는 정적 카피만으로 구성됨).

import { AuraAxis, ScoreBand } from '../types/genesis';

export interface AuraStoryEntry {
  axis: AuraAxis;
  band: ScoreBand;
  title: string;
  letter: string;     // 감성 편지 카피 — 항상 강점 프레임
  contextCue: string; // 맥락 환기 한 줄 (원문 노출 없이 "상황"만 소환)
}

const POOL: AuraStoryEntry[] = [
  // ── 애착 안정성 ──────────────────────────────────────────────────────────
  { axis: 'attachmentSecurity', band: 'low', title: '천천히, 확실하게',
    letter: '너는 아무한테나 곁을 쉽게 내주지 않아. 대신 한번 곁을 내주면 그 자리는 오래가. 신중함이 너의 사랑을 더 단단하게 만들어.',
    contextCue: '누군가를 새로 알아갈 때, 조금 더 지켜보고 싶어지는 순간들' },
  { axis: 'attachmentSecurity', band: 'mid', title: '균형 잡힌 곁',
    letter: '너는 상황에 따라 곁을 내주는 속도를 조절할 줄 알아. 너무 서두르지도, 너무 재지도 않는 균형 감각이 관계를 편안하게 만들어.',
    contextCue: '가까워지는 속도를 스스로 조율하던 순간들' },
  { axis: 'attachmentSecurity', band: 'high', title: '흔들리지 않는 온도',
    letter: '너는 한번 마음을 준 사람에게는 흔들림 없이 곁을 지켜. 그 단단함이 상대에게 가장 큰 안정감이 돼.',
    contextCue: '힘든 순간에도 먼저 곁을 지키기로 마음먹던 순간들' },

  // ── 갈등 반응 ────────────────────────────────────────────────────────────
  { axis: 'conflictResponse', band: 'low', title: '화내기보다 다독이는 마음',
    letter: '너는 갈등이 생기면 먼저 감정이 가라앉을 시간을 줘. 부딪히기보다 다독이는 쪽을 택하는 그 여유가 관계를 부드럽게 지켜.',
    contextCue: '말다툼 직후, 한 박자 쉬고 싶어지던 순간들' },
  { axis: 'conflictResponse', band: 'mid', title: '상황 따라 유연하게',
    letter: '너는 갈등 앞에서 무조건 피하지도, 무조건 맞서지도 않아. 상황을 읽고 필요한 만큼만 목소리를 내는 유연함을 가졌어.',
    contextCue: '의견이 갈릴 때, 얼마나 말할지 가늠하던 순간들' },
  { axis: 'conflictResponse', band: 'high', title: '숨기지 않고 마주하는 용기',
    letter: '너는 불편한 얘기도 미루지 않고 정면으로 꺼내. 그 솔직함이 오히려 관계를 더 빨리, 더 깊게 회복시켜.',
    contextCue: '서운한 게 있으면 바로 말하고 싶어지던 순간들' },

  // ── 감정 표현성 ──────────────────────────────────────────────────────────
  { axis: 'expressiveness', band: 'low', title: '말보다 더 깊은 마음',
    letter: '너는 감정을 다 말로 꺼내지 않아도, 마음속엔 훨씬 깊은 진심이 있어. 조용히 담아두는 방식으로도 충분히 사랑을 전하고 있어.',
    contextCue: '마음이 컸는데도 말로는 짧게 전했던 순간들' },
  { axis: 'expressiveness', band: 'mid', title: '표현과 여백 사이',
    letter: '너는 표현할 때와 아낄 때를 자연스럽게 구분해. 다 보여주지 않아도, 필요한 순간엔 정확하게 마음을 전해.',
    contextCue: '마음을 얼마나 드러낼지 자연스럽게 고르던 순간들' },
  { axis: 'expressiveness', band: 'high', title: '마음이 그대로 드러나는 사람',
    letter: '너는 좋으면 좋다고, 서운하면 서운하다고 바로 표현해. 그 솔직한 표현이 상대에게 안심을 줘 — 지금 어떤 마음인지 헷갈릴 틈이 없거든.',
    contextCue: '기쁘거나 서운한 감정이 저절로 티가 나던 순간들' },

  // ── 자율성 ───────────────────────────────────────────────────────────────
  { axis: 'independence', band: 'low', title: '함께일 때 더 나다운',
    letter: '너는 혼자보다 함께일 때 에너지가 채워지는 편이야. 상대와 시간을 공유하는 걸 우선하는 마음이 관계를 따뜻하게 데워.',
    contextCue: '약속이 비면 먼저 연락하고 싶어지던 순간들' },
  { axis: 'independence', band: 'mid', title: '적당한 거리의 미학',
    letter: '너는 함께하는 시간과 혼자만의 시간을 균형 있게 가져가. 그 적당한 거리감이 서로를 지치지 않게 지켜줘.',
    contextCue: '같이 있고 싶은 날과 혼자 쉬고 싶은 날을 구분하던 순간들' },
  { axis: 'independence', band: 'high', title: '혼자여도 단단한 사람',
    letter: '너는 혼자만의 시간에서 에너지를 채우는 편이야. 그 시간이 있어야 상대에게 더 좋은 모습을 보여줄 수 있다는 걸 아는 사람이야.',
    contextCue: '바쁜 하루 끝, 혼자만의 시간이 먼저 필요했던 순간들' },

  // ── 즉흥성 ───────────────────────────────────────────────────────────────
  { axis: 'spontaneity', band: 'low', title: '촘촘한 계획이 주는 안심',
    letter: '너는 미리 계획을 세워둘 때 마음이 편해. 그 꼼꼼함 덕분에 데이트도, 관계도 예상치 못한 실수 없이 안정적으로 흘러가.',
    contextCue: '데이트 전날, 동선을 미리 그려보던 순간들' },
  { axis: 'spontaneity', band: 'mid', title: '계획과 즉흥 사이 균형',
    letter: '너는 큰 틀은 계획하되, 나머지는 흐름에 맡길 줄 알아. 그 균형 감각이 관계를 편안하면서도 지루하지 않게 만들어.',
    contextCue: '계획 중간에 갑자기 일정을 바꿔보고 싶어지던 순간들' },
  { axis: 'spontaneity', band: 'high', title: '순간을 붙잡는 자유로움',
    letter: '너는 계획보다 그 순간의 기분을 따르는 편이야. 그 자유로움이 관계에 예상 못한 즐거운 순간들을 자꾸 만들어내.',
    contextCue: '갑자기 떠오른 아이디어를 바로 실행하고 싶어지던 순간들' },

  // ── 신뢰 형성 속도 ───────────────────────────────────────────────────────
  { axis: 'trustPace', band: 'low', title: '신중해서 더 진심인 사람',
    letter: '너는 마음을 여는 데 시간이 좀 걸리는 편이야. 그만큼 한번 연 마음은 가볍지 않고, 오래도록 진심으로 남아.',
    contextCue: '누군가를 믿기까지 여러 번 확인하고 싶어지던 순간들' },
  { axis: 'trustPace', band: 'mid', title: '적당한 속도로 다가서는 사람',
    letter: '너는 상대를 보며 신뢰의 속도를 맞춰가. 너무 빠르지도 느리지도 않게, 관계에 맞는 리듬을 찾는 사람이야.',
    contextCue: '조금씩 마음을 열어가던 그 과정의 순간들' },
  { axis: 'trustPace', band: 'high', title: '먼저 마음을 여는 용기',
    letter: '너는 먼저 마음을 열고 다가가는 편이야. 그 용기 덕분에 관계가 더 빨리, 더 깊게 가까워질 수 있어.',
    contextCue: '처음 만난 사람에게도 스스럼없이 다가가던 순간들' },
];

export function getAuraStory(axis: AuraAxis, band: ScoreBand): AuraStoryEntry {
  const entry = POOL.find((e) => e.axis === axis && e.band === band);
  if (!entry) throw new Error(`AuraStory missing for ${axis}/${band}`);
  return entry;
}

export function getAllAuraStoryEntries(): AuraStoryEntry[] {
  return POOL;
}
