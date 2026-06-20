// ─── Savannah — 무료 테마 에디션 ─────────────────────────────────────────────
// 사바나의 여명·노을·대지 팔레트에서 정밀 추출한 디자인 토큰

export const SavannahTokens = {
  /** 깊은 밤하늘 네이비 — 주요 다크 배경 */
  DUSK_DEEP:          '#0E0E26',
  /** 미드 딥 퍼플 레이어 */
  DUSK_MID:           '#17153B',
  /** 타오르는 오렌지 선셋 — 액센트 / 액티브 */
  BURNING_SUN:        '#FF6B00',
  /** 밝은 선셋 앰버 — 하이라이트 */
  BURNING_SUN_LIGHT:  '#FF9F29',
  /** 사파리 하늘 블루 — 보조 액센트 */
  SAFARI_SKY:         '#3B82F6',
  /** 밝은 스카이 블루 — 그라데이션 끝 */
  SAFARI_SKY_LIGHT:   '#93C5FD',
  /** 노을 핑크 퍼플 — 서브 무드 / 버블 */
  TWILIGHT_ROSE:      '#D1A3FF',
  /** 붉은 노을 핑크 — 그라데이션 끝 */
  TWILIGHT_ROSE_WARM: '#FFA3A3',
  /** 사바나 모래 베이지 — 밝은 텍스트 */
  SAND:               '#F5EBE6',
  /** 밝은 모래 크림 — 온보딩 강조 */
  SAND_LIGHT:         '#FFE8D6',
  /** 뮤티드 샌드 회색조 — 서브 텍스트 / 비활성 */
  AMBER_MUTED:        '#A89F91',
} as const;

export const SavannahGradients = {
  /** 스플래시 수직 그라데이션: 노을 퍼플 → 밤하늘 네이비 */
  SPLASH_BG:      ['#D1A3FF', '#3B1B6A', '#0E0E26'] as const,
  /** 웰컴 버블 Burning Sun 오렌지 그라데이션 */
  WELCOME_BUBBLE: ['#FF6B00', '#FF9F29'] as const,
  /** CTA 수평 선셋 그라데이션: Burning Sun → Twilight Rose */
  CTA_SUNSET:     ['#FF6B00', '#D1A3FF'] as const,
  /** 딥 다크 카드 배경 */
  DEEP_CARD:      ['#0E0E26', '#17153B'] as const,
} as const;

export const SAVANNAH_THEME_ID = 'savannah' as const;
