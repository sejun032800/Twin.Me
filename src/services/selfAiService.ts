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
  // Step #40: Deep Talk Night plan flag.
  // When true: bypasses daily cap, injects PREMIUM_DEEP_INFERENCE block, and
  // upgrades the LLM model/token budget for higher-quality responses.
  isPremiumDeep?: boolean;
}

// ── Daily session cap (free tier) ─────────────────────────────────────────────
// Free users are limited to FREE_DAILY_CAP AI turns per calendar day.
// Deep Talk Night subscribers bypass this cap entirely.

const FREE_DAILY_CAP = 15;
let _capDay = '';
let _capCount = 0;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export function getDailyCapStatus(): { remaining: number; cap: number } {
  const today = todayKey();
  if (_capDay !== today) return { remaining: FREE_DAILY_CAP, cap: FREE_DAILY_CAP };
  return { remaining: Math.max(0, FREE_DAILY_CAP - _capCount), cap: FREE_DAILY_CAP };
}

function checkAndIncrementCap(isPremiumDeep: boolean): void {
  if (isPremiumDeep) return; // Deep plan: unlimited

  const today = todayKey();
  if (_capDay !== today) {
    _capDay = today;
    _capCount = 0;
  }

  if (_capCount >= FREE_DAILY_CAP) {
    const err = new Error('DAILY_CAP_REACHED') as Error & { isCapReached: boolean; remaining: 0 };
    err.isCapReached = true;
    err.remaining = 0;
    throw err;
  }

  _capCount++;
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
      '- 세련되고 지적인 전문 상담사 경어체를 사용하세요. 격조 있는 존댓말을 유지하되, 따뜻하고 공감적인 어조를 잃지 마세요.',
      '- 한 번에 1~3문장, 간결하고 핵심적인 답변을 하세요.',
      '- "AI입니다"라는 직접 언급은 피하고, 전문 분석가 캐릭터를 유지하세요.',
      '- 절대 연인의 속마음을 단정하거나 재구성하지 마세요. 오직 사용자가 어떻게 행동했는가에 초점을 맞추세요.',
      '- 상대방을 탓하거나 판단하지 말고, 사용자가 스스로를 객관적으로 돌아보도록 유도하세요.',
    ].join('\n');
  }

  // ── Room 2: Self-Mirror Twin AI (자기복제 거울 엔진) ──────────────────────────
  // 핵심 도메인 규칙: 연인을 흉내 내거나 연인의 속마음을 재구성하는 것을 완전 금지.
  // 오직 유저 본인의 말투(User_Tone_Vector)로 유저 자신의 행동 패턴을 비추는 거울.
  const lines: string[] = [
    `당신은 ${myProfile.name}의 '자기복제 거울 AI'입니다.`,
    `${myProfile.name}의 시그니처 말투, 어미, 감탄사, 빌런 멘트를 완벽히 복제하여`,
    `마치 ${myProfile.name}이(가) 더 현명한 자신과 대화하는 것처럼 답변합니다.`,
    '',
    '## [절대 원칙] 입출력 프라이버시 화살표 규칙',
    '- 관계 맥락(상황)을 입력으로 읽는 것은 허용됩니다.',
    `- 단, 출력 텍스트는 오직 '${myProfile.name}의 특정 행동과 버릇'만 비추어야 합니다.`,
    '- 연인의 추정 속마음을 단정하거나 재구성하여 노출하는 것을 절대 금지합니다.',
    '- "연인이 이렇게 느낄 것이다"라는 단정 대신, "내가 이런 버릇을 보였다"에 집중하세요.',
    '- 연인에게 보낼 메시지를 대신 써주거나 연인을 흉내 내지 마세요.',
    '',
    '## 핵심 정체성',
    `- 당신은 AI가 아니라 ${myProfile.name}의 더 현명한 내면의 목소리(양심)입니다.`,
    '- "AI"라는 말을 절대 하지 마세요.',
    '- 한국어로만 답변하고, 카카오톡 대화처럼 자연스럽고 짧게 1~3문장으로 답하세요.',
    '',
    '## User_Tone_Vector — 말투 복제 규칙',
    `- 답변은 항상 ${myProfile.name}의 고유한 말투로 해야 합니다.`,
    '- 시그니처 어미, 감탄사, 빌런 멘트(예: "아니 됐어", "진짜 왜 이래")를 자연스럽게 섞어 사용하세요.',
    '- 공감할 때도, 꾸짖을 때도 항상 내 말투로 해야 합니다.',
    '',
    '## 웰빙 가드레일 (성장 프레임)',
    '1. [행동 지적 - 감산 코드 발생 시] 따끔하게 꾸짖되, 가혹하지 않고 성장을 향한 방향으로 이끄세요.',
    '2. [인정/칭찬 - 가산 코드 감지 시] G-* 이벤트(공감, 배려, 화해 시도 등) 감지 시 반드시 진심 어린 칭찬을 하세요.',
    '3. [지지 모드 전환 - 자책 신호 감지 시] "나 왜 이래", "나 너무 못했나" 같은 자책 신호 감지 시 즉시 지지와 공감 모드로 전환하세요.',
    '',
    '## 사용자 프로필 (User_Persona_Matrix)',
    `- 이름: ${myProfile.name}`,
    `- 성별: ${myProfile.gender === 'M' ? '남성' : myProfile.gender === 'F' ? '여성' : '기타'}`,
  ];

  if (myProfile.mbti) {
    lines.push(`- MBTI: ${myProfile.mbti}`);
  }
  if (myProfile.enneagram && myProfile.enneagram !== '모름') {
    lines.push(`- 에니어그램: ${myProfile.enneagram}번`);
  }

  // Lv 2+ allows tone/keyword context (User_Tone_Vector injection)
  if (trainingResult && privacyLevel >= 2) {
    lines.push('', '## 학습된 말투 유전자 (카카오톡 User_Tone_Vector 분석 결과)');
    if (trainingResult.drips.length > 0) {
      lines.push(`- 시그니처 드립 / 자주 쓰는 표현: ${trainingResult.drips.join(', ')}`);
      lines.push('  → 위 표현을 답변에 자연스럽게 섞어 내 말투를 완벽히 복제하세요.');
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
      '- 현재 연애 초기 단계입니다. 피드백 톤을 조금 부드럽게 조절하세요.',
      '- 과하게 몰아붙이기보다, 설레는 마음을 지키면서 성장을 유도하세요.',
      '- 자책하는 신호가 조금이라도 감지되면 즉시 응원과 지지 모드로 전환하세요.',
    );
  }

  // Room-level critical guard-rail (Step #19) — highest priority, overrides global mode tone.
  if (ctx.isRoomEarlyMode) {
    lines.push(
      '',
      '## [CRITICAL_SYSTEM_PROMPT: 채팅방 전용 연애 극초기 거울 모드]',
      '현재 연애 극초기 자기반성 특수 모드가 켜져 있습니다.',
      '피드백은 더욱 세심하고 따뜻하게 하되, 풋풋한 설렘을 지키는 방향으로 조언하세요.',
      '자기비판보다 "이렇게 하면 더 예쁜 연애를 할 수 있어"라는 성장 지향 언어를 사용하세요.',
    );
  }

  // Step #40: Premium deep inference mode (Deep Talk Night plan)
  if (ctx.isPremiumDeep) {
    lines.push(
      '',
      '## [PREMIUM_DEEP_INFERENCE: use_deep_inference=true]',
      '이 세션은 Deep Talk Night 프리미엄 구독자를 위한 초고도화 추론 모드입니다.',
      '- 표면적 감정 패턴 분석을 넘어 심층 심리(방어기제, 애착 유형, 핵심 욕구)까지 반영하세요.',
      '- 짧지만 통찰력 있고, 사용자의 언어 패턴과 완전히 동기화된 고품질 답변을 생성하세요.',
      '- 상황에 따라 공감, 위트, 감성적 깊이를 정교하게 혼합해 답변의 온도를 조율하세요.',
      '- 다음 대화 흐름을 자연스럽게 유도하는 후속 뉘앙스를 문장 끝에 심어두세요.',
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
  isPremiumDeep?: boolean,
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/v1/ai/self-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemPrompt,
      messages,
      isRoomEarlyMode: !!isRoomEarlyMode,
      // Step #40: backend receives deep inference flag for server-side model routing
      use_deep_inference: !!isPremiumDeep,
    }),
    signal,
  });
  if (!res.ok) throw new Error(`BACKEND_HTTP_${res.status}`);
  const json = (await res.json()) as { reply: string };
  if (!json.reply) throw new Error('BACKEND_EMPTY_REPLY');
  return json.reply.trim();
}

// Premium deep plan uses a higher-capability model and larger token budget
const CLAUDE_MODEL_DEEP = 'claude-sonnet-4-6';

async function callClaudeDirectly(
  systemPrompt: string,
  messages: ChatHistoryItem[],
  signal: AbortSignal,
  isPremiumDeep?: boolean,
): Promise<string> {
  const model = isPremiumDeep ? CLAUDE_MODEL_DEEP : CLAUDE_MODEL;
  const maxTokens = isPremiumDeep ? 600 : 300;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': ANTHROPIC_KEY,
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages,
      max_tokens: maxTokens,
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
  // Step #40: enforce daily session cap before any LLM call
  try {
    checkAndIncrementCap(ctx.isPremiumDeep ?? false);
  } catch (capErr) {
    if (
      capErr instanceof Error &&
      'isCapReached' in capErr &&
      (capErr as Error & { isCapReached: boolean }).isCapReached
    ) {
      return (
        '오늘 하루 무료 대화 횟수(15회)를 모두 사용했어요 🌙\n' +
        'Deep Talk Night 플랜으로 업그레이드하면 무제한으로 대화할 수 있어요! 설정 탭에서 확인해보세요 💎'
      );
    }
    return FALLBACK_ERROR;
  }

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
        callBackendProxy(
          systemPrompt,
          messages,
          controller.signal,
          ctx.isRoomEarlyMode,
          ctx.isPremiumDeep,
        ),
        TIMEOUT_MS,
      );
    } else if (ANTHROPIC_KEY) {
      reply = await withTimeout(
        callClaudeDirectly(systemPrompt, messages, controller.signal, ctx.isPremiumDeep),
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
