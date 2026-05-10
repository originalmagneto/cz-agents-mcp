/**
 * Address Crowding — "shell-firm hotel" detector. Basic (public) variant.
 *
 * Counts how many Czech companies share the same registered address and
 * maps the count to a threshold-based risk signal. No cross-DB enrichment;
 * pure function over data already fetched by the caller (server.ts).
 *
 * Thresholds:
 *   1-9   → none   (multi-tenant office, normal)
 *   10-49 → low    (coworking / legitimate shared space)
 *   50-199 → medium (virtual office provider)
 *   200+  → high   (shell-firm hotel)
 *
 * Rich variant (+ provider detection + clustering + recommendations)
 * available in @czagents/ddplus (paid Compliance tier).
 */

import type { AresSearchHit } from '../clients.js';

export interface AddressCrowdingInput {
  /** ARES subject record for the queried IČO. Must have `sidlo` populated. */
  company: {
    ico: string;
    sidlo?: {
      nazevUlice?: string;
      nazevObce?: string;
      psc?: number;
    };
  };
  /** All companies found at the same address via reverse ARES search. */
  companiesAtAddress: AresSearchHit[];
  /**
   * Total count from ARES (pocetCelkem). May exceed companiesAtAddress.length
   * when the first page (cap 200) is smaller than the full result set.
   */
  totalCountAtAddress: number;
}

export type CrowdingRiskSignal = 'none' | 'low' | 'medium' | 'high';
export type CrowdingThreshold = 'normal' | 'crowded' | 'shell-hotel';

export interface AddressCrowdingReport {
  ico: string;
  address: {
    ulice?: string;
    obec?: string;
    psc?: number;
  };
  /** Total count of companies registered at this address per ARES. */
  companyCountAtAddress: number;
  /**
   * Set when ARES returned more results than the page cap (200).
   * companyCountAtAddress = totalCountAtAddress in that case.
   */
  cappedAt?: number;
  riskSignal: CrowdingRiskSignal;
  threshold: CrowdingThreshold;
  /** Weighted risk score 0-100. */
  riskScore: number;
  /** Up to 10 example IČOs from the result set (random sample if > 10). */
  sampleCompanyIcos: string[];
}

export const RISK_LABELS: Record<CrowdingRiskSignal, string> = {
  none: 'Žádné riziko — normální multi-nájemní adresa',
  low: 'Nízké riziko — pravděpodobný coworking nebo sdílená kancelář',
  medium: 'Střední riziko — pravděpodobný virtual office provider',
  high: 'Vysoké riziko — typický "shell-firm hotel"',
};

const PAGE_CAP = 200;

export function detectAddressCrowding(input: AddressCrowdingInput): AddressCrowdingReport {
  const { company, companiesAtAddress, totalCountAtAddress } = input;

  const address = {
    ulice: company.sidlo?.nazevUlice,
    obec: company.sidlo?.nazevObce,
    psc: company.sidlo?.psc,
  };

  // Use the total count from ARES (may be larger than the fetched page)
  const count = totalCountAtAddress;
  const capped = companiesAtAddress.length >= PAGE_CAP && count > PAGE_CAP;

  const { riskSignal, threshold, riskScore } = classify(count);

  // Exclude the queried company from the sample, pick up to 10
  const others = companiesAtAddress
    .map((c) => c.ico)
    .filter((ico) => ico !== company.ico);
  const sampleCompanyIcos = pickSample(others, 10);

  return {
    ico: company.ico,
    address,
    companyCountAtAddress: count,
    ...(capped ? { cappedAt: PAGE_CAP } : {}),
    riskSignal,
    threshold,
    riskScore,
    sampleCompanyIcos,
  };
}

// ── Classification ────────────────────────────────────────────────────────────

interface Classification {
  riskSignal: CrowdingRiskSignal;
  threshold: CrowdingThreshold;
  riskScore: number;
}

function classify(count: number): Classification {
  if (count < 10) {
    // 1-9: none, score 0-10 (proportional: ~1 per company)
    return {
      riskSignal: 'none',
      threshold: 'normal',
      riskScore: Math.min(10, count),
    };
  }
  if (count < 50) {
    // 10-49: low, score 20-40
    const fraction = (count - 10) / (50 - 10); // 0..1
    return {
      riskSignal: 'low',
      threshold: 'normal',
      riskScore: Math.round(20 + fraction * 20),
    };
  }
  if (count < 200) {
    // 50-199: medium, score 50-70
    const fraction = (count - 50) / (200 - 50); // 0..1
    return {
      riskSignal: 'medium',
      threshold: 'crowded',
      riskScore: Math.round(50 + fraction * 20),
    };
  }
  // 200+: high, score 80-100
  const fraction = Math.min(1, (count - 200) / 300); // 0..1, saturates at 500
  return {
    riskSignal: 'high',
    threshold: 'shell-hotel',
    riskScore: Math.round(80 + fraction * 20),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns up to `n` elements from `arr`. When arr.length > n, picks
 * a deterministic random-looking sample (Fisher-Yates partial shuffle
 * seeded on arr.length to keep tests stable when using fixed-size arrays).
 */
export function pickSample(arr: string[], n: number): string[] {
  if (arr.length <= n) return [...arr];
  // Partial Fisher-Yates — shallow copy first
  const copy = [...arr];
  for (let i = 0; i < n; i++) {
    // Simple deterministic index: avoids crypto dependency in pure fn
    const j = i + ((arr.length * (i + 1)) % (copy.length - i));
    const tmp = copy[i] as string;
    copy[i] = copy[j] as string;
    copy[j] = tmp;
  }
  return copy.slice(0, n);
}
