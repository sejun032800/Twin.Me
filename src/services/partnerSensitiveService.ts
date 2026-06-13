// Partner Sensitive Keywords Pipeline (Step #20)
// Endpoint: GET /api/v1/couple/:coupleId/partner-sensitive-config
// Falls back to curated defaults when couple is unlinked or request fails.

export interface PartnerSensitiveConfig {
  keywords: string[];
  isWarningEnabled: boolean;
  updatedAt: string;
}

export const DEFAULT_PARTNER_SENSITIVE_CONFIG: PartnerSensitiveConfig = {
  keywords: [
    '전 남자친구', '전 남친', '전 여자친구', '전 여친', '예전 남자', '예전 여자', '옛날 애인',
    '살쪘', '뚱뚱', '살 쪘', '몸무게', '다이어트 해',
    '가족이 왜', '부모님이 왜', '집안이',
  ],
  isWarningEnabled: true,
  updatedAt: new Date(0).toISOString(),
};

export async function syncPartnerSensitiveKeywords(
  coupleId: string | null,
  signal?: AbortSignal,
): Promise<PartnerSensitiveConfig> {
  if (!coupleId) return DEFAULT_PARTNER_SENSITIVE_CONFIG;

  try {
    const res = await fetch(`/api/v1/couple/${coupleId}/partner-sensitive-config`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as Partial<PartnerSensitiveConfig>;
    if (
      Array.isArray(json.keywords) &&
      json.keywords.length > 0 &&
      typeof json.isWarningEnabled === 'boolean'
    ) {
      return {
        keywords: json.keywords,
        isWarningEnabled: json.isWarningEnabled,
        updatedAt: json.updatedAt ?? new Date().toISOString(),
      };
    }
    return DEFAULT_PARTNER_SENSITIVE_CONFIG;
  } catch {
    return DEFAULT_PARTNER_SENSITIVE_CONFIG;
  }
}
