import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NlKvkAdapter } from '../adapters/nl-kvk.js';

type FetchArgs = Parameters<typeof fetch>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const RESULTAAT = {
  kvkNummer: '69599084',
  naam: 'Test BV',
  actief: true,
  adres: { volledigAdres: 'Teststraat 1 1234AB Amsterdam' },
};

const BASISPROFIEL = {
  kvkNummer: '69599084',
  naam: 'Test BV',
  formeleRegistratiedatum: '20150101',
  materieleRegistratie: { datumAanvang: '20150101', datumEinde: null },
  hoofdvestiging: {
    adressen: [{ volledigAdres: 'Teststraat 1 1234AB Amsterdam' }],
  },
};

describe('NlKvkAdapter', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let handler: (url: string, init?: RequestInit) => Response | Promise<Response>;

  beforeEach(() => {
    handler = () => jsonResponse({});
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      (async (...args: FetchArgs) => {
        const url = args[0] instanceof URL ? args[0].toString() : String(args[0]);
        return handler(url, args[1]);
      }) as typeof fetch,
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('searchByName uses test endpoint when no API key set and sends apikey header', async () => {
    let capturedUrl: string | undefined;
    let capturedHeaders: HeadersInit | undefined;
    handler = (url, init) => {
      capturedUrl = url;
      capturedHeaders = init?.headers;
      return jsonResponse({ totaal: 1, resultaten: [RESULTAAT] });
    };

    const adapter = new NlKvkAdapter('');
    const result = await adapter.searchByName('test', 5);

    expect(capturedUrl).toContain('api.kvk.nl/test/api/v2/zoeken');
    expect(capturedUrl).toContain('naam=test');
    expect((capturedHeaders as Record<string, string>)?.apikey).toBeTruthy();
    expect(result).toEqual({
      total_results: 1,
      companies: [
        {
          id: '69599084',
          country: 'nl',
          name: 'Test BV',
          status: 'active',
          address: 'Teststraat 1 1234AB Amsterdam',
          source_url: 'https://www.kvk.nl/zoeken/?query=69599084',
        },
      ],
    });
  });

  it('searchByName uses production endpoint when API key provided', async () => {
    let capturedUrl: string | undefined;
    handler = (url) => {
      capturedUrl = url;
      return jsonResponse({ totaal: 0, resultaten: [] });
    };

    const adapter = new NlKvkAdapter('prod-key-abc');
    await adapter.searchByName('shell');

    expect(capturedUrl).toContain('api.kvk.nl/api/v2/zoeken');
    expect(capturedUrl).not.toContain('/test/');
  });

  it('getById maps basisprofiel and parses YYYYMMDD date', async () => {
    handler = () => jsonResponse(BASISPROFIEL);

    const adapter = new NlKvkAdapter('');
    const company = await adapter.getById('69599084');

    expect(company).toEqual({
      id: '69599084',
      country: 'nl',
      name: 'Test BV',
      status: 'active',
      address: 'Teststraat 1 1234AB Amsterdam',
      registered_on: '2015-01-01',
      source_url: 'https://www.kvk.nl/zoeken/?query=69599084',
    });
  });

  it('getById returns null on 404', async () => {
    handler = () => jsonResponse({}, 404);
    const adapter = new NlKvkAdapter('');

    await expect(adapter.getById('00000000')).resolves.toBeNull();
  });

  it('dissolved when datumEinde is set', async () => {
    handler = () =>
      jsonResponse({
        ...BASISPROFIEL,
        materieleRegistratie: { datumAanvang: '20150101', datumEinde: '20220101' },
      });

    const adapter = new NlKvkAdapter('');
    const company = await adapter.getById('69599084');
    expect(company?.status).toBe('dissolved');
  });

  it('network error returns empty without throwing', async () => {
    handler = () => { throw new Error('network failed'); };
    const adapter = new NlKvkAdapter('');

    await expect(adapter.searchByName('test')).resolves.toEqual({
      companies: [],
      total_results: 0,
    });
  });
});
