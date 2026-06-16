import type { Photo, MemoryRing } from '../types/gallery';

// Tag pool for mock Vision AI — swap internals for real Vision API call when ready.
const CANDIDATE_TAGS = [
  '#sns용사진', '#커플엽사', '#전시관', '#파리여행', '#분위기맛집',
  '#카페투어', '#한강피크닉', '#홍대', '#성수동', '#영화관',
];

// Simulates an async Vision API call, returns 2–3 relevant hashtags.
export async function analyzeAndCategorizePhoto(_uri: string): Promise<string[]> {
  await new Promise<void>((r) => setTimeout(r, 80));
  const shuffled = [...CANDIDATE_TAGS].sort(() => Math.random() - 0.5);
  const count = Math.random() < 0.35 ? 3 : 2;
  return shuffled.slice(0, count);
}

// Builds top-10 MemoryRing objects from a Photo array.
// Counts tag frequencies, picks the 10 most common, clusters photos, sorts oldest→newest.
export function generateTopMemoryRings(photos: Photo[]): MemoryRing[] {
  if (photos.length === 0) return [];

  const tagCount: Record<string, number> = {};
  for (const photo of photos) {
    for (const tag of photo.extractedTags) {
      tagCount[tag] = (tagCount[tag] ?? 0) + 1;
    }
  }

  const top10Tags = Object.entries(tagCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag]) => tag);

  return top10Tags
    .map((tag): MemoryRing => {
      const tagged = photos
        .filter((p) => p.extractedTags.includes(tag))
        .sort((a, b) => a.createdAt - b.createdAt);
      return {
        id: `ring-${tag}`,
        title: tag.startsWith('#') ? tag.slice(1) : tag,
        coverUri: tagged[tagged.length - 1]?.uri ?? '',
        photos: tagged,
      };
    })
    .filter((r) => r.photos.length > 0);
}
