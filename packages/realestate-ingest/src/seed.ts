// packages/realestate-ingest/src/seed.ts
import type Database from 'better-sqlite3';
import { slugifyCs } from '@czagents/shared';
import { DISTRICTS } from './data/districts.js';
import { PRICE_ROWS, PRICE_SOURCE } from './data/priceIndex.js';

const SEED_WINDOW_DAYS = 90; // DistrictAggregate is used only for okres→kraj mapping.

export function seedDistricts(db: Database.Database): void {
  const stmt = db.prepare(
    `INSERT INTO DistrictAggregate (okresSlug, windowDays, krajSlug)
     VALUES (@okresSlug, @windowDays, @krajSlug)
     ON CONFLICT(okresSlug, windowDays) DO UPDATE SET krajSlug = excluded.krajSlug`
  );
  const tx = db.transaction(() => {
    for (const d of DISTRICTS) {
      stmt.run({ okresSlug: slugifyCs(d.okres), windowDays: SEED_WINDOW_DAYS, krajSlug: d.krajSlug });
    }
  });
  tx();
}

export function seedPriceIndex(db: Database.Database): void {
  const stmt = db.prepare(
    `INSERT INTO RealEstatePriceIndex (id, kraj, propertyType, periodYear, periodQuarter, kcPerM2, source)
     VALUES (@id, @kraj, 'byt', @year, @quarter, @kcPerM2, @source)
     ON CONFLICT(id) DO UPDATE SET kcPerM2 = excluded.kcPerM2`
  );
  const tx = db.transaction(() => {
    for (const p of PRICE_ROWS) {
      const id = `${PRICE_SOURCE}:${slugifyCs(p.kraj)}:byt:${p.year}Q${p.quarter}`;
      stmt.run({ id, kraj: p.kraj, year: p.year, quarter: p.quarter, kcPerM2: p.kcPerM2, source: PRICE_SOURCE });
    }
  });
  tx();
}
