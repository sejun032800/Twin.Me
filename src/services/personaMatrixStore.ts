// ─── User_Persona_Matrix 영속화 스토어 ─────────────────────────────────────────
// userToneVectorStore.ts와 동일한 load/save/clear + STORAGE_KEY 패턴을 따른다.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserPersonaMatrix } from '../types/genesis';

const STORAGE_KEY = 'twin_user_persona_matrix_v1';
const LAST_GENESIS_KEY = 'twin_last_genesis_at_v1';

export async function loadPersonaMatrix(): Promise<UserPersonaMatrix | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UserPersonaMatrix) : null;
  } catch {
    return null;
  }
}

export async function savePersonaMatrix(matrix: UserPersonaMatrix): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(matrix));
  } catch {
    // non-critical — in-memory state is still valid for the current session
  }
}

export async function clearPersonaMatrix(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export async function loadLastGenesisAt(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_GENESIS_KEY);
  } catch {
    return null;
  }
}

export async function saveLastGenesisAt(iso: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_GENESIS_KEY, iso);
  } catch {
    // ignore
  }
}
