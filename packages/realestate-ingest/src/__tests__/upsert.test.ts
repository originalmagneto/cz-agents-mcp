// packages/realestate-ingest/src/__tests__/upsert.test.ts
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { ensureSchema } from '../schema.js';
import { upsertLeads, archiveStale } from '../upsert.js';
import { auctionToLead, type NormalizedAuction } from '../drazby/parse.js';

const a: NormalizedAuction = {
  externalId: 'A-1', spisovaZnacka: 'X 1/24', okres: 'Praha',
  detailUrl: 'https://www.portaldrazeb.cz/detail/1', auctionDateIso: '2020-01-01T00:00:00.000Z', status: 'active',
};

describe('upsertLeads', () => {
  it('inserts then updates the same id (no duplicate)', () => {
    const db = new Database(':memory:'); ensureSchema(db);
    upsertLeads(db, [auctionToLead(a, '2026-05-31T00:00:00.000Z')]);
    upsertLeads(db, [auctionToLead(a, '2026-06-01T00:00:00.000Z')]);
    const rows = db.prepare('SELECT id, ingestedAt FROM RealEstateLead').all() as any[];
    expect(rows.length).toBe(1);
    expect(rows[0].ingestedAt).toBe('2026-06-01T00:00:00.000Z');
    db.close();
  });
});

describe('archiveStale', () => {
  it('archives portaldrazeb leads whose auction date is older than 365 days', () => {
    const db = new Database(':memory:'); ensureSchema(db);
    upsertLeads(db, [auctionToLead(a, '2026-05-31T00:00:00.000Z')]); // publishedAt 2020 → stale
    archiveStale(db, '2026-05-31T00:00:00.000Z');
    const row = db.prepare("SELECT status FROM RealEstateLead WHERE id='portaldrazeb:A-1'").get() as any;
    expect(row.status).toBe('archived');
    db.close();
  });
});
