// ─── Weekly Report Analysis & LLM Summary Engine (Step #22) ─────────────────
//
// Privacy contract:
//   • All topic/emotion computation is done entirely on-device.
//   • Only aggregated NUMBERS (no raw chat text) are forwarded to the LLM API.
//   • Partner messages are used only for relationship metric computation
//     and are never stored or transmitted.
//
// Architecture:
//   computeWeeklyMetrics()  → pure, synchronous, no I/O
//   generateAnalystSummary() → LLM call with aggregated numbers only
//   generateFullReport()    → combines both + persists to FileSystem
//   loadCachedReport()      → loads persisted report on cold start
//   shouldFireWeeklyReport() → Sunday 22:00 gate

import { File, Paths } from 'expo-file-system';
import type { UserProfile, PartnerProfile } from '../context/AppContext';

// ── Public types ──────────────────────────────────────────────────────────────

export interface TopicItem {
  label: string;
  value: number; // 0–100 (percentage)
  color: string;
}

export interface WeeklyReportData {
  weekLabel: string;
  generatedAt: number; // unix ms
  overallScore: number; // 0–100
  weatherLabel: string;
  topics: TopicItem[];
  emotionData: number[]; // 7 values Mon–Sun (0–100)
  emotionLabels: string[]; // ['월','화','수','목','금','토','일']
  radarAxes: string[]; // ['애정','안정성','소통','갈등조절','친밀도']
  radarValues: number[]; // 0–1 per axis
  analystComment: string;
  isLoading: boolean;
}

// ── Internal types ────────────────────────────────────────────────────────────

interface ParsedMessage {
  date: string; // YYYY-MM-DD
  speaker: string;
  content: string;
}

// ── Classification tables ─────────────────────────────────────────────────────

const TOPIC_COLORS: Record<string, string> = {
  '연애/감정': '#D946EF',
  '일상/근황': '#7C3AED',
  '미래/계획': '#38BDF8',
  '갈등': '#FF6B8B',
  '기타': '#64748B',
};

const TOPIC_KEYWORDS: Record<string, string[]> = {
  '연애/감정': ['사랑', '좋아', '보고싶', '설레', '그리워', '이쁘다', '예뻐', '칭찬', '고마워', '사랑해', '행복', '두근', '귀여워', '멋있', '잘생겼'],
  '일상/근황': ['오늘', '어제', '밥', '먹었', '뭐해', '학교', '회사', '퇴근', '출근', '피곤', '잠', '잤어', '기상', '알바', '공부', '시험', '점심', '저녁'],
  '갈등': ['화가', '짜증', '미안', '잘못', '속상', '힘들어', '실망', '서운', '억울', '됐어', '몰라', '그만해', '싫어', '못해'],
  '미래/계획': ['다음에', '언제', '여행', '데이트', '만나자', '보자', '다음주', '주말에', '예약', '계획', '가자', '할까', '어때', '내일'],
};

const POSITIVE_TOKENS = [
  '사랑', '좋아', '행복', '설레', '기대', '고마워', '이쁘다', '예뻐',
  '칭찬', '최고', '잘했어', 'ㅋㅋ', '기분좋', '재밌', '신남', '좋겠',
  '귀여워', '대박', '짱이야', '오늘도', '함께', '같이',
];

const NEGATIVE_TOKENS = [
  '화가', '짜증', '힘들', '싫어', '피곤', '속상', '실망', '서운',
  'ㅠㅠ', '슬퍼', '우울', '그만', '됐어', '몰라', '미안',
];

// ── Regex patterns ────────────────────────────────────────────────────────────

const DATE_HEADER_RE =
  /[-─]{2,}\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/;
const KAKAO_MSG_RE =
  /^\[(.+?)\] \[(?:오전|오후) \d{1,2}:\d{2}\] (.*)$/;

// ── FileSystem persistence filenames ─────────────────────────────────────────

const REPORT_CACHE_FILE = 'twin_weekly_report.json';
const LAST_GENERATED_FILE = 'twin_report_last_gen.json';

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 1 — Pure data-parsing helpers
// ═══════════════════════════════════════════════════════════════════════════════

function parseMessagesWithDate(rawText: string): ParsedMessage[] {
  const lines = rawText.split('\n');
  const messages: ParsedMessage[] = [];
  let currentDate = '';

  for (const line of lines) {
    const dateMatch = line.match(DATE_HEADER_RE);
    if (dateMatch) {
      const [, year, month, day] = dateMatch;
      currentDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      continue;
    }

    const msgMatch = line.match(KAKAO_MSG_RE);
    if (msgMatch && currentDate) {
      const [, speaker, content] = msgMatch;
      messages.push({ date: currentDate, speaker, content });
    }
  }

  return messages;
}

function getLast7Days(): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    days.push(`${yyyy}-${mm}-${dd}`);
  }
  return days;
}

function buildWeekLabel(days: string[]): string {
  if (days.length === 0) return '';
  const start = new Date(days[0]);
  const end = new Date(days[days.length - 1]);
  const em = end.getMonth() + 1;
  const ed = end.getDate();
  const sm = start.getMonth() + 1;
  const sd = start.getDate();
  const weekNum = Math.ceil(ed / 7);
  return `${em}월 ${weekNum}주차 (${sm}.${String(sd).padStart(2, '0')} ~ ${em}.${String(ed).padStart(2, '0')})`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 2 — Scoring algorithms (all pure functions)
// ═══════════════════════════════════════════════════════════════════════════════

function classifyTopics(messages: ParsedMessage[]): TopicItem[] {
  const counts: Record<string, number> = {
    '연애/감정': 0,
    '일상/근황': 0,
    '미래/계획': 0,
    '갈등': 0,
    '기타': 0,
  };

  for (const { content } of messages) {
    let matched = false;
    for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
      if (keywords.some((kw) => content.includes(kw))) {
        counts[topic]++;
        matched = true;
        break;
      }
    }
    if (!matched) counts['기타']++;
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;

  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => ({
      label,
      value: Math.round((count / total) * 100),
      color: TOPIC_COLORS[label] ?? '#64748B',
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

function computeDayEmotionScore(messages: ParsedMessage[]): number {
  if (messages.length === 0) return 50;

  let positiveHits = 0;
  let negativeHits = 0;

  for (const { content } of messages) {
    for (const token of POSITIVE_TOKENS) {
      if (content.includes(token)) positiveHits++;
    }
    for (const token of NEGATIVE_TOKENS) {
      if (content.includes(token)) negativeHits++;
    }
  }

  const total = positiveHits + negativeHits;
  if (total === 0) {
    // No emotional markers — score by message density (active day = above neutral)
    const densityBonus = Math.min(15, messages.length * 1.5);
    return Math.round(55 + densityBonus);
  }

  const ratio = positiveHits / total;
  // Map [0,1] → [30,95]
  return Math.round(30 + ratio * 65);
}

function computeRadarValues(messages: ParsedMessage[], myName: string): number[] {
  const allText = messages.map((m) => m.content).join(' ');
  const myText = messages.filter((m) => m.speaker === myName).map((m) => m.content).join(' ');

  // 1. 애정 — love keyword density across conversation
  const loveKws = ['사랑', '좋아', '보고싶', '그리워', '설레', '행복', '두근', '❤', '💕', '이쁘다', '귀여워'];
  const loveHits = loveKws.filter((k) => allText.includes(k)).length;
  const affection = Math.min(1, 0.15 + loveHits / loveKws.length);

  // 2. 안정성 — conversation regularity across the 7-day window
  const uniqueDays = new Set(messages.map((m) => m.date)).size;
  const stability = Math.min(1, 0.1 + uniqueDays / 7);

  // 3. 소통 — reciprocity & volume (avg messages per day with messages)
  const avgPerDay = uniqueDays > 0 ? messages.length / uniqueDays : 0;
  const communication = Math.min(1, 0.2 + avgPerDay / 40);

  // 4. 갈등조절 — inverse conflict keyword density
  const conflictHits = NEGATIVE_TOKENS.filter((k) => allText.includes(k)).length;
  const conflictControl = Math.max(0.1, 1 - conflictHits / (NEGATIVE_TOKENS.length * 0.6));

  // 5. 친밀도 — intimacy markers in my own messages
  const intimacyKws = ['나', '우리', '같이', '함께', '너', '자기', '여보', '오빠', '언니', '자기야'];
  const intimacyHits = intimacyKws.filter((k) => myText.includes(k)).length;
  const intimacy = Math.min(1, 0.2 + intimacyHits / intimacyKws.length);

  return [affection, stability, communication, conflictControl, intimacy].map((v) =>
    Math.max(0.1, Math.min(1.0, parseFloat(v.toFixed(2)))),
  );
}

function scoreToWeather(score: number): string {
  if (score >= 88) return '☀️ 최상 · 두 분 케미 폭발 중';
  if (score >= 75) return '🌤 맑음 · 신뢰 지수 상승 중';
  if (score >= 60) return '⛅ 구름 조금 · 안정적인 관계';
  if (score >= 45) return '🌥 흐림 · 소통이 필요한 주간';
  return '🌧 비 · 갈등 회복 구간';
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 3 — Main computation entry point (synchronous, pure)
// ═══════════════════════════════════════════════════════════════════════════════

export function computeWeeklyMetrics(
  rawKakaoText: string,
  myName: string,
): Omit<WeeklyReportData, 'analystComment' | 'isLoading' | 'generatedAt'> {
  const allMessages = parseMessagesWithDate(rawKakaoText);
  const last7 = getLast7Days();
  const weekLabel = buildWeekLabel(last7);

  // Use last-7-day window; fall back to last 200 messages when chat history is short
  const last7Set = new Set(last7);
  const weekMessages = allMessages.filter((m) => last7Set.has(m.date));
  const workingMessages = weekMessages.length >= 5 ? weekMessages : allMessages.slice(-200);

  const topics = classifyTopics(workingMessages);

  const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
  const emotionData = last7.map((dateStr) => {
    const dayMsgs = workingMessages.filter((m) => m.date === dateStr);
    return computeDayEmotionScore(dayMsgs);
  });

  // Overall score: weighted average, ignoring days with no messages (default 50)
  const activeDayScores = emotionData.filter((s, i) => {
    const cnt = workingMessages.filter((m) => m.date === last7[i]).length;
    return cnt > 0;
  });
  const overallScore =
    activeDayScores.length > 0
      ? Math.round(activeDayScores.reduce((a, b) => a + b, 0) / activeDayScores.length)
      : 65;

  const radarAxes = ['애정', '안정성', '소통', '갈등조절', '친밀도'];
  const radarValues = computeRadarValues(workingMessages, myName);

  return {
    weekLabel,
    overallScore,
    weatherLabel: scoreToWeather(overallScore),
    topics,
    emotionData,
    emotionLabels: DAY_LABELS,
    radarAxes,
    radarValues,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 4 — LLM analyst summary (aggregated numbers only — privacy safe)
// ═══════════════════════════════════════════════════════════════════════════════

const API_BASE: string = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
const ANTHROPIC_KEY: string = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

function buildAnalystSystemPrompt(
  metrics: Omit<WeeklyReportData, 'analystComment' | 'isLoading' | 'generatedAt'>,
  myProfile: UserProfile,
  partnerProfile: PartnerProfile,
): string {
  const topTopics = metrics.topics
    .slice(0, 3)
    .map((t) => `${t.label}(${t.value}%)`)
    .join(', ');
  const emotionTrend = metrics.emotionData.join(', ');
  const radarStr = metrics.radarAxes
    .map((ax, i) => `${ax}:${Math.round(metrics.radarValues[i] * 5 * 10) / 10}점`)
    .join(', ');

  return [
    `당신은 Twin.me 앱의 연애 분석가 트윈이입니다. ${myProfile.name}(${myProfile.mbti || 'MBTI미상'})의 커플 채팅 데이터를 분석했습니다.`,
    '',
    '## 이번 주 분석 데이터',
    `- 기간: ${metrics.weekLabel}`,
    `- 관계 종합 점수: ${metrics.overallScore}/100`,
    `- 날씨 지수: ${metrics.weatherLabel}`,
    `- 주요 대화 주제 분포: ${topTopics}`,
    `- 일별 감정 점수(월~일, 0~100): [${emotionTrend}]`,
    `- 관계 레이더(1~5점): ${radarStr}`,
    '',
    '## 출력 형식 (반드시 아래 형식 엄수)',
    '이 데이터를 바탕으로 트윈이의 3줄 요약 리포트를 작성해주세요.',
    '',
    '조건:',
    '1. 이번 주 대화 패턴의 핵심 특징 1문장 (날카롭고 구체적인 관찰)',
    '2. 감정 흐름의 심리학적 해석 1문장 (수치 근거 포함)',
    '3. 다음 주를 위한 실용적 조언 또는 진심 어린 칭찬 1문장 (이모지 1개)',
    '',
    '세 문장을 이어진 하나의 단락으로 작성하세요. 전문성과 따뜻함을 동시에 담아주세요.',
  ].join('\n');
}

async function callLlmForAnalysis(systemPrompt: string, signal: AbortSignal): Promise<string> {
  const userMsg = '위 데이터를 기반으로 트윈이의 3줄 요약 리포트를 작성해줘.';
  const body = JSON.stringify({
    systemPrompt,
    messages: [{ role: 'user', content: userMsg }],
  });

  if (API_BASE) {
    const res = await fetch(`${API_BASE}/api/v1/ai/self-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal,
    });
    if (res.ok) {
      const json = (await res.json()) as { reply: string };
      if (json.reply) return json.reply.trim();
    }
  }

  if (ANTHROPIC_KEY) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': ANTHROPIC_KEY,
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }],
        max_tokens: 350,
      }),
      signal,
    });
    if (res.ok) {
      const json = (await res.json()) as { content: { type: string; text: string }[] };
      const block = json.content?.find((b) => b.type === 'text');
      if (block?.text) return block.text.trim();
    }
  }

  // No API configured — generate a fallback based on the score
  return null as unknown as string;
}

function buildFallbackComment(
  metrics: Omit<WeeklyReportData, 'analystComment' | 'isLoading' | 'generatedAt'>,
): string {
  const { overallScore, topics, radarValues, radarAxes } = metrics;
  const topTopic = topics[0]?.label ?? '일상';
  const lowestRadarIdx = radarValues.indexOf(Math.min(...radarValues));
  const lowestAxis = radarAxes[lowestRadarIdx] ?? '소통';

  if (overallScore >= 80) {
    return `이번 주 대화의 핵심은 '${topTopic}' 주제 비중이 가장 높았고, 전반적으로 긍정적 감정 흐름이 유지된 건강한 한 주였어요. 두 분의 감정 싱크로가 상위권을 기록하며 신뢰의 기반이 탄탄하게 쌓이고 있어요. 이 따뜻한 흐름을 이어가려면 다음 주에도 소소한 일상 공유를 꾸준히 유지해 보세요 ✨`;
  }
  if (overallScore >= 60) {
    return `이번 주는 '${topTopic}' 이야기가 대화의 중심이었지만, 감정 기복이 다소 있었던 주간이었어요. 중반부 이후 감정 점수가 회복되는 긍정적인 흐름이 감지됩니다. '${lowestAxis}' 지표를 조금 더 보완하면 다음 주 관계 온도가 눈에 띄게 올라갈 거예요 💪`;
  }
  return `이번 주는 '${lowestAxis}' 부분에서 개선의 여지가 보인 주간이에요. 감정 점수 추이를 보면 대화 흐름에 단절이 있었던 것 같아요. 다음 주에는 짧더라도 매일 안부를 주고받는 것부터 시작해보면 어떨까요? 작은 연락이 관계의 온도를 지켜줘요 🌡️`;
}

export async function generateAnalystSummary(
  metrics: Omit<WeeklyReportData, 'analystComment' | 'isLoading' | 'generatedAt'>,
  myProfile: UserProfile,
  partnerProfile: PartnerProfile,
): Promise<string> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), 15_000);

  try {
    const prompt = buildAnalystSystemPrompt(metrics, myProfile, partnerProfile);
    const result = await callLlmForAnalysis(prompt, controller.signal);
    if (result) return result;
  } catch {
    // timeout or network error — fall through to deterministic fallback
  } finally {
    clearTimeout(timeoutHandle);
  }

  return buildFallbackComment(metrics);
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 5 — FileSystem persistence (expo-file-system SDK 56 new API)
// ═══════════════════════════════════════════════════════════════════════════════

export async function loadCachedReport(): Promise<WeeklyReportData | null> {
  try {
    const file = new File(Paths.document, REPORT_CACHE_FILE);
    if (!file.exists) return null;
    const raw = await file.text();
    return JSON.parse(raw) as WeeklyReportData;
  } catch {
    return null;
  }
}

export async function saveReportToCache(data: WeeklyReportData): Promise<void> {
  try {
    const file = new File(Paths.document, REPORT_CACHE_FILE);
    if (!file.exists) file.create();
    file.write(JSON.stringify(data));
  } catch {
    // non-critical
  }
}

export async function loadLastGeneratedTimestamp(): Promise<number> {
  try {
    const file = new File(Paths.document, LAST_GENERATED_FILE);
    if (!file.exists) return 0;
    const raw = file.textSync();
    return (JSON.parse(raw) as { ts: number }).ts ?? 0;
  } catch {
    return 0;
  }
}

async function saveLastGeneratedTimestamp(ts: number): Promise<void> {
  try {
    const file = new File(Paths.document, LAST_GENERATED_FILE);
    if (!file.exists) file.create();
    file.write(JSON.stringify({ ts }));
  } catch {
    // non-critical
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 6 — Full pipeline orchestrator
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateFullReport(
  rawKakaoText: string,
  myProfile: UserProfile,
  partnerProfile: PartnerProfile,
): Promise<WeeklyReportData> {
  const metrics = computeWeeklyMetrics(rawKakaoText, myProfile.name);
  const analystComment = await generateAnalystSummary(metrics, myProfile, partnerProfile);

  const report: WeeklyReportData = {
    ...metrics,
    generatedAt: Date.now(),
    analystComment,
    isLoading: false,
  };

  // Persist both the report and the generation timestamp
  await Promise.all([
    saveReportToCache(report),
    saveLastGeneratedTimestamp(Date.now()),
  ]);

  return report;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 7 — Scheduler gate
// ═══════════════════════════════════════════════════════════════════════════════

// Returns true when it is Sunday 22:00+ AND no report was generated in the last 6 hours.
export function shouldFireWeeklyReport(lastGeneratedAt: number): boolean {
  const now = new Date();
  if (now.getDay() !== 0) return false; // must be Sunday
  if (now.getHours() < 22) return false; // must be 22:00+

  const SIX_HOURS = 6 * 60 * 60 * 1000;
  return Date.now() - lastGeneratedAt > SIX_HOURS;
}

export const LOADING_PLACEHOLDER: WeeklyReportData = {
  weekLabel: '분석 중...',
  generatedAt: 0,
  overallScore: 0,
  weatherLabel: '🔮 데이터 집계 중',
  topics: [],
  emotionData: Array(7).fill(50),
  emotionLabels: ['월', '화', '수', '목', '금', '토', '일'],
  radarAxes: ['애정', '안정성', '소통', '갈등조절', '친밀도'],
  radarValues: Array(5).fill(0.5),
  analystComment: '채팅 데이터를 분석하고 있어요. 잠시만 기다려주세요... 🔬',
  isLoading: true,
};
