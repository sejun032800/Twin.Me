// Date Shuttle AI recommendation service (Step #26)
// Pipeline: GPS (expo-location) → Weather (simulated API) → Partner prefs (AppContext)
// → LLM prompt injection → structured 3-step course cards
//
// Fallback chain: GPS failure → Seoul default | Weather failure → seasonal estimate
//                 LLM failure → local preset archive (never crashes)

import * as Location from 'expo-location';
import type { DateCourse, PartnerProfile } from '../context/AppContext';

// ── Environment ───────────────────────────────────────────────────────────────
const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const TIMEOUT_MS = 20_000;

// Seoul Gangnam default when GPS unavailable
const SEOUL_FALLBACK = { latitude: 37.5172, longitude: 127.0473, address: '서울 강남' };

// ── Public types ──────────────────────────────────────────────────────────────

export interface WeatherSnapshot {
  temperature: number;    // °C
  condition: string;      // 맑음 | 구름 많음 | 흐림 | 비 | 눈
  isRaining: boolean;
  humidity: number;       // 0-100
  airQuality: string;     // 좋음 | 보통 | 나쁨
}

export interface ShuttleContext {
  latitude: number;
  longitude: number;
  address: string;
  weather: WeatherSnapshot;
  partnerName: string;
  partnerMbti: string;
  preferredFoods: string[];
  favoriteSpots: string[];  // top-rated visited locations
}

export interface ShuttleCourseCard {
  step: number;
  place: string;      // 📍 장소명
  category: string;   // 카테고리 이모지+텍스트
  timeSlot: string;   // ⏰ 추천 시간대
  tip: string;        // 📝 트윈이의 꿀팁
}

export interface ShuttleResult {
  intro: string;
  cards: ShuttleCourseCard[];
}

// ── GPS Layer ─────────────────────────────────────────────────────────────────

async function fetchGpsContext(): Promise<{ latitude: number; longitude: number; address: string }> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return SEOUL_FALLBACK;

    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const [geo] = await Location.reverseGeocodeAsync({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
    });

    const address = geo
      ? [geo.district ?? geo.subregion ?? '', geo.city ?? '서울']
          .filter(Boolean)
          .join(' ')
      : '현재 위치';

    return { latitude: loc.coords.latitude, longitude: loc.coords.longitude, address };
  } catch {
    return SEOUL_FALLBACK;
  }
}

// ── Weather Layer ─────────────────────────────────────────────────────────────
// Simulates a real weather API (e.g. OpenWeatherMap) with realistic seasonal data
// for the Seoul metro area. A production implementation would replace the body
// of this function with an actual `fetch` call to the weather endpoint.

async function fetchWeatherSnapshot(
  _lat: number,
  _lng: number,
): Promise<WeatherSnapshot> {
  await new Promise((r) => setTimeout(r, 500)); // simulated network latency

  const month = new Date().getMonth() + 1; // 1-12
  // Seoul seasonal temperature ranges [lo, hi] °C
  const tempRanges: Record<number, [number, number]> = {
    1: [-5, 3],  2: [-3, 7],  3: [4, 13],  4: [10, 19],
    5: [16, 24], 6: [21, 28], 7: [24, 32], 8: [25, 34],
    9: [18, 26], 10: [10, 21], 11: [3, 13], 12: [-3, 6],
  };
  const [lo, hi] = tempRanges[month] ?? [15, 24];
  const temperature = Math.round(lo + Math.random() * (hi - lo));

  const rainChance = (month >= 6 && month <= 8) ? 0.38 : 0.13;
  const isRaining = Math.random() < rainChance;
  const condition = isRaining
    ? '비'
    : Math.random() > 0.45 ? '맑음' : '구름 많음';
  const humidity = isRaining
    ? 75 + Math.floor(Math.random() * 20)
    : 38 + Math.floor(Math.random() * 28);
  const aqRoll = Math.random();
  const airQuality = aqRoll < 0.52 ? '좋음' : aqRoll < 0.82 ? '보통' : '나쁨';

  return { temperature, condition, isRaining, humidity, airQuality };
}

// ── Partner Preference Extractor ──────────────────────────────────────────────

function extractPartnerPreferences(
  partnerProfile: PartnerProfile,
  dateCourses: DateCourse[],
): { preferredFoods: string[]; favoriteSpots: string[] } {
  const mbtiToFoods: Record<string, string[]> = {
    INTJ: ['일식', '이자카야', '와인바'],
    INFJ: ['브런치 카페', '채식 레스토랑', '감성 디저트'],
    ENFJ: ['한식', '루프탑 레스토랑', '분위기 있는 이탈리안'],
    ENFP: ['퓨전 요리', '트렌디 팝업', '힙 카페'],
    ISFJ: ['한식', '정통 카페', '동네 맛집'],
    ISTP: ['고기집', '라멘', '이자카야'],
    ENTP: ['신생 레스토랑', '힙 카페', '파인다이닝'],
    INFP: ['감성 카페', '채식', '소규모 브런치'],
    ESTJ: ['한식', '정통 레스토랑', '룸살롱식 이자카야'],
    ESFJ: ['한식', '브런치', '베이커리 카페'],
    INTP: ['조용한 카페', '서점 카페', '라멘'],
    ISTJ: ['한식', '정통 음식점', '조용한 카페'],
  };
  const preferredFoods = mbtiToFoods[partnerProfile.mbti] ?? ['다양한 요리', '분위기 좋은 레스토랑'];

  const favoriteSpots = [...dateCourses]
    .sort((a, b) => (b.myRating + b.partnerRating) - (a.myRating + a.partnerRating))
    .slice(0, 3)
    .map((c) => c.title);

  return { preferredFoods, favoriteSpots };
}

// ── Context Aggregator (Promise.all) ──────────────────────────────────────────

export async function gatherDateShuttleContext(
  partnerProfile: PartnerProfile,
  dateCourses: DateCourse[],
): Promise<ShuttleContext> {
  const [gps, prefs] = await Promise.all([
    fetchGpsContext(),
    Promise.resolve(extractPartnerPreferences(partnerProfile, dateCourses)),
  ]);
  // Weather fetched after GPS to pass coordinates
  const weather = await fetchWeatherSnapshot(gps.latitude, gps.longitude);

  return {
    ...gps,
    weather,
    partnerName: partnerProfile.name,
    partnerMbti: partnerProfile.mbti,
    ...prefs,
  };
}

// ── LLM System Prompt Builder ─────────────────────────────────────────────────

function buildShuttleSystemPrompt(
  ctx: ShuttleContext,
  food: string,
  mood: string,
  ootd: string,
): string {
  const weatherLine = ctx.weather.isRaining
    ? `${ctx.weather.condition}이 내리고 있어 실내 위주 동선 최소화 필요 (기온 ${ctx.weather.temperature}°C, 습도 ${ctx.weather.humidity}%)`
    : `${ctx.weather.condition}, 기온 ${ctx.weather.temperature}°C, 미세먼지 ${ctx.weather.airQuality}`;

  const spotsLine = ctx.favoriteSpots.length > 0
    ? `두 분이 즐겨 찾던 장소 TOP3: ${ctx.favoriteSpots.join(', ')}`
    : '등록된 방문 이력 없음';

  return [
    '[SHUTTLE_PROMPT_RULE: AI 데이트 코스 큐레이터]',
    `현재 위치: ${ctx.address}`,
    `날씨 컨텍스트: ${weatherLine}`,
    `파트너(${ctx.partnerName}, MBTI: ${ctx.partnerMbti}) 선호 음식: ${ctx.preferredFoods.join(', ')}`,
    spotsLine,
    '',
    `오늘의 선택 — 음식: ${food} / 무드: ${mood} / OOTD: ${ootd}`,
    '',
    '이를 조합하여 식사→활동→카페/디저트로 이어지는 동선 최적화 3단계 데이트 코스를 작성하되:',
    ctx.weather.isRaining ? '- 비가 오므로 실내 중심, 이동 거리 최소화 우선.' : '',
    '- 파트너의 기피 요소를 철저히 배제하고,',
    '- 트윈이 특유의 감성적이고 다정한 어조로 추천 이유(tip)를 포함할 것.',
    '',
    '출력 형식 — JSON 배열만 출력 (앞뒤 어떤 텍스트도 없이 순수 JSON):',
    '[',
    '  {"step":1,"place":"장소명","category":"카테고리 이모지+텍스트","timeSlot":"예: 오후 6시~7시30분","tip":"트윈이 꿀팁 한 줄"},',
    '  {"step":2,"place":"장소명","category":"카테고리","timeSlot":"예: 오후 7시30분~8시30분","tip":"꿀팁"},',
    '  {"step":3,"place":"장소명","category":"카테고리","timeSlot":"예: 오후 8시30분~10시","tip":"꿀팁"}',
    ']',
  ].filter(Boolean).join('\n');
}

// ── LLM Call Helpers ──────────────────────────────────────────────────────────

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms)),
  ]);
}

async function callLlmForShuttle(systemPrompt: string, signal: AbortSignal): Promise<string> {
  const userMessage = '위 조건에 맞는 3단계 데이트 코스를 JSON 배열로만 출력해줘.';

  if (API_BASE) {
    const res = await fetch(`${API_BASE}/api/v1/ai/self-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal,
    });
    if (!res.ok) throw new Error(`BACKEND_${res.status}`);
    const json = (await res.json()) as { reply: string };
    return json.reply;
  }

  if (ANTHROPIC_KEY) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': ANTHROPIC_KEY,
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        max_tokens: 700,
      }),
      signal,
    });
    if (!res.ok) throw new Error(`ANTHROPIC_${res.status}`);
    const json = (await res.json()) as { content: { type: string; text: string }[] };
    const block = json.content?.find((b) => b.type === 'text');
    if (!block?.text) throw new Error('EMPTY');
    return block.text;
  }

  throw new Error('NO_API_CONFIGURED');
}

function parseCards(raw: string): ShuttleCourseCard[] {
  // Extract JSON array even if LLM wraps it in markdown code fences or prose
  const match = raw.match(/\[[\s\S]*?\]/);
  if (!match) throw new Error('NO_JSON_ARRAY');
  const parsed = JSON.parse(match[0]) as Partial<ShuttleCourseCard>[];
  return parsed.slice(0, 3).map((item, i) => ({
    step: typeof item.step === 'number' ? item.step : i + 1,
    place: item.place ?? '추천 장소',
    category: item.category ?? '📍 명소',
    timeSlot: item.timeSlot ?? '',
    tip: item.tip ?? '두 분에게 딱 맞는 공간이에요 ✨',
  }));
}

// ── Fallback Preset Archive ───────────────────────────────────────────────────
// Used when GPS, weather, or LLM pipeline fails entirely.

export const SHUTTLE_FALLBACK_CARDS: ShuttleCourseCard[] = [
  {
    step: 1,
    place: '성수동 감성 이탈리안',
    category: '🍝 레스토랑',
    timeSlot: '오후 6시~7시30분',
    tip: '조용하고 분위기 있어서 편하게 대화하기 딱 좋아요 🤍',
  },
  {
    step: 2,
    place: '서울숲 야간 산책로',
    category: '🌳 산책',
    timeSlot: '오후 7시30분~8시30분',
    tip: '손 꼭 잡고 걷다 보면 기억에 남는 밤이 될 거예요 🌙',
  },
  {
    step: 3,
    place: '어니언 성수 루프탑',
    category: '☕ 카페',
    timeSlot: '오후 8시30분~10시',
    tip: '야경 보면서 오늘 하루 이야기 나눠봐요, 여기 라떼 진짜 꿀맛이에요 ✨',
  },
];

// ── Main Export ───────────────────────────────────────────────────────────────

/**
 * Calls the LLM with a rich context packet (GPS + weather + partner prefs + user choices)
 * and returns a structured 3-card date course.
 * Never throws — always returns either an LLM result or the fallback preset.
 */
export async function requestDateShuttleRecommendation(
  ctx: ShuttleContext,
  food: string,
  mood: string,
  ootd: string,
): Promise<ShuttleResult> {
  const systemPrompt = buildShuttleSystemPrompt(ctx, food, mood, ootd);
  const controller = new AbortController();

  try {
    const raw = await withTimeout(
      callLlmForShuttle(systemPrompt, controller.signal),
      TIMEOUT_MS,
    );
    const cards = parseCards(raw);
    const intro = ctx.weather.isRaining
      ? `${ctx.address} 근처, 비 오는 날을 위한 실내 동선 최소화 코스예요 ☔`
      : `${ctx.address} 주변 ${ctx.weather.temperature}°C 날씨에 맞춘 맞춤 코스예요 🌟`;
    return { intro, cards };
  } catch {
    return {
      intro: '셔틀 엔진에 일시적인 안개가 꼈어요 🌫️ 주변 추천 코스를 대신 불러올게요!',
      cards: SHUTTLE_FALLBACK_CARDS,
    };
  }
}
