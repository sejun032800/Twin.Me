// Coaching message service — Twin AI personal analysis engine.
// Fetches from /api/v1/couple/:coupleId/coaching when a backend exists;
// falls back to deterministic context-based generation until then.
// Caches in module scope (24-hour TTL + warning-entry trigger).

import { PartnerAiMoodTag } from './partnerMoodService';
import { WeeklyMetrics } from '../context/AppContext';

// ── Public interfaces ────────────────────────────────────────────────────────

export interface CoachingMessage {
  id: string;
  coachingText: string;
  category: 'warning' | 'sweet' | 'tip';
  createdAt: string; // ISO 8601
}

export interface CoachingContext {
  coupleId: string | null;
  partnerName: string;
  myName: string;
  partnerMood: PartnerAiMoodTag[];
  weeklyMetrics: WeeklyMetrics;
  hasCompletedInterview: boolean;
}

// ── Module-level cache (persists across re-renders, resets on cold start) ───

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  message: CoachingMessage;
  cachedAt: number;
  // Track warning state at cache time to detect warning-entry event
  hadWarning: boolean;
}

const _store = new Map<string, CacheEntry>();

function cacheKey(coupleId: string | null): string {
  return `coaching_${coupleId ?? 'local'}`;
}

function hasWarningMood(tags: PartnerAiMoodTag[]): boolean {
  return tags.some((t) => t.type === 'warning');
}

// Returns true when a fresh fetch is required.
export function shouldRefetch(ctx: CoachingContext): boolean {
  const entry = _store.get(cacheKey(ctx.coupleId));
  if (!entry) return true;

  const stale = Date.now() - entry.cachedAt > CACHE_TTL_MS;
  if (stale) return true;

  // Trigger only on *entering* warning state (not leaving it)
  const nowWarning = hasWarningMood(ctx.partnerMood);
  if (!entry.hadWarning && nowWarning) return true;

  return false;
}

export function getCachedMessage(ctx: CoachingContext): CoachingMessage | null {
  return _store.get(cacheKey(ctx.coupleId))?.message ?? null;
}

// ── Local generation engine ──────────────────────────────────────────────────
// Produces realistic, context-sensitive coaching text when the backend is
// unavailable. Output is deterministic given the same context snapshot.

function deriveCategory(ctx: CoachingContext): 'warning' | 'sweet' | 'tip' {
  if (hasWarningMood(ctx.partnerMood)) return 'warning';
  const { partnerScore, currentScore } = ctx.weeklyMetrics;
  const avgSync = (partnerScore + currentScore) / 2;
  if (avgSync >= 68) return 'sweet';
  return 'tip';
}

const WARNING_TEMPLATES = [
  (p: string) =>
    `요즘 ${p}님이 감정적으로 많이 예민한 상태예요. 오늘은 판단이나 조언보다 "많이 힘들었구나"처럼 짧은 공감 한 줄이 더 깊은 위로가 될 거예요.`,
  (p: string) =>
    `${p}님의 스트레스 지수가 높게 감지되고 있어요. 지금은 해결책보다 조용히 옆에 있어 주는 존재감이 가장 큰 힘이 됩니다.`,
  (p: string) =>
    `${p}님이 지금 마음 안에서 무언가 무거운 것을 안고 있는 것 같아요. 오늘 저녁, 먼저 "요즘 어때?"라고 가볍게 물어봐 주는 건 어떨까요?`,
];

const SWEET_TEMPLATES = [
  (p: string) =>
    `${p}님이 요즘 따뜻하고 안정적인 감정 상태예요. 오늘 "오늘도 수고했어"라는 한 마디가 하루를 특별하게 만들어 줄 수 있어요.`,
  (p: string) =>
    `두 분의 감정 싱크로가 이번 주 최고치를 기록 중이에요 🌡️. ${p}님에게 오늘 소소한 깜짝 선물이나 먹고 싶은 거 물어보는 건 어떨까요?`,
  (p: string) =>
    `${p}님이 지금 당신의 연락을 기다리고 있는 것 같아요 💕. 먼저 다정한 안부를 건네보세요, 오늘 대화가 더 깊어질 거예요.`,
];

const TIP_TEMPLATES = [
  (p: string, replyMin: number) =>
    `최근 ${p}님의 평균 답장 시간이 ${replyMin}분대로 조금 늘었어요. 바쁜 일상 속에서도 가볍고 유쾌한 안부 하나가 서로의 온도를 따뜻하게 유지시켜 줄 거예요.`,
  (p: string) =>
    `이번 주 대화 밀도를 분석해보니, ${p}님이 질문형 메시지에 더 활발하게 반응하는 패턴이 보여요. 오늘은 "요즘 뭐가 제일 재미있어?"로 대화를 열어보세요.`,
  (p: string) =>
    `${p}님과의 소통 패턴을 살펴보면, 저녁 시간대에 가장 대화 밀도가 높아요. 오늘 저녁에 짧은 음성 메시지나 귀여운 이모티콘 하나를 보내보는 건 어떨까요?`,
];

function pickTemplate(arr: ((p: string, ...a: number[]) => string)[], seed: number) {
  return arr[seed % arr.length];
}

function generateLocal(ctx: CoachingContext): CoachingMessage {
  const category = deriveCategory(ctx);
  const seed = Math.floor(Date.now() / CACHE_TTL_MS); // Changes daily
  const { partnerName, weeklyMetrics } = ctx;

  let text: string;
  if (category === 'warning') {
    text = pickTemplate(WARNING_TEMPLATES as any, seed)(partnerName);
  } else if (category === 'sweet') {
    text = pickTemplate(SWEET_TEMPLATES as any, seed)(partnerName);
  } else {
    text = pickTemplate(TIP_TEMPLATES as any, seed)(partnerName, weeklyMetrics.avgReplyTimeMin);
  }

  return {
    id: `local_${seed}_${category}`,
    coachingText: text,
    category,
    createdAt: new Date().toISOString(),
  };
}

// ── Main fetch function ──────────────────────────────────────────────────────

export const FALLBACK_MESSAGE: CoachingMessage = {
  id: 'fallback',
  coachingText:
    '오늘도 두 분의 대화를 분석하며 따뜻한 조언을 준비 중이에요 🔮',
  category: 'tip',
  createdAt: new Date().toISOString(),
};

export async function fetchTwinCoachingMessage(
  ctx: CoachingContext,
  signal?: AbortSignal,
): Promise<CoachingMessage> {
  // 1. Try real backend when coupleId is available
  if (ctx.coupleId) {
    try {
      const res = await fetch(
        `/api/v1/couple/${ctx.coupleId}/coaching`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            partnerMoodSnapshot: ctx.partnerMood.map((t) => ({
              type: t.type,
              text: t.text,
              intensity: t.intensity,
            })),
            weeklyMetrics: ctx.weeklyMetrics,
            hasCompletedInterview: ctx.hasCompletedInterview,
          }),
          signal,
        },
      );
      if (res.ok) {
        const json = await res.json();
        const msg = json as CoachingMessage;
        _store.set(cacheKey(ctx.coupleId), {
          message: msg,
          cachedAt: Date.now(),
          hadWarning: hasWarningMood(ctx.partnerMood),
        });
        return msg;
      }
    } catch {
      // Network error or abort — fall through to local generation
    }
  }

  // 2. Local context-based generation (MVP fallback)
  const msg = generateLocal(ctx);
  _store.set(cacheKey(ctx.coupleId), {
    message: msg,
    cachedAt: Date.now(),
    hadWarning: hasWarningMood(ctx.partnerMood),
  });
  return msg;
}
