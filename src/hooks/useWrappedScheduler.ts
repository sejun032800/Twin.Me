// ─── FUN-REP-003: 커플 Wrapped 스케줄러 훅 ────────────────────────────────────
//
// 주간 리포트 스케줄러(useReportScheduler)와 완전히 독립적으로 동작한다.
// 1분 하트비트로 연말(12/26~12/31) 및 기념일(D+100/365/…) 트리거를 검사하고,
// 발급 대상이면 WrappedData를 조립해 모달을 띄운다. 한 번 발급된 트리거는
// AsyncStorage에 영구 기록되어 같은 트리거로 중복 발급되지 않는다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  buildWrappedData,
  checkAnniversaryMilestone,
  loadWrappedSchedulerState,
  saveWrappedSchedulerState,
  shouldFireYearEndWrapped,
  type WrappedData,
} from '../services/coupleWrappedService';

const CHECK_INTERVAL_MS = 60 * 1000;

export function useWrappedScheduler() {
  const { currentScore, scoreHistory, highlightCards, comboRecoveryCount, coupleInfo } = useAppContext();
  const [wrappedData, setWrappedData] = useState<WrappedData | null>(null);
  const [visible, setVisible] = useState(false);
  const checkedRef = useRef(false);

  const runCheck = useCallback(async () => {
    const scheduler = await loadWrappedSchedulerState();
    const now = new Date();

    const buildAndShow = (trigger: 'year_end' | 'anniversary', milestone: number | null) => {
      const data = buildWrappedData({
        trigger,
        milestone,
        currentScore,
        scoreHistory,
        highlightCards,
        recoveryCount: comboRecoveryCount,
        now,
      });
      setWrappedData(data);
      setVisible(true);
    };

    if (shouldFireYearEndWrapped(scheduler, now)) {
      await saveWrappedSchedulerState({ ...scheduler, lastYearEndFiredYear: now.getFullYear() });
      buildAndShow('year_end', null);
      return;
    }

    const milestone = checkAnniversaryMilestone(coupleInfo.startedAt, scheduler);
    if (milestone !== null) {
      await saveWrappedSchedulerState({ ...scheduler, lastAnniversaryMilestone: milestone });
      buildAndShow('anniversary', milestone);
    }
  }, [currentScore, scoreHistory, highlightCards, comboRecoveryCount, coupleInfo.startedAt]);

  useEffect(() => {
    if (!checkedRef.current) {
      checkedRef.current = true;
      runCheck();
    }
    const timer = setInterval(runCheck, CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [runCheck]);

  const dismiss = useCallback(() => setVisible(false), []);

  return { wrappedData, visible, dismiss };
}
