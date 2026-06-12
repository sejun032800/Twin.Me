import { useCallback, useEffect, useRef, useState } from 'react';

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

// ─── Partner sensitive topics (파트너 설정 트라우마 키워드 — mock) ─────────────

const SENSITIVE_TOPICS: { keywords: string[]; label: string }[] = [
  {
    keywords: ['전 남자친구', '전 남친', '전 여자친구', '전 여친', '예전 남자', '예전 여자', '옛날 애인'],
    label: '전 연인 언급',
  },
  {
    keywords: ['살쪘', '뚱뚱', '살 쪘', '몸무게', '다이어트 해'],
    label: '외모/체형 발언',
  },
  {
    keywords: ['가족이 왜', '부모님이 왜', '집안이'],
    label: '가족 관련 발언',
  },
];

// ─── Deadlock nudge messages (5분 침묵 후) ────────────────────────────────────

const DEADLOCK_NUDGES = [
  '지금 서영이 퇴근길일 시간이에요! "오늘 부장님 잔소리 때문에 힘들었지? 치맥 사갈까?" 라고 톡을 보내 흐름을 깨보세요 💕',
  '대화가 5분 넘게 멈췄어요. "오늘 뭐 먹고 싶어?" 한 마디로 시작해보는 건 어떨까요? 🍽️',
  '서영이가 좋아하는 드라마 이야기를 꺼내보는 건 어때요? 가볍게 "요즘 뭐 봐?" 로 시작해보세요 🎬',
];

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

export interface ChatStreamReturn {
  pendingToneAlerts: ToneAlert[];
  sensitiveWarning: SensitiveWarning | null;
  deadlockNudge: string | null;
  tapMessage: (text: string) => void;
  checkSensitive: (text: string) => void;
  dismissToneAlert: (id: string) => void;
  clearDeadlockNudge: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useChatStream(): ChatStreamReturn {
  const [pendingToneAlerts, setPendingToneAlerts] = useState<ToneAlert[]>([]);
  const [sensitiveWarning, setSensitiveWarning] = useState<SensitiveWarning | null>(null);
  const [deadlockNudge, setDeadlockNudge] = useState<string | null>(null);

  const deadlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetDeadlock = useCallback(() => {
    if (deadlockTimer.current) clearTimeout(deadlockTimer.current);
    deadlockTimer.current = setTimeout(() => {
      setDeadlockNudge(DEADLOCK_NUDGES[Math.floor(Math.random() * DEADLOCK_NUDGES.length)]);
    }, 5 * 60 * 1000); // 5 minutes
  }, []);

  useEffect(() => {
    resetDeadlock();
    return () => { if (deadlockTimer.current) clearTimeout(deadlockTimer.current); };
  }, [resetDeadlock]);

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

  const checkSensitive = useCallback((text: string) => {
    for (const topic of SENSITIVE_TOPICS) {
      if (topic.keywords.some((kw) => text.includes(kw))) {
        setSensitiveWarning({
          label: topic.label,
          message: `잠깐! 서영이의 AI 데이터에 따르면, '${topic.label}' 주제는 상대방에게 큰 스트레스를 줄 수 있어요.`,
        });
        return;
      }
    }
    setSensitiveWarning(null);
  }, []);

  const dismissToneAlert = useCallback((id: string) => {
    setPendingToneAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearDeadlockNudge = useCallback(() => setDeadlockNudge(null), []);

  return {
    pendingToneAlerts,
    sensitiveWarning,
    deadlockNudge,
    tapMessage,
    checkSensitive,
    dismissToneAlert,
    clearDeadlockNudge,
  };
}
