// ─── User_Tone_Vector 영속화 스토어 ────────────────────────────────────────────
// Chat_logic.md Stage 2/4 산출물을 AsyncStorage에 저장한다. 다른 스토어
// (matchEngineStore.ts 등)와 동일한 load/save/clear + STORAGE_KEY 패턴을 따른다.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserToneVector } from '../lib/userToneVectorBuilder';

const STORAGE_KEY = 'twin_user_tone_vector_v1';

export async function loadUserToneVector(): Promise<UserToneVector | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UserToneVector) : null;
  } catch {
    return null;
  }
}

export async function saveUserToneVector(vector: UserToneVector): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(vector));
  } catch {
    // non-critical — in-memory state is still valid for the current session
  }
}

export async function clearUserToneVector(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
