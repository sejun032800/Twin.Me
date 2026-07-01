// ─── FUN-REP-003: 커플 Wrapped & 기념일 결산 리포트 ───────────────────────────
//
// 주간 리포트(FUN-REP-001/002)와 완전히 별개로 동작하는 시즌성 바이럴 모듈.
// 트리거: ① 연말 Wrapped(매년 12월 26일~31일), ② 기념일 결산(사귄 날짜 기준 D+100·D+365 배수).
//
// 프라이버시 수사학: 공유 카드에는 집계·이모지 중심 수치만 노출한다. 원문 텍스트는
// highlightCards(이미 온디바이스에서 요약·마스킹된 짧은 발췌)에서만 가져오며,
// 카카오톡 원본 대화는 이 모듈이 절대 직접 참조하지 않는다.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ScoreHistoryEntry } from './matchEngineStore';
import { EMOTION_META, type HighlightCard } from './kakaoHighlightService';
import { getRelationshipTier, type RelationshipTier } from '../utils/scoreCalculator';

const STORAGE_KEY = 'twin_me_wrapped_scheduler_v1';

export type WrappedTrigger = 'year_end' | 'anniversary';

export interface WrappedSchedulerState {
  lastYearEndFiredYear: number | null; // e.g. 2026
  lastAnniversaryMilestone: number | null; // 마지막으로 발급된 D+ 값 (예: 100)
}

const DEFAULT_STATE: WrappedSchedulerState = {
  lastYearEndFiredYear: null,
  lastAnniversaryMilestone: null,
};

export async function loadWrappedSchedulerState(): Promise<WrappedSchedulerState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_STATE, ...(JSON.parse(raw) as WrappedSchedulerState) } : DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

export async function saveWrappedSchedulerState(state: WrappedSchedulerState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // non-critical
  }
}

// ── 마일스톤 정의: D+100, D+365, 그 이후 매 365일 배수(2주년, 3주년…) ──────────
const ANNIVERSARY_MILESTONES = [100, 365, 730, 1095, 1460, 1825];

function daysSince(startedAt: string): number {
  const start = new Date(`${startedAt}T00:00:00`);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

/** 연말 Wrapped 발급 대상 여부 (12/26~12/31, 올해 아직 미발급) */
export function shouldFireYearEndWrapped(scheduler: WrappedSchedulerState, now: Date = new Date()): boolean {
  const isLateDecember = now.getMonth() === 11 && now.getDate() >= 26;
  if (!isLateDecember) return false;
  return scheduler.lastYearEndFiredYear !== now.getFullYear();
}

/** 기념일 결산 발급 대상 여부 — 도달한 마일스톤 중 아직 발급하지 않은 가장 최근 값 반환 */
export function checkAnniversaryMilestone(
  startedAt: string | null,
  scheduler: WrappedSchedulerState,
): number | null {
  if (!startedAt) return null;
  const d = daysSince(startedAt);
  const reached = ANNIVERSARY_MILESTONES.filter((m) => d >= m);
  if (reached.length === 0) return null;
  const latest = reached[reached.length - 1];
  return latest !== scheduler.lastAnniversaryMilestone ? latest : null;
}

// ── Wrapped 카드 시퀀스 데이터 ─────────────────────────────────────────────────

export interface WrappedData {
  trigger: WrappedTrigger;
  milestoneLabel: string; // "2026 Wrapped" | "D+100" | "1주년"
  tier: RelationshipTier;
  currentScore: number;
  peakDay: { date: string; score: number } | null;
  topFunnyLines: { text: string; emoji: string }[]; // G-HUM 최다 유발 드립 근사(= funny 하이라이트)
  sweetestLine: { text: string; emoji: string } | null; // 다정했던 한마디(= caring 하이라이트)
  recoveryCount: number; // C-ARC 회복 서사 극복 횟수
}

function milestoneLabel(trigger: WrappedTrigger, milestone: number | null, now: Date): string {
  if (trigger === 'year_end') return `${now.getFullYear()} Wrapped`;
  if (milestone === 365) return '1주년';
  if (milestone && milestone % 365 === 0) return `${milestone / 365}주년`;
  return `D+${milestone}`;
}

/** 순수 함수 — AppContext에서 이미 보유한 상태만으로 카드 시퀀스 데이터를 조립한다. */
export function buildWrappedData(params: {
  trigger: WrappedTrigger;
  milestone: number | null;
  currentScore: number;
  scoreHistory: ScoreHistoryEntry[];
  highlightCards: HighlightCard[];
  recoveryCount: number;
  now?: Date;
}): WrappedData {
  const now = params.now ?? new Date();
  const peakDay = params.scoreHistory.length > 0
    ? params.scoreHistory.reduce((best, cur) => (cur.score > best.score ? cur : best))
    : null;

  const funnyCards = params.highlightCards
    .filter((c) => c.emotion === 'funny')
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, 3)
    .map((c) => ({ text: c.text, emoji: EMOTION_META.funny.emoji }));

  const caringCard = params.highlightCards
    .filter((c) => c.emotion === 'caring')
    .sort((a, b) => b.savedAt - a.savedAt)[0];

  return {
    trigger: params.trigger,
    milestoneLabel: milestoneLabel(params.trigger, params.milestone, now),
    tier: getRelationshipTier(params.currentScore),
    currentScore: params.currentScore,
    peakDay,
    topFunnyLines: funnyCards,
    sweetestLine: caringCard ? { text: caringCard.text, emoji: EMOTION_META.caring.emoji } : null,
    recoveryCount: params.recoveryCount,
  };
}
