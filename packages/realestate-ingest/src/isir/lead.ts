// packages/realestate-ingest/src/isir/lead.ts
//
// Step 5 of the ISIR Tier-B ingester (see
// docs/superpowers/plans/2026-05-31-isir-tier-b.md, NARROWED v1).
//
// PURE mapping from a gated, okres-resolved ISIR event to a RealEstateLead row.
// By the time an event reaches this step the pipeline has already decided it is
// a real-estate sale (filter + content gate) and resolved its `okresSlug`
// (extract.resolveOkresSlug). This module only assembles the row; persistence
// reuses the shared `upsertLeads`.
import type { LeadRow } from '../drazby/parse.js';
import type { IsirEventLike } from './poll.js';

/**
 * Build a `RealEstateLead` row for an ISIR insolvency sale event.
 *
 * The id is `isir:<spisovaZnacka>` — stable across re-ingests of the same case
 * so `upsertLeads`' ON CONFLICT(id) updates rather than duplicates. (The spisová
 * značka, e.g. "INS 12503/2024", identifies the insolvency proceeding; one lead
 * per proceeding is the intended grain for the okres aggregates.)
 *
 * @param event      the gated ISIR event (typ_udalosti already accepted upstream)
 * @param okresSlug  the okres resolved from the document text (non-null caller-side)
 * @param nowIso     ingest timestamp
 */
export function isirEventToLead(
  event: IsirEventLike,
  okresSlug: string,
  nowIso: string,
): LeadRow {
  return {
    id: `isir:${event.spisova_znacka}`,
    sourceType: 'isir',
    spisovaZnacka: event.spisova_znacka,
    courtCode: '',
    ingestedAt: nowIso,
    publishedAt: event.datum_zverejneni ?? null,
    status: 'pending_vision',
    dokumentUrl: event.dokument_url ?? '',
    kuMatchedName: '',
    okresSlug,
    auctionStatus: '',
  };
}
