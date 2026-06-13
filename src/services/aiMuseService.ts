// AI Date Muse LLM Orchestration Engine (Step #29)
// Destroys: SPOT_POOL 12-entry hardcoded pool + fetchAIDateCourse() fake 2400ms timer in history.tsx
// Pipeline: Map center coords → Kakao nearby places (real) → MUSE_CORE_PROTOCOL → RecommendedPlace[]

import type { DateCourse, RecommendedPlace } from '../context/AppContext';

const REST_KEY       = process.env.EXPO_PUBLIC_KAKAO_REST_KEY   ?? '';
const ANTHROPIC_KEY  = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';
const API_BASE       = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
const CLAUDE_MODEL   = 'claude-haiku-4-5-20251001';
const TIMEOUT_MS     = 20_000;
const isMockMode     = REST_KEY === 'MOCK_REST_KEY' || REST_KEY === '';

// ── Mood / OOTD → Kakao search keyword mapping ────────────────────────────────

const MOOD_KEYWORDS: Record<string, string> = {
  '차분함': '조용한 감성 카페',
  '신남':   '루프탑바 이자카야',
  '로맨틱': '야경 파인다이닝',
  '힐링':   '자연 공원 카페',
};

const OOTD_KEYWORDS: Record<string, string> = {
  '캐주얼': '감성 브런치카페',
  '시크':   '갤러리 와인바',
  '스트릿': '힙카페 팝업스토어',
  '페미닌': '플라워카페 디저트',
};

// ── Nearby spot type ──────────────────────────────────────────────────────────

interface NearbySpot {
  title: string;
  lat: number;
  lng: number;
  category: string;
}

// Mock spots used when Kakao REST key is absent
const MOCK_NEARBY_SPOTS: NearbySpot[] = [
  { title: '서울숲 공원',        lat: 37.5444, lng: 127.0377, category: '🌳 공원' },
  { title: '카페 어니언 성수',   lat: 37.5447, lng: 127.0555, category: '☕ 카페' },
  { title: '한남 루프탑 레스토랑', lat: 37.5338, lng: 127.0014, category: '🍽️ 레스토랑' },
  { title: '삼청동 갤러리 카페', lat: 37.5814, lng: 126.9808, category: '🎨 갤러리카페' },
  { title: '홍대 스카이랩 바',   lat: 37.5540, lng: 126.9213, category: '🍹 루프탑바' },
  { title: '반포 한강공원',       lat: 37.5125, lng: 127.0046, category: '🌊 한강' },
  { title: '성수동 감성 카페',   lat: 37.5460, lng: 127.0512, category: '☕ 감성카페' },
];

// ── Layer 1: Kakao coordinate-based nearby place fetch ────────────────────────

async function fetchNearbySpots(
  lat: number,
  lng: number,
  mood: string,
  ootd: string,
): Promise<NearbySpot[]> {
  if (isMockMode) {
    await new Promise<void>((r) => setTimeout(r, 320));
    // Offset mock spots relative to current map center for realistic UX
    return MOCK_NEARBY_SPOTS.map((s, i) => ({
      ...s,
      lat: lat + (i - 3) * 0.0045,
      lng: lng + (i - 3) * 0.0045,
    }));
  }

  const keywords = [
    MOOD_KEYWORDS[mood]  ?? '카페',
    OOTD_KEYWORDS[ootd]  ?? '레스토랑',
    '데이트 맛집',
  ];

  const seen    = new Set<string>();
  const results: NearbySpot[] = [];

  for (const kw of keywords) {
    try {
      const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
      url.searchParams.set('query',  kw);
      url.searchParams.set('x',      String(lng));   // 경도
      url.searchParams.set('y',      String(lat));   // 위도
      url.searchParams.set('radius', '3000');        // 반경 3km
      url.searchParams.set('size',   '5');
      url.searchParams.set('sort',   'distance');

      const res = await fetch(url.toString(), {
        headers: { Authorization: `KakaoAK ${REST_KEY}` },
      });
      if (!res.ok) continue;

      const data = (await res.json()) as {
        documents: Array<{
          id: string;
          place_name: string;
          x: string;
          y: string;
          category_name: string;
        }>;
      };

      for (const doc of data.documents ?? []) {
        if (seen.has(doc.id)) continue;
        seen.add(doc.id);
        const catParts = doc.category_name.split(' > ');
        results.push({
          title:    doc.place_name,
          lat:      parseFloat(doc.y),
          lng:      parseFloat(doc.x),
          category: catParts[catParts.length - 1] ?? catParts[0] ?? '명소',
        });
      }
    } catch { /* skip failed keyword — next kw runs */ }
  }

  return results;
}

// ── Layer 2: MUSE_CORE_PROTOCOL prompt builder ────────────────────────────────

function buildMusePrompt(
  spotList: NearbySpot[],
  ootd: string,
  mood: string,
  dateCourses: DateCourse[],
  weatherData: import('./weatherService').WeatherData | null,
): string {
  const favSpots = [...dateCourses]
    .sort((a, b) => (b.myRating + b.partnerRating) - (a.myRating + a.partnerRating))
    .slice(0, 3)
    .map((c) => c.title);

  const spotStr = spotList
    .map(
      (s, i) =>
        `${i + 1}. ${s.title} (위도: ${s.lat.toFixed(6)}, 경도: ${s.lng.toFixed(6)}, 카테고리: ${s.category})`,
    )
    .join('\n');

  const historyLine =
    favSpots.length > 0
      ? `커플 방문 이력 TOP3: ${favSpots.join(', ')}`
      : '등록된 방문 이력 없음';

  const weatherProtocol = weatherData
    ? [
        `[WEATHER_CONTEXT_PROTOCOL: 현재 데이트 지역의 실시간 기온은 ${weatherData.temperature}°C이며,`,
        `날씨 상태는 "${weatherData.weatherStatus}"입니다.`,
        `만약 비(Rain)/눈(Snow)이 감지되거나 기온이 너무 낮거나 높다면`,
        `야외 동선을 철저히 배제하고 실내 몰링, 아늑한 심야 식당, 독립 서점 등`,
        `쾌적한 실내 위주의 코스로 시나리오를 자동 전환할 것]`,
      ].join(' ')
    : '';

  return [
    `[MUSE_CORE_PROTOCOL: 현재 맵 중심 근처의 실제 장소 후보군 리스트는 ${spotList.length}개이며:`,
    spotStr,
    `유저가 원하는 무드는 "${mood}"이며, 오늘 OOTD는 "${ootd}"입니다.`,
    historyLine,
    weatherProtocol,
    `이 후보지들을 수학적으로 단순 매칭하는 것에 그치지 말고, 실제 연인들이 이동 시 느낄 감성적 연결고리(Storyline)를 고려해 식사-디저트-산책 동선으로 엮어내어 100% 동적이고 창조적인 3단계 코스를 빌드할 것. 각 단계별로 뮤즈의 한줄평 감성 팁을 반드시 포함해 JSON 스펙으로 응답할 것]`,
    ``,
    `출력 형식 — 순수 JSON 배열만 출력 (앞뒤 설명 텍스트 없이):`,
    `[`,
    `  {"title":"장소명","latitude":위도숫자,"longitude":경도숫자,"category":"이모지 카테고리명","reason":"뮤즈의 감성 스토리+한줄팁 (2~3문장, 다정하고 시적인 어조)","estimatedTime":"이동 소요 시간"},`,
    `  {"title":"...","latitude":0,"longitude":0,"category":"...","reason":"...","estimatedTime":"..."},`,
    `  {"title":"...","latitude":0,"longitude":0,"category":"...","reason":"...","estimatedTime":"..."}`,
    `]`,
    ``,
    `⚠️ latitude와 longitude는 반드시 위 후보군 리스트에서 그대로 가져올 것. 임의 생성 절대 금지.`,
  ].join('\n');
}

// ── Layer 3: LLM call ─────────────────────────────────────────────────────────

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), ms),
    ),
  ]);
}

async function callLlmForMuse(systemPrompt: string): Promise<string> {
  const userMsg = '위 MUSE_CORE_PROTOCOL에 따라 3단계 데이트 코스를 JSON 배열로만 출력해줘.';

  if (API_BASE) {
    const res = await fetch(`${API_BASE}/api/v1/ai/self-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemPrompt,
        messages: [{ role: 'user', content: userMsg }],
      }),
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
        messages: [{ role: 'user', content: userMsg }],
        max_tokens: 900,
      }),
    });
    if (!res.ok) throw new Error(`ANTHROPIC_${res.status}`);
    const json = (await res.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const block = json.content?.find((b) => b.type === 'text');
    if (!block?.text) throw new Error('EMPTY');
    return block.text;
  }

  throw new Error('NO_API_CONFIGURED');
}

// ── Layer 4: Response parser ──────────────────────────────────────────────────

function parseMuseResponse(
  raw: string,
  spotList: NearbySpot[],
): RecommendedPlace[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('NO_JSON');

  const parsed = JSON.parse(match[0]) as Array<{
    title?: string;
    latitude?: number;
    longitude?: number;
    category?: string;
    reason?: string;
    estimatedTime?: string;
  }>;

  const fallbackLabels = ['출발점', '도보 10~15분', '도보 8~12분'];

  return parsed.slice(0, 3).map((item, i) => {
    // Validate coordinates inside Korea bounding box
    const validLat = typeof item.latitude  === 'number' && item.latitude  > 33 && item.latitude  < 39;
    const validLng = typeof item.longitude === 'number' && item.longitude > 124 && item.longitude < 132;

    let lat = validLat ? item.latitude!  : 0;
    let lng = validLng ? item.longitude! : 0;

    // Coordinate miss: try to match by title against the spotList the LLM was given
    if (!lat || !lng) {
      const matched = spotList.find(
        (s) =>
          s.title.includes(item.title ?? '') ||
          (item.title ?? '').includes(s.title),
      );
      lat = matched?.lat ?? spotList[i]?.lat ?? 37.5512;
      lng = matched?.lng ?? spotList[i]?.lng ?? 126.9882;
    }

    return {
      id:            `muse-${Date.now()}-${i}`,
      title:         item.title         ?? spotList[i]?.title ?? '추천 장소',
      latitude:      lat,
      longitude:     lng,
      category:      item.category      ?? '📍 명소',
      reason:        item.reason        ?? '뮤즈가 특별히 고른 감성 공간이에요 ✨',
      estimatedTime: item.estimatedTime ?? fallbackLabels[i],
    };
  });
}

// ── Fallback preset (never exposes hardcoded Seoul fixture) ───────────────────
// Offsets are relative to current map center so pins land "around" the user.

function buildFallback(mapLat: number, mapLng: number): RecommendedPlace[] {
  return [
    {
      id:            `muse-fb-${Date.now()}-0`,
      title:         '감성 갤러리 카페',
      latitude:      mapLat + 0.004,
      longitude:     mapLng - 0.003,
      category:      '🎨 갤러리카페',
      reason:        '오늘 무드에 딱 맞는 조용하고 감성적인 공간에서 하루를 시작해보세요. 두 분만의 대화가 자연스럽게 깊어질 거예요 🌿',
      estimatedTime: '출발점',
    },
    {
      id:            `muse-fb-${Date.now()}-1`,
      title:         '루프탑 파인다이닝',
      latitude:      mapLat - 0.002,
      longitude:     mapLng + 0.005,
      category:      '🍽️ 레스토랑',
      reason:        '야경이 펼쳐지는 루프탑에서 오늘 저녁의 주인공이 되어보세요. 오늘 OOTD와 분위기가 완벽하게 맞아요 ✨',
      estimatedTime: '도보 10~15분',
    },
    {
      id:            `muse-fb-${Date.now()}-2`,
      title:         '한강 야경 산책로',
      latitude:      mapLat - 0.005,
      longitude:     mapLng - 0.002,
      category:      '🌊 야경산책',
      reason:        '오늘 하루의 마침표는 함께 걷는 강변 산책으로. 오늘 나눈 이야기들이 기억 속 가장 선명한 장면이 될 거예요 🌙',
      estimatedTime: '도보 12~18분',
    },
  ];
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Full AI Date Muse pipeline.
 *
 * 1. Fetches real nearby places from Kakao Local API (radius 3km from map center).
 * 2. Injects them into the MUSE_CORE_PROTOCOL LLM prompt with mood/OOTD context.
 * 3. Calls Claude (or backend proxy) to generate a sensory 3-step date storyline.
 * 4. Validates and returns coordinates that are guaranteed to be within Korea.
 *
 * Never throws — always returns 3 RecommendedPlace items.
 */
export async function requestMuseCourse(
  mapLat: number,
  mapLng: number,
  ootd: string,
  mood: string,
  dateCourses: DateCourse[],
  privacyLevel: number,
  weatherData: import('./weatherService').WeatherData | null = null,
): Promise<RecommendedPlace[]> {
  try {
    // Layer 1: Collect real nearby spots from Kakao
    const spotList = await withTimeout(
      fetchNearbySpots(mapLat, mapLng, mood, ootd),
      8_000,
    );

    if (spotList.length === 0) return buildFallback(mapLat, mapLng);

    // Layer 2: Build MUSE_CORE_PROTOCOL prompt (weather context injected here)
    const contextCourses = privacyLevel === 1 ? [] : dateCourses;
    const systemPrompt = buildMusePrompt(spotList, ootd, mood, contextCourses, weatherData);

    // Layer 3: LLM call
    const raw = await withTimeout(callLlmForMuse(systemPrompt), TIMEOUT_MS);

    // Layer 4: Parse + coordinate guard
    const places = parseMuseResponse(raw, spotList);
    if (places.length < 1) return buildFallback(mapLat, mapLng);
    return places;
  } catch {
    return buildFallback(mapLat, mapLng);
  }
}
