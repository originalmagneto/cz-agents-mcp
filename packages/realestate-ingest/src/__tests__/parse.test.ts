// packages/realestate-ingest/src/__tests__/parse.test.ts
import { describe, it, expect } from 'vitest';
import { auctionToLead, type NormalizedAuction } from '../drazby/parse.js';

const base: NormalizedAuction = {
  externalId: 'A-123',
  spisovaZnacka: '030 EX 1/2024',
  okres: 'Ostrava-město',
  detailUrl: 'https://www.portaldrazeb.cz/detail/abc',
  auctionDateIso: '2026-07-01T10:00:00.000Z',
  status: 'active',
};

describe('auctionToLead', () => {
  it('maps a normalized auction to a RealEstateLead row', () => {
    const lead = auctionToLead(base, '2026-05-31T00:00:00.000Z');
    expect(lead.sourceType).toBe('portaldrazeb');
    expect(lead.okresSlug).toBe('ostrava-mesto');
    expect(lead.spisovaZnacka).toBe('030 EX 1/2024');
    expect(lead.dokumentUrl).toBe('https://www.portaldrazeb.cz/detail/abc');
    expect(lead.status).toBe('active');
    expect(lead.id).toBe('portaldrazeb:A-123'); // stable → upsert, not duplicate
    expect(lead.ingestedAt).toBe('2026-05-31T00:00:00.000Z');
  });
  it('is stable: same auction → same id', () => {
    expect(auctionToLead(base, 'x').id).toBe(auctionToLead(base, 'y').id);
  });
  it('defaults courtCode to empty string (column is NOT NULL)', () => {
    expect(auctionToLead(base, 'x').courtCode).toBe('');
  });
});
