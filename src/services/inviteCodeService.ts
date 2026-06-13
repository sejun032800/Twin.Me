/**
 * Invite Code Service
 *
 * EXPO_PUBLIC_API_BASE_URL이 설정되지 않았거나 'mock'을 포함하면 Mock 모드로 동작.
 * 실제 백엔드 배포 후 .env에 EXPO_PUBLIC_API_BASE_URL=https://api.twin.me 를 설정하면
 * 동일한 코드로 실 서버와 통신한다.
 */

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';
export const isMockMode =
  API_BASE === '' || API_BASE.toLowerCase().includes('mock');

const INVITE_ENDPOINT = `${API_BASE}/api/v1/couples/invite-code`;
const MATCH_ENDPOINT  = `${API_BASE}/api/v1/couples/match`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InviteCodePayload {
  code: string;
  userId: string;
  createdAt: string;
}

export interface MatchPayload {
  coupleId: string;
  partnerInfo: {
    name: string;
    gender: 'M' | 'F' | '';
    mbti: string;
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function generateLocalCode(): string {
  const pool = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let raw = '';
  for (let i = 0; i < 8; i++) {
    raw += pool[Math.floor(Math.random() * pool.length)];
  }
  return `${raw.slice(0, 3)} ${raw.slice(3, 6)} ${raw.slice(6)}`;
}

function formatCode(raw: string): string {
  const stripped = raw.replace(/\s/g, '');
  if (stripped.length !== 8) return raw;
  return `${stripped.slice(0, 3)} ${stripped.slice(3, 6)} ${stripped.slice(6)}`;
}

// ── Mock: invite code registration ────────────────────────────────────────────

async function registerMock(userId: string): Promise<InviteCodePayload> {
  await new Promise((resolve) => setTimeout(resolve, 800));
  return {
    code: generateLocalCode(),
    userId,
    createdAt: new Date().toISOString(),
  };
}

// ── Live: invite code registration ────────────────────────────────────────────

async function registerLive(userId: string): Promise<InviteCodePayload> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  let response: Response;
  try {
    response = await fetch(INVITE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 201 || response.status === 200) {
    const data = await response.json();
    return {
      code: formatCode(data.code as string),
      userId,
      createdAt: (data.createdAt as string) ?? new Date().toISOString(),
    };
  }

  // 409 Conflict — 이미 발급된 코드가 있으면 서버가 기존 코드를 반환
  if (response.status === 409) {
    const data = await response.json();
    return {
      code: formatCode(data.code as string),
      userId,
      createdAt: (data.createdAt as string) ?? new Date().toISOString(),
    };
  }

  throw new Error(`서버 오류 (${response.status})`);
}

// ── Mock: couple matching ──────────────────────────────────────────────────────

async function verifyMock(
  inputCode: string,
  myCode: string | null,
): Promise<MatchPayload> {
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const normalizedInput = inputCode.replace(/\s/g, '').toUpperCase();
  const normalizedMy = myCode ? myCode.replace(/\s/g, '').toUpperCase() : null;

  if (normalizedInput.length !== 8) {
    throw new Error('올바른 초대코드가 아닙니다. 다시 확인해 주세요.');
  }

  if (normalizedMy && normalizedInput === normalizedMy) {
    throw new Error('자신의 초대코드는 사용할 수 없습니다.');
  }

  return {
    coupleId: `CPL_${Date.now()}`,
    partnerInfo: { name: '파트너', gender: '', mbti: '' },
  };
}

// ── Live: couple matching ──────────────────────────────────────────────────────

async function verifyLive(inputCode: string): Promise<MatchPayload> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  let response: Response;
  try {
    response = await fetch(MATCH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: inputCode.replace(/\s/g, '') }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.ok) {
    const data = await response.json();
    return {
      coupleId: data.coupleId as string,
      partnerInfo: {
        name: (data.partnerInfo?.name as string) ?? '파트너',
        gender: (data.partnerInfo?.gender as 'M' | 'F' | '') ?? '',
        mbti: (data.partnerInfo?.mbti as string) ?? '',
      },
    };
  }

  if (response.status === 404) {
    throw new Error('올바른 초대코드가 아닙니다. 다시 확인해 주세요.');
  }
  if (response.status === 409) {
    throw new Error('자신의 초대코드는 사용할 수 없습니다.');
  }
  if (response.status === 410) {
    throw new Error('만료된 초대코드입니다. 상대방에게 새 코드를 요청해 주세요.');
  }

  throw new Error(`서버 오류 (${response.status})`);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * 서버에 초대코드 발급을 요청하고 사용자 계정과 바인딩한다.
 * Mock 모드에서는 로컬에서 코드를 생성하고 800ms 지연을 시뮬레이션한다.
 */
export async function registerInviteCodeToServer(
  userId: string,
): Promise<InviteCodePayload> {
  if (isMockMode) return registerMock(userId);
  return registerLive(userId);
}

/**
 * 상대방이 공유한 초대코드를 검증하고 Couple_ID를 생성·반환한다.
 * myCode: 이미 발급된 자신의 코드 (자기 자신 코드 입력 방지용).
 */
export async function verifyAndConnectCouple(
  inputCode: string,
  myCode: string | null = null,
): Promise<MatchPayload> {
  if (isMockMode) return verifyMock(inputCode, myCode);
  return verifyLive(inputCode);
}
