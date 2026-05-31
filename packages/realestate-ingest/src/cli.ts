// packages/realestate-ingest/src/cli.ts
import Database from 'better-sqlite3';
import { ensureSchema } from './schema.js';
import { seedDistricts, seedPriceIndex } from './seed.js';
import { fetchAuctions } from './drazby/fetch.js';
import { auctionToLead } from './drazby/parse.js';
import { upsertLeads, archiveStale } from './upsert.js';

async function main(): Promise<void> {
  const dbPath = process.env.REALESTATE_DB_PATH ?? '/data/webapp.db';
  const now = new Date().toISOString();
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
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
  db.close();
}

main().catch((err) => { console.error('[realestate-ingest] fatal:', err); process.exit(1); });
