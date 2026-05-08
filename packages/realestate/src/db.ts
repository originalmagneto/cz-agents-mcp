/**
 * Read-only SQLite client for cz-agents-webapp shared database.
 *
 * Memory `cz-agents-realestate-launch-plan.md` Section 12: read-only Prisma
 * was the original design, but for MCP package isolation we use plain
 * better-sqlite3 (lower deps, smaller container, no Prisma client codegen
 * dependency). Schema reference: cz-agents-webapp/prisma/schema.prisma —
 * specifically RealEstateLead, RealEstateExtract, DistrictAggregate (tbd),
 * OptOutEntry, RealEstateCrawlState models.
 *
 * Connection mode: read-only. The webapp container holds the writer
 * connection; this MCP package only reads. Path is set via REALESTATE_DB_PATH
 * env (default: /data/webapp.db, mounted from webapp-data volume in
 * docker-compose).
 */

import Database from 'better-sqlite3';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const path = process.env.REALESTATE_DB_PATH ?? '/data/webapp.db';
  _db = new Database(path, { readonly: true, fileMustExist: true });
  // busy_timeout — wait if writer holds lock (webapp daily crawl).
  // WAL mode is set by the writer (cz-agents-webapp), readers inherit it
  // automatically; we don't need to issue a `journal_mode = WAL` PRAGMA here
  // (it would attempt a write and fail on a readonly connection).
  _db.pragma('busy_timeout = 5000');
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export interface RealEstateLeadRow {
  id: string;
  isirEventId: number | null;
  sourceType: string;
  spisovaZnacka: string;
  courtCode: string;
  popisUdalosti: string;
  typUdalosti: string;
  ingestedAt: string;
  publishedAt: string | null;
  status: string;
  opportunityScore: number | null;
  matchedKeywords: string;
  dokumentUrl: string | null;
  kuMatchedName: string | null;
  lat: number | null;
  lng: number | null;
  parcelaPlocha: number | null;
  parcelaDruh: string | null;
  parcelaVyuziti: string | null;
  auctionStatus: string | null;
}

export interface RealEstateExtractRow {
  id: string;
  leadId: string;
  parsedJson: string;
  createdAt: string;
}

export interface OptOutEntryRow {
  id: string;
  identifier: string;
  identifierType: string;
  reason: string | null;
  createdAt: string;
}
