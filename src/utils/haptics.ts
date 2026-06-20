import * as Haptics from 'expo-haptics';

let lastHapticTime = 0;

export const triggerHaptic = (hapticAction: () => void): void => {
  const now = Date.now();
  // Block calls within 100ms to prevent motor overload and perceptual fatigue
  if (now - lastHapticTime < 100) return;
  lastHapticTime = now;
  try {
    hapticAction();
  } catch {
    // Haptics may be unavailable in simulators or restricted environments
  }
};
