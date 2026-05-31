// packages/realestate-ingest/src/isir/filter.ts
//
// Step 2 of the ISIR Tier-B ingester (see
// docs/superpowers/plans/2026-05-31-isir-tier-b.md, NARROWED v1).
//
// Pure event-type filter. The ISIR event carries a numeric `typ_udalosti`
// code but no okres/property info, so we triage events into three buckets by
// type *before* any document fetch/text extraction:
//
//   - 535  (Usnesení o prodeji mimo dražbu)
//   - 1028 (Smlouva o prodeji mimo dražbu)
//       → `true`: clean-text, identified-property sales. Always real-estate
//         candidates; the later content gate confirms okres.
//
//   - 335  (Dražební vyhláška)
//   - 1081 (Vyhláška o zpeněžení majetku)
//       → `'needs_gate'`: may concern movables; accept ONLY if the downstream
//         content gate (katastrální území / parc. č. / LV tokens) passes.
//
//   - everything else → `false`: not a real-estate sale event.
import type { IsirEventLike } from './poll.js';

/** Primary RE-sale types: prodej mimo dražbu. Accept outright. */
const PRIMARY_SALE_TYPES = new Set(['535', '1028']);

/** Secondary types: accept only if the content gate later passes. */
const GATED_SALE_TYPES = new Set(['335', '1081']);

/**
 * Classify an ISIR event by its `typ_udalosti`:
 *   - `true`         — definite real-estate sale candidate (prodej mimo dražbu).
 *   - `'needs_gate'` — possible RE sale; admit only if the content gate passes.
 *   - `false`        — not a real-estate sale event.
 */
export function isReSaleEvent(event: IsirEventLike): boolean | 'needs_gate' {
  const typ = String(event.typ_udalosti).trim();
  if (PRIMARY_SALE_TYPES.has(typ)) return true;
  if (GATED_SALE_TYPES.has(typ)) return 'needs_gate';
  return false;
}
