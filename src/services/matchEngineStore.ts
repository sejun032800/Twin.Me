// ─── 일치율 코어 엔진 v2.2 — 자정 정산 영속화 스토어 ──────────────────────────
//
// S_Current(공식 일치율)는 "매일 자정 1회 정산되어 DB에 영구 저장"되는 값이므로,
// 앱을 완전히 재시작해도 당일 기준선(S_Today_Open)과 위기 메모리 스트릭이
// 유지되어야 한다. 백엔드가 없는 현재 아키텍처에서는 AsyncStorage를 로컬
// "영구 저장소"로 사용한다 (다른 서비스 — kakaoHighlightService 등과 동일 패턴).

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OverflowStatus } from '../utils/scoreCalculator';

const STORAGE_KEY = 'twin_match_engine_v22_state';

export interface ScoreHistoryEntry {
  date: string; // YYYY-MM-DD
  score: number; // 그날 자정 정산된 S_Current
}

export interface PersistedMatchEngineState {
  sCurrent: number;
  sTodayOpen: number;
  lastSettledDay: string; // YYYY-MM-DD
  dailyStatusHistory: OverflowStatus[]; // 최근 3일 (크라이시스 메모리 스트릭 판정용)
  crisisMemoryActive: boolean;
  // FUN-REP-003: 커플 Wrapped — 연간 최고점 일자 산출용 (최근 400일 캡)
  scoreHistory?: ScoreHistoryEntry[];
  // FUN-REP-003: 회복 서사(C-ARC 콤보) 누적 발생 횟수
  comboRecoveryCount?: number;
}

export async function loadMatchEngineState(): Promise<PersistedMatchEngineState | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedMatchEngineState) : null;
  } catch {
    return null;
  }
}

export async function saveMatchEngineState(state: PersistedMatchEngineState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // non-critical — S_Live/오늘 세션은 다음 자정 정산 때 재수렴
  }
}

export async function clearMatchEngineState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
