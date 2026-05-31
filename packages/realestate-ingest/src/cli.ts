// packages/realestate-ingest/src/cli.ts
import Database from 'better-sqlite3';
import { ensureSchema } from './schema.js';
import { seedDistricts, seedPriceIndex } from './seed.js';
import { fetchAuctions } from './drazby/fetch.js';
import { auctionToLead } from './drazby/parse.js';
import { upsertLeads, archiveStale } from './upsert.js';
import { runIsirPassLive } from './isir/runtime.js';

async function main(): Promise<void> {
  const dbPath = process.env.REALESTATE_DB_PATH ?? '/data/webapp.db';
  const now = new Date().toISOString();
  const db = new Database(dbPath);
  // Default rollback journal (NOT WAL): realestate reads this DB from a
  // read-only volume mount, and a WAL-mode database needs a writable -shm/-wal
  // alongside it — which fails on a :ro mount. With the default journal the
  // writer leaves no persistent sidecar files, so the read-only reader opens
  // cleanly. Brief writer locks (every 6h) are absorbed by the reader's
  // busy_timeout. Also checkpoint/limit memory just in case.
  db.pragma('journal_mode = DELETE');
  db.pragma('busy_timeout = 5000');
  ensureSchema(db);
  seedDistricts(db);
  seedPriceIndex(db);
  try {
    const auctions = await fetchAuctions();
    const leads = auctions.map((a) => auctionToLead(a, now));
    upsertLeads(db, leads);
    archiveStale(db, now);
    console.log(`[realestate-ingest] ok — auctions fetched=${auctions.length} upserted=${leads.length}`);
  } catch (err) {
    // Seeds already committed; scraping failure must not leave DB unusable.
    console.error(`[realestate-ingest] scrape failed (schema+seed still applied): ${(err as Error).message}`);
    db.close();
    process.exit(1);
  }

  // ISIR pass — runs AFTER the portál dražeb pass against the same DB. Bounded
  // per run (max N events) and fully self-contained: any failure here is logged
  // and swallowed so it can never corrupt the seeds/auctions already committed
  // above. Disabled unless the SOAP feed is explicitly enabled.
  try {
    const maxEvents = Number(process.env.ISIR_MAX_EVENTS) || undefined;
    const res = await runIsirPassLive(db, now, maxEvents);
    console.log(
      `[realestate-ingest] isir ok — polled=${res.polled} considered=${res.considered} upserted=${res.upserted}`,
    );
  } catch (err) {
    console.error(`[realestate-ingest] isir pass failed (auctions+seed intact): ${(err as Error).message}`);
  }

  db.close();
}

main().catch((err) => { console.error('[realestate-ingest] fatal:', err); process.exit(1); });
