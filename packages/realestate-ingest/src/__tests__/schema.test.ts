// packages/realestate-ingest/src/__tests__/schema.test.ts
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { ensureSchema } from '../schema.js';

describe('ensureSchema', () => {
  it('creates the three tables idempotently', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    ensureSchema(db); // second call must not throw
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((r: any) => r.name);
    expect(tables).toEqual(['DistrictAggregate', 'RealEstateLead', 'RealEstatePriceIndex']);
    db.close();
  });
});
