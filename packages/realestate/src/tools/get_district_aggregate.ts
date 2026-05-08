/**
 * get_district_aggregate — okres-level statistics with k≥5 anonymity gate.
 *
 * Free tier — UNLIMITED. Aggregates contain no PII (no names, no addresses,
 * no specific properties), so safe to expose without rate limit beyond
 * the basic IP-level free tier limit applied at HTTP layer.
 *
 * k-anonymity: if a count for the okres + window combination is < 5, return
 * `null` for that count + set `low_activity: true`. Prevents identifying
 * a specific debtor in low-activity districts.
 */

import { getDb } from '../db.js';
import type { DistrictAggregate } from '../types.js';

const K_ANONYMITY_THRESHOLD = 5;

export function getDistrictAggregate(params: {
  okres: string;
  window_days?: 30 | 90 | 365;
}): DistrictAggregate {
  const window_days = params.window_days ?? 90;
  const db = getDb();

  const since = new Date(Date.now() - window_days * 24 * 60 * 60 * 1000).toISOString();

  // Count distress leads in window. OkresMapping table doesn't exist yet
  // (Sprint 1 SEO uses programmatic mapping in webapp/lib/okres-data.ts —
  // not yet materialized as DB table). For now we match against
  // kuMatchedName which is set by the RÚIAN enrichment cron. When
  // OkresMapping table lands, JOIN can be added without API contract change.
  const distressCount = (db
    .prepare(`
      SELECT COUNT(*) AS c
      FROM RealEstateLead l
      WHERE l.kuMatchedName = @okres
        AND l.ingestedAt >= @since
        AND l.status != 'archived'
    `)
    .get({ okres: params.okres, since }) as { c: number }).c;

  const insolvencyCount = (db
    .prepare(`
      SELECT COUNT(*) AS c
      FROM RealEstateLead l
      WHERE l.kuMatchedName = @okres
        AND l.ingestedAt >= @since
        AND l.sourceType = 'isir'
    `)
    .get({ okres: params.okres, since }) as { c: number }).c;

  const auctionCount = (db
    .prepare(`
      SELECT COUNT(*) AS c
      FROM RealEstateLead l
      WHERE l.kuMatchedName = @okres
        AND l.ingestedAt >= @since
        AND l.sourceType IN ('portaldrazeb', 'cevd', 'cuzk_delta')
    `)
    .get({ okres: params.okres, since }) as { c: number }).c;

  const lowActivity = distressCount < K_ANONYMITY_THRESHOLD;

  return {
    okres: params.okres,
    window_days,
    insolvency_count: insolvencyCount < K_ANONYMITY_THRESHOLD ? null : insolvencyCount,
    auction_count: auctionCount < K_ANONYMITY_THRESHOLD ? null : auctionCount,
    distress_lead_count: lowActivity ? null : distressCount,
    avg_estimated_price_kc_per_m2: null, // placeholder — depends on extracts
    trend_yoy_pct: null, // placeholder — depends on cached aggregate
    ...(lowActivity ? { low_activity: true as const } : {}),
  };
}
