/**
 * Sanitization layer — enforces "never more than the public registry"
 * principle. Fields in BLACKLIST are NEVER returned at any tier.
 *
 * Hard-coded as code (not config) so unit tests fail loudly if someone
 * accidentally adds a sensitive field to the response shape.
 *
 * Reference: GDPR Article 6(1)(f) legitimate interest balancing test —
 * we redistribute exactly what is in ISIR + portál dražeb, no more.
 */

export const SENSITIVE_FIELDS_BLACKLIST = [
  // Personal identifiers — NEVER expose
  'rodne_cislo',
  'rodneCislo',
  'birth_number',
  'national_id',
  // Contact details — not in source registries
  'phone',
  'telefon',
  'email',
  'mobile',
  // Bank / financial — separate registry, sensitive
  'iban',
  'bank_account_number',
  'cislo_uctu',
  // Salary / debt detail — debtor-side data
  'salary',
  'wage',
  'plat',
  'dluh_castka',
] as const;

/**
 * Recursively strip sensitive keys from any object. Defense-in-depth —
 * even if upstream parser returns extra fields, sanitize() removes them.
 */
export function stripSensitive<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(stripSensitive) as unknown as T;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if ((SENSITIVE_FIELDS_BLACKLIST as readonly string[]).includes(key)) {
      continue;
    }
    result[key] = stripSensitive(value);
  }
  return result as T;
}

/**
 * Tier-based field gating. Free tier sees only PropertyTeaser shape; paid
 * tiers see PropertyFull. Applied AFTER stripSensitive (= sensitive fields
 * never in either case).
 */
export function applyTier<T extends Record<string, unknown>>(
  fullObj: T,
  tier: 'free' | 'pro' | 'agency',
  paidFields: readonly string[],
): Partial<T> {
  if (tier === 'free') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fullObj)) {
      if (!paidFields.includes(k)) out[k] = v;
    }
    return out as Partial<T>;
  }
  return fullObj;
}
