import type { Company, CompanySearchResult, RegistryAdapter } from '../types.js';

// Production: https://api.kvk.nl/api/v2/zoeken (requires paid KVK_API_KEY, €6.40/mo)
// Test:       https://api.kvk.nl/test/api/v2/zoeken (public test key, fake data only)
const TEST_API_KEY = 'l7xx1f2691f2520d487b902f4e0b57a0b197';
const REQUEST_TIMEOUT_MS = 10_000;

interface KvkAdres {
  volledigAdres?: string;
  straatnaam?: string;
  huisnummer?: number;
  postcode?: string;
  plaats?: string;
}

interface KvkResultaat {
  kvkNummer?: string;
  naam?: string;
  actief?: boolean;
  adres?: KvkAdres;
}

interface KvkZoekenResponse {
  totaal?: number;
  resultaten?: KvkResultaat[];
}

interface KvkBasisprofiel {
  kvkNummer?: string;
  naam?: string;
  formeleRegistratiedatum?: string;
  materieleRegistratie?: { datumAanvang?: string; datumEinde?: string | null };
  hoofdvestiging?: {
    adressen?: KvkAdres[];
  };
}

export class NlKvkAdapter implements RegistryAdapter {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(
    apiKey?: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {
    this.apiKey = apiKey ?? process.env.KVK_API_KEY ?? '';
    // Fall back to test environment when no production key provided
    this.baseUrl = this.apiKey ? 'https://api.kvk.nl' : 'https://api.kvk.nl/test';
  }

  async searchByName(name: string, limit = 10): Promise<CompanySearchResult> {
    const url = new URL(`${this.baseUrl}/api/v2/zoeken`);
    url.searchParams.set('naam', name);
    url.searchParams.set('pagina', '1');
    url.searchParams.set('resultatenPerPagina', String(limit));

    try {
      const response = await this.fetchImpl(url, requestInit(this.apiKey || TEST_API_KEY));
      if (!response.ok) {
        warn(`KvK search failed: ${response.status} ${response.statusText}`);
        return { companies: [], total_results: 0 };
      }

      const payload = (await response.json()) as KvkZoekenResponse;
      const companies = (payload.resultaten ?? [])
        .map(mapResultaat)
        .filter((c): c is Company => c !== null);

      return {
        companies,
        total_results: payload.totaal ?? companies.length,
      };
    } catch (error) {
      warn('KvK search failed', error);
      return { companies: [], total_results: 0 };
    }
  }

  async getById(id: string): Promise<Company | null> {
    const url = new URL(`${this.baseUrl}/api/v1/basisprofielen/${encodeURIComponent(id)}`);

    try {
      const response = await this.fetchImpl(url, requestInit(this.apiKey || TEST_API_KEY));
      if (response.status === 404) return null;
      if (!response.ok) {
        warn(`KvK lookup failed: ${response.status} ${response.statusText}`);
        return null;
      }

      const payload = (await response.json()) as KvkBasisprofiel;
      return mapBasisprofiel(payload);
    } catch (error) {
      warn('KvK lookup failed', error);
      return null;
    }
  }
}

function mapResultaat(r: KvkResultaat): Company | null {
  if (!r.kvkNummer || !r.naam) return null;
  return {
    id: r.kvkNummer,
    country: 'nl',
    name: r.naam,
    status: r.actief === true ? 'active' : r.actief === false ? 'dissolved' : 'unknown',
    address: formatAdres(r.adres),
    source_url: `https://www.kvk.nl/zoeken/?query=${encodeURIComponent(r.kvkNummer)}`,
  };
}

function mapBasisprofiel(p: KvkBasisprofiel): Company | null {
  if (!p.kvkNummer || !p.naam) return null;
  const terminated = p.materieleRegistratie?.datumEinde;
  const addr = p.hoofdvestiging?.adressen?.[0];

  return {
    id: p.kvkNummer,
    country: 'nl',
    name: p.naam,
    status: terminated ? 'dissolved' : 'active',
    address: formatAdres(addr),
    registered_on: parseKvkDate(p.formeleRegistratiedatum),
    source_url: `https://www.kvk.nl/zoeken/?query=${encodeURIComponent(p.kvkNummer)}`,
  };
}

function formatAdres(adres: KvkAdres | undefined): string | undefined {
  if (!adres) return undefined;
  if (adres.volledigAdres) return adres.volledigAdres;

  const parts = [
    adres.straatnaam,
    adres.huisnummer !== undefined ? String(adres.huisnummer) : undefined,
    adres.postcode,
    adres.plaats,
  ].filter((p): p is string => Boolean(p));

  return parts.length > 0 ? parts.join(' ') : undefined;
}

// KvK dates arrive as YYYYMMDD string
function parseKvkDate(raw: string | undefined): string | undefined {
  if (!raw || raw.length !== 8) return raw;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function requestInit(apiKey: string): RequestInit {
  return {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { apikey: apiKey },
  };
}

function warn(message: string, error?: unknown): void {
  if (error === undefined) console.warn(`[cz-agents/eu-registry] ${message}`);
  else console.warn(`[cz-agents/eu-registry] ${message}:`, error);
}
