// packages/realestate-ingest/src/__tests__/e2e.test.ts
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { ensureSchema } from '../schema.js';
import { seedDistricts, seedPriceIndex } from '../seed.js';
import { upsertLeads } from '../upsert.js';
import { auctionToLead, type NormalizedAuction } from '../drazby/parse.js';

function auction(id: string): NormalizedAuction {
  return { externalId: id, spisovaZnacka: `X ${id}`, okres: 'Praha',
    detailUrl: `https://www.portaldrazeb.cz/detail/${id}`, auctionDateIso: '2030-01-01T00:00:00.000Z', status: 'active' };
}

describe('pipeline → getDistrictAggregate', () => {
  it('surfaces real auction counts for an okres', () => {
    const db = new Database(':memory:'); ensureSchema(db); seedDistricts(db); seedPriceIndex(db);
    const now = '2030-01-01T00:00:00.000Z';
    upsertLeads(db, [auction('1'), auction('2'), auction('3'), auction('4')].map((x) => auctionToLead(x, now)));
    const c = (db.prepare(
      "SELECT COUNT(*) c FROM RealEstateLead WHERE okresSlug='praha' AND sourceType IN ('portaldrazeb','cevd','cuzk_delta')"
    ).get() as any).c;
    expect(c).toBe(4);
    const price = db.prepare("SELECT kcPerM2 FROM RealEstatePriceIndex WHERE kraj='Praha' AND periodYear=2024").get() as any;
    expect(price.kcPerM2).toBe(142000);
    db.close();
  });
});
