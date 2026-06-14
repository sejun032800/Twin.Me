// ─── Brand Color Palette ────────────────────────────────────────────────────

export const Colors = {
  // Background & Stage
  BG_DARK_MIDNIGHT: '#0A0D1A',
  BG_LIGHT_SNOW: '#F8F9FA',

  // Card surfaces
  CARD_DARK_SLATE: '#1E293B',
  CARD_LIGHT_WHITE: '#FFFFFF',

  // Brand core gradient stops (dark/neon)
  GRADIENT_START: '#7C3AED',   // Neon Violet
  GRADIENT_MID: '#D946EF',     // Orchid Magenta
  GRADIENT_END: '#FF6B8B',     // Peach Pink

  // Pastel gradient stops (light mode)
  PASTEL_START: '#FFB7CE',     // Pastel Pink
  PASTEL_MID: '#E1BEE7',       // Pastel Lavender
  PASTEL_END: '#B39DDB',       // Pastel Violet

  // Semantic & badge
  BADGE_AI_BLUE: '#38BDF8',
  ALERT_SIREN_RED: '#EF4444',

  // Text
  TEXT_MAIN_CHARCOAL: '#0F172A',
  TEXT_SECONDARY: '#64748B',
  TEXT_MUTED: '#94A3B8',
  TEXT_ON_DARK: '#F1F5F9',
  TEXT_ON_DARK_SECONDARY: '#94A3B8',

  // Utility
  DIVIDER_DARK: '#1E293B',
  DIVIDER_LIGHT: '#E2E8F0',
  OVERLAY_DARK: 'rgba(0,0,0,0.6)',
  TRANSPARENT: 'transparent',
} as const;

export const Gradients = {
  TWIN_PRIMARY: {
    colors: ['#7C3AED', '#D946EF', '#FF6B8B'] as const,
    start: { x: 0, y: 1 } as const,
    end: { x: 1, y: 0 } as const,
  },
  TWIN_VERTICAL: {
    colors: ['#7C3AED', '#D946EF', '#FF6B8B'] as const,
    start: { x: 0.5, y: 0 } as const,
    end: { x: 0.5, y: 1 } as const,
  },
  TWIN_PASTEL: {
    colors: ['#FFB7CE', '#E1BEE7', '#B39DDB'] as const,
    start: { x: 0, y: 1 } as const,
    end: { x: 1, y: 0 } as const,
  },
  TWIN_PASTEL_H: {
    colors: ['#FFB7CE', '#E1BEE7', '#B39DDB'] as const,
    start: { x: 0, y: 0.5 } as const,
    end: { x: 1, y: 0.5 } as const,
  },
  STORE_BANNER: {
    colors: ['#7C3AED', '#FF6B8B'] as const,
    start: { x: 0, y: 0.5 } as const,
    end: { x: 1, y: 0.5 } as const,
  },
  DARK_CARD: {
    colors: ['#1E293B', '#0F172A'] as const,
    start: { x: 0, y: 0 } as const,
    end: { x: 0, y: 1 } as const,
  },
} as const;

// ─── Theme Tokens ─────────────────────────────────────────────────────────────

export interface ThemeTokens {
  bg: string;
  card: string;
  cardBorder: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  divider: string;
  inputBg: string;
  chipBg: string;
  chipBorder: string;
  avatarInner: string;
  bubbleAI: string;
  bubbleAIText: string;
  headerBg: string;
  segmentTrack: string;
  isLight: boolean;
  gradientColors: readonly [string, string, string];
}

export const LIGHT_THEME: ThemeTokens = {
  bg: '#FFF5F7',
  card: '#FFFFFF',
  cardBorder: 'rgba(180,140,160,0.18)',
  text: '#1E293B',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  divider: '#F1E8EC',
  inputBg: '#F5EEF2',
  chipBg: 'rgba(255,183,206,0.22)',
  chipBorder: 'rgba(200,150,180,0.45)',
  avatarInner: '#FFF0F4',
  bubbleAI: '#FFFFFF',
  bubbleAIText: '#1E293B',
  headerBg: '#FFF5F7',
  segmentTrack: '#F5EEF2',
  isLight: true,
  gradientColors: ['#FFB7CE', '#E1BEE7', '#B39DDB'],
};

export const DARK_THEME: ThemeTokens = {
  bg: '#0A0D1A',
  card: '#1E293B',
  cardBorder: 'rgba(255,255,255,0.06)',
  text: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  divider: '#1E293B',
  inputBg: '#1E293B',
  chipBg: 'rgba(124,58,237,0.12)',
  chipBorder: 'rgba(124,58,237,0.32)',
  avatarInner: '#1E293B',
  bubbleAI: '#1E293B',
  bubbleAIText: '#F1F5F9',
  headerBg: '#0A0D1A',
  segmentTrack: '#1E293B',
  isLight: false,
  gradientColors: ['#7C3AED', '#D946EF', '#FF6B8B'],
};

export type ThemeMode = 'light' | 'dark';

// ─── Spacing ─────────────────────────────────────────────────────────────────

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
} as const;

// ─── Border Radius ───────────────────────────────────────────────────────────

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  pill: 999,
  card: 20,
  chip: 100,
} as const;

// ─── Typography ──────────────────────────────────────────────────────────────

export const FontFamily = {
  regular:  'SpoqaHanSansNeo-Regular',
  medium:   'SpoqaHanSansNeo-Medium',
  bold:     'SpoqaHanSansNeo-Bold',
  light:    'SpoqaHanSansNeo-Light',
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  '2xl': 28,
  '3xl': 34,
  '4xl': 40,
} as const;

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const LineHeight = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.75,
} as const;

// ─── Shadows ─────────────────────────────────────────────────────────────────

export const Shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  subtle: {
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  glow: {
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
} as const;

// ─── Animation Durations ─────────────────────────────────────────────────────

export const Duration = {
  fast: 150,
  normal: 250,
  slow: 400,
  breathing: 4000,
} as const;

// ─── Tab Bar ─────────────────────────────────────────────────────────────────

export const TabBar = {
  height: 64,
  paddingBottom: 12,
} as const;
