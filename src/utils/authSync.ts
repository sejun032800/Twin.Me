import type { LinkedProvider, UserAccount } from '../types/auth';
import type { DateCourse } from '../context/AppContext';
import type { WeeklyReportData } from '../services/weeklyReportService';

// ── Server payload shape ──────────────────────────────────────────────────────

export interface SyncPayload {
  provider: LinkedProvider;
  oauthToken: string;
  currentScore: number;
  dateCourses: DateCourse[];
  weeklyReportData: WeeklyReportData | null;
  capturedAt: string;
}

// ── Placeholder: replace with real API call once backend is ready ─────────────

export async function uploadUserDataToServer(payload: SyncPayload): Promise<void> {
  console.log('[authSync] uploadUserDataToServer — payload size:', JSON.stringify(payload).length, 'bytes');
  console.log('[authSync] provider:', payload.provider, '| score:', payload.currentScore, '| courses:', payload.dateCourses.length);
  // TODO: replace with real endpoint
  // await fetch('https://api.twin.me/v1/account/link', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(payload),
  // });
  await new Promise<void>((resolve) => setTimeout(resolve, 1000));
}

// ── OAuth token simulation ────────────────────────────────────────────────────

function simulateOAuthToken(provider: LinkedProvider): string {
  return `mock_${provider.toLowerCase()}_token_${Date.now()}`;
}

// ── Main link handler ─────────────────────────────────────────────────────────

export interface AccountLinkDeps {
  currentScore: number;
  dateCourses: DateCourse[];
  weeklyReportData: WeeklyReportData | null;
  userAccount: UserAccount;
  setUserAccount: (account: UserAccount) => void;
}

export async function handleAccountLink(
  provider: LinkedProvider,
  deps: AccountLinkDeps,
): Promise<void> {
  const { currentScore, dateCourses, weeklyReportData, userAccount, setUserAccount } = deps;

  if (userAccount.linkedProviders.includes(provider)) {
    throw new Error(`${provider} 계정은 이미 연동되어 있습니다.`);
  }

  const oauthToken = simulateOAuthToken(provider);

  const payload: SyncPayload = {
    provider,
    oauthToken,
    currentScore,
    dateCourses,
    weeklyReportData,
    capturedAt: new Date().toISOString(),
  };

  await uploadUserDataToServer(payload);

  const syncTimestamp = new Date().toISOString();
  setUserAccount({
    ...userAccount,
    linkedProviders: [...userAccount.linkedProviders, provider],
    syncTimestamp,
  });
}
