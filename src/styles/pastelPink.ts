// ─── Pastel Pink — 시그니처 힙스터 에디션 ────────────────────────────────────
// 성수동 편집숍 감성의 코랄 피치 · 만다린 · 뷰티 핑크 · 라벤더 팔레트

export const PastelPinkTokens = {
  /** 포근한 살구빛 피치 코랄 — 베이스 / 서브 버블 */
  PIECE_CORAL:    '#FFA69E',
  /** 파스텔 만다린 오렌지 — 따뜻한 포인트 / 액센트 */
  MANDARIN_SUN:   '#FFBF86',
  /** 화사한 뷰티 핑크 — 주요 메인 하이라이트 */
  BUBBLE_PINK:    '#F9A1BC',
  /** 세련된 라벤더 퍼플 — 딥 무드 / 그라데이션 엔드 */
  LAVENDER_VIBE:  '#C48CB9',
  /** 눈부심 없는 오프화이트 크림 — 라이트 배경 */
  MILKY_CREAM:    '#F6F5F2',
  /** OLED 깊은 우주 블랙 — 다크 배경 마스터 */
  DEEP_MIDNIGHT:  '#0A0D1A',
  /** 부드러운 샌드 회색조 — 서브 텍스트 / 비활성 */
  PASTEL_MUTED:   '#D2C9BF',
} as const;

export const PastelPinkGradients = {
  /** 스플래시 시그니처 4색 수직 그라데이션 */
  SPLASH_BG:      ['#FFA69E', '#FFBF86', '#F9A1BC', '#C48CB9'] as const,
  /** 웰컴 버블 Bubble Pink → Lavender Vibe */
  WELCOME_BUBBLE: ['#F9A1BC', '#C48CB9'] as const,
  /** CTA 선셋 파스텔 3색 수평 그라데이션 */
  CTA_PASTEL:     ['#FFA69E', '#F9A1BC', '#C48CB9'] as const,
  /** 버블 핑크 보더 링 */
  BUBBLE_RING:    ['#F9A1BC', '#FFBF86'] as const,
} as const;

export const PASTEL_PINK_THEME_ID = 'pastel_pink' as const;
