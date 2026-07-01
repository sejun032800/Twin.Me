import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { syncPartnerSensitiveKeywords } from '../services/partnerSensitiveService';

// ─── Tone patterns (날카롭거나 공격적인 표현) ─────────────────────────────────

const TONE_PATTERNS: { keywords: string[]; suggestion: string }[] = [
  {
    keywords: ['됐어', '아니 됐어', '필요 없어', '상관없어'],
    suggestion: '"그랬구나, 내가 좀 더 배려해볼게" 어떨까요?',
  },
  {
    keywords: ['몰라', '알아서 해', '니 맘대로 해', '너 맘대로 해'],
    suggestion: '"지금은 내가 어떻게 해야 할지 모르겠어, 조금만 기다려줘" 어떨까요?',
  },
  {
    keywords: ['짜증나', '짜증났', '짜증'],
    suggestion: '"조금 지쳐있는 것 같아, 오늘은 좀 쉬어도 될까?" 어때요?',
  },
  {
    keywords: ['귀찮아', '귀찮다'],
    suggestion: '"지금 조금 힘들어서 나중에 얘기할 수 있을까?" 어떠세요?',
  },
  {
    keywords: ['그만해', '그만하자', '됐다'],
    suggestion: '"잠깐 생각 정리하고 다시 얘기하면 안 될까?" 로 전해보세요.',
  },
  {
    keywords: ['너무하네', '너무해', '실망이야'],
    suggestion: '"나는 그 말을 들었을 때 많이 속상했어" 처럼 나 전달법으로 바꿔보세요.',
  },
];

// ─── Deadlock nudge messages (5분 침묵 후) ────────────────────────────────────

const DEADLOCK_NUDGES = [
  '지금 서영이 퇴근길일 시간이에요! "오늘 부장님 잔소리 때문에 힘들었지? 치맥 사갈까?" 라고 톡을 보내 흐름을 깨보세요 💕',
  '대화가 5분 넘게 멈췄어요. "오늘 뭐 먹고 싶어?" 한 마디로 시작해보는 건 어떨까요? 🍽️',
  '서영이가 좋아하는 드라마 이야기를 꺼내보는 건 어때요? 가볍게 "요즘 뭐 봐?" 로 시작해보세요 🎬',
];

// ─── Text normalizer — bypass-attack defense ────────────────────────────────
// Strips zero-width / invisible chars and collapses arbitrary whitespace /
// separators so that "살  쪘", "살-쪘", "살​쪘" all match "살쪘".

function normalizeForMatch(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[​-‍﻿­᠎⁠]/g, '') // zero-width & soft-hyphen
    .replace(/[\s\-_·•※~]+/g, ' ')                            // collapse separators → space
    .trim()
    .toLowerCase();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToneAlert {
  id: string;
  detectedKeyword: string;
  suggestion: string;
  originalText: string;
  timestamp: number;
}

export interface SensitiveWarning {
  label: string;
  message: string;
}

export interface SensitiveInterceptResult {
  detectedKeyword: string;
  label: string;
}

export interface ChatStreamReturn {
  pendingToneAlerts: ToneAlert[];
  sensitiveWarning: SensitiveWarning | null;
  deadlockNudge: string | null;
  tapMessage: (text: string) => void;
  checkSensitive: (text: string) => void;
  validateMessageSensitivity: (text: string) => SensitiveInterceptResult | null;
  dismissToneAlert: (id: string) => void;
  clearDeadlockNudge: () => void;
  pushToneAlert: (alert: Omit<ToneAlert, 'id' | 'timestamp'>) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useChatStream(): ChatStreamReturn {
  const { coupleId, partnerSensitiveConfig, setPartnerSensitiveConfig } = useAppContext();

  const [pendingToneAlerts, setPendingToneAlerts] = useState<ToneAlert[]>([]);
  const [sensitiveWarning, setSensitiveWarning] = useState<SensitiveWarning | null>(null);
  const [deadlockNudge, setDeadlockNudge] = useState<string | null>(null);

  const deadlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Sync partner sensitive config: on mount + 30 s poll ─────────────────────
  // Aborts in-flight request on coupleId change or hook unmount.
  useEffect(() => {
    const controller = new AbortController();

    const doSync = async () => {
      const fresh = await syncPartnerSensitiveKeywords(coupleId, controller.signal);
      if (!controller.signal.aborted) {
        setPartnerSensitiveConfig(fresh);
      }
    };

    doSync();
    const poll = setInterval(doSync, 30_000);

    return () => {
      controller.abort();
      clearInterval(poll);
    };
  }, [coupleId, setPartnerSensitiveConfig]);

  // ── Deadlock timer ──────────────────────────────────────────────────────────
  const resetDeadlock = useCallback(() => {
    if (deadlockTimer.current) clearTimeout(deadlockTimer.current);
    deadlockTimer.current = setTimeout(() => {
      setDeadlockNudge(DEADLOCK_NUDGES[Math.floor(Math.random() * DEADLOCK_NUDGES.length)]);
    }, 5 * 60 * 1000);
  }, []);

  useEffect(() => {
    resetDeadlock();
    return () => { if (deadlockTimer.current) clearTimeout(deadlockTimer.current); };
  }, [resetDeadlock]);

  // ── Tap: tone pattern analysis (AI room ingestion) ──────────────────────────
  const tapMessage = useCallback((text: string) => {
    resetDeadlock();
    for (const pattern of TONE_PATTERNS) {
      const matched = pattern.keywords.find((kw) => text.includes(kw));
      if (matched) {
        setPendingToneAlerts((prev) => [
          ...prev.slice(-4),
          {
            id: `tone-${Date.now()}`,
            detectedKeyword: matched,
            suggestion: pattern.suggestion,
            originalText: text,
            timestamp: Date.now(),
          },
        ]);
        break;
      }
    }
  }, [resetDeadlock]);

  // ── Real-time banner: fires while typing, shows inline yellow warning ────────
  const checkSensitive = useCallback((text: string) => {
    if (!partnerSensitiveConfig.isWarningEnabled || !text) {
      setSensitiveWarning(null);
      return;
    }
    const normText = normalizeForMatch(text);
    for (const kw of partnerSensitiveConfig.keywords) {
      if (normText.includes(normalizeForMatch(kw))) {
        setSensitiveWarning({
          label: kw,
          message: `잠깐! 파트너의 AI 데이터에 따르면, '${kw}' 주제는 상대방에게 큰 스트레스를 줄 수 있어요.`,
        });
        return;
      }
    }
    setSensitiveWarning(null);
  }, [partnerSensitiveConfig]);

  // ── Pre-send intercept: called the instant [전송] is pressed ─────────────────
  // Pure — no state mutation. Returns matched result or null.
  // Caller is responsible for halting the send pipeline on non-null return.
  const validateMessageSensitivity = useCallback(
    (text: string): SensitiveInterceptResult | null => {
      if (!partnerSensitiveConfig.isWarningEnabled) return null;
      const normText = normalizeForMatch(text);
      for (const kw of partnerSensitiveConfig.keywords) {
        if (normText.includes(normalizeForMatch(kw))) {
          return { detectedKeyword: kw, label: kw };
        }
      }
      return null;
    },
    [partnerSensitiveConfig],
  );

  const dismissToneAlert = useCallback((id: string) => {
    setPendingToneAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearDeadlockNudge = useCallback(() => setDeadlockNudge(null), []);

  // ── Twin Response Logic — ADVISE 채널 진입점 ────────────────────────────────
  // v2.2 이벤트 코드 기반 개입 엔진(twinResponseEngine)이 생성한 대안 문구를
  // 기존 말투 가이드 배너(ToneGuidePopup) 큐에 그대로 얹는다. 룸 1에서 발생한
  // 감지가 룸 2 진입 시 노출되는 기존 크로스룸 동작을 그대로 재사용한다.
  const pushToneAlert = useCallback((alert: Omit<ToneAlert, 'id' | 'timestamp'>) => {
    setPendingToneAlerts((prev) => [
      ...prev.slice(-4),
      { ...alert, id: `advise-${Date.now()}`, timestamp: Date.now() },
    ]);
  }, []);

  return {
    pendingToneAlerts,
    sensitiveWarning,
    deadlockNudge,
    tapMessage,
    checkSensitive,
    validateMessageSensitivity,
    dismissToneAlert,
    clearDeadlockNudge,
    pushToneAlert,
  };
}
