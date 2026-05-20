export type Tier = 'free' | 'compliance' | 'agency';

export const COUNTRY_TIERS: Record<string, Tier> = {
  gb: 'free',
  sk: 'free',
  pl: 'free',
  nl: 'free',
  de: 'free',
  fr: 'compliance',
};

export function isCountryEnabled(country: string, tier: Tier): boolean {
  const required = COUNTRY_TIERS[country];
  if (!required) return false;
  if (required === 'free') return true;
  if (required === 'compliance') return tier === 'compliance' || tier === 'agency';
  if (required === 'agency') return tier === 'agency';
  return false;
}

export function getTierFromEnv(): Tier {
  const t = process.env.EU_REGISTRY_TIER?.toLowerCase();
  if (t === 'compliance' || t === 'agency') return t;
  return 'free';
}
