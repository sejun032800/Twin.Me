// ─── Kakao Highlight Service — 4-Emotion AI Classification + Archive ─────────────
//
// Pipeline:
//  1. Receive raw parsed messages
//  2. Run LLM / local classifier → 4 emotion buckets
//  3. Persist to AsyncStorage
//  4. Expose to SloganFooter + HelixView + GalleryScreen

import AsyncStorage from '@react-native-async-storage/async-storage';

const ANTHROPIC_KEY: string = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';
const API_BASE: string = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const STORAGE_KEY = 'twin_me_highlight_cards_v1';

// ── Public types ─────────────────────────────────────────────────────────────

export type EmotionType = 'caring' | 'funny' | 'touching' | 'random';

export interface HighlightCard {
  id: string;
  emotion: EmotionType;
  text: string;
  date: string;     // 'YYYY-MM-DD'
  speaker: string;
  savedAt: number;  // Date.now()
}

// ── Emotion metadata ─────────────────────────────────────────────────────────

export const EMOTION_META: Record<EmotionType, { label: string; emoji: string; color: string }> = {
  caring:   { label: '다정한 말',   emoji: '💌', color: '#F472B6' },
  funny:    { label: '재밌는 말',   emoji: '😂', color: '#FBBF24' },
  touching: { label: '감동적인 말', emoji: '✨', color: '#A78BFA' },
  random:   { label: '뜬금없는 말', emoji: '🤪', color: '#34D399' },
};

// ── AsyncStorage helpers ──────────────────────────────────────────────────────

export async function loadHighlightCards(): Promise<HighlightCard[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HighlightCard[];
  } catch {
    return [];
  }
}

export async function saveHighlightCards(cards: HighlightCard[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  } catch {}
}

export async function appendHighlightCards(newCards: HighlightCard[]): Promise<HighlightCard[]> {
  const existing = await loadHighlightCards();
  const existingIds = new Set(existing.map((c) => c.id));
  const deduped = newCards.filter((c) => !existingIds.has(c.id));
  const merged = [...deduped, ...existing];
  await saveHighlightCards(merged);
  return merged;
}

export async function clearHighlightCards(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {}
}

// ── Local fallback classifier ─────────────────────────────────────────────────

const CARING_RE = /사랑해|사랑한다|보고싶어|보고파|걱정돼|잘 자|잘자|고마워|감사해|힘내|응원해|안아|예뻐|잘생겼|토닥/i;
const FUNNY_RE  = /ㅋㅋㅋ|ㅎㅎㅎ|ㅋㅋㅋㅋ|ㅋㅋㅋㅋㅋ|ㅎㅎㅎㅎ|웃겨|대박|어이없|황당|ㅋㅋ|ㅎㅎ|ㅠㅠ|ㅜㅜ/i;
const TOUCHING_RE = /약속|영원|함께|평생|기억할게|기억할|잊지 못해|잊을 수 없어|진심|진짜로|행복해|행복|설레|두근/i;
const RANDOM_RE = /갑자기|뜬금없|왠지|아 맞다|그러고 보니|참|어 그|있잖아|근데|아무튼/i;

function localClassify(text: string): EmotionType | null {
  if (TOUCHING_RE.test(text)) return 'touching';
  if (CARING_RE.test(text)) return 'caring';
  if (FUNNY_RE.test(text)) return 'funny';
  if (RANDOM_RE.test(text)) return 'random';
  return null;
}

function localFallbackClassification(
  messages: Array<{ date: string; speaker: string; content: string }>,
): HighlightCard[] {
  const buckets: Record<EmotionType, Array<{ date: string; speaker: string; content: string }>> = {
    caring: [], funny: [], touching: [], random: [],
  };

  for (const msg of messages) {
    const emotion = localClassify(msg.content);
    if (emotion) buckets[emotion].push(msg);
  }

  const results: HighlightCard[] = [];
  const emotions: EmotionType[] = ['caring', 'funny', 'touching', 'random'];

  for (const emotion of emotions) {
    const candidates = buckets[emotion];
    if (candidates.length === 0) continue;
    // Pick top 2 (or 1 if only 1)
    const picks = candidates.slice(0, 2);
    for (let i = 0; i < picks.length; i++) {
      const msg = picks[i];
      results.push({
        id: `local-${emotion}-${msg.date}-${i}`,
        emotion,
        text: msg.content,
        date: msg.date,
        speaker: msg.speaker,
        savedAt: Date.now(),
      });
    }
  }

  return results;
}

// ── LLM classification prompt ─────────────────────────────────────────────────

const EMOTION_PROMPT = `당신은 커플의 카카오톡 대화에서 감정 유형별로 인상 깊은 문장을 선별하는 AI입니다.

아래 메시지 목록을 분석해 다음 4가지 감정 유형에서 각 1~2개씩 가장 인상 깊은 문장을 선별해주세요:
1. "caring" - 다정한 말 (위로나 애정 표현)
2. "funny" - 재밌는 말 (ㅋㅋㅋㅋ가 들어간 유쾌한 티키타카)
3. "touching" - 감동적인 말 (진심 어린 표현, 약속, 감동)
4. "random" - 뜬금없는 말 (기억에 남는 엉뚱한 순간)

반드시 다음 JSON 배열 형식만 응답하세요 (다른 텍스트 없이):
[
  {
    "id": "고유ID",
    "emotion": "caring|funny|touching|random",
    "text": "원문 문장",
    "date": "YYYY-MM-DD",
    "speaker": "발화자이름"
  }
]`;

// ── LLM classification ────────────────────────────────────────────────────────

async function llmClassification(
  messages: Array<{ date: string; speaker: string; content: string }>,
): Promise<HighlightCard[]> {
  const sample = messages.slice(-100);
  const msgList = sample
    .map((m, i) => `${i + 1}. [${m.date}] ${m.speaker}: ${m.content}`)
    .join('\n');

  const payload = {
    model: CLAUDE_MODEL,
    max_tokens: 1500,
    system: EMOTION_PROMPT,
    messages: [{ role: 'user', content: `다음 메시지를 분석해주세요:\n\n${msgList}` }],
  };

  try {
    let response: Response;

    if (API_BASE) {
      response = await fetch(`${API_BASE}/api/v1/ai/emotion-highlights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: sample }),
        signal: AbortSignal.timeout(18_000),
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
        signal: AbortSignal.timeout(18_000),
      });
    } else {
      return localFallbackClassification(messages);
    }

    const json = await response.json();

    if (Array.isArray(json.records)) {
      return (json.records as HighlightCard[]).map((r, i) => ({
        ...r,
        savedAt: Date.now(),
        id: r.id ?? `llm-${Date.now()}-${i}`,
      }));
    }

    const text: string = json?.content?.[0]?.text ?? '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return localFallbackClassification(messages);

    const parsed = JSON.parse(match[0]) as HighlightCard[];
    if (!Array.isArray(parsed)) return localFallbackClassification(messages);

    return parsed.map((r, i) => ({
      ...r,
      savedAt: Date.now(),
      id: r.id ?? `llm-${Date.now()}-${i}`,
    }));
  } catch {
    return localFallbackClassification(messages);
  }
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export interface EmotionPipelineResult {
  newCards: HighlightCard[];
  allCards: HighlightCard[];
}

export async function runEmotionHighlightPipeline(
  rawText: string,
  lastSyncTimestamp: string | null,
): Promise<EmotionPipelineResult> {
  // Parse messages from raw text
  const DATE_HEADER_RE = /(\d{4})년 (\d{1,2})월 (\d{1,2})일/;
  const MSG_RE = /^\[(.+?)\] \[(오전|오후) (\d{1,2}):(\d{2})\] (.+)$/;

  const lines = rawText.split('\n');
  const messages: Array<{ ts: string; date: string; speaker: string; content: string }> = [];
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
    let h = parseInt(hourStr, 10);
    if (ampm === '오후' && h < 12) h += 12;
    if (ampm === '오전' && h === 12) h = 0;
    const ts = `${currentDate}T${String(h).padStart(2, '0')}:${String(minStr).padStart(2, '0')}`;
    messages.push({ ts, date: currentDate, speaker, content: content.trim() });
  }

  const delta = lastSyncTimestamp
    ? messages.filter((m) => m.ts > lastSyncTimestamp)
    : messages;

  if (delta.length === 0) {
    const allCards = await loadHighlightCards();
    return { newCards: [], allCards };
  }

  const newCards = await llmClassification(delta);
  const allCards = await appendHighlightCards(newCards);

  return { newCards, allCards };
}

// ── Random quote picker (for slogan + weekly notification) ────────────────────

export function pickRandomHighlight(cards: HighlightCard[]): HighlightCard | null {
  if (cards.length === 0) return null;
  return cards[Math.floor(Math.random() * cards.length)];
}

// ── Format slogan string ──────────────────────────────────────────────────────

export function formatHighlightSlogan(card: HighlightCard): string {
  const d = new Date(card.date);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hour = new Date().getHours();
  const timeLabel = hour >= 18 || hour < 6 ? '어느날 밤' : '어느날 낮';
  return `Twin.me - "${card.text}" - ${yy}.${mm}.${timeLabel}`;
}
