// packages/realestate-ingest/src/__tests__/seed.test.ts
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { ensureSchema } from '../schema.js';
import { seedDistricts, seedPriceIndex } from '../seed.js';
import { DISTRICTS } from '../data/districts.js';

function freshDb() { const db = new Database(':memory:'); ensureSchema(db); return db; }

describe('seedDistricts', () => {
  it('inserts one row per okres with computed slug, idempotently', () => {
    const db = freshDb();
    seedDistricts(db); seedDistricts(db);
    const count = (db.prepare('SELECT COUNT(*) c FROM DistrictAggregate').get() as any).c;
    expect(count).toBe(DISTRICTS.length);
    const praha = db.prepare("SELECT krajSlug FROM DistrictAggregate WHERE okresSlug='praha'").get() as any;
    expect(praha.krajSlug).toBe('hl-m-praha');
    const ostrava = db.prepare("SELECT krajSlug FROM DistrictAggregate WHERE okresSlug='ostrava-mesto'").get() as any;
    expect(ostrava.krajSlug).toBe('moravskoslezsky');
    db.close();
  });
});

describe('seedPriceIndex', () => {
  it('inserts byt price rows with a year-ago period for YoY', () => {
    const db = freshDb();
    seedPriceIndex(db); seedPriceIndex(db);
    const praha = db.prepare(
      "SELECT periodYear FROM RealEstatePriceIndex WHERE kraj='Praha' AND propertyType='byt' ORDER BY periodYear DESC"
    ).all() as any[];
    expect(praha.length).toBeGreaterThanOrEqual(2);
    expect(praha[0].periodYear - praha[1].periodYear).toBe(1);
    db.close();
  });
});
