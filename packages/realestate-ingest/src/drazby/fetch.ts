// packages/realestate-ingest/src/drazby/fetch.ts
// Data source: portál dražeb public listing JSON, as used by the site frontend.
// Endpoint pinned 2026-05 (live-verified):
//   https://www.portaldrazeb.cz/drazby/pripravovane.json
// Returns a JSON OBJECT keyed by numeric index ("0","1",…); each value is an
// auction record. Real-estate auctions carry a populated `location_district`
// with `district_name` (okres) + `county`; movable-property auctions (cars,
// furniture) have `location_district: null` and are filtered out. We key okres
// off `location_district.district_name` (NOT `ruian.district_name`, which is a
// city-part, not an okres). The shape is locked by the fixture-backed test.
import type { NormalizedAuction } from './parse.js';

export const DRAZBY_API_URL =
  process.env.DRAZBY_API_URL ?? 'https://www.portaldrazeb.cz/drazby/pripravovane.json';

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function mapStatus(raw: string): NormalizedAuction['status'] {
  const s = raw.toLowerCase();
  if (s.includes('sold') || s.includes('prodáno')) return 'finished_sold';
  if (s.includes('unsold') || s.includes('neúsp') || s.includes('finished')) return 'finished_unsold';
  if (s.includes('upcoming') || s.includes('připrav') || s.includes('prepar')) return 'upcoming';
  return 'active'; // started / running
}

export function normalizeAuctions(raw: unknown): NormalizedAuction[] {
  // Upstream is an object keyed "0","1",… — also tolerate a plain array or
  // a { data: [...] } wrapper for forward-compatibility.
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown>)?.data)
      ? ((raw as Record<string, unknown>).data as unknown[])
      : Object.values(obj(raw));

  return list
    .map((entry): NormalizedAuction | null => {
      const r = obj(entry);
      const item = obj(r.item);
      const category = obj(item.category);
      const fullPath = str(category.full_path);
      // Real estate only.
      if (!fullPath.startsWith('/Nemovitosti')) return null;

      const district = obj(r.location_district);
      const okres = str(district.district_name);
      if (!okres) return null; // no resolvable okres → skip (keeps counts honest)

      const externalId = str(r.hash) || str(r.slug);
      if (!externalId) return null;

      const link = str(r.link);
      const detailUrl = link.startsWith('http')
        ? link
        : `https://www.portaldrazeb.cz${link || `/drazba/${externalId}`}`;

      const startAt = r.start_at ?? r.published_at ?? null;
      const auctionDateIso = startAt ? new Date(String(startAt)).toISOString() : null;

      return {
        externalId,
        spisovaZnacka: str(r.number) || externalId,
        okres,
        detailUrl,
        auctionDateIso,
        status: mapStatus(str(r.status)),
      };
    })
    .filter((x): x is NormalizedAuction => x !== null);
}

export async function fetchAuctions(url = DRAZBY_API_URL): Promise<NormalizedAuction[]> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent':
        'Mozilla/5.0 (compatible; cz-agents-realestate-ingest/0.1; +https://cz-agents.dev)',
    },
  });
  if (!res.ok) throw new Error(`portál dražeb fetch failed: HTTP ${res.status}`);
  return normalizeAuctions(await res.json());
}
