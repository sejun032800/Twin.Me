// Supabase JS v2 singleton — shared across the entire app.
//
// Guard contract:
//   isSupabaseReady === false  →  env vars missing; all callers fall back to
//                                 simulation mode.  No crash on import.
//   isSupabaseReady === true   →  supabase client is safe to use.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL: string = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY: string = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

function checkEnv(): boolean {
  const missing = [
    !SUPABASE_URL && 'EXPO_PUBLIC_SUPABASE_URL',
    !SUPABASE_ANON_KEY && 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  ].filter(Boolean);

  if (missing.length > 0) {
    console.warn(
      '[supabase] Supabase 환경 변수를 확인해 주세요 ⚠️\n' +
        `  누락된 키: ${missing.join(', ')}\n` +
        '  .env 파일에 EXPO_PUBLIC_SUPABASE_URL 과\n' +
        '  EXPO_PUBLIC_SUPABASE_ANON_KEY 를 설정하면\n' +
        '  실시간 채팅 및 미디어 업로드가 활성화됩니다.\n' +
        '  현재는 시뮬레이션 폴백 모드로 동작합니다.',
    );
    return false;
  }
  return true;
}

export const isSupabaseReady: boolean = checkEnv();

export const supabase: SupabaseClient | null = isSupabaseReady
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: {
        params: { eventsPerSecond: 10 },
      },
    })
  : null;
