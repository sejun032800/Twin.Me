// ─── 카톡 업로드 배치 탐지 파이프라인 (Twin Response Logic — 경로 A) ──────────
//
// FUN-ONB-002가 이미 마스킹/필터링을 마친 내 발화(myLines)만 입력으로 받는다.
// 상대방 발화는 온보딩 단계에서 원천 드롭되므로, classifyMessage의 구조적 규칙
// (직전 메시지 role 비교 등)은 상대 문맥이 없어 사실상 발동하지 않고, 어휘 패턴
// 매치만 유효하게 작동한다 — 이는 거울 불변 원칙(오직 내 발화만 분석)과 정확히
// 부합한다.

import { classifyMessage, type ClassifierMessage } from '../engine/eventClassifier';
import { EVENT_REGISTRY, type EventCode } from '../engine/metrics';
import type { KakaoBatchDetectionResult, KakaoBatchPatternEntry } from '../engine/twinResponseEngine';

export function runKakaoBatchDetection(myLines: string[]): KakaoBatchDetectionResult {
  const frequencyByCode: Partial<Record<EventCode, number>> = {};
  const history: ClassifierMessage[] = [];

  let t = 0;
  for (const text of myLines) {
    t += 1; // 합성 타임스탬프 — 상대 문맥이 없어 실제 간격은 무의미, 순서만 보존
    const msg: ClassifierMessage = { role: 'me', text, timestamp: t };
    history.push(msg);

    const hits = classifyMessage(msg, { history });
    for (const code of hits) {
      frequencyByCode[code] = (frequencyByCode[code] ?? 0) + 1;
    }
  }

  const topPatterns: KakaoBatchPatternEntry[] = (Object.entries(frequencyByCode) as [EventCode, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([code, count]) => ({ code, label: EVENT_REGISTRY[code].label, count }));

  return { totalLinesAnalyzed: myLines.length, frequencyByCode, topPatterns };
}
