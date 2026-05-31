// packages/realestate-ingest/src/upsert.ts
import type Database from 'better-sqlite3';
import type { LeadRow } from './drazby/parse.js';

export function upsertLeads(db: Database.Database, leads: LeadRow[]): void {
  const stmt = db.prepare(
    `INSERT INTO RealEstateLead
       (id, sourceType, spisovaZnacka, courtCode, ingestedAt, publishedAt, status, dokumentUrl, kuMatchedName, okresSlug, auctionStatus)
     VALUES
       (@id, @sourceType, @spisovaZnacka, @courtCode, @ingestedAt, @publishedAt, @status, @dokumentUrl, @kuMatchedName, @okresSlug, @auctionStatus)
     ON CONFLICT(id) DO UPDATE SET
       ingestedAt = excluded.ingestedAt,
       publishedAt = excluded.publishedAt,
       status = excluded.status,
       dokumentUrl = excluded.dokumentUrl,
       kuMatchedName = excluded.kuMatchedName,
       okresSlug = excluded.okresSlug,
       auctionStatus = excluded.auctionStatus`
  );
  const tx = db.transaction(() => { for (const l of leads) stmt.run(l); });
  tx();
}

/** Archive portál dražeb leads whose auction date is older than the longest window (365d). */
export function archiveStale(db: Database.Database, nowIso: string): void {
  const cutoff = new Date(new Date(nowIso).getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    `UPDATE RealEstateLead SET status = 'archived'
     WHERE sourceType = 'portaldrazeb' AND status != 'archived'
       AND publishedAt IS NOT NULL AND publishedAt < @cutoff`
  ).run({ cutoff });
}
