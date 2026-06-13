// Step #23 — Crisis Intelligence Engine
// Replaces the static CRISIS_KEYWORDS check with a multi-layer psychological
// analysis pipeline: local rule-based scoring → LLM refinement.
//
// Dimensions (Gottman's Four Horsemen adaptation):
//   - Aggression      (난폭성)   : accusatory language, emotional escalation
//   - Defensiveness   (방어기제) : blame-shifting, stonewalling, counter-attacks
//   - Empathy Decay   (공감결여) : ignored connection bids, emotional misalignment
//
// Thresholds:
//   >= 0.75 → crisisActive  (warning bar + pulse border)
//   >= 0.84 → crisisModalTrigger (full reflection overlay)

import { useCallback, useRef, useState } from 'react';

// ── Public types ──────────────────────────────────────────────────────────────

export interface CrisisMessage {
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
  type: string;
}

export interface CrisisMetrics {
  aggression: number;     // 0–1
  defensiveness: number;  // 0–1
  empathyDecay: number;   // 0–1
}

export interface CrisisAnalysisResult {
  metrics: CrisisMetrics;
  crisisProbability: number;  // 0–1 weighted score
  crisisActive: boolean;      // probability >= 0.75
  crisisModalTrigger: boolean; // probability >= 0.84
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WINDOW_24H = 24 * 60 * 60 * 1000;
const CRISIS_BAR_THRESHOLD = 0.75;
const CRISIS_MODAL_THRESHOLD = 0.84;
const WEIGHTS = { aggression: 0.40, defensiveness: 0.35, empathyDecay: 0.25 };

const API_KEY: string = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';
const MODEL = 'claude-haiku-4-5-20251001';

// ── Signal: Aggression ────────────────────────────────────────────────────────
// Detects accusatory 2nd-person attacks, emotional escalation markers,
// and repetitive hostile punctuation patterns.

const AGGRESSION_PATTERNS = [
  /\b너[는가]\b/, /\b당신[은이]\b/, /\b니[가]\b/, /\b네가\b/,
  /짜증/, /화[나났]/, /열받/, /미치겠/, /답답해/, /왜 항상/, /매번/,
  /진짜 왜/, /이게 뭐야/, /하지마/, /하지 마/,
  /!{2,}/, // multiple exclamation marks = emotional surge
];

function scoreAggression(userMsgs: CrisisMessage[]): number {
  if (userMsgs.length === 0) return 0;
  const hits = userMsgs.filter(
    (m) => AGGRESSION_PATTERNS.some((p) => p.test(m.text)),
  ).length;
  return Math.min(1, hits / Math.max(userMsgs.length, 1));
}

// ── Signal: Defensiveness ─────────────────────────────────────────────────────
// Stonewalling (sudden short replies) + blame-reversal language.

const DEFENSIVENESS_PATTERNS = [
  /니가 먼저/, /네가 먼저/, /내 잘못 아니/, /나는 잘못/, /억울/,
  /왜 나만/, /다 니 탓/, /내가 뭘/, /그러면 안 돼/, /몰라/, /됐어/, /그만해/,
];

function scoreDefensiveness(userMsgs: CrisisMessage[]): number {
  if (userMsgs.length === 0) return 0;
  let score = 0;
  // Stonewalling: recent message length collapses to near-nothing
  const recent = userMsgs.slice(-6);
  const avgLen = recent.reduce((s, m) => s + m.text.trim().length, 0) / Math.max(recent.length, 1);
  if (avgLen < 4) score += 0.48;
  else if (avgLen < 10) score += 0.22;
  // Blame-reversal patterns
  const blameHits = userMsgs.filter(
    (m) => DEFENSIVENESS_PATTERNS.some((p) => p.test(m.text)),
  ).length;
  score += Math.min(0.52, (blameHits / Math.max(userMsgs.length, 1)) * 2.2);
  return Math.min(1, score);
}

// ── Signal: Empathy Decay ─────────────────────────────────────────────────────
// Ratio of ignored "bids for connection" to total bids in the conversation.
// A bid is any message with a question or positive reach-out marker.

const BID_PATTERNS = [
  /어떻게[?？]?/, /어때[?？]?/, /같이/, /우리/, /보고 싶/,
  /사랑해/, /걱정/, /괜찮[아아]?[?？]?/, /힘내/, /응원/, /[?？]/,
];

function scoreEmpathyDecay(allMsgs: CrisisMessage[]): number {
  if (allMsgs.length < 2) return 0;
  let bids = 0; let ignored = 0;
  for (let i = 0; i < allMsgs.length - 1; i++) {
    if (!BID_PATTERNS.some((p) => p.test(allMsgs[i].text))) continue;
    bids++;
    const next = allMsgs[i + 1];
    // A dismissive reply: user responds with < 4 chars (ㅇ, 몰라, ㅋ…)
    if (next.role === 'user' && next.text.trim().length < 4) ignored++;
  }
  return bids === 0 ? 0 : Math.min(1, ignored / bids);
}

// ── Weighted probability ──────────────────────────────────────────────────────

function computeProbability(m: CrisisMetrics): number {
  return (
    m.aggression * WEIGHTS.aggression +
    m.defensiveness * WEIGHTS.defensiveness +
    m.empathyDecay * WEIGHTS.empathyDecay
  );
}

function makeResult(m: CrisisMetrics): CrisisAnalysisResult {
  const p = computeProbability(m);
  return {
    metrics: m,
    crisisProbability: p,
    crisisActive: p >= CRISIS_BAR_THRESHOLD,
    crisisModalTrigger: p >= CRISIS_MODAL_THRESHOLD,
  };
}

// ── LLM refinement layer ──────────────────────────────────────────────────────
// The rule-based scores are sent alongside the conversation text so the model
// can adjust for context that regex cannot capture (sarcasm, historical tone).
// Returns the raw scores if no API key or on any fetch failure.

async function refineViaLLM(
  raw: CrisisMetrics,
  conversation: string,
  signal: AbortSignal,
): Promise<CrisisMetrics> {
  if (!API_KEY) return raw;

  const system = `당신은 커플 대화 심리 분석가입니다. 대화를 분석하여 반드시 아래 JSON만 반환하세요 (다른 텍스트 절대 없이):
{"aggression":0.0,"defensiveness":0.0,"empathyDecay":0.0}

판단 기준 (0=없음, 1=극심):
- aggression: 비난·공격적 언어·감정 고조
- defensiveness: 책임회피·역비난·단답 침묵(stonewalling)
- empathyDecay: 감정 연결 시도 무시·감정 비동기화

초기 규칙 기반 점수를 참고하되, 대화 맥락을 최우선으로 반영하세요.`;

  const userContent = [
    `초기 점수: aggression=${raw.aggression.toFixed(2)} defensiveness=${raw.defensiveness.toFixed(2)} empathyDecay=${raw.empathyDecay.toFixed(2)}`,
    '',
    '최근 대화:',
    conversation.slice(-900),
  ].join('\n');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 80,
        system,
        messages: [{ role: 'user', content: userContent }],
      }),
      signal,
    });
    if (!res.ok) return raw;
    const json = (await res.json()) as { content: Array<{ text: string }> };
    const parsed = JSON.parse(json.content?.[0]?.text ?? '{}') as Record<string, number>;
    const clamp = (v: unknown, fb: number) =>
      typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1, v)) : fb;
    return {
      aggression: clamp(parsed.aggression, raw.aggression),
      defensiveness: clamp(parsed.defensiveness, raw.defensiveness),
      empathyDecay: clamp(parsed.empathyDecay, raw.empathyDecay),
    };
  } catch {
    return raw;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCrisisIntelligence() {
  const [result, setResult] = useState<CrisisAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const runAnalysis = useCallback(async (messages: CrisisMessage[]) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // 24h rolling window — text messages only
    const cutoff = Date.now() - WINDOW_24H;
    const window24h = messages.filter((m) => m.timestamp >= cutoff && m.type === 'normal');
    if (window24h.length < 3) return;
    const userMsgs = window24h.filter((m) => m.role === 'user');
    if (userMsgs.length < 2) return;

    setIsAnalyzing(true);
    try {
      // Phase 1 — local rule-based (instant, no API)
      const raw: CrisisMetrics = {
        aggression: scoreAggression(userMsgs),
        defensiveness: scoreDefensiveness(userMsgs),
        empathyDecay: scoreEmpathyDecay(window24h),
      };
      setResult(makeResult(raw));

      // Phase 2 — LLM refinement (async, replaces phase-1 result)
      const convo = window24h
        .map((m) => `[${m.role === 'user' ? '나' : 'AI'}]: ${m.text}`)
        .join('\n');
      const refined = await refineViaLLM(raw, convo, ctrl.signal);
      setResult(makeResult(refined));
    } catch (e: unknown) {
      if ((e as Error)?.name === 'AbortError') return;
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setResult(null);
    setIsAnalyzing(false);
  }, []);

  return { result, isAnalyzing, runAnalysis, reset };
}
