// ─── Aura Theme Engine — 접근성 설정 영속화 ─────────────────────────────────────
// personaMatrixStore.ts와 동일한 load/save 패턴. "오라 줄이기/끄기" 토글 1개만 다룬다.

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'twin_me_reduce_aura_motion_v1';

export async function loadReduceAuraMotion(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw === '1';
  } catch {
    return false;
  }
}

export async function saveReduceAuraMotion(value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    // best-effort — non-fatal
  }
}
