import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UkCompaniesHouseAdapter } from '../adapters/uk-companies-house.js';

type FetchArgs = Parameters<typeof fetch>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('UkCompaniesHouseAdapter', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let handler: (url: string, init?: RequestInit) => Response | Promise<Response>;

  beforeEach(() => {
    vi.stubEnv('CH_API_KEY', 'test-key');
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
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('searchByName returns mapped companies', async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    handler = (url, init) => {
      captured = { url, init };
      return jsonResponse({
        total_results: 2,
        items: [
          {
            company_number: '14356670',
            title: 'ACME LIMITED',
            company_status: 'active',
            address_snippet: '1 Test Street, London',
            date_of_creation: '2022-09-14',
          },
          {
            company_number: '00000001',
            title: 'OLD LIMITED',
            company_status: 'dissolved',
          },
        ],
      });
    };

    const adapter = new UkCompaniesHouseAdapter();
    const result = await adapter.searchByName('acme', 5);

    expect(captured?.url).toBe('https://api.company-information.service.gov.uk/search/companies?q=acme&items_per_page=5');
    expect(captured?.init?.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from('test-key:').toString('base64')}`,
      Accept: 'application/json',
    });
    expect(result).toEqual({
      total_results: 2,
      companies: [
        {
          id: '14356670',
          country: 'gb',
          name: 'ACME LIMITED',
          status: 'active',
          address: '1 Test Street, London',
          registered_on: '2022-09-14',
          source_url: 'https://find-and-update.company-information.service.gov.uk/company/14356670',
        },
        {
          id: '00000001',
          country: 'gb',
          name: 'OLD LIMITED',
          status: 'dissolved',
          address: undefined,
          registered_on: undefined,
          source_url: 'https://find-and-update.company-information.service.gov.uk/company/00000001',
        },
      ],
    });
  });

  it('getById returns mapped company or null on 404', async () => {
    handler = (url) => {
      if (url.endsWith('/company/14356670')) {
        return jsonResponse({
          company_number: '14356670',
          company_name: 'ACME LIMITED',
          company_status: 'active',
          registered_office_address: {
            address_line_1: '1 Test Street',
            locality: 'London',
            postal_code: 'SW1A 1AA',
          },
          date_of_creation: '2022-09-14',
        });
      }
      return jsonResponse({}, 404);
    };

    const adapter = new UkCompaniesHouseAdapter();

    await expect(adapter.getById('14356670')).resolves.toEqual({
      id: '14356670',
      country: 'gb',
      name: 'ACME LIMITED',
      status: 'active',
      address: '1 Test Street, London, SW1A 1AA',
      registered_on: '2022-09-14',
      source_url: 'https://find-and-update.company-information.service.gov.uk/company/14356670',
    });
    await expect(adapter.getById('missing')).resolves.toBeNull();
  });

  it('missing CH_API_KEY returns empty results without throwing', async () => {
    vi.stubEnv('CH_API_KEY', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const adapter = new UkCompaniesHouseAdapter();

    await expect(adapter.searchByName('acme')).resolves.toEqual({ companies: [], total_results: 0 });
    await expect(adapter.getById('14356670')).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
});
