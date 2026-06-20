// ─── The Ocean — 무료 테마 에디션 ────────────────────────────────────────────
// Twinny UI 그라데이션 에셋에서 정밀 추출한 심해·해변 팔레트

export const OceanTokens = {
  /** 깊은 심해 네이비 — 주요 다크 배경 */
  DEEP_OCEAN:         '#0D234A',
  /** 중간 블루 레이어 */
  DEEP_OCEAN_MID:     '#163A6E',
  /** 맑은 청록 — 액센트 / 액티브 포인트 */
  LAGOON_TEAL:        '#509A96',
  /** 밝은 라군 틸 — 하이라이트 */
  LAGOON_TEAL_LIGHT:  '#6CB2A7',
  /** 해변 모래 골드 — 라이트 보조 */
  COASTAL_SAND:       '#D9CB9E',
  /** 밝은 크림 모래 — 온보딩 강조 */
  COASTAL_SAND_LIGHT: '#F2EAC4',
  /** 안개 낀 바다빛 회색 — 서브 텍스트 / 비활성 */
  AQUA_MUTED:         '#8BA1A8',
} as const;

export const OceanGradients = {
  /** 스플래시 수직 그라데이션: 해변 크림 → 심해 네이비 */
  SPLASH_BG:      ['#F2EAC4', '#163A6E', '#0D234A'] as const,
  /** 액센트 청록 그라데이션 (버튼·배지·웰컴 버블) */
  LAGOON_ACCENT:  ['#509A96', '#6CB2A7'] as const,
  /** CTA 수평 그라데이션: Lagoon Teal → Coastal Sand */
  CTA_OCEAN:      ['#6CB2A7', '#D9CB9E'] as const,
  /** 카드 배경 딥 네이비 */
  DEEP_CARD:      ['#0D234A', '#163A6E'] as const,
} as const;

export const OCEAN_THEME_ID = 'the_ocean' as const;
