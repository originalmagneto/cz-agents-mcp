import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlKrsAdapter } from '../adapters/pl-krs.js';

type FetchArgs = Parameters<typeof fetch>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('PlKrsAdapter', () => {
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

  // The WyszukiwanieKRS search endpoint was retired in the 2024 eKRS migration.
  // searchByName always returns empty without making a network call.
  it('searchByName returns empty without making a network call', async () => {
    const adapter = new PlKrsAdapter();
    const result = await adapter.searchByName('ACME', 5);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ companies: [], total_results: 0 });
  });

  it('getById calls correct OdpisAktualny URL and maps company', async () => {
    let capturedUrl: string | undefined;
    handler = (url) => {
      capturedUrl = url;
      return jsonResponse({
        odpis: {
          naglowekA: { numerKRS: '0000123456' },
          dane: {
            dzial1: {
              danePodmiotu: {
                nazwa: 'ACME POLSKA SP. Z O.O.',
                statusPodmiotu: 'czynny',
              },
              siedzibaIAdres: {
                adres: {
                  ulica: 'Testowa',
                  nrDomu: '1',
                  kodPocztowy: '00-001',
                  miejscowosc: 'Warszawa',
                },
              },
              dataRejestracjiWKRS: '2021-03-04',
            },
          },
        },
      });
    };

    const adapter = new PlKrsAdapter();
    const company = await adapter.getById('0000123456');

    expect(capturedUrl).toContain(
      'https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/0000123456',
    );
    expect(capturedUrl).not.toContain('/podmiot/');
    expect(company).toEqual({
      id: '0000123456',
      country: 'pl',
      name: 'ACME POLSKA SP. Z O.O.',
      status: 'active',
      address: 'Testowa, 1, 00-001, Warszawa',
      registered_on: '2021-03-04',
      source_url:
        'https://ekrs.ms.gov.pl/web/wyszukiwarka-krs/strona-glowna/wyszukaj?numer=0000123456',
    });
  });

  it('getById returns null when both rejestr=P and rejestr=S return 404', async () => {
    handler = () => jsonResponse({}, 404);
    const adapter = new PlKrsAdapter();

    await expect(adapter.getById('9999999999')).resolves.toBeNull();
  });

  it('maps statusPodmiotu wykreślony to dissolved in getById', async () => {
    handler = () =>
      jsonResponse({
        odpis: {
          naglowekA: { numerKRS: '0000654321' },
          dane: {
            dzial1: {
              danePodmiotu: { nazwa: 'OLD POLSKA SP. Z O.O.', statusPodmiotu: 'wykreślony' },
            },
          },
        },
      });

    const adapter = new PlKrsAdapter();
    const company = await adapter.getById('0000654321');

    expect(company?.status).toBe('dissolved');
  });
});
