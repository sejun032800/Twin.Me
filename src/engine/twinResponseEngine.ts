// ─── 트윈 AI 응답 생성 엔진 (Twin Response Logic) ──────────────────────────────
//
// 일치율 코어 엔진 v2.2(metrics.ts)가 산출하는 EventCode 스트림을 받아,
// "언제 / 어떤 채널로 / 유저에게 개입할지"를 결정하는 상위 의사결정 레이어.
//
// 거울 불변 원칙: 이 엔진은 오직 '나'의 발화(EventCode)에 대해서만 개입하며,
// 연인의 속마음을 추정하거나 연인에게 무언가를 전송하지 않는다. 산출되는
// Detection은 항상 유저 본인에게만 보여지는 피드백을 위한 판정 결과다.
//
// 파이프라인: EventCode → 개입 점수 I(u) → 발화 게이트(θ) → 채널 라우팅
//            → 쿨다운/피로도 통과 → Detection (또는 null)

import { EVENT_REGISTRY, type EventCode } from './metrics';

// ── 채널 정의 ──────────────────────────────────────────────────────────────────

export type InterventionChannel = 'WARN' | 'ADVISE' | 'NOTIFY';

// 중대 코드(감산·경고 최우선 군) — 피로도 무시하고 항상 개입, 쿨다운 완전 무시
const CRITICAL_GROUPS = ['L-CRU', 'L-HRS'] as const;

export function isCriticalCode(code: EventCode): boolean {
  return CRITICAL_GROUPS.some((g) => code.startsWith(g));
}

// w_channel — 감산(L-*) 1.0 / 가산(G-*, C-*) 0.6
export function resolveChannelWeight(code: EventCode): number {
  return code.startsWith('L-') ? 1.0 : 0.6;
}

// ── 튜닝 파라미터 (사양 그대로 이식) ────────────────────────────────────────────

export const THETA_INTERVENE = 0.12;          // θ_intervene — 발화 게이트 임계값
export const ALPHA_FATIGUE = 0.3;             // α_f — 피로도 EMA 계수
export const HARD_COOLDOWN_MS = 15 * 60 * 1000; // ADVISE/NOTIFY 15분 하드 쿨다운
export const REPEAT_PATTERN_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
export const REPEAT_PATTERN_THRESHOLD = 3;    // m_rt — 동일 코드 반복 임계
export const REALTIME_BUFFER_MS = 2500;       // 인앱 실시간 스트림 입력 버퍼링
export const BALANCE_OBLIGATION_STREAK = 3;   // 균형 의무: 연속 N회 경고/권고 후 인정 발화 강제

// ── [수식] 개입 점수: I(u) = |δ_base| × M_intensity × w_channel × (1 − fatigue) ──

export interface InterventionScoreInput {
  code: EventCode;
  mIntensity?: number; // 0.5~1.5, 기본 1.0 (metrics.ts EventContext.intensity와 동일 척도)
  fatigue: number;     // 0~1
}

export function computeInterventionScore({ code, mIntensity = 1.0, fatigue }: InterventionScoreInput): number {
  const def = EVENT_REGISTRY[code];
  const w = resolveChannelWeight(code);
  const clampedIntensity = Math.max(0.5, Math.min(1.5, mIntensity));
  const clampedFatigue = Math.max(0, Math.min(1, fatigue));
  return Math.abs(def.delta) * clampedIntensity * w * (1 - clampedFatigue);
}

// 발화 게이트: I(u) ≥ θ 이거나 중대 코드일 때만 open (중대 코드는 피로도 무시)
export function shouldOpenGate(code: EventCode, score: number): boolean {
  if (isCriticalCode(code)) return true;
  return score >= THETA_INTERVENE;
}

// ── 채널 라우팅: route(detection) ──────────────────────────────────────────────
// 중대 코드 또는 Rapid-Swing/CRITICAL_LOSS 발생 시 즉시 WARN.
// 그 외 일반 감산(L-*)은 ADVISE, 가산/회복(G-*, C-*)은 NOTIFY.

export interface RouteContext {
  rapidSwing?: boolean;
  criticalLoss?: boolean;
}

export function routeChannel(code: EventCode, ctx: RouteContext = {}): InterventionChannel {
  if (isCriticalCode(code) || ctx.rapidSwing || ctx.criticalLoss) return 'WARN';
  const def = EVENT_REGISTRY[code];
  return def.delta < 0 ? 'ADVISE' : 'NOTIFY';
}

// ── 피로도 EMA: fatigue ← α_f·(개입 발생 1/0) + (1-α_f)·fatigue ───────────────

export function updateFatigue(prevFatigue: number, intervened: boolean): number {
  return ALPHA_FATIGUE * (intervened ? 1 : 0) + (1 - ALPHA_FATIGUE) * prevFatigue;
}

// ── 24h 반복 패턴 트래커 ────────────────────────────────────────────────────────

export interface CodeOccurrence { code: EventCode; t: number; }

export function countRecentOccurrences(
  log: CodeOccurrence[], code: EventCode, now: number = Date.now(),
): number {
  return log.filter((e) => e.code === code && now - e.t <= REPEAT_PATTERN_WINDOW_MS).length;
}

// 이번 발생을 포함해 24h 내 m_rt(3)회 이상이면 반복 패턴 경고
export function isRepeatPattern(log: CodeOccurrence[], code: EventCode, now: number = Date.now()): boolean {
  return countRecentOccurrences(log, code, now) + 1 >= REPEAT_PATTERN_THRESHOLD;
}

// ── 쿨다운 레지스트리 — ADVISE/NOTIFY 15분 하드 홀드, WARN은 안전을 위해 완전 무시 ──

export type CooldownRegistry = Partial<Record<EventCode, number>>;

export function isOnCooldown(
  registry: CooldownRegistry, code: EventCode, channel: InterventionChannel, now: number = Date.now(),
): boolean {
  if (channel === 'WARN') return false;
  const last = registry[code];
  return last != null && now - last < HARD_COOLDOWN_MS;
}

function markFired(registry: CooldownRegistry, code: EventCode, now: number): CooldownRegistry {
  return { ...registry, [code]: now };
}

// ── Detection: 최종 판정 결과 ───────────────────────────────────────────────────

export interface Detection {
  code: EventCode;
  channel: InterventionChannel;
  score: number;
  isCritical: boolean;
  isRepeatPattern: boolean;
  label: string;
  // 웰빙 가드레일 §4: 경고/권고가 BALANCE_OBLIGATION_STREAK회 이상 연속되면 true —
  // 생성 파이프라인은 이번 응답에 인정/칭찬 한 마디를 반드시 포함해야 한다.
  mustAffirmSoon: boolean;
}

export interface GateState {
  fatigue: number;
  cooldowns: CooldownRegistry;
  occurrenceLog: CodeOccurrence[];
  sinceAffirmation: number;
}

export function createGateState(): GateState {
  return { fatigue: 0, cooldowns: {}, occurrenceLog: [], sinceAffirmation: 0 };
}

export interface GateContext {
  now?: number;
  mIntensity?: number;
  rapidSwing?: boolean;
  criticalLoss?: boolean;
}

export interface GateResult {
  detection: Detection | null;
  nextState: GateState;
}

/**
 * 단일 EventCode에 대한 전체 개입 판정 파이프라인.
 * I(u) 게이트 → 채널 라우팅 → 쿨다운 체크 → 통과 시에만 Detection 반환.
 * 피로도 EMA와 반복 패턴 로그는 게이트 통과 여부와 무관하게 매 호출마다 갱신된다.
 */
export function evaluateGate(code: EventCode, state: GateState, ctx: GateContext = {}): GateResult {
  const now = ctx.now ?? Date.now();
  const def = EVENT_REGISTRY[code];
  const critical = isCriticalCode(code);
  const repeat = isRepeatPattern(state.occurrenceLog, code, now);
  const nextLog = [...state.occurrenceLog, { code, t: now }].filter(
    (e) => now - e.t <= REPEAT_PATTERN_WINDOW_MS,
  );

  const score = computeInterventionScore({ code, mIntensity: ctx.mIntensity, fatigue: state.fatigue });
  const gateOpen = shouldOpenGate(code, score) || repeat;

  let detection: Detection | null = null;
  let cooldowns = state.cooldowns;

  if (gateOpen) {
    const channel = routeChannel(code, { rapidSwing: ctx.rapidSwing, criticalLoss: ctx.criticalLoss });
    if (!isOnCooldown(state.cooldowns, code, channel, now)) {
      detection = {
        code,
        channel,
        score,
        isCritical: critical,
        isRepeatPattern: repeat,
        label: def.label,
        mustAffirmSoon: channel !== 'NOTIFY' && state.sinceAffirmation >= BALANCE_OBLIGATION_STREAK,
      };
      // WARN은 쿨다운을 완전히 무시하는 채널이다 — 이번 발화의 타임스탬프를
      // 레지스트리에 남기면, 같은 코드가 나중에 비-WARN 상황(rapidSwing 해제 등)에서
      // 재발했을 때 ADVISE/NOTIFY가 이 흔적 때문에 잘못 억제된다. WARN 발화는
      // 쿨다운 레지스트리에 흔적을 남기지 않는다.
      if (channel !== 'WARN') {
        cooldowns = markFired(state.cooldowns, code, now);
      }
    }
  }

  const nextFatigue = updateFatigue(state.fatigue, detection !== null);
  const nextSinceAffirmation = detection === null
    ? state.sinceAffirmation
    : detection.channel === 'NOTIFY'
      ? 0
      : state.sinceAffirmation + 1;

  return {
    detection,
    nextState: { fatigue: nextFatigue, cooldowns, occurrenceLog: nextLog, sinceAffirmation: nextSinceAffirmation },
  };
}

// ── 룸 2/3에 사후 렌더링되는 알림 큐 아이템 (NOTIFY 채널 산출물) ────────────────

export interface SelfAiNotifyItem {
  id: string;
  targetRoom: 'ai' | 'analyst';
  text: string;
  timestamp: number;
}

// ── 경로 A: 카톡 업로드 배치 탐지 결과 (onKakaoUpload) ─────────────────────────

export interface KakaoBatchPatternEntry {
  code: EventCode;
  label: string;
  count: number;
}

export interface KakaoBatchDetectionResult {
  totalLinesAnalyzed: number;
  frequencyByCode: Partial<Record<EventCode, number>>;
  topPatterns: KakaoBatchPatternEntry[]; // TOP 3
}
