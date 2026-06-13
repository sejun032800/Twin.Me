// A2A (AI-to-AI) partner mood synchronisation pipeline.
// Endpoint: GET /api/v1/couple/:coupleId/partner-mood
// Response:  { tags: PartnerAiMoodTag[] }
//
// Falls back to placeholder tags on network failure or while the couple
// hasn't been linked yet.

export interface PartnerAiMoodTag {
  id: string;
  text: string;
  intensity: number;  // 0.0 – 1.0 · controls neon glow brightness
  type: 'romantic' | 'sensitive' | 'cozy' | 'warning';
}

export const FALLBACK_MOOD_TAGS: PartnerAiMoodTag[] = [
  { id: 'fb-analyzing', text: '분석 중 🔮',          intensity: 0.40, type: 'cozy' },
  { id: 'fb-calm',      text: '평온함 🕊️',           intensity: 0.30, type: 'romantic' },
  { id: 'fb-waiting',   text: '기다리는 중 ✨',       intensity: 0.25, type: 'sensitive' },
  { id: 'fb-curious',   text: '궁금한 게 많아요 💭',  intensity: 0.35, type: 'cozy' },
];

export async function syncPartnerAiMoodTags(
  coupleId: string | null,
  signal?: AbortSignal,
): Promise<PartnerAiMoodTag[]> {
  if (!coupleId) return FALLBACK_MOOD_TAGS;

  try {
    const res = await fetch(`/api/v1/couple/${coupleId}/partner-mood`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const tags = json.tags as PartnerAiMoodTag[];
    return Array.isArray(tags) && tags.length > 0 ? tags : FALLBACK_MOOD_TAGS;
  } catch {
    return FALLBACK_MOOD_TAGS;
  }
}
