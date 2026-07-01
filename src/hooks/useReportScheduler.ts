// ─── Weekly Report Scheduler Hook (Step #22) ─────────────────────────────────
//
// Responsibilities:
//   1. On cold start — loads persisted report from FileSystem into AppContext.
//   2. KakaoTalk upload trigger — when `rawKakaoText` in AppContext changes from
//      null → string, immediately begins the first report generation.
//   3. Sunday 22:00 scheduler — polls every 60 s (also fires on AppState 'active')
//      and triggers generation when shouldFireWeeklyReport() is true.
//
// The hook writes results into AppContext.weeklyReportData so any subscriber
// (WeeklyReportModal, ReportCardBubble) stays in sync without prop-drilling.

import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAppContext } from '../context/AppContext';
import {
  generateFullReport,
  loadCachedReport,
  loadLastGeneratedTimestamp,
  shouldFireWeeklyReport,
  LOADING_PLACEHOLDER,
} from '../services/weeklyReportService';
import { parseKakaoExport } from '../lib/kakaoParser';
import { runKakaoBatchDetection } from '../services/kakaoBatchDetectionService';

const SCHEDULE_CHECK_INTERVAL_MS = 60 * 1000; // 1-minute heartbeat

// Twin Response Logic — 경로 A(카톡 업로드 배치) 반복 패턴 TOP 3 요약 카피
function formatBatchSummary(topPatterns: { label: string; count: number }[]): string {
  if (topPatterns.length === 0) {
    return '이번 카톡 학습에서는 두드러진 반복 습관이 감지되지 않았어요. 안정적인 대화를 이어가고 있네요 🌿';
  }
  const lines = topPatterns.map((p, i) => `${i + 1}위. ${p.label} (${p.count}회)`);
  return `카톡 대화 학습 완료 — 최근 기간 반복 언어 습관 TOP ${topPatterns.length} 📊\n${lines.join('\n')}`;
}

export function useReportScheduler(): void {
  const {
    rawKakaoText,
    myProfile,
    partnerProfile,
    weeklyReportData,
    setWeeklyReportData,
    setSelfAiNotifyQueue,
  } = useAppContext();

  const isGeneratingRef = useRef(false);
  const prevRawTextRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateSubRef = useRef<ReturnType<typeof AppState.addEventListener> | null>(null);

  // ── Core generation pipeline ─────────────────────────────────────────────────

  const triggerGeneration = useCallback(
    async (rawText: string) => {
      if (isGeneratingRef.current) return;
      isGeneratingRef.current = true;

      // Show loading state immediately so the UI can react
      setWeeklyReportData(LOADING_PLACEHOLDER);

      try {
        const report = await generateFullReport(rawText, myProfile, partnerProfile);
        setWeeklyReportData(report);
      } catch {
        // Restore null so the UI falls back to "no data" rather than stuck loading
        setWeeklyReportData(null);
      } finally {
        isGeneratingRef.current = false;
      }
    },
    [myProfile, partnerProfile, setWeeklyReportData],
  );

  // ── Twin Response Logic §2 (경로 A: 카톡 업로드 배치) ────────────────────────
  // 온보딩/재업로드 시 이미 마스킹된 내 발화(myLines)만으로 v2.2 이벤트 코드를
  // 라벨링해 반복 패턴(TOP 3)을 산출하고, 룸 3(분석가)에 사후 요약 카드를 큐잉한다.
  const runBatchDetection = useCallback(
    (rawText: string) => {
      const { myLines } = parseKakaoExport(rawText, myProfile.name);
      if (myLines.length === 0) return;
      const result = runKakaoBatchDetection(myLines);
      setSelfAiNotifyQueue((prev) => [
        ...prev,
        {
          id: `kakao-batch-${Date.now()}`,
          targetRoom: 'analyst' as const,
          text: formatBatchSummary(result.topPatterns),
          timestamp: Date.now(),
        },
      ]);
    },
    [myProfile.name, setSelfAiNotifyQueue],
  );

  // ── Cold-start: hydrate from FileSystem cache ────────────────────────────────

  useEffect(() => {
    loadCachedReport().then((cached) => {
      // Only hydrate when there is no in-memory report yet
      if (cached && !weeklyReportData) {
        setWeeklyReportData(cached);
      }
    });
    // Intentionally omits weeklyReportData from deps — this should run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setWeeklyReportData]);

  // ── KakaoTalk upload trigger ─────────────────────────────────────────────────
  // Detects the transition null → string and fires the first analysis immediately.

  useEffect(() => {
    if (!rawKakaoText) {
      prevRawTextRef.current = null;
      return;
    }
    if (prevRawTextRef.current === rawKakaoText) return;

    // New or changed text — trigger immediately
    prevRawTextRef.current = rawKakaoText;
    triggerGeneration(rawKakaoText);
    runBatchDetection(rawKakaoText);
  }, [rawKakaoText, triggerGeneration, runBatchDetection]);

  // ── Sunday 22:00 recurring scheduler ────────────────────────────────────────

  useEffect(() => {
    if (!rawKakaoText) return; // nothing to analyze yet

    const checkSchedule = async () => {
      const lastTs = await loadLastGeneratedTimestamp();
      if (shouldFireWeeklyReport(lastTs)) {
        triggerGeneration(rawKakaoText);
      }
    };

    // Fire on mount and whenever the app returns to foreground
    checkSchedule();

    intervalRef.current = setInterval(checkSchedule, SCHEDULE_CHECK_INTERVAL_MS);

    appStateSubRef.current = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => {
        if (state === 'active') checkSchedule();
      },
    );

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      appStateSubRef.current?.remove();
      appStateSubRef.current = null;
    };
  }, [rawKakaoText, triggerGeneration]);
}
