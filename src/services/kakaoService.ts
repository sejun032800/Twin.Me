/**
 * Kakao Local API service layer.
 *
 * isMockMode is true when EXPO_PUBLIC_KAKAO_REST_KEY is the placeholder value.
 * Swap the key in .env and the service transparently switches to live API calls.
 */

const REST_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_KEY ?? '';
export const isMockMode = REST_KEY === 'MOCK_REST_KEY' || REST_KEY === '';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KakaoPlace {
  id: string;
  place_name: string;
  address_name: string;
  road_address_name: string;
  /** longitude (경도 x) */
  x: string;
  /** latitude (위도 y) */
  y: string;
  phone: string;
  place_url: string;
  category_name: string;
}

interface KakaoSearchMeta {
  total_count: number;
  pageable_count: number;
  is_end: boolean;
}

interface KakaoSearchResponse {
  documents: KakaoPlace[];
  meta: KakaoSearchMeta;
}

// ── Mock Data: 서울 연인 데이트 장소 TOP 5 ────────────────────────────────────

const MOCK_SEOUL_DATE_SPOTS: KakaoPlace[] = [
  {
    id: 'mock-1',
    place_name: '서울숲 공원',
    address_name: '서울 성동구 뚝섬로 273',
    road_address_name: '서울 성동구 뚝섬로 273',
    x: '127.0377',
    y: '37.5444',
    phone: '02-460-2905',
    place_url: 'https://place.map.kakao.com/mock-1',
    category_name: '공원 > 도시근린공원',
  },
  {
    id: 'mock-2',
    place_name: '카페 어니언 성수',
    address_name: '서울 성동구 아차산로9길 8',
    road_address_name: '서울 성동구 아차산로9길 8',
    x: '127.0555',
    y: '37.5447',
    phone: '02-1234-5678',
    place_url: 'https://place.map.kakao.com/mock-2',
    category_name: '음식점 > 카페 > 커피전문점',
  },
  {
    id: 'mock-3',
    place_name: '반포 한강공원',
    address_name: '서울 서초구 신반포로11길 40',
    road_address_name: '서울 서초구 신반포로11길 40',
    x: '127.0028',
    y: '37.5125',
    phone: '02-3780-0551',
    place_url: 'https://place.map.kakao.com/mock-3',
    category_name: '공원 > 도시근린공원',
  },
  {
    id: 'mock-4',
    place_name: '북촌한옥마을',
    address_name: '서울 종로구 계동길 37',
    road_address_name: '서울 종로구 계동길 37',
    x: '126.9832',
    y: '37.5797',
    phone: '',
    place_url: 'https://place.map.kakao.com/mock-4',
    category_name: '관광명소 > 역사유적지',
  },
  {
    id: 'mock-5',
    place_name: '광장시장',
    address_name: '서울 종로구 창경궁로 88',
    road_address_name: '서울 종로구 창경궁로 88',
    x: '126.9997',
    y: '37.5702',
    phone: '02-2267-0291',
    place_url: 'https://place.map.kakao.com/mock-5',
    category_name: '음식점 > 전통시장',
  },
];

// ── API Functions ─────────────────────────────────────────────────────────────

/**
 * [키워드로 장소 검색] — Kakao Local REST API v2
 * Ref: https://developers.kakao.com/docs/ko/local/dev-guide#search-by-keyword
 *
 * When isMockMode is true, returns filtered mock Seoul date spots.
 */
export async function searchPlacesByKeyword(keyword: string): Promise<KakaoPlace[]> {
  if (isMockMode) {
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    const lower = keyword.trim().toLowerCase();
    if (!lower) return MOCK_SEOUL_DATE_SPOTS;
    const filtered = MOCK_SEOUL_DATE_SPOTS.filter(
      (p) =>
        p.place_name.toLowerCase().includes(lower) ||
        p.category_name.toLowerCase().includes(lower) ||
        p.address_name.toLowerCase().includes(lower),
    );
    return filtered.length > 0 ? filtered : MOCK_SEOUL_DATE_SPOTS;
  }

  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
  url.searchParams.set('query', keyword);
  url.searchParams.set('size', '15');

  const response = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${REST_KEY}` },
  });

  if (!response.ok) {
    throw new Error(`Kakao Local API error: HTTP ${response.status}`);
  }

  const data: KakaoSearchResponse = await response.json();
  return data.documents;
}
