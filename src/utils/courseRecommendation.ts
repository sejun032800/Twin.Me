import type { KakaoPlace } from '../services/kakaoService';
import { searchPlacesByKeyword } from '../services/kakaoService';
import type { DateCourse } from '../context/AppContext';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BudgetRange {
  min: number;
  max: number;
}

export interface CandidatePlace {
  id: string;
  label: 'A' | 'B' | 'C';
  title: string;
  category: string;
  latitude: number;
  longitude: number;
  walkMinutes: number;
  driveMinutes: number;
  distance: number;
  estimatedBudget: number; // per-person KRW estimate derived from category_name
}

// ── Haversine distance (metres) ───────────────────────────────────────────────

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Time-based category guard ─────────────────────────────────────────────────

function getTimeBasedKeywords(): string[] {
  const h = new Date().getHours();
  if (h < 10) return ['카페', '브런치'];
  if (h < 13) return ['점심 맛집', '레스토랑'];
  if (h < 17) return ['카페', '디저트'];
  if (h < 20) return ['저녁 식당', '레스토랑'];
  return ['루프탑 바', '야경 명소'];
}

// ── Per-person budget estimation from Kakao category_name ─────────────────────
// Kakao Places has no price field — derive from category string keywords.

export function estimateBudgetFromCategory(category: string): number {
  const c = category.toLowerCase();
  if (c.includes('파인다이닝') || c.includes('오마카세') || c.includes('코스요리')) return 130_000;
  if (c.includes('스테이크') || c.includes('고깃집') || c.includes('샤부')) return 65_000;
  if (c.includes('일식') || c.includes('초밥') || c.includes('스시')) return 48_000;
  if (c.includes('한정식')) return 50_000;
  if (c.includes('이자카야') || c.includes('술집') || c.includes('루프탑 바')) return 55_000;
  if (c.includes('레스토랑') || c.includes('양식') || c.includes('이탈리안') || c.includes('프렌치')) return 40_000;
  if (c.includes('한식') || c.includes('식당') || c.includes('맛집') || c.includes('분식')) return 20_000;
  if (c.includes('중식')) return 22_000;
  if (c.includes('브런치')) return 24_000;
  if (c.includes('디저트') || c.includes('케이크') || c.includes('베이커리') || c.includes('아이스크림')) return 14_000;
  if (c.includes('카페') || c.includes('커피') || c.includes('coffee')) return 10_000;
  if (c.includes('야경') || c.includes('명소') || c.includes('관광') || c.includes('전망대')) return 8_000;
  if (c.includes('공원') || c.includes('산책')) return 2_000;
  if (c.includes('영화') || c.includes('cinema') || c.includes('cgv') || c.includes('롯데시네마')) return 15_000;
  if (c.includes('전시') || c.includes('박물관') || c.includes('미술관') || c.includes('갤러리')) return 12_000;
  if (c.includes('노래방') || c.includes('karaoke')) return 20_000;
  return 25_000; // default mid-range
}

// ── Budget scoring ─────────────────────────────────────────────────────────────
// Returns 1.0 (in-range), 0.5 (within ±10% tolerance), or 0 (excluded).

function budgetScore(estimated: number, range: BudgetRange): number {
  if (estimated >= range.min && estimated <= range.max) return 1.0;
  const tMin = range.min * 0.9;
  const tMax = range.max * 1.1;
  if (estimated >= tMin && estimated <= tMax) return 0.5;
  return 0;
}

// ── Main recommendation engine ────────────────────────────────────────────────
// Returns up to 3 candidates.
// Sorting: budget score DESC → distance ASC.
// When budgetRange is omitted every place scores 1.0 (pure distance sort).

export async function calculateNextCourseCandidates(
  anchor: DateCourse,
  userTags?: string[],
  budgetRange?: BudgetRange,
): Promise<CandidatePlace[]> {
  const keywords = userTags?.length ? userTags : getTimeBasedKeywords();
  const MAX_RADIUS_M = 5000;
  const LABELS: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];

  const fetched = await Promise.all(
    keywords.slice(0, 2).map((kw) =>
      searchPlacesByKeyword(kw).catch((): KakaoPlace[] => []),
    ),
  );
  const results = fetched.flat();

  const seen = new Set<string>();
  const unique = results.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  type Scored = {
    p: KakaoPlace;
    lat: number;
    lng: number;
    dist: number;
    estimatedBudget: number;
    bScore: number;
  };

  const scored: Scored[] = unique
    .map((p) => {
      const lat = parseFloat(p.y);
      const lng = parseFloat(p.x);
      if (isNaN(lat) || isNaN(lng)) return null;
      const dist = haversineDistance(anchor.latitude, anchor.longitude, lat, lng);
      if (dist > MAX_RADIUS_M) return null;
      const estimatedBudget = estimateBudgetFromCategory(p.category_name || '');
      const bScore = budgetRange ? budgetScore(estimatedBudget, budgetRange) : 1.0;
      if (bScore === 0) return null;
      return { p, lat, lng, dist, estimatedBudget, bScore };
    })
    .filter((x): x is Scored => x !== null)
    .sort((a, b) => {
      if (b.bScore !== a.bScore) return b.bScore - a.bScore; // higher score first
      return a.dist - b.dist;                                  // closer first
    })
    .slice(0, 3);

  return scored.map(({ p, lat, lng, dist, estimatedBudget }, i) => ({
    id: p.id,
    label: LABELS[i],
    title: p.place_name,
    category: p.category_name || keywords[0],
    latitude: lat,
    longitude: lng,
    walkMinutes: Math.max(1, Math.round(dist / 80)),
    driveMinutes: Math.max(1, Math.round(dist / 400)),
    distance: Math.round(dist),
    estimatedBudget,
  }));
}
