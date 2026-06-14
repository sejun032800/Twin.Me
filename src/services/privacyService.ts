// Privacy Pipeline Service (Step #37)
// Controls the server-side data ingestion infrastructure via REST API.
//
// Endpoint contract:
//   PUT  /api/v1/privacy/pipeline      — toggles GPS/EXIF/logging/E2EE pipelines
//   POST /api/v1/privacy/session-cleanup — rotates session tokens + forces DB cache GC
//
// Frontend PrivacyLevel → Backend ingestionLevel mapping:
//   Level 3 (완전복제) → ingestionLevel 1: all pipelines ACTIVE
//   Level 2 (최적화)   → ingestionLevel 2: GPS worker SUSPENDED
//   Level 1 (보호)     → ingestionLevel 4: E2EE ON, logging BLOCKED, EXIF stripped

import type { PrivacyLevel } from '../context/AppContext';

const API_BASE: string = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
const TIMEOUT_MS = 8_000;

// ── Backend pipeline payload types ────────────────────────────────────────────

interface PipelinePayload {
  privacyLevel: PrivacyLevel;
  ingestionLevel: 1 | 2 | 3 | 4;
  pipeline: {
    gpsCollection: 'ACTIVE' | 'SUSPENDED';
    exifAnonymization: 'ACTIVE' | 'DISABLED';
    realtimeLogging: 'ACTIVE' | 'BLOCKED';
    e2eeSession: boolean;
    learningPipeline: 'FULL' | 'CONTEXT_ONLY' | 'DISABLED';
  };
}

interface SessionCleanupPayload {
  privacyLevel: PrivacyLevel;
  invalidateAxiosInterceptors: boolean;
  flushWebSocketTokens: boolean;
  gcCacheLevel: 'SOFT' | 'HARD';
}

// ── Pipeline configuration registry ──────────────────────────────────────────
//
// Level 1 (기본 / Lv3 완전복제):
//   All collection pipelines fully active. AI receives real-time tone, GPS, and
//   media metadata streams.
//
// Level 2 (위치 보호 / Lv2 최적화):
//   Backend GPS worker immediately SUSPENDED. Reverse-geocoding background job
//   paused. Chat context collection continues (keyword-only, no raw text).
//
// Level 4 (완전 잠금 / Lv1 보호):
//   Combines media EXIF stripping (level 3) + full logging block + E2EE session
//   switch. All real-time server log streams terminated. Session keys rotated to
//   E2EE channel. AI operates exclusively on onboarding snapshot data.

const PIPELINE_CONFIG: Record<PrivacyLevel, PipelinePayload> = {
  3: {
    privacyLevel: 3,
    ingestionLevel: 1,
    pipeline: {
      gpsCollection: 'ACTIVE',
      exifAnonymization: 'DISABLED',
      realtimeLogging: 'ACTIVE',
      e2eeSession: false,
      learningPipeline: 'FULL',
    },
  },
  2: {
    privacyLevel: 2,
    ingestionLevel: 2,
    pipeline: {
      gpsCollection: 'SUSPENDED',
      exifAnonymization: 'DISABLED',
      realtimeLogging: 'ACTIVE',
      e2eeSession: false,
      learningPipeline: 'CONTEXT_ONLY',
    },
  },
  1: {
    privacyLevel: 1,
    ingestionLevel: 4,
    pipeline: {
      gpsCollection: 'SUSPENDED',
      exifAnonymization: 'ACTIVE',
      realtimeLogging: 'BLOCKED',
      e2eeSession: true,
      learningPipeline: 'DISABLED',
    },
  },
};

// ── Utility ───────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms),
    ),
  ]);
}

async function apiFetch(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: path.includes('pipeline') ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Privacy API ${res.status}: ${path}`);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Sends the updated privacy level to the backend ingestion pipeline controller.
 *
 * When API_BASE is not configured (dev / preview), simulates a 600 ms call with
 * a 10 % failure rate so the rollback path stays exercised locally.
 */
export async function toggleServerDataIngestion(level: PrivacyLevel): Promise<void> {
  if (!API_BASE) {
    await new Promise<void>((resolve, reject) =>
      setTimeout(() => {
        if (__DEV__ && Math.random() < 0.1) {
          reject(new Error('Simulated pipeline sync failure'));
        } else {
          resolve();
        }
      }, 600),
    );
    return;
  }

  await withTimeout(apiFetch('/api/v1/privacy/pipeline', PIPELINE_CONFIG[level]), TIMEOUT_MS);
}

/**
 * Forces immediate session token rotation and DB cache GC after a pipeline change.
 *
 * Ensures residual data from the previous privacy level is not served from
 * Axios interceptor caches or live WebSocket sessions on either device.
 *
 * WebSocket tokens are flushed for levels 1 and 2 (heightened privacy).
 * Cache GC uses HARD mode for level 1 (full lock) to wipe all volatile stores.
 */
export async function invalidateSessionTokens(level: PrivacyLevel): Promise<void> {
  const payload: SessionCleanupPayload = {
    privacyLevel: level,
    invalidateAxiosInterceptors: true,
    flushWebSocketTokens: level <= 2,
    gcCacheLevel: level === 1 ? 'HARD' : 'SOFT',
  };

  if (!API_BASE) {
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    return;
  }

  await withTimeout(apiFetch('/api/v1/privacy/session-cleanup', payload), TIMEOUT_MS);
}
