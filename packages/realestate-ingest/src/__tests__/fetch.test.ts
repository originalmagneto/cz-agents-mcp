// packages/realestate-ingest/src/__tests__/fetch.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeAuctions } from '../drazby/fetch.js';

const raw = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/auctions.sample.json', import.meta.url)), 'utf8'),
);

describe('normalizeAuctions', () => {
  it('maps raw portál dražeb JSON to NormalizedAuction[]', () => {
    const out = normalizeAuctions(raw);
    expect(out.length).toBeGreaterThan(0);
    const a = out[0];
    expect(typeof a.externalId).toBe('string');
    expect(a.externalId.length).toBeGreaterThan(0);
    expect(typeof a.okres).toBe('string');
    expect(a.detailUrl).toMatch(/^https?:\/\//);
  });
});
