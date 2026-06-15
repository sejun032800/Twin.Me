/**
 * useAppTheme — convenience hook for resolved theme tokens + mode helpers.
 *
 * Returns the same themeTokens / themeMode / setThemeMode that AppContext exposes,
 * but through a single import so consumers don't need to destructure manually.
 *
 * Also exports useSystemTheme() for components that need theme resolution
 * outside of AppContext (e.g., root-level wrappers before the Provider mounts).
 */

import { useColorScheme } from 'react-native';
import { useAppContext } from '../context/AppContext';
import { DARK_THEME, LIGHT_THEME, ThemeMode, ThemeTokens } from '../styles/theme';

export interface AppTheme {
  theme: ThemeTokens;
  mode: ThemeMode;
  isLight: boolean;
  setMode: (m: ThemeMode) => void;
}

export function useAppTheme(): AppTheme {
  const { themeTokens, themeMode, setThemeMode } = useAppContext();
  return {
    theme:   themeTokens,
    mode:    themeMode,
    isLight: themeTokens.isLight,
    setMode: setThemeMode,
  };
}

/** Resolves theme from system colour scheme — usable before AppProvider mounts. */
export function useSystemTheme(): ThemeTokens {
  const scheme = useColorScheme();
  return scheme === 'dark' ? DARK_THEME : LIGHT_THEME;
}
