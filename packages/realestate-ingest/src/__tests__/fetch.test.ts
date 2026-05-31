// packages/realestate-ingest/src/__tests__/fetch.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeAuctions } from '../drazby/fetch.js';

// Fixture is two REAL (trimmed) records recorded from
// https://www.portaldrazeb.cz/drazby/pripravovane.json — one real-estate
// auction (Nemovitosti, with location_district) and one movable (Movitosti,
// no location_district) that must be filtered out.
const raw = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/auctions.sample.json', import.meta.url)), 'utf8'),
);

describe('normalizeAuctions', () => {
  it('maps real-estate auctions and drops movables / districtless rows', () => {
    const out = normalizeAuctions(raw);
    // exactly one of the two fixture rows is a Nemovitost with an okres
    expect(out.length).toBe(1);
    const a = out[0];
    expect(a.externalId.length).toBeGreaterThan(0);
    expect(a.okres).toBe('Uherské Hradiště'); // from location_district.district_name
    expect(a.detailUrl).toMatch(/^https?:\/\//);
    expect(a.spisovaZnacka.length).toBeGreaterThan(0);
  });

  it('tolerates a plain array and a { data: [...] } wrapper', () => {
    const arr = Object.values(raw);
    expect(normalizeAuctions(arr).length).toBe(1);
    expect(normalizeAuctions({ data: arr }).length).toBe(1);
  });

  it('returns [] for empty / malformed input', () => {
    expect(normalizeAuctions({})).toEqual([]);
    expect(normalizeAuctions(null)).toEqual([]);
  });
});
