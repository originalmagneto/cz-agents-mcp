import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SkOrsrAdapter } from '../adapters/sk-orsr.js';

type FetchArgs = Parameters<typeof fetch>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ENTITY = {
  id: 999,
  identifiers: [{ value: '31333532', validFrom: '2020-01-02' }],
  fullNames: [{ value: 'ACME SLOVAKIA s.r.o.', validFrom: '2020-01-02' }],
  addresses: [
    {
      street: 'Hlavná',
      buildingNumber: '1',
      postalCodes: ['81101'],
      municipality: { value: 'Bratislava' },
    },
  ],
  establishment: '2020-01-02',
  terminationDate: null,
};

describe('SkOrsrAdapter', () => {
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

  it('searchByName calls correct API URL and maps results', async () => {
    let capturedUrl: string | undefined;
    handler = (url) => {
      capturedUrl = url;
      return jsonResponse({ results: [ENTITY] });
    };

    const adapter = new SkOrsrAdapter();
    const result = await adapter.searchByName('ACME', 5);

    expect(capturedUrl).toBe(
      'https://api.statistics.sk/rpo/v1/search?fullName=ACME&page=0&size=5',
    );
    expect(result).toEqual({
      total_results: 1,
      companies: [
        {
          id: '31333532',
          country: 'sk',
          name: 'ACME SLOVAKIA s.r.o.',
          status: 'active',
          address: 'Hlavná, 1, 81101, Bratislava',
          registered_on: '2020-01-02',
          source_url: 'https://rpo.statistics.sk/rpo/registration/999',
        },
      ],
    });
  });

  it('getById calls search with identifier param and returns first result', async () => {
    let capturedUrl: string | undefined;
    handler = (url) => {
      capturedUrl = url;
      return jsonResponse({ results: [ENTITY] });
    };

    const adapter = new SkOrsrAdapter();
    const company = await adapter.getById('31333532');

    expect(capturedUrl).toBe(
      'https://api.statistics.sk/rpo/v1/search?identifier=31333532&page=0&size=1',
    );
    expect(company).toMatchObject({ id: '31333532', name: 'ACME SLOVAKIA s.r.o.' });
  });

  it('getById returns null when results are empty', async () => {
    handler = () => jsonResponse({ results: [] });
    const adapter = new SkOrsrAdapter();

    await expect(adapter.getById('missing')).resolves.toBeNull();
  });

  it('terminationDate set means dissolved status', async () => {
    handler = () =>
      jsonResponse({ results: [{ ...ENTITY, terminationDate: '2023-06-01' }] });
    const adapter = new SkOrsrAdapter();
    const result = await adapter.searchByName('ACME');

    expect(result.companies[0]?.status).toBe('dissolved');
  });

  it('non-200 on searchByName returns empty results without throwing', async () => {
    handler = () => jsonResponse({}, 500);
    const adapter = new SkOrsrAdapter();

    await expect(adapter.searchByName('ACME')).resolves.toEqual({
      companies: [],
      total_results: 0,
    });
  });

  it('network error on searchByName returns empty results without throwing', async () => {
    handler = () => {
      throw new Error('network failed');
    };
    const adapter = new SkOrsrAdapter();

    await expect(adapter.searchByName('ACME')).resolves.toEqual({
      companies: [],
      total_results: 0,
    });
  });
});
