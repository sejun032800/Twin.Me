// Real-time weather data engine (Step #31)
// Fetches current weather from OpenWeatherMap API and returns a normalized payload
// consumed by the AI Date Muse LLM prompt (WEATHER_CONTEXT_PROTOCOL injection).
// Falls back to season-average context when the API key is absent or the request fails.

const OW_KEY     = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY ?? '';
const TIMEOUT_MS = 8_000;

export interface WeatherData {
  temperature:    number;   // °C rounded
  feelsLike:      number;   // °C rounded
  weatherStatus:  string;   // Korean label
  conditionId:    number;   // OpenWeatherMap condition code
  icon:           string;   // emoji
  glowColor:      string;   // neon hex for UI glow
  isOutdoorRisky: boolean;  // true when rain/snow/extreme temp
  description:    string;   // short Korean description
}

// ── Season-based fallback (no API key or network error) ───────────────────────
function getSeasonFallback(): WeatherData {
  const month = new Date().getMonth() + 1; // 1–12
  if (month >= 3 && month <= 5) {
    return {
      temperature: 18, feelsLike: 17, weatherStatus: '맑음', conditionId: 800,
      icon: '🌸', glowColor: '#FF9BC2', isOutdoorRisky: false, description: '포근한 봄날씨',
    };
  }
  if (month >= 6 && month <= 8) {
    return {
      temperature: 28, feelsLike: 30, weatherStatus: '맑음', conditionId: 800,
      icon: '☀️', glowColor: '#FF9500', isOutdoorRisky: false, description: '선선한 초여름 날씨',
    };
  }
  if (month >= 9 && month <= 11) {
    return {
      temperature: 16, feelsLike: 15, weatherStatus: '맑음', conditionId: 800,
      icon: '🍂', glowColor: '#FF7043', isOutdoorRisky: false, description: '선선한 가을 날씨',
    };
  }
  return {
    temperature: 3, feelsLike: 0, weatherStatus: '흐림', conditionId: 803,
    icon: '⛄', glowColor: '#90CAF9', isOutdoorRisky: true, description: '쌀쌀한 겨울 날씨',
  };
}

// ── Condition ID → Korean label + neon glow ───────────────────────────────────
// Full mapping spec: https://openweathermap.org/weather-conditions
function mapConditionId(
  id: number,
): Pick<WeatherData, 'weatherStatus' | 'icon' | 'glowColor'> {
  if (id >= 200 && id < 300) return { weatherStatus: '천둥번개', icon: '⚡',   glowColor: '#FFE066' };
  if (id >= 300 && id < 400) return { weatherStatus: '이슬비',   icon: '🌦️',  glowColor: '#64B5F6' };
  if (id >= 500 && id < 600) return { weatherStatus: '비',        icon: '🌧️',  glowColor: '#2196F3' };
  if (id >= 600 && id < 700) return { weatherStatus: '눈',        icon: '❄️',  glowColor: '#80DEEA' };
  if (id >= 700 && id < 800) return { weatherStatus: '안개',      icon: '🌫️', glowColor: '#90A4AE' };
  if (id === 800)             return { weatherStatus: '맑음',      icon: '☀️',  glowColor: '#FF9500' };
  if (id === 801)             return { weatherStatus: '약간 흐림', icon: '🌤️', glowColor: '#FFC107' };
  if (id <= 803)              return { weatherStatus: '구름',      icon: '⛅',  glowColor: '#90A4AE' };
  if (id === 804)             return { weatherStatus: '흐림',      icon: '☁️',  glowColor: '#78909C' };
  return                             { weatherStatus: '알 수 없음', icon: '🌡️', glowColor: '#94A3B8' };
}

// ── Outdoor risk classifier ───────────────────────────────────────────────────
// Returns true for precipitation, extreme cold (<5°C) or extreme heat (>35°C).
function isOutdoorRisky(conditionId: number, temp: number): boolean {
  if (conditionId >= 200 && conditionId < 700) return true;
  if (temp < 5 || temp > 35) return true;
  return false;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetches current weather for a lat/lon point.
 * Never throws — falls back to a season-average WeatherData on any error.
 */
export async function fetchCurrentWeather(lat: number, lon: number): Promise<WeatherData> {
  if (!OW_KEY) return getSeasonFallback();

  try {
    const url =
      `https://api.openweathermap.org/data/2.5/weather` +
      `?lat=${lat}&lon=${lon}&appid=${OW_KEY}&units=metric&lang=kr`;

    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`OWM_${res.status}`);

    const data = (await res.json()) as {
      main:    { temp: number; feels_like: number };
      weather: Array<{ id: number; description: string }>;
    };

    const temp        = Math.round(data.main.temp);
    const feelsLike   = Math.round(data.main.feels_like);
    const conditionId = data.weather[0]?.id ?? 800;
    const mapped      = mapConditionId(conditionId);

    return {
      temperature: temp,
      feelsLike,
      conditionId,
      isOutdoorRisky: isOutdoorRisky(conditionId, temp),
      description:    data.weather[0]?.description ?? mapped.weatherStatus,
      ...mapped,
    };
  } catch {
    return getSeasonFallback();
  }
}
