import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lookupGleifParent } from '../gleif-lookup.js';

type FetchArgs = Parameters<typeof fetch>;

function gleifResponse(records: unknown[], status = 200): Response {
  return new Response(JSON.stringify({ data: records }), {
    status,
    headers: { 'Content-Type': 'application/vnd.api+json' },
  });
}

function makeRecord(lei: string, name: string, jurisdiction = 'DE') {
  return {
    id: lei,
    attributes: {
      entity: {
        legalName: { name },
        jurisdiction,
      },
    },
  };
}

describe('lookupGleifParent', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns HIGH confidence on exact name match (after suffix strip)', async () => {
    fetchSpy.mockResolvedValue(
      gleifResponse([makeRecord('529900T8BM49AURSDO55', 'Siemens AG')]),
    );

    const result = await lookupGleifParent('Siemens s.r.o.');
    expect(result).not.toBeNull();
    expect(result?.confidence).toBe('HIGH');
    expect(result?.lei).toBe('529900T8BM49AURSDO55');
    expect(result?.name).toBe('Siemens AG');
  });

  it('returns MEDIUM confidence when czech name contains gleif name', async () => {
    fetchSpy.mockResolvedValue(
      gleifResponse([makeRecord('LEI123', 'Bosch')]),
    );

    const result = await lookupGleifParent('Bosch Service Solutions s.r.o.');
    expect(result?.confidence).toBe('MEDIUM');
  });

  it('calls GLEIF API with fulltext filter', async () => {
    let capturedUrl = '';
    fetchSpy.mockImplementation((async (...args: FetchArgs) => {
      capturedUrl = args[0] instanceof URL ? args[0].toString() : String(args[0]);
      return gleifResponse([makeRecord('X', 'Test Corp')]);
    }) as typeof fetch);

    await lookupGleifParent('Test Company');
    expect(capturedUrl).toContain('api.gleif.org/api/v1/lei-records');
    expect(capturedUrl).toContain('filter%5Bfulltext%5D=Test+Company');
    expect(capturedUrl).toContain('page%5Bsize%5D=5');
  });

  it('returns null when no records', async () => {
    fetchSpy.mockResolvedValue(gleifResponse([]));
    await expect(lookupGleifParent('NonExistent XYZ 123')).resolves.toBeNull();
  });

  it('returns null on network error without throwing', async () => {
    fetchSpy.mockRejectedValue(new Error('network failed'));
    await expect(lookupGleifParent('SomeCorp')).resolves.toBeNull();
  });

  it('returns null when score is zero (unrelated name)', async () => {
    fetchSpy.mockResolvedValue(
      gleifResponse([makeRecord('ABC', 'Volkswagen AG')]),
    );
    // "Xyzu" has zero word overlap with "Volkswagen"
    const result = await lookupGleifParent('Xyzu a.s.');
    expect(result).toBeNull();
  });
});
