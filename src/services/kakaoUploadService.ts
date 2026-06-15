// ─── KakaoTalk Upload — Incremental Parse + AI Touching Moment Selection ────────
//
// Pipeline:
//   1. Parse .txt export → ParsedMsg[] with ISO timestamps
//   2. Filter to delta (ts > lastSyncTimestamp)
//   3. LLM selects 3-5 most touching/emotional moments → KakaoSyncRecord[]
//   4. Fallback: local valence scoring when no API key is available

// ── Environment ──────────────────────────────────────────────────────────────
const API_BASE: string = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
const ANTHROPIC_KEY: string = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

// ── Public types ─────────────────────────────────────────────────────────────

export interface KakaoSyncRecord {
  id: string;
  date: string;       // 'YYYY-MM-DD'
  speaker: string;
  context: string;    // surrounding conversation summary
  coreQuote: string;  // the single touching line
}

// ── Internal parsed message ───────────────────────────────────────────────────

interface ParsedMsg {
  ts: string;        // 'YYYY-MM-DDTHH:mm' — sort/compare key
  date: string;      // 'YYYY-MM-DD'
  speaker: string;
  content: string;
}

// ── KakaoTalk .txt format regexes ────────────────────────────────────────────
// Date header: --------------- 2024년 1월 20일 토요일 ---------------
const DATE_HEADER_RE = /(\d{4})년 (\d{1,2})월 (\d{1,2})일/;
// Message:    [이름] [오전/오후 HH:MM] content
const MSG_RE = /^\[(.+?)\] \[(오전|오후) (\d{1,2}):(\d{2})\] (.+)$/;

function toISO(date: string, ampm: string, hourStr: string, minStr: string): string {
  let h = parseInt(hourStr, 10);
  const m = parseInt(minStr, 10);
  if (ampm === '오후' && h < 12) h += 12;
  if (ampm === '오전' && h === 12) h = 0;
  return `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── Full parser ───────────────────────────────────────────────────────────────

export function parseKakaoMessagesWithTimestamps(rawText: string): ParsedMsg[] {
  const lines = rawText.split('\n');
  const messages: ParsedMsg[] = [];
  let currentDate = '2020-01-01';

  for (const raw of lines) {
    const line = raw.trim();

    const dateMatch = line.match(DATE_HEADER_RE);
    if (dateMatch) {
      const [, y, m, d] = dateMatch;
      currentDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      continue;
    }

    const msgMatch = line.match(MSG_RE);
    if (!msgMatch) continue;

    const [, speaker, ampm, hourStr, minStr, content] = msgMatch;
    const ts = toISO(currentDate, ampm, hourStr, minStr);

    messages.push({ ts, date: currentDate, speaker, content: content.trim() });
  }

  return messages;
}

// ── Incremental filter ────────────────────────────────────────────────────────
// Returns only messages after lastSyncTimestamp (exclusive).
// If lastSyncTimestamp is null, all messages are considered new.

export function extractIncrementalMessages(
  messages: ParsedMsg[],
  lastSyncTimestamp: string | null,
): { delta: ParsedMsg[]; newLastTs: string | null } {
  if (!messages.length) return { delta: [], newLastTs: lastSyncTimestamp };

  const sorted = [...messages].sort((a, b) => (a.ts > b.ts ? 1 : a.ts < b.ts ? -1 : 0));

  const delta = lastSyncTimestamp
    ? sorted.filter((m) => m.ts > lastSyncTimestamp)
    : sorted;

  const newLastTs = sorted[sorted.length - 1].ts;

  return { delta, newLastTs };
}

// ── Local valence fallback ────────────────────────────────────────────────────
// Used when LLM API is unavailable. Mirrors VALENCE_PATTERNS from useMemoryWall.

const LOCAL_VALENCE: Array<{ re: RegExp; score: number }> = [
  { re: /사랑해|사랑한다|사랑스러워|사랑이야/, score: 10 },
  { re: /좋아해|좋아한다|너를 좋아|많이 좋아/, score: 9 },
  { re: /약속해|약속할게|영원히|평생 함께/, score: 9 },
  { re: /행복해|행복하다|너무 행복/, score: 8 },
  { re: /보고싶어|보고싶다|보고파/, score: 8 },
  { re: /설레|두근|심쿵|떨려/, score: 7 },
  { re: /예쁘다|예뻐|잘생겼어|멋있어/, score: 7 },
  { re: /감사해|고마워|고맙다/, score: 7 },
  { re: /최고야|최고다|세상에서 제일/, score: 7 },
  { re: /기억할게|잊지 못해|평생 기억/, score: 7 },
  { re: /함께라서|같이 있어서|옆에 있어/, score: 7 },
  { re: /완벽해|찰떡이야|딱 맞아/, score: 6 },
];

function localScore(text: string): number {
  return LOCAL_VALENCE.reduce((sum, { re, score }) => sum + (re.test(text) ? score : 0), 0);
}

function localFallbackSelection(delta: ParsedMsg[], max = 5): KakaoSyncRecord[] {
  const scored = delta
    .map((m) => ({ msg: m, score: localScore(m.content) }))
    .filter(({ score }) => score >= 6)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);

  return scored.map(({ msg }, i) => ({
    id: `sync-${msg.ts}-${i}`,
    date: msg.date,
    speaker: msg.speaker,
    context: `${msg.speaker}의 메시지`,
    coreQuote: msg.content,
  }));
}

// ── LLM selection ─────────────────────────────────────────────────────────────

const SELECTION_PROMPT = `당신은 커플의 카카오톡 대화에서 가장 감동적이고 다정한 순간을 선별하는 AI입니다.

아래 메시지 목록에서 3~5개의 가장 감동적인 대화를 선별해주세요.
기준: 위로, 애정 표현, 진심 어린 리액션, 약속, 고백 등.
단순 정보 전달, 일정 조율, 반복되는 안부 인사는 제외합니다.

반드시 다음 JSON 배열 형식만 응답하세요 (다른 텍스트 없이):
[
  {
    "id": "고유ID",
    "date": "YYYY-MM-DD",
    "speaker": "발화자이름",
    "context": "주변 맥락 한 줄 요약",
    "coreQuote": "가장 감동적인 원문 한 줄"
  }
]`;

async function callLLMSelection(
  delta: ParsedMsg[],
  max = 5,
): Promise<KakaoSyncRecord[]> {
  // Limit to 80 messages to avoid token overflow
  const sample = delta.slice(-80);
  const msgList = sample.map((m, i) => `${i + 1}. [${m.date}] ${m.speaker}: ${m.content}`).join('\n');

  const payload = {
    model: CLAUDE_MODEL,
    max_tokens: 1200,
    system: SELECTION_PROMPT,
    messages: [{ role: 'user', content: `다음 메시지를 분석해주세요:\n\n${msgList}` }],
  };

  let response: Response;
  try {
    if (API_BASE) {
      response = await fetch(`${API_BASE}/api/v1/ai/touching-moments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: sample, max }),
        signal: AbortSignal.timeout(15_000),
      });
    } else if (ANTHROPIC_KEY) {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
    } else {
      return localFallbackSelection(delta, max);
    }

    const json = await response.json();

    // Backend proxy: { records: KakaoSyncRecord[] }
    if (Array.isArray(json.records)) return json.records.slice(0, max);

    // Direct Anthropic: extract text block
    const text: string = json?.content?.[0]?.text ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return localFallbackSelection(delta, max);

    const parsed = JSON.parse(jsonMatch[0]) as KakaoSyncRecord[];
    if (!Array.isArray(parsed)) return localFallbackSelection(delta, max);

    // Stamp unique IDs to prevent collisions
    return parsed.slice(0, max).map((r, i) => ({
      ...r,
      id: r.id ?? `llm-${Date.now()}-${i}`,
    }));
  } catch {
    return localFallbackSelection(delta, max);
  }
}

// ── Main pipeline entry point ─────────────────────────────────────────────────

export interface KakaoSyncPipelineResult {
  newRecords: KakaoSyncRecord[];
  newLastTs: string | null;
  deltaCount: number;
}

export async function runKakaoSyncPipeline(
  rawText: string,
  lastSyncTimestamp: string | null,
  maxMoments = 5,
): Promise<KakaoSyncPipelineResult> {
  const allMessages = parseKakaoMessagesWithTimestamps(rawText);
  const { delta, newLastTs } = extractIncrementalMessages(allMessages, lastSyncTimestamp);

  if (delta.length === 0) {
    return { newRecords: [], newLastTs, deltaCount: 0 };
  }

  const newRecords = await callLLMSelection(delta, maxMoments);

  return { newRecords, newLastTs, deltaCount: delta.length };
}
