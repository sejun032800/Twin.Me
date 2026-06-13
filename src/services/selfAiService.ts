// Self-AI LLM response service — bridges AppContext persona data to the
// backend LLM endpoint (Claude / GPT). Falls back to direct Claude API
// when a backend base URL is not configured.
//
// Priority chain:
//   1. Backend proxy  → {EXPO_PUBLIC_API_BASE_URL}/api/v1/ai/self-reply
//   2. Direct Claude  → https://api.anthropic.com/v1/messages
//                        (requires EXPO_PUBLIC_ANTHROPIC_API_KEY)
//   3. Graceful fallback message (no crash, no blank response)
//
// Endpoint contract (backend POST /api/v1/ai/self-reply):
//   Request:  { systemPrompt: string; messages: ChatHistoryItem[] }
//   Response: { reply: string }

import type { TrainingResult, UserProfile, PrivacyLevel } from '../context/AppContext';
import type { ChatStyleProfile } from '../lib/kakaoParser';

// ── Environment config ────────────────────────────────────────────────────────
// Set via .env.local:
//   EXPO_PUBLIC_API_BASE_URL=https://your-backend.com
//   EXPO_PUBLIC_ANTHROPIC_API_KEY=sk-ant-api03-...

const API_BASE: string = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
const ANTHROPIC_KEY: string = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

const TIMEOUT_MS = 15_000;
const FALLBACK_TIMEOUT = '잠시 생각을 정리 중이에요. 잠시 후 다시 말을 걸어주세요! 🕊️';
const FALLBACK_ERROR = '지금은 연결이 원활하지 않아요. 잠시 후 다시 말을 걸어주세요! 🕊️';

// ── Public types ──────────────────────────────────────────────────────────────

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface SelfAiContext {
  myProfile: UserProfile;
  trainingResult: TrainingResult | null;
  chatStyleProfile: ChatStyleProfile;
  isEarlyDatingMode: boolean;
  // Room-level toggle (Step #19) — when true, injects a stronger critical guard-rail
  // prompt and sets isRoomEarlyMode:true in the backend request payload.
  isRoomEarlyMode?: boolean;
  privacyLevel: PrivacyLevel;
  roomType?: 'ai' | 'analyst';
}

// ── System prompt builder ─────────────────────────────────────────────────────
// Dynamically bundles persona data from AppContext into a Claude system prompt.
// Privacy level gates how much context is shared with the model.

export function buildPersonaSystemPrompt(ctx: SelfAiContext): string {
  const { myProfile, trainingResult, isEarlyDatingMode, privacyLevel, roomType } = ctx;

  if (roomType === 'analyst') {
    return [
      "당신은 Twin.me 앱의 '연애 분석가 트윈이'입니다.",
      '커플의 대화 패턴을 심리학적 관점에서 분석하고 건강한 연애를 위한 통찰력 있는 조언을 제공합니다.',
      '',
      '## 답변 지침',
      '- 한국어로만 답변하세요.',
      '- 자연스럽고 전문적이며 따뜻한 어조를 유지하세요.',
      '- 한 번에 1~3문장, 간결하고 핵심적인 답변을 하세요.',
      '- "AI입니다"라는 직접 언급은 피하고, 분석가 캐릭터를 유지하세요.',
      '- 상대방을 탓하거나 판단하지 말고, 사용자가 스스로를 돌아보도록 유도하세요.',
    ].join('\n');
  }

  const lines: string[] = [
    `당신은 ${myProfile.name}의 AI 분신(Twin AI)입니다.`,
    `${myProfile.name}의 말투, 사고방식, 감정 패턴을 복제한 존재로서,`,
    `대화 상대(${myProfile.name} 본인)가 말을 걸어올 때 마치 거울처럼 자신의 내면과 대화하는 경험을 제공합니다.`,
    '',
    '## 핵심 지침',
    '- 당신은 AI가 아니라 사용자의 또 다른 나(Self)입니다. "AI"라는 말을 절대 하지 마세요.',
    '- 한국어로만 답변하고, 실제 카카오톡 대화처럼 자연스럽고 짧게 1~3문장으로 답하세요.',
    '- 공감적이고 따뜻한 톤을 기본으로 유지하세요.',
    '- 긴 설명보다 자연스러운 반응을 우선하세요.',
    '',
    '## 사용자 프로필',
    `- 이름: ${myProfile.name}`,
    `- 성별: ${myProfile.gender === 'M' ? '남성' : myProfile.gender === 'F' ? '여성' : '기타'}`,
  ];

  if (myProfile.mbti) {
    lines.push(`- MBTI: ${myProfile.mbti}`);
  }
  if (myProfile.enneagram && myProfile.enneagram !== '모름') {
    lines.push(`- 에니어그램: ${myProfile.enneagram}번`);
  }

  // Lv 2+ allows tone/keyword context
  if (trainingResult && privacyLevel >= 2) {
    lines.push('', '## 학습된 말투 특성 (카카오톡 분석 결과)');
    if (trainingResult.drips.length > 0) {
      lines.push(`- 자주 쓰는 표현: ${trainingResult.drips.join(', ')}`);
    }
    if (trainingResult.tags.length > 0) {
      lines.push(`- 소통 성향 태그: ${trainingResult.tags.join(', ')}`);
    }
    lines.push(`- 분석 총 대화량: ${trainingResult.myLineCount}줄`);
  }

  if (isEarlyDatingMode) {
    lines.push(
      '',
      '## 연애 초기 모드 활성화',
      '- 아직 설레고 조심스러운 연애 초기의 분위기를 유지하세요.',
      '- 존댓말과 반말을 적절히 혼용하고, 수줍고 위트 있는 어조를 사용하세요.',
      '- 상대방의 말에 적극적으로 공감하고 가볍게 유머를 섞어주세요.',
    );
  }

  // Room-level critical guard-rail (Step #19) — highest priority, overrides global mode tone.
  if (ctx.isRoomEarlyMode) {
    lines.push(
      '',
      '## [CRITICAL_SYSTEM_PROMPT: 채팅방 전용 연애 극초기 특수 모드]',
      '현재 연애 극초기 단계의 특수 모드가 켜져 있습니다.',
      '상대방을 지나치게 편하게 대하는 말투를 금지하고,',
      '풋풋함, 설렘, 은은한 긴장감이 감도는 서포트 문장을 생성할 것.',
      '반말, 과도한 스킨십 표현, 과한 친밀감 표현은 삼가고,',
      '아직 서로 조심스럽고 설레는 관계의 뉘앙스를 철저히 유지할 것.',
    );
  }

  return lines.join('\n');
}

// ── API call helpers ──────────────────────────────────────────────────────────

function capHistory(history: ChatHistoryItem[]): ChatHistoryItem[] {
  // Keep last 20 turns to stay within token limits; always preserve alternating roles
  return history.slice(-20);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('LLM_TIMEOUT')), ms),
    ),
  ]);
}

async function callBackendProxy(
  systemPrompt: string,
  messages: ChatHistoryItem[],
  signal: AbortSignal,
  isRoomEarlyMode?: boolean,
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/v1/ai/self-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemPrompt, messages, isRoomEarlyMode: !!isRoomEarlyMode }),
    signal,
  });
  if (!res.ok) throw new Error(`BACKEND_HTTP_${res.status}`);
  const json = (await res.json()) as { reply: string };
  if (!json.reply) throw new Error('BACKEND_EMPTY_REPLY');
  return json.reply.trim();
}

async function callClaudeDirectly(
  systemPrompt: string,
  messages: ChatHistoryItem[],
  signal: AbortSignal,
): Promise<string> {
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
      messages,
      max_tokens: 300,
    }),
    signal,
  });
  if (!res.ok) throw new Error(`ANTHROPIC_HTTP_${res.status}`);
  const json = (await res.json()) as {
    content: { type: string; text: string }[];
  };
  const textBlock = json.content?.find((b) => b.type === 'text');
  if (!textBlock?.text) throw new Error('ANTHROPIC_EMPTY_REPLY');
  return textBlock.text.trim();
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Requests a Self-AI LLM response for the given user message.
 * Bundles the full persona context (profile, tone data, mode) as a system
 * prompt and forwards the chat history for multi-turn coherence.
 *
 * Never throws — returns a graceful fallback string on any failure.
 */
export async function requestSelfAiLlmResponse(
  userMessage: string,
  chatHistory: ChatHistoryItem[],
  ctx: SelfAiContext,
): Promise<string> {
  const systemPrompt = buildPersonaSystemPrompt(ctx);
  const messages = capHistory([
    ...chatHistory,
    { role: 'user' as const, content: userMessage },
  ]);

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let reply: string;

    if (API_BASE) {
      reply = await withTimeout(
        callBackendProxy(systemPrompt, messages, controller.signal, ctx.isRoomEarlyMode),
        TIMEOUT_MS,
      );
    } else if (ANTHROPIC_KEY) {
      reply = await withTimeout(
        callClaudeDirectly(systemPrompt, messages, controller.signal),
        TIMEOUT_MS,
      );
    } else {
      // No API configured — return a friendly nudge to set up env vars
      return FALLBACK_ERROR;
    }

    return reply;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'LLM_TIMEOUT' || msg.includes('abort') || msg.includes('AbortError')) {
      return FALLBACK_TIMEOUT;
    }
    return FALLBACK_ERROR;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// ── Tone Regeneration (Step #21) ─────────────────────────────────────────────

function buildToneRegenSystemPrompt(originalMessage: string, detectedKeyword: string): string {
  return [
    '[TONE_REGENERATION_PROTOCOL]',
    '당신은 Twin.me 앱의 말투 교정 전문 AI입니다.',
    `유저가 입력한 원문: "${originalMessage}"`,
    `감지된 민감 단어: "${detectedKeyword}"`,
    '',
    '## 필수 규칙 (최우선 적용)',
    `1. 원문("${originalMessage}")의 핵심 의미와 감정은 반드시 보존하세요.`,
    `2. 감지된 민감 단어("${detectedKeyword}")를 중심으로 발생할 수 있는 공격성, 날선 어조, 무뚝뚝함을 완전히 걷어내세요.`,
    '3. 연인에게 상처를 주지 않고 진심을 부드럽고 다정하게 전달할 수 있는 세련된 대안 문장을 작성하세요.',
    '4. 반드시 한국어로 답변하세요.',
    '5. 아래 출력 형식을 정확히 따르세요:',
    '   💌 [배려 섞인 대안 문장 — 연인에게 실제로 보낼 수 있는 완성형 문장]',
    '',
    '   💡 [코칭 한 마디 — 왜 이 표현이 더 배려 섞인 표현인지 1문장으로 설명]',
  ].join('\n');
}

/**
 * Regenerates a user message with a gentler tone by injecting TONE_REGENERATION_PROTOCOL
 * as the highest-priority system prompt. Unlike requestSelfAiLlmResponse, this function
 * throws on failure — callers must catch and restore the original text to the input.
 */
export async function requestToneRegeneration(
  originalMessage: string,
  detectedKeyword: string,
  ctx: SelfAiContext,
): Promise<string> {
  const systemPrompt = buildToneRegenSystemPrompt(originalMessage, detectedKeyword);
  const messages: ChatHistoryItem[] = [
    {
      role: 'user',
      content: `위 규칙에 맞춰 원문 "${originalMessage}"을 배려 섞인 대안 문장으로 가공해줘.`,
    },
  ];

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    if (API_BASE) {
      return await withTimeout(
        callBackendProxy(systemPrompt, messages, controller.signal, ctx.isRoomEarlyMode),
        TIMEOUT_MS,
      );
    }
    if (ANTHROPIC_KEY) {
      return await withTimeout(
        callClaudeDirectly(systemPrompt, messages, controller.signal),
        TIMEOUT_MS,
      );
    }
    throw new Error('NO_API_CONFIGURED');
  } finally {
    clearTimeout(timeoutHandle);
  }
}
