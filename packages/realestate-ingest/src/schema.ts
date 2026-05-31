// packages/realestate-ingest/src/schema.ts
import type Database from 'better-sqlite3';

/**
 * DDL copied verbatim from
 * packages/realestate/src/__tests__/get_district_aggregate.test.ts — the
 * canonical shape the realestate tool reads. Keep in sync if that changes.
 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS RealEstateLead (
  id TEXT PRIMARY KEY,
  sourceType TEXT NOT NULL,
  spisovaZnacka TEXT NOT NULL,
  courtCode TEXT NOT NULL,
  ingestedAt TEXT NOT NULL,
  publishedAt TEXT,
  status TEXT DEFAULT 'pending_vision',
  opportunityScore REAL,
  dokumentUrl TEXT,
  kuMatchedName TEXT,
  parcelaPlocha REAL,
  parcelaDruh TEXT,
  parcelaVyuziti TEXT,
  auctionStatus TEXT,
  popisUdalosti TEXT DEFAULT '',
  typUdalosti TEXT DEFAULT '',
  matchedKeywords TEXT DEFAULT '',
  lat REAL,
  lng REAL,
  okresSlug TEXT
);

CREATE TABLE IF NOT EXISTS DistrictAggregate (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  okresSlug TEXT NOT NULL,
  windowDays INTEGER NOT NULL,
  insolvencyCount INTEGER NOT NULL DEFAULT 0,
  auctionCount INTEGER NOT NULL DEFAULT 0,
  distressLeadCount INTEGER NOT NULL DEFAULT 0,
  krajSlug TEXT NOT NULL,
  krajCount INTEGER NOT NULL DEFAULT 0,
  lastUpdated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS RealEstatePriceIndex (
  id TEXT PRIMARY KEY,
  kraj TEXT NOT NULL,
  propertyType TEXT NOT NULL,
  periodYear INTEGER NOT NULL,
  periodQuarter INTEGER NOT NULL,
  kcPerM2 INTEGER NOT NULL,
  source TEXT NOT NULL,
  fetchedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lead_okres ON RealEstateLead(okresSlug, ingestedAt);
CREATE UNIQUE INDEX IF NOT EXISTS idx_district_okres ON DistrictAggregate(okresSlug, windowDays);
`;

export function ensureSchema(db: Database.Database): void {
  db.exec(SCHEMA);
}
