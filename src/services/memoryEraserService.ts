// Memory Eraser Service (Step #38)
// Vector DB embedding retrieval + permanent hard-delete pipeline.
//
// Endpoints:
//   GET    /api/v1/memories/learned   — retrieves all learned memory embeddings for current user
//   DELETE /api/v1/memories/permanent — hard-deletes specified embedding nodes from vector space
//
// When EXPO_PUBLIC_API_BASE_URL is not set (dev / preview), both functions fall back to
// in-memory simulation with realistic latency so UI flows can be fully exercised locally.

const API_BASE: string = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
const TIMEOUT_MS = 10_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export type MemoryCategory =
  | 'tone'       // 말투 DNA 벡터
  | 'interview'  // 10분 인터뷰 성향 매트릭스
  | 'archive'    // 커플 추억 아카이브
  | 'crisis'     // 크라이시스 중재 히스토리
  | 'date_pref'  // 데이트 코스 선호도
  | 'custom';    // 기타 학습 항목

export interface LearnedMemory {
  id: string;
  content: string;       // human-readable description shown in the UI
  learnedAt: string;     // ISO 8601 date-time string
  category: MemoryCategory;
  vectorCount?: number;  // number of embedding vectors associated with this node
}

interface DeletePayload {
  targetMemoryIds: string[];
  hardDelete: true;
  vectorSpacePurge: true;
}

// ── Dev / preview seed data ───────────────────────────────────────────────────
// Mirrors realistic vector DB output so every UI path can be exercised without
// a live backend. Includes variety across all category types.

const DEV_FALLBACK_MEMORIES: LearnedMemory[] = [
  {
    id: 'mem_tone_001',
    content: '말투 DNA 벡터 데이터 (3,241개 문장 임베딩)',
    learnedAt: '2024-06-01T09:22:14Z',
    category: 'tone',
    vectorCount: 3241,
  },
  {
    id: 'mem_interview_001',
    content: '10분 인터뷰 성향 매트릭스 · 애착 유형 점수',
    learnedAt: '2024-06-03T20:45:00Z',
    category: 'interview',
    vectorCount: 48,
  },
  {
    id: 'mem_archive_001',
    content: '커플 공유 추억 아카이브 (18개 데이트 임베딩)',
    learnedAt: '2024-06-10T14:30:00Z',
    category: 'archive',
    vectorCount: 18,
  },
  {
    id: 'mem_crisis_001',
    content: '크라이시스 중재 히스토리 · 갈등 패턴 학습 데이터',
    learnedAt: '2024-05-28T22:17:33Z',
    category: 'crisis',
    vectorCount: 12,
  },
  {
    id: 'mem_date_001',
    content: '데이트 코스 선호도 학습 데이터 (지역·음식·무드)',
    learnedAt: '2024-06-08T16:00:00Z',
    category: 'date_pref',
    vectorCount: 97,
  },
];

// ── Utility ───────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms),
    ),
  ]);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Retrieves all embedding nodes the AI has learned about the current user from
 * the vector database. Session authentication is handled server-side via the
 * Authorization header set by the Axios interceptor (or Cookie in web).
 *
 * Dev mode: returns the seed list after an 800 ms simulated latency.
 */
export async function fetchAILearnedMemories(): Promise<LearnedMemory[]> {
  if (!API_BASE) {
    await new Promise<void>((resolve) => setTimeout(resolve, 800));
    return DEV_FALLBACK_MEMORIES;
  }

  const res = await withTimeout(
    fetch(`${API_BASE}/api/v1/memories/learned`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    }),
    TIMEOUT_MS,
  );

  if (!res.ok) {
    throw new Error(`Memory fetch failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.memories as LearnedMemory[];
}

/**
 * Permanently hard-deletes the specified embedding nodes from the vector space.
 * The backend is expected to:
 *   1. Remove the exact embedding vectors from the HNSW/FAISS index.
 *   2. Delete metadata rows from the relational store.
 *   3. Trigger a GC sweep to reclaim orphaned embedding slots.
 *
 * Returns void on success (200 OK).
 * Throws on any non-200 response or network / timeout failure.
 *
 * Dev mode: simulates 900 ms with a 5 % failure rate to exercise the rollback path.
 */
export async function deleteMemoriesPermanently(ids: string[]): Promise<void> {
  const payload: DeletePayload = {
    targetMemoryIds: ids,
    hardDelete: true,
    vectorSpacePurge: true,
  };

  if (!API_BASE) {
    await new Promise<void>((resolve, reject) =>
      setTimeout(() => {
        if (__DEV__ && Math.random() < 0.05) {
          reject(new Error('Simulated vector DB deletion failure'));
        } else {
          resolve();
        }
      }, 900),
    );
    return;
  }

  const res = await withTimeout(
    fetch(`${API_BASE}/api/v1/memories/permanent`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    TIMEOUT_MS,
  );

  if (!res.ok) {
    throw new Error(`Vector DB deletion failed: HTTP ${res.status}`);
  }
}
