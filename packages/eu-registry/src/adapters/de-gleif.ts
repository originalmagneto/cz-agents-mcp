import type { Company, CompanySearchResult, CompanyStatus, RegistryAdapter } from '../types.js';

// GLEIF (Global Legal Entity Identifier Foundation) — free, no auth, ISO 17442.
// Covers DE companies with LEIs (mid-large entities). Small GmbHs without LEIs
// won't appear. Rate limit: 60 req/min.
const API_BASE = 'https://api.gleif.org/api/v1';
const REQUEST_TIMEOUT_MS = 10_000;

interface GleifAddress {
  addressLines?: string[];
  city?: string;
  postalCode?: string;
  country?: string;
}

interface GleifEntity {
  legalName?: { name?: string };
  status?: string;
  jurisdiction?: string;
  registeredAs?: string;
  creationDate?: string;
  legalAddress?: GleifAddress;
}

interface GleifRecord {
  id?: string;
  attributes?: { entity?: GleifEntity };
}

interface GleifResponse {
  data?: GleifRecord[];
  meta?: { pagination?: { total?: number } };
}

export class DeGleifAdapter implements RegistryAdapter {
  constructor(private readonly fetchImpl: typeof fetch = globalThis.fetch) {}

  async searchByName(name: string, limit = 10): Promise<CompanySearchResult> {
    const url = new URL(`${API_BASE}/lei-records`);
    url.searchParams.set('filter[fulltext]', name);
    url.searchParams.set('filter[entity.jurisdiction]', 'DE');
    url.searchParams.set('page[size]', String(limit));

    try {
      const response = await this.fetchImpl(url, requestInit());
      if (!response.ok) {
        warn(`GLEIF search failed: ${response.status} ${response.statusText}`);
        return { companies: [], total_results: 0 };
      }

      const payload = (await response.json()) as GleifResponse;
      const companies = (payload.data ?? [])
        .map(mapRecord)
        .filter((c): c is Company => c !== null);

      return {
        companies,
        total_results: payload.meta?.pagination?.total ?? companies.length,
      };
    } catch (error) {
      warn('GLEIF search failed', error);
      return { companies: [], total_results: 0 };
    }
  }

  async getById(id: string): Promise<Company | null> {
    const url = new URL(`${API_BASE}/lei-records/${encodeURIComponent(id)}`);

    try {
      const response = await this.fetchImpl(url, requestInit());
      if (response.status === 404) return null;
      if (!response.ok) {
        warn(`GLEIF lookup failed: ${response.status} ${response.statusText}`);
        return null;
      }

      const payload = (await response.json()) as { data?: GleifRecord };
      return payload.data ? mapRecord(payload.data) : null;
    } catch (error) {
      warn('GLEIF lookup failed', error);
      return null;
    }
  }
}

function mapRecord(record: GleifRecord): Company | null {
  const lei = record.id;
  const entity = record.attributes?.entity;
  const name = entity?.legalName?.name;
  if (!lei || !name) return null;

  return {
    id: lei,
    country: 'de',
    name,
    status: mapStatus(entity?.status),
    address: formatAddress(entity?.legalAddress),
    registered_on: entity?.creationDate?.slice(0, 10),
    lei,
    source_url: `https://search.gleif.org/#/record/${lei}`,
  };
}

function mapStatus(status: string | undefined): CompanyStatus {
  const s = status?.toUpperCase();
  if (s === 'ACTIVE') return 'active';
  if (s === 'INACTIVE') return 'dissolved';
  return 'unknown';
}

function formatAddress(addr: GleifAddress | undefined): string | undefined {
  if (!addr) return undefined;
  const parts = [
    ...(addr.addressLines ?? []),
    addr.postalCode,
    addr.city,
  ].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(', ') : undefined;
}

function requestInit(): RequestInit {
  return {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { Accept: 'application/vnd.api+json' },
  };
}

function warn(message: string, error?: unknown): void {
  if (error === undefined) console.warn(`[cz-agents/eu-registry] ${message}`);
  else console.warn(`[cz-agents/eu-registry] ${message}:`, error);
}
