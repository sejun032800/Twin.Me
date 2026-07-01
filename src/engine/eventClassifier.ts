// ─── 실시간 이벤트 분류기 (v2.2 틱 엔진 입력단) ────────────────────────────────
//
// 메시지 스트림에서 EventCode를 근사 탐지하는 온디바이스 규칙 엔진.
// useCrisisIntelligence.ts와 동일한 설계 철학: 정규식 기반 어휘 탐지(즉시) +
// 필요 시 구조적 패턴(타이밍·길이·상호성) 근사. LLM 정밀 분류는 상위 훅에서
// 선택적으로 얹을 수 있으나, 본 파일은 항상 오프라인에서 동작하는 폴백 레이어다.
//
// ⚠️ 근사치 명시: 아래 패턴은 검증된 언어학적 분류기가 아니라 자기성찰용 휴리스틱이다.
// 특히 L-HRS(고트만 4 호스맨)는 단일 문장이 아닌 구조 패턴으로만 근사한다.

import type { EventCode } from './metrics';

export interface ClassifierMessage {
  role: 'me' | 'partner';
  text: string;
  timestamp: number;
}

export interface ClassifierContext {
  /** 최근 대화 히스토리 (오래된 → 최신 순). 구조적 탐지(타이밍/길이)에 사용 */
  history: ClassifierMessage[];
  /** 현재 세션이 갈등 국면인지 (M_context 승수 및 콤보 탐지에 활용) */
  inConflict?: boolean;
}

// ── 어휘 패턴 테이블 ───────────────────────────────────────────────────────────
// 각 코드는 발화 텍스트에 대한 정규식 힌트 배열을 가진다. 하나라도 매치되면 후보로 채택.

const LEXICAL_PATTERNS: Partial<Record<EventCode, RegExp[]>> = {
  // G-CON
  'G-CON-002': [/내가\s*(방금|아까)?\s*말이?\s*(짧았|심했)/, /미안해?[.,!]?\s*$/, /내\s*잘못/, /사과할게/],
  'G-CON-003': [/전화로\s*(차분히|얘기)/, /통화로\s*(풀자|얘기하자)/, /만나서\s*얘기하자/],
  'G-CON-005': [/나\s*(사실|지금)\s*(속상|서운|불안|화가)/, /내\s*감정이/],
  'G-CON-006': [/잠깐\s*(쉬자|숨\s*고르자)/, /시간\s*좀\s*갖자/],
  'G-CON-007': [/우리\s*둘\s*다\s*(예민|잘못)/, /같이\s*고치자/],
  'G-CON-008': [/아까\s*미안/, /먼저\s*미안하다고/],
  'G-CON-009': [/네\s*말도\s*일리\s*있어/, /그럴\s*수도\s*있겠다/],
  'G-CON-010': [/그래도\s*사랑해/, /싸워도\s*좋아해/],

  // G-REG
  'G-REG-001': [/진짜\s*힘들었겠다/, /속상했겠네/, /많이\s*힘들지/],
  'G-REG-002': [/잘했어/, /멋있다/, /예쁘다|이쁘다/, /최고야/, /자랑스러워/],
  'G-REG-006': [/이제\s*(끝났|퇴근|수업\s*끝)/, /나\s*이제\s*(자유|한가)/],
  'G-REG-007': [/그때\s*말했던/, /저번에\s*얘기한/],
  'G-REG-008': [/사실\s*나\s*좀\s*불안/, /고민\s*있는데/],
  'G-REG-009': [/고마워/, /덕분이야|덕분에/],
  'G-REG-010': [/밥\s*먹었어/, /뭐\s*시켜줄까/, /뭐\s*먹고\s*싶어/],
  'G-REG-012': [/잘\s*잤어/, /오늘\s*안\s*힘들어/, /컨디션\s*어때/],

  // G-HUM
  'G-HUM-004': [/짤\s*(보내|봐)/, /밈\s*(보내|봐)/],
  'G-HUM-008': [/가사\s*처럼/, /노래\s*가사/],
  'G-HUM-010': [/나\s*진짜\s*바보/, /나\s*왜\s*이러냐/],

  // G-FUT
  'G-FUT-001': [/주말에\s*.*(갈래|가자|볼래)/, /다음\s*주에\s*(만나|보자|갈까)/],
  'G-FUT-002': [/여름에\s*여행/, /내년에\s*같이/, /나중에\s*우리/],
  'G-FUT-004': [/기념일\s*(준비|챙기|계획)/, /(백일|1주년|100일)\s*(준비|계획)/],
  'G-FUT-005': [/같이\s*살자/, /동거/, /결혼/],
  'G-FUT-006': [/버킷리스트/, /하고\s*싶은\s*거\s*(같이|리스트)/],
  'G-FUT-007': [/저번에\s*약속한\s*거/, /약속\s*지켰/],
  'G-FUT-008': [/시험\s*잘\s*봐/, /면접\s*화이팅/, /잘\s*될\s*거야/],

  // G-RES
  'G-RES-002': [/굿모닝|좋은\s*아침/, /잘\s*자|굿나잇/],
  'G-RES-004': [/지금\s*.*(하는\s*중|가는\s*중|먹는\s*중)/],
  'G-RES-005': [/이제\s*회의/, /수업\s*들어가/, /못\s*볼\s*것\s*같아/],
  'G-RES-006': [/전화\s*할까/, /통화\s*하자/, /영상통화/],
  'G-RES-008': [/자느라\s*늦었/, /답장\s*늦어서\s*미안/],

  // G-INT
  'G-INT-001': [/자기야/, /애기야/, /여보/, /자기\s/],
  'G-INT-002': [/보고\s*싶/, /그립다/],
  'G-INT-003': [/사랑해/, /사랑한다/],
  'G-INT-004': [/안아주고\s*싶/, /손\s*잡고\s*싶/],
  'G-INT-006': [/나\s*지금\s*.*(있어|도착)/, /위치\s*공유/],
  'G-INT-007': [/사실\s*나\s*(고민|불안)이\s*있는데/, /진지하게\s*얘기하고\s*싶은데/],

  // L-MIC
  'L-MIC-005': [/알았어\s*그럼/, /^ㅋ$/, /^ㅇㄴ$/],
  'L-MIC-006': [/^뭐해\??$/, /^어\??$/, /^내일\s*봄\??$/],
  'L-MIC-008': [/전\s*여친|전\s*남친/, /걔는\s*안\s*그러던데/, /친구는\s*더/],
  'L-MIC-009': [/미안한데\s*너도/, /미안하지만\s*너도\s*잘못/],
  'L-MIC-011': [/^ㅇㅇ$/, /^ㅎ$/, /^ㅇ$/],
  'L-MIC-012': [/다음에\s*가자(?!.*(주말|다음\s*주))/, /나중에\s*(가자|하자)(?!.*계획)/],

  // L-CRU
  'L-CRU-002': [/헤어지든가/, /이럴\s*거면\s*그만두자/, /끝내자/, /관두자/],
  'L-CRU-003': [/너는?\s*맨날/, /너\s*때문에/, /너\s*때문이잖아/],
  'L-CRU-004': [/입\s*닫아/, /시끄러워/, /닥쳐/],
  'L-CRU-006': [/그때도\s*네가/, /예전에도\s*그랬잖아/, /또\s*그\s*얘기냐/],
  'L-CRU-008': [/내\s*친구도\s*(다\s*)?너\s*이상하대/, /다들\s*너\s*그렇대/],
  'L-CRU-009': [/또\s*헤어지자|한다/],
  'L-CRU-010': [/그것\s*때문에\s*그런\s*거\s*아니야/],
  'L-CRU-011': [/ㅋ\s*수준\s*보소/, /그거밖에\s*못해/, /한심하다/],
  'L-CRU-012': [/차단한다/, /연락\s*끊는다/, /차단할\s*거야/],

  // L-HRS (lexical seed — 구조 패턴과 병행 사용)
  'L-HRS-001': [/넌\s*항상/, /넌\s*맨날/, /항상\s*그런\s*식/],
  'L-HRS-002': [/ㅋ\s*진짜\??\s*웃기다/, /🙄/, /수준\s*알만하다/],
  'L-HRS-003': [/내\s*탓\s*아니/, /나는\s*잘못\s*없/, /억울해/],
  'L-HRS-008': [/또\s*시작이네/, /또\s*저런다/],

  // L-NEG
  'L-NEG-006': [/약속\s*(취소|못\s*가|못\s*갈\s*것\s*같아)/, /노쇼/],
  'L-NEG-007': [/기념일.*몰랐/, /오늘이\s*무슨\s*날인지\s*몰랐/],
};

// ── 다중 이모지 패턴 (경멸/조롱 등 근사 신호) ─────────────────────────────────

const LAUGH_RE = /ㅋ{2,}|ㅎ{2,}|😂|🤣/;
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

function last(arr: ClassifierMessage[]): ClassifierMessage | undefined {
  return arr[arr.length - 1];
}

/**
 * 단일 신규 메시지(msg)를 대화 히스토리 컨텍스트와 함께 분류해 후보 EventCode 목록을 반환한다.
 * msg는 이미 ctx.history 마지막 원소로 포함되어 있다고 가정한다 (호출측이 push 후 전달).
 */
export function classifyMessage(msg: ClassifierMessage, ctx: ClassifierContext): EventCode[] {
  const hits: EventCode[] = [];
  const { history } = ctx;
  const idx = history.length - 1;
  const prev = history[idx - 1];
  const text = msg.text.trim();

  // ── 1. 어휘 패턴 매치 ──
  for (const [code, patterns] of Object.entries(LEXICAL_PATTERNS) as [EventCode, RegExp[]][]) {
    if (patterns.some((p) => p.test(text))) hits.push(code);
  }

  // ── 2. 구조적 패턴: 장문 vs 단답 ──
  if (prev && prev.role !== msg.role) {
    const prevLen = prev.text.trim().length;
    const curLen = text.length;

    if (prevLen >= 100) {
      const ratio = curLen / prevLen;
      if (curLen <= 3 && /^(ㅇㅇ|웅|ㅇ|ㅎ)$/.test(text)) {
        hits.push('L-MIC-002');
      } else if (ratio >= 0.8 && ratio <= 1.2) {
        hits.push('G-REG-005');
      }
    }
  }

  // ── 3. 즉시/신속 응답 (평소 대비 — 30초 이내 상호 응답) ──
  if (prev && prev.role !== msg.role) {
    const gapMs = msg.timestamp - prev.timestamp;
    if (gapMs >= 0 && gapMs <= 30_000) hits.push('G-RES-007');
    if (gapMs >= 0 && gapMs <= 15_000) hits.push('G-RES-001');
  }

  // ── 4. 읽씹/방치 (직전 상대 메시지 이후 경과 시간) ──
  if (prev && prev.role !== msg.role) {
    const gapMs = msg.timestamp - prev.timestamp;
    const ONE_HOUR = 60 * 60 * 1000;
    const SIX_HOURS = 6 * ONE_HOUR;
    if (gapMs >= SIX_HOURS && prev.text.trim().length >= 20) {
      hits.push('L-CRU-005'); // 안읽씹 6시간+ (장문 서운함 가정 근사)
    } else if (gapMs >= ONE_HOUR) {
      hits.push('L-MIC-004');
    }
  }

  // ── 5. 드립 성공 / 받아치기 (직전 내 메시지 뒤 상대 폭소) ──
  if (prev && prev.role !== msg.role && LAUGH_RE.test(text)) {
    if (prev.role === 'me') hits.push('G-HUM-001');
    else hits.push('G-HUM-002');
  }

  // ── 6. 이모지 합주 (연속 2메시지 모두 이모지만) ──
  if (prev && EMOJI_RE.test(text) && EMOJI_RE.test(prev.text) && text.replace(EMOJI_RE, '').trim().length === 0) {
    hits.push('G-HUM-009');
  }

  // ── 7. 티키타카 연쇄: 최근 5턴이 모두 60초 이내 상호 응답 ──
  if (history.length >= 5) {
    const lastFive = history.slice(-5);
    const rapidPingPong = lastFive.every((m, i) => {
      if (i === 0) return true;
      const gp = m.timestamp - lastFive[i - 1].timestamp;
      return gp >= 0 && gp <= 60_000 && m.role !== lastFive[i - 1].role;
    });
    if (rapidPingPong) hits.push('G-HUM-007');
  }

  // ── 8. 대화 독점 (최근 10메시지 중 한쪽이 80%+ 점유) ──
  if (history.length >= 10) {
    const lastTen = history.slice(-10);
    const mine = lastTen.filter((m) => m.role === 'me').length;
    const ratio = mine / lastTen.length;
    if (ratio >= 0.8 || ratio <= 0.2) hits.push('L-MIC-003');
  }

  // ── 9. 선톡 비대칭 (최근 10회 대화 시작 메시지 중 한쪽이 항상 먼저) ──
  if (history.length >= 10) {
    const lastTen = history.slice(-10);
    const initiators = lastTen.filter((m, i) => i === 0 || m.role !== lastTen[i - 1].role);
    const mineInit = initiators.filter((m) => m.role === 'me').length;
    if (initiators.length >= 4 && mineInit === 0) hits.push('L-NEG-002');
  }

  void idx;
  return Array.from(new Set(hits));
}

// ── 윈도우 기반 4-호스맨 패턴 근사 탐지 (고트만 모델) ──────────────────────────
// 단발 메시지가 아닌 최근 대화 창(기본 24h) 전체 구조를 스캔한다.

export function classifyHorsemenPatterns(window: ClassifierMessage[]): EventCode[] {
  const hits: EventCode[] = [];
  const myMsgs = window.filter((m) => m.role === 'me');
  if (myMsgs.length < 4) return hits;

  const criticismHits = myMsgs.filter((m) => /넌\s*(항상|맨날)|매번\s*그래/.test(m.text)).length;
  const contemptHits = myMsgs.filter((m) => /ㅋ\s*수준|한심|🙄|어이없/.test(m.text)).length;
  const defensivenessHits = myMsgs.filter((m) => /내\s*탓\s*아니|억울해|나는\s*잘못\s*없/.test(m.text)).length;

  const recentSix = myMsgs.slice(-6);
  const avgLen = recentSix.reduce((s, m) => s + m.text.trim().length, 0) / Math.max(recentSix.length, 1);
  const stonewalling = avgLen < 4;

  if (criticismHits >= 2) hits.push('L-HRS-001');
  if (contemptHits >= 2) hits.push('L-HRS-002');
  if (defensivenessHits >= 2) hits.push('L-HRS-003');
  if (stonewalling) hits.push('L-HRS-004');
  if (criticismHits >= 1 && defensivenessHits >= 1) hits.push('L-HRS-005');
  if (contemptHits >= 4) hits.push('L-HRS-006');

  const avoidanceHits = myMsgs.filter((m) => /그건\s*그렇고|아무튼|암튼\s*됐고/.test(m.text)).length;
  if (avoidanceHits >= 2) hits.push('L-HRS-007');

  return Array.from(new Set(hits));
}
