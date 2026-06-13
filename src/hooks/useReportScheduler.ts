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

const SCHEDULE_CHECK_INTERVAL_MS = 60 * 1000; // 1-minute heartbeat

export function useReportScheduler(): void {
  const {
    rawKakaoText,
    myProfile,
    partnerProfile,
    weeklyReportData,
    setWeeklyReportData,
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
  }, [rawKakaoText, triggerGeneration]);

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
