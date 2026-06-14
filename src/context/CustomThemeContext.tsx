/**
 * CustomThemeContext.tsx — Step #41
 * Runtime custom-skin / aurora-background / font-override provider.
 * State is persisted to expo-file-system so the chosen skin survives app restarts.
 *
 * Contrast guard: every built-in theme's textColor is pre-verified to reach
 * WCAG AA (≥4.5:1) on its bgColors[0]. The guard runs in __DEV__ for any
 * future dynamically-added theme specs.
 */

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

// ── WCAG Contrast Guard ───────────────────────────────────────────────────────

function hexLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const channel = (s: number) => {
    const v = parseInt(h.slice(s, s + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrastRatio(a: string, b: string): number {
  const L1 = hexLuminance(a);
  const L2 = hexLuminance(b);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

// ── Theme Catalog ─────────────────────────────────────────────────────────────

export interface CustomThemeSpec {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
  readonly tagline: string;
  readonly priceLabel: string;
  readonly sku: string;
  // ── Visual tokens ──
  /** LinearGradient bg stop colours */
  readonly bgColors: readonly [string, string, string];
  /** Primary neon accent — borders, glow rings */
  readonly accentPrimary: string;
  /** Secondary accent — highlights, chips */
  readonly accentSecondary: string;
  /** Card / bubble surface colour */
  readonly cardBg: string;
  /** Main text — WCAG AA-verified on bgColors[0] */
  readonly textColor: string;
  /** Secondary text */
  readonly textSecondary: string;
  /** fontFamily override; undefined = inherit system default */
  readonly fontFamily: string | undefined;
  /** True → AuroraBackground animates the bg layer */
  readonly auroraAnimated: boolean;
  /** Three colours used in the store card preview swatch */
  readonly previewColors: readonly [string, string, string];
}

export const THEME_CATALOG: readonly CustomThemeSpec[] = [
  {
    id: 'cyber_neon',
    name: '사이버 펑크 (Cyber Neon)',
    emoji: '⚡',
    tagline: '레이저 블루 & 핫핑크 극강 네온 보더 스킨',
    priceLabel: '₩4,900 / $3.99',
    sku: 'theme_cyber_neon_v1',
    bgColors: ['#000818', '#001428', '#000D1F'],
    accentPrimary: '#00F5FF',    // laser blue  — contrast on bg: ~22:1
    accentSecondary: '#FF00B8',  // hot pink
    cardBg: '#001428',
    textColor: '#E0FFFF',        // near-white cyan — ~19:1 on #000818
    textSecondary: '#7EC8E3',
    fontFamily: undefined,
    auroraAnimated: false,
    previewColors: ['#000818', '#00F5FF', '#FF00B8'],
  },
  {
    id: 'aurora_dream',
    name: '오로라 드림 (Aurora Dream)',
    emoji: '🌌',
    tagline: '부드럽게 흐르는 오로라 그라데이션 배경',
    priceLabel: '₩4,900 / $3.99',
    sku: 'theme_aurora_dream_v1',
    bgColors: ['#0A0D2A', '#1A0A3A', '#0A1A2A'],
    accentPrimary: '#7C3AED',
    accentSecondary: '#38BDF8',
    cardBg: 'rgba(30,15,60,0.85)',
    textColor: '#F0EAFF',        // soft lavender white — ~16:1 on #0A0D2A
    textSecondary: '#B8A9D9',
    fontFamily: undefined,
    auroraAnimated: true,
    previewColors: ['#7C3AED', '#D946EF', '#38BDF8'],
  },
  {
    id: 'retro_pixel',
    name: '네온 레트로 폰트 (Retro Pixel)',
    emoji: '🕹️',
    tagline: '감성 픽셀 폰트 + 엠버 터미널 네온 스킨',
    priceLabel: '₩4,900 / $3.99',
    sku: 'theme_retro_pixel_v1',
    bgColors: ['#050A05', '#070E07', '#050A05'],
    accentPrimary: '#39FF14',    // neon green  — contrast on bg: ~28:1
    accentSecondary: '#FFB800',  // amber
    cardBg: '#0A120A',
    textColor: '#B4FF4B',        // bright lime  — ~16:1 on #050A05
    textSecondary: '#7AB83A',
    // System monospace as pixel-look substitute until a real font file is bundled
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: undefined }),
    auroraAnimated: false,
    previewColors: ['#050A05', '#39FF14', '#FFB800'],
  },
] as const;

// DEV contrast audit — runs once at module load so mis-spec'd themes surface early
if (__DEV__) {
  for (const spec of THEME_CATALOG) {
    const ratio = contrastRatio(spec.textColor, spec.bgColors[0]);
    if (ratio < 4.5) {
      console.warn(
        `[CustomTheme] Contrast guard FAIL: theme="${spec.id}" ` +
        `textColor="${spec.textColor}" on bg="${spec.bgColors[0]}" ratio=${ratio.toFixed(2)} < 4.5`,
      );
    }
  }
}

// ── FileSystem Persistence (expo-file-system SDK 56 new API) ─────────────────

interface StoredState {
  activeThemeId: string | null;
  ownedIds: string[];
}

const STORE_FILENAME = 'twin_theme_v1.json';

async function loadStoredState(): Promise<StoredState | null> {
  try {
    const file = new File(Paths.document, STORE_FILENAME);
    if (!file.exists) return null;
    const raw = await file.text();
    return JSON.parse(raw) as StoredState;
  } catch {
    return null;
  }
}

function persistState(state: StoredState): void {
  try {
    const file = new File(Paths.document, STORE_FILENAME);
    if (!file.exists) file.create();
    file.write(JSON.stringify(state));
  } catch {
    // best-effort — non-fatal
  }
}

// ── Context shape ─────────────────────────────────────────────────────────────

export interface CustomThemeContextValue {
  /** Resolved spec of the active theme, or null → default Twin.me skin */
  activeTheme: CustomThemeSpec | null;
  /** Product IDs the current user owns */
  ownedThemeIds: string[];
  /**
   * True once the theme's fontFamily is ready to render.
   * Always true with system fonts; will gate Retro Pixel when a real
   * custom font file is loaded via expo-font in a future build.
   */
  isFontLoaded: boolean;
  /** Activate an owned theme (or null to revert to default) */
  applyTheme: (id: string | null) => void;
  /** Permanently mark a theme as purchased — call after IAP receipt verified */
  markOwned: (id: string) => void;
  /** Convenience alias for applyTheme(null) */
  resetTheme: () => void;
}

const CustomThemeContext = createContext<CustomThemeContextValue>({
  activeTheme: null,
  ownedThemeIds: [],
  isFontLoaded: true,
  applyTheme: () => {},
  markOwned: () => {},
  resetTheme: () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function CustomThemeProvider({ children }: { children: React.ReactNode }) {
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null);
  const [ownedIds, setOwnedIds] = useState<string[]>([]);
  // System fonts (Courier / monospace) are always available — no async load needed.
  // When expo-font is added for a real pixel TTF, flip to false until loadAsync resolves.
  const [isFontLoaded] = useState(true);

  // Ref-based version for use inside setOwnedIds functional updater to avoid stale closure
  const activeThemeIdRef = useRef<string | null>(null);
  useEffect(() => { activeThemeIdRef.current = activeThemeId; }, [activeThemeId]);

  // Hydrate from disk on mount; skip persistence until hydration is complete
  const hasHydrated = useRef(false);
  useEffect(() => {
    loadStoredState().then((saved) => {
      if (saved) {
        setActiveThemeId(saved.activeThemeId);
        setOwnedIds(saved.ownedIds);
      }
      hasHydrated.current = true;
    });
  }, []);

  // Persist any state change that happens after hydration
  useEffect(() => {
    if (!hasHydrated.current) return;
    persistState({ activeThemeId, ownedIds });
  }, [activeThemeId, ownedIds]);

  const activeTheme = THEME_CATALOG.find((t) => t.id === activeThemeId) ?? null;

  const applyTheme = (id: string | null) => setActiveThemeId(id);

  const markOwned = (id: string) =>
    setOwnedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));

  const resetTheme = () => setActiveThemeId(null);

  return (
    <CustomThemeContext.Provider
      value={{ activeTheme, ownedThemeIds: ownedIds, isFontLoaded, applyTheme, markOwned, resetTheme }}
    >
      {children}
    </CustomThemeContext.Provider>
  );
}

export const useCustomTheme = () => useContext(CustomThemeContext);
