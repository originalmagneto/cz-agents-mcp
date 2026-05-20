import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GleifAdapter } from '../adapters/de-gleif.js';

type FetchArgs = Parameters<typeof fetch>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/vnd.api+json' },
  });
}

const NL_RECORD = {
  id: 'NLGLEIF0000000001',
  attributes: {
    entity: {
      legalName: { name: 'ASML Holding N.V.' },
      status: 'ACTIVE',
      jurisdiction: 'NL',
      creationDate: '2001-07-01T00:00:00Z',
      legalAddress: {
        addressLines: ['De Run 6501'],
        city: 'Veldhoven',
        postalCode: '5504 DR',
        country: 'NL',
      },
    },
  },
};

describe('GleifAdapter (NL)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: [] }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('searchByName uses NL jurisdiction filter', async () => {
    let capturedUrl = '';
    fetchSpy.mockImplementation((async (...args: FetchArgs) => {
      capturedUrl = args[0] instanceof URL ? args[0].toString() : String(args[0]);
      return jsonResponse({ data: [NL_RECORD], meta: { pagination: { total: 1 } } });
    }) as typeof fetch);

    const adapter = new GleifAdapter('NL');
    const result = await adapter.searchByName('ASML', 5);

    expect(capturedUrl).toContain('filter%5Bentity.jurisdiction%5D=NL');
    expect(result.companies[0]?.country).toBe('nl');
    expect(result.companies[0]?.name).toBe('ASML Holding N.V.');
    expect(result.companies[0]?.lei).toBe('NLGLEIF0000000001');
  });

  it('getById returns company with nl country code', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ data: NL_RECORD }));
    const adapter = new GleifAdapter('NL');
    const company = await adapter.getById('NLGLEIF0000000001');
    expect(company?.country).toBe('nl');
    expect(company?.name).toBe('ASML Holding N.V.');
  });
});
