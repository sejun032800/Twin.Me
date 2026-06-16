import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

export type TutorialTabKey =
  | 'home'
  | 'chat'
  | 'history'
  | 'settings';

const STORAGE_PREFIX = '@twin_tutorial_seen_';

function storageKey(tab: TutorialTabKey): string {
  return `${STORAGE_PREFIX}${tab}`;
}

/**
 * Returns { shouldShow, markDone } for a given tab's first-visit tutorial.
 * shouldShow is true only if AsyncStorage flag is absent (never completed).
 * useFocusEffect re-checks on every tab focus — handles the first-ever visit.
 */
export function useTutorialGuard(tab: TutorialTabKey) {
  const [shouldShow, setShouldShow] = useState(false);
  const checkedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (checkedRef.current) return; // only check once per component lifetime
        const raw = await AsyncStorage.getItem(storageKey(tab));
        if (!cancelled && raw === null) {
          setShouldShow(true);
          checkedRef.current = true;
        }
      })();
      return () => { cancelled = true; };
    }, [tab]),
  );

  const markDone = useCallback(async () => {
    setShouldShow(false);
    await AsyncStorage.setItem(storageKey(tab), 'done');
  }, [tab]);

  // Dev helper: call resetTutorial(tab) from console to re-trigger
  return { shouldShow, markDone };
}

/** Dev utility — clears all tutorial flags */
export async function resetAllTutorials(): Promise<void> {
  const keys: TutorialTabKey[] = ['home', 'chat', 'history', 'settings'];
  await AsyncStorage.multiRemove(keys.map(storageKey));
}
