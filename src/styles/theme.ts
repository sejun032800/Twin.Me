// ─── Brand Identity Tokens (docs/Darkmode_color.PNG) ─────────────────────────
// Primary   #F48FB1 — 활성화 버튼, 탭 하이라이트, 활성 마커 핀
// Secondary #CE93D8 — 아카이브 핀, 클러스터 뭉치 배경, 서브 배지
// Tertiary  #1A1A2E — 앱 전역 배경, 바텀 시트 베이스
// Neutral   #807477 — 비활성 트랙, 플레이스홀더, 경계선

export const BrandTokens = {
  PRIMARY:   '#F48FB1',
  SECONDARY: '#CE93D8',
  TERTIARY:  '#1A1A2E',
  NEUTRAL:   '#807477',
} as const;

// ─── Light Mode Brand Identity Tokens (docs/Lightmode_color.PNG) ──────────────
// Primary   #70585B — 뮤트 브라운 — 활성 버튼, 탭 하이라이트, 활성 마커 핀
// Secondary #725477 — 딥 퍼플    — 아카이브 핀, 클러스터 배경색
// Tertiary  #5355AA — 소프트 실버 블루 — 전역 배경/컨테이너 베이스, 지도 콜아웃
// Neutral   #7B7676 — 웜 그레이  — 플레이스홀더, 비활성 트랙, 가이드선

export const LightBrandTokens = {
  PRIMARY:   '#70585B',
  SECONDARY: '#725477',
  TERTIARY:  '#5355AA',
  NEUTRAL:   '#7B7676',
} as const;

// ─── Interpolated Blend Colors (RGB midpoints between anchor pairs) ───────────
//
// Dark Theme: all values are floor((A + B) / 2) per RGB channel.
//   PRIMARY_SECONDARY : midpoint(#F48FB1, #CE93D8) → R225 G145 B196 → #E191C4
//   SECONDARY_TERTIARY: midpoint(#CE93D8, #1A1A2E) → R116 G86  B131 → #745683
//   TERTIARY_NEUTRAL  : midpoint(#1A1A2E, #807477) → R77  G71  B82  → #4D4752
//   BG_SURFACE        : 25% blend Tertiary→Secondary → deep plum surface
export const DarkBlends = {
  PRIMARY_SECONDARY:  '#E191C4',
  SECONDARY_TERTIARY: '#745683',
  TERTIARY_NEUTRAL:   '#4D4752',
  BG_SURFACE:         '#231B35',
} as const;

// Light Theme:
//   PRIMARY_SECONDARY : midpoint(#70585B, #725477) → R113 G86 B105 → #715669
//   SECONDARY_TERTIARY: midpoint(#725477, #5355AA) → R98  G84 B144 → #625490
//   TERTIARY_NEUTRAL  : midpoint(#5355AA, #7B7676) → R103 G101 B144 → #676590
//   BG_SURFACE        : warm white with subtle purple tint
export const LightBlends = {
  PRIMARY_SECONDARY:  '#715669',
  SECONDARY_TERTIARY: '#625490',
  TERTIARY_NEUTRAL:   '#676590',
  BG_SURFACE:         '#F5F1F8',
} as const;

// ─── Brand Color Palette ────────────────────────────────────────────────────

export const Colors = {
  // Background & Stage
  BG_DARK_MIDNIGHT: '#0A0D1A',
  BG_LIGHT_SNOW: '#FAF8F5',

  // Card surfaces
  CARD_DARK_SLATE: '#1E293B',
  CARD_LIGHT_WHITE: '#FFFDF9',

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

// ─── Theme Gradient Sub-type ───────────────────────────────────────────────────
// All gradient arrays are pre-typed tuples for type-safe LinearGradient binding.

export interface ThemeGradients {
  /** Primary → Secondary (diagonal accent, e.g. active badges) */
  primaryToSecondary: readonly [string, string];
  /** Deep background — 3-stop sweep from darkest to surface tint */
  bgDeep: readonly [string, string, string];
  /** Card/container backdrop — 2-stop depth layer */
  cardBackdrop: readonly [string, string];
  /** DNA Helix Strand A — warm spectrum: secondaryTertiary blend → primary */
  helixStrandA: readonly [string, string, string, string];
  /** DNA Helix Strand B — cool/depth spectrum anchored at tertiary */
  helixStrandB: readonly [string, string, string, string];
  /** Map / bottom sheet inner background — 3-stop deep gradient */
  mapBottomSheet: readonly [string, string, string];
  /** Gallery card border shimmer — secondary → blend → primary */
  galleryCardBorder: readonly [string, string, string];
  /** Full spectral sweep — primary → secondary → secondaryTertiary → tertiary */
  fullSpectrum: readonly [string, string, string, string];
}

// ─── Theme Blend Sub-type ─────────────────────────────────────────────────────

export interface ThemeBlends {
  /** Midpoint between Primary and Secondary anchor colors */
  primarySecondary: string;
  /** Midpoint between Secondary and Tertiary anchor colors */
  secondaryTertiary: string;
  /** Midpoint between Tertiary and Neutral anchor colors */
  tertiaryNeutral: string;
  /** Slightly elevated surface for layering depth (above bg) */
  bgSurface: string;
}

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
  // ── Anchor Colors (最上位 포인트 컬러 — 직접 사용) ──────────────────────────
  primary: string;
  secondary: string;
  tertiary: string;
  neutral: string;
  // ── Interpolated Blends (베이스·서포트 레이어 전용) ─────────────────────────
  blends: ThemeBlends;
  // ── Pre-composed Gradient Arrays (LinearGradient colors 바인딩 전용) ─────────
  gradients: ThemeGradients;
}

export const LIGHT_THEME: ThemeTokens = {
  bg: '#F9F6F7',                             // warm white — neutral base
  card: '#FFFDF9',
  cardBorder: 'rgba(112,88,91,0.14)',        // LightBrandTokens.PRIMARY tint
  text: '#1E293B',
  textSecondary: '#4A3D40',                  // darkened PRIMARY
  textMuted: '#7B7676',                      // LightBrandTokens.NEUTRAL
  divider: '#EDE8EA',
  inputBg: '#F4F0F1',
  chipBg: 'rgba(112,88,91,0.10)',            // PRIMARY tint
  chipBorder: 'rgba(114,84,119,0.38)',       // SECONDARY tint
  avatarInner: '#FFF5F7',
  bubbleAI: '#FFFDF9',
  bubbleAIText: '#1E293B',
  headerBg: '#F9F6F7',
  segmentTrack: '#EDE8EA',
  isLight: true,
  gradientColors: [LightBrandTokens.PRIMARY, LightBrandTokens.SECONDARY, LightBrandTokens.TERTIARY],
  // Anchor colors
  primary:   LightBrandTokens.PRIMARY,
  secondary: LightBrandTokens.SECONDARY,
  tertiary:  LightBrandTokens.TERTIARY,
  neutral:   LightBrandTokens.NEUTRAL,
  // Interpolated blends
  blends: {
    primarySecondary:  LightBlends.PRIMARY_SECONDARY,
    secondaryTertiary: LightBlends.SECONDARY_TERTIARY,
    tertiaryNeutral:   LightBlends.TERTIARY_NEUTRAL,
    bgSurface:         LightBlends.BG_SURFACE,
  },
  // Pre-composed gradient arrays
  gradients: {
    primaryToSecondary: [LightBrandTokens.PRIMARY, LightBrandTokens.SECONDARY],
    bgDeep:             ['#F9F6F7', '#EEE8EF', '#E5DFF0'],
    cardBackdrop:       ['#FFFDF9', LightBlends.BG_SURFACE],
    helixStrandA: [
      LightBlends.SECONDARY_TERTIARY,
      LightBrandTokens.SECONDARY,
      LightBlends.PRIMARY_SECONDARY,
      LightBrandTokens.PRIMARY,
    ],
    helixStrandB: [
      LightBrandTokens.TERTIARY,
      LightBlends.TERTIARY_NEUTRAL,
      LightBrandTokens.NEUTRAL,
      '#A09D9D',
    ],
    mapBottomSheet:   ['#FFFDF9', LightBlends.BG_SURFACE, '#EDE8EF'],
    galleryCardBorder: [LightBrandTokens.SECONDARY, LightBlends.PRIMARY_SECONDARY, LightBrandTokens.PRIMARY],
    fullSpectrum: [
      LightBrandTokens.PRIMARY,
      LightBrandTokens.SECONDARY,
      LightBlends.SECONDARY_TERTIARY,
      LightBrandTokens.TERTIARY,
    ],
  },
};

export const DARK_THEME: ThemeTokens = {
  bg: '#0A0D1A',           // Colors.BG_DARK_MIDNIGHT — unified
  card: '#1E293B',
  cardBorder: 'rgba(255,255,255,0.06)',
  text: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#807477',    // BrandTokens.NEUTRAL
  divider: '#1E293B',
  inputBg: '#1E293B',
  chipBg: 'rgba(206,147,216,0.12)',   // BrandTokens.SECONDARY tint
  chipBorder: 'rgba(206,147,216,0.32)',
  avatarInner: '#1E293B',
  bubbleAI: '#1E293B',
  bubbleAIText: '#F1F5F9',
  headerBg: '#0A0D1A',     // Colors.BG_DARK_MIDNIGHT — unified
  segmentTrack: '#1E293B',
  isLight: false,
  gradientColors: [BrandTokens.PRIMARY, BrandTokens.SECONDARY, DarkBlends.SECONDARY_TERTIARY],
  // Anchor colors
  primary:   BrandTokens.PRIMARY,
  secondary: BrandTokens.SECONDARY,
  tertiary:  BrandTokens.TERTIARY,
  neutral:   BrandTokens.NEUTRAL,
  // Interpolated blends
  blends: {
    primarySecondary:  DarkBlends.PRIMARY_SECONDARY,
    secondaryTertiary: DarkBlends.SECONDARY_TERTIARY,
    tertiaryNeutral:   DarkBlends.TERTIARY_NEUTRAL,
    bgSurface:         DarkBlends.BG_SURFACE,
  },
  // Pre-composed gradient arrays
  gradients: {
    primaryToSecondary: [BrandTokens.PRIMARY, BrandTokens.SECONDARY],
    bgDeep:             ['#0A0A1A', BrandTokens.TERTIARY, DarkBlends.BG_SURFACE],
    cardBackdrop:       [BrandTokens.TERTIARY, DarkBlends.BG_SURFACE],
    helixStrandA: [
      DarkBlends.SECONDARY_TERTIARY,
      BrandTokens.SECONDARY,
      DarkBlends.PRIMARY_SECONDARY,
      BrandTokens.PRIMARY,
    ],
    helixStrandB: [
      '#0A0A1A',
      BrandTokens.TERTIARY,
      '#2D1E3E',
      DarkBlends.TERTIARY_NEUTRAL,
    ],
    mapBottomSheet:    [BrandTokens.TERTIARY, DarkBlends.BG_SURFACE, '#2D1E3E'],
    galleryCardBorder: [BrandTokens.SECONDARY, DarkBlends.PRIMARY_SECONDARY, BrandTokens.PRIMARY],
    fullSpectrum: [
      BrandTokens.PRIMARY,
      BrandTokens.SECONDARY,
      DarkBlends.SECONDARY_TERTIARY,
      BrandTokens.TERTIARY,
    ],
  },
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

// ─── Typography Presets ──────────────────────────────────────────────────────
// 컴포넌트에서 `style={Typography.bodyMd}` 형태로 사용한다.
// fontFamily는 _layout.tsx defaultProps로 자동 주입되므로
// 여기서는 굵기·크기·행간만 명시해 충돌을 방지한다.

export const Typography = {
  // Display
  display:    { fontFamily: FontFamily.bold,    fontSize: FontSize['3xl'], lineHeight: FontSize['3xl'] * 1.2 },
  headline:   { fontFamily: FontFamily.bold,    fontSize: FontSize['2xl'], lineHeight: FontSize['2xl'] * 1.2 },

  // Title
  titleLg:    { fontFamily: FontFamily.bold,    fontSize: FontSize.xl,    lineHeight: FontSize.xl  * 1.3 },
  titleMd:    { fontFamily: FontFamily.medium,  fontSize: FontSize.lg,    lineHeight: FontSize.lg  * 1.3 },
  titleSm:    { fontFamily: FontFamily.medium,  fontSize: FontSize.md,    lineHeight: FontSize.md  * 1.4 },

  // Body
  bodyLg:     { fontFamily: FontFamily.regular, fontSize: FontSize.md,    lineHeight: FontSize.md  * 1.6 },
  bodyMd:     { fontFamily: FontFamily.regular, fontSize: FontSize.base,  lineHeight: FontSize.base * 1.6 },
  bodySm:     { fontFamily: FontFamily.regular, fontSize: FontSize.sm,    lineHeight: FontSize.sm  * 1.6 },

  // Label / Caption
  labelMd:    { fontFamily: FontFamily.medium,  fontSize: FontSize.sm,    lineHeight: FontSize.sm  * 1.4 },
  labelSm:    { fontFamily: FontFamily.medium,  fontSize: FontSize.xs,    lineHeight: FontSize.xs  * 1.4 },
  caption:    { fontFamily: FontFamily.light,   fontSize: FontSize.xs,    lineHeight: FontSize.xs  * 1.5 },

  // Emphasis
  boldMd:     { fontFamily: FontFamily.bold,    fontSize: FontSize.base,  lineHeight: FontSize.base * 1.5 },
  boldSm:     { fontFamily: FontFamily.bold,    fontSize: FontSize.sm,    lineHeight: FontSize.sm  * 1.5 },
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
