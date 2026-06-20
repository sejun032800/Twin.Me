// ─── AI 동선 최적화 알고리즘 (FUN-HIS-006) ───────────────────────────────────
//
// optimizeDateCourse(courses):
//   Step 1 — 카테고리 가중치로 시간대별 그룹 분류 (카페/식사 → 명소 → 바/야경)
//   Step 2 — 각 그룹 내 그리디 최단거리 정렬 (nearest-neighbour TSP heuristic)
//   Step 3 — 그룹 순서 유지하며 전체 최종 시퀀스 합산

import type { DateCourse } from '../context/AppContext';

// ── Category weight system ────────────────────────────────────────────────────

export type TimeSlotCategory = 'morning' | 'midday' | 'afternoon' | 'evening';

const MORNING_KEYWORDS  = ['카페', '커피', '브런치', '베이커리', '디저트', '빵', 'cafe', 'coffee', 'bakery'];
const MIDDAY_KEYWORDS   = ['식사', '레스토랑', '음식', '밥', '점심', '한식', '일식', '중식', '양식', '분식', '정식', '국밥', '냉면'];
const AFTERNOON_KEYWORDS = ['전망', '공원', '미술', '박물관', '갤러리', '관광', '테마', '액티비티', '체험', '쇼핑', '타워', '한강', '궁', '성'];
const EVENING_KEYWORDS  = ['야경', '바', '와인', '펍', '루프탑', '클럽', '맥주', '이자카야', '칵테일', 'bar', 'pub', 'rooftop', 'wine'];

const WEIGHT: Record<TimeSlotCategory, number> = {
  morning:   1,
  midday:    2,
  afternoon: 3,
  evening:   4,
};

export function getCourseCategory(course: DateCourse): TimeSlotCategory {
  const text = course.title.toLowerCase();

  if (MORNING_KEYWORDS.some((k) => text.includes(k)))   return 'morning';
  if (MIDDAY_KEYWORDS.some((k) => text.includes(k)))    return 'midday';
  if (EVENING_KEYWORDS.some((k) => text.includes(k)))   return 'evening';
  if (AFTERNOON_KEYWORDS.some((k) => text.includes(k))) return 'afternoon';

  // Default fallback: use visit status as heuristic
  // (pending visits tend to be planned newer places → afternoon)
  return course.myRating === 0 ? 'afternoon' : 'midday';
}

export const CATEGORY_LABEL: Record<TimeSlotCategory, string> = {
  morning:   '오전 · 카페/브런치',
  midday:    '낮 · 식사',
  afternoon: '오후 · 명소/액티비티',
  evening:   '저녁 · 야경/바',
};

export const CATEGORY_COLOR: Record<TimeSlotCategory, string> = {
  morning:   '#F59E0B',
  midday:    '#FF6B8B',
  afternoon: '#38BDF8',
  evening:   '#A78BFA',
};

// ── Haversine distance (metres) ───────────────────────────────────────────────

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Greedy nearest-neighbour within a group ───────────────────────────────────

function greedyOrder(items: DateCourse[]): DateCourse[] {
  if (items.length <= 1) return items;

  const remaining = [...items];
  const ordered: DateCourse[] = [remaining.shift()!];

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(last.latitude, last.longitude, remaining[i].latitude, remaining[i].longitude);
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    }

    ordered.push(remaining.splice(nearestIdx, 1)[0]);
  }

  return ordered;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface OptimizedCourse extends DateCourse {
  planOrder: number;           // 1-indexed display order
  timeCategory: TimeSlotCategory;
  estimatedStartTime: string;  // "오전 11:00", "오후 2:30", etc.
}

const BASE_TIMES: Record<TimeSlotCategory, { h: number; m: number }> = {
  morning:   { h: 10, m: 30 },
  midday:    { h: 12, m: 0  },
  afternoon: { h: 14, m: 30 },
  evening:   { h: 18, m: 0  },
};

const AVG_VISIT_MINUTES = 60; // estimated time per stop

function formatTime(h: number, m: number): string {
  const period = h < 12 ? '오전' : '오후';
  const hh = h % 12 === 0 ? 12 : h % 12;
  const mm = m.toString().padStart(2, '0');
  return `${period} ${hh}:${mm}`;
}

export function optimizeDateCourse(courses: DateCourse[]): OptimizedCourse[] {
  if (courses.length === 0) return [];

  // Group by category weight
  const groups: Map<TimeSlotCategory, DateCourse[]> = new Map([
    ['morning',   []],
    ['midday',    []],
    ['afternoon', []],
    ['evening',   []],
  ]);

  for (const c of courses) {
    groups.get(getCourseCategory(c))!.push(c);
  }

  // Sort each group by greedy nearest-neighbour
  const categoryOrder: TimeSlotCategory[] = ['morning', 'midday', 'afternoon', 'evening'];
  const orderedAll: OptimizedCourse[] = [];

  let order = 1;
  for (const cat of categoryOrder) {
    const group = groups.get(cat)!;
    if (group.length === 0) continue;

    const sorted = greedyOrder(group);
    const base = BASE_TIMES[cat];
    let h = base.h;
    let m = base.m;

    for (const c of sorted) {
      orderedAll.push({
        ...c,
        planOrder: order++,
        timeCategory: cat,
        estimatedStartTime: formatTime(h, m),
      });
      // Advance time by avg visit + 30 min transit
      m += AVG_VISIT_MINUTES + 30;
      h += Math.floor(m / 60);
      m = m % 60;
    }
  }

  return orderedAll;
}
