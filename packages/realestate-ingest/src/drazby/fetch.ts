// packages/realestate-ingest/src/drazby/fetch.ts
// Data source: portál dražeb public auction listing JSON (anonymous XHR used
// by the site frontend). Endpoint pinned 2026-05 — see DRAZBY_API_URL.
//
// IMPORTANT (reconcile at deploy time): this module was implemented WITHOUT
// live network access to portaldrazeb.cz. The fixture
// (src/__tests__/fixtures/auctions.sample.json) is SYNTHETIC and the JSON
// field names below (id/uuid/number, item.okres/okresPredmetu/county,
// detailUrl/url, auctionStart/datumZahajeni/date, status/state) are best-effort
// guesses that MUST be verified against a recorded live XHR response body
// (Task 7 Step 1: DevTools → Network on
// https://www.portaldrazeb.cz/drazby/pripravovane). If the live shape differs,
// update both the accessors here and the fixture so the normalization test
// continues to lock the parser contract.
import type { NormalizedAuction } from './parse.js';

export const DRAZBY_API_URL =
  process.env.DRAZBY_API_URL ?? 'https://www.portaldrazeb.cz/api/v2/auctions'; // confirm in Step 1

interface RawAuction { [k: string]: unknown; }

function str(v: unknown): string { return v == null ? '' : String(v); }

export function normalizeAuctions(raw: unknown): NormalizedAuction[] {
  // Upstream returns either an array or { data: [...] } / { auctions: [...] }.
  const list: RawAuction[] = Array.isArray(raw)
    ? (raw as RawAuction[])
    : ((raw as any)?.data ?? (raw as any)?.auctions ?? (raw as any)?.items ?? []);
  return list
    .map((r): NormalizedAuction | null => {
      const externalId = str((r as any).id ?? (r as any).uuid ?? (r as any).number);
      if (!externalId) return null;
      const okres = str((r as any).item?.okres ?? (r as any).okresPredmetu ?? (r as any).county);
      const detailPath = str((r as any).detailUrl ?? (r as any).url ?? `/detail/${externalId}`);
      const detailUrl = detailPath.startsWith('http') ? detailPath : `https://www.portaldrazeb.cz${detailPath}`;
      const auctionDateRaw = (r as any).auctionStart ?? (r as any).datumZahajeni ?? (r as any).date ?? null;
      const auctionDateIso = auctionDateRaw ? new Date(String(auctionDateRaw)).toISOString() : null;
      const rawStatus = str((r as any).status ?? (r as any).state).toLowerCase();
      const status: NormalizedAuction['status'] =
        rawStatus.includes('sold') ? 'finished_sold'
        : rawStatus.includes('unsold') || rawStatus.includes('neúsp') ? 'finished_unsold'
        : rawStatus.includes('upcom') || rawStatus.includes('připrav') ? 'upcoming'
        : 'active';
      return { externalId, spisovaZnacka: str((r as any).number ?? (r as any).spisovaZnacka), okres, detailUrl, auctionDateIso, status };
    })
    .filter((x): x is NormalizedAuction => x !== null && x.okres !== '');
}

export async function fetchAuctions(url = DRAZBY_API_URL): Promise<NormalizedAuction[]> {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'cz-agents-realestate-ingest/0.1' } });
  if (!res.ok) throw new Error(`portál dražeb fetch failed: HTTP ${res.status}`);
  return normalizeAuctions(await res.json());
}
