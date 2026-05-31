// packages/realestate-ingest/src/isir/poll.ts
//
// Step 1 of the ISIR Tier-B ingester (see
// docs/superpowers/plans/2026-05-31-isir-tier-b.md, NARROWED v1).
//
// Wraps `@czagents/isir` IsirClient.pollEvents — the ISIR public SOAP WS is an
// append-only event log keyed by `idPodnetu` (the last event id seen). We
// persist that cursor in a tiny kv table (`crawl_state`, key `isir_last_id`)
// inside webapp.db so each cron run continues incrementally from where the
// previous one stopped, instead of re-reading the whole firehose.
//
// The client is *injectable* (structural `IsirPollClient`) so unit tests can
// replay the recorded fixtures/isir/event-batch.sample.json with no live WS.
import type Database from 'better-sqlite3';

/**
 * Structural view of one parsed ISIR event. Mirrors `IsirEvent` from
 * `@czagents/isir` (client.ts) but is declared locally so this module does not
 * depend on that package's type surface — only the runtime client is injected.
 */
export interface IsirEventLike {
  id: number;
  datum_zalozeni: string;
  datum_zverejneni: string;
  spisova_znacka: string;
  typ_udalosti: string;
  popis_udalosti: string;
  oddil?: string;
  cislo_v_oddilu?: number;
  dokument_url?: string;
  poznamka?: string;
}

/** Structural view of IsirClient.pollEvents's result (PollResult). */
export interface IsirPollResult {
  events: IsirEventLike[];
  /** Highest event id seen; pass back as `idPodnetu` next time. */
  last_id: number;
  status: 'OK' | 'CHYBA';
  error_code?: string;
  error_message?: string;
}

/**
 * The only thing this module needs from `@czagents/isir`. A real `IsirClient`
 * instance satisfies this structurally; tests pass a fixture replayer.
 */
export interface IsirPollClient {
  pollEvents(idPodnetu?: number): Promise<IsirPollResult>;
}

const CURSOR_KEY = 'isir_last_id';

/** Create the kv table used to persist crawl cursors. Idempotent. */
export function ensureCrawlState(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS crawl_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/** Read the persisted ISIR cursor (idPodnetu). Defaults to 0 (start of feed). */
export function getCursor(db: Database.Database): number {
  const row = db
    .prepare('SELECT value FROM crawl_state WHERE key = ?')
    .get(CURSOR_KEY) as { value: string } | undefined;
  if (!row) return 0;
  const n = Number(row.value);
  return Number.isFinite(n) ? n : 0;
}

/** Persist the ISIR cursor (idPodnetu). */
export function setCursor(db: Database.Database, lastId: number): void {
  db.prepare(
    `INSERT INTO crawl_state (key, value, updatedAt)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = CURRENT_TIMESTAMP`,
  ).run(CURSOR_KEY, String(Math.floor(lastId)));
}

/**
 * Poll one batch of ISIR events starting from the persisted cursor and advance
 * the cursor to the batch's `last_id`. Returns the raw poll result so callers
 * can process/route the events.
 *
 * Incremental + bounded: a single call returns up to ~1000 events (one WS page)
 * with id > the stored cursor. The cursor only ever moves forward, so when the
 * batch is empty (caught up) it is left unchanged.
 */
export async function pollIsirEvents(
  db: Database.Database,
  client: IsirPollClient,
): Promise<IsirPollResult> {
  const cursor = getCursor(db);
  const result = await client.pollEvents(cursor);
  // Never move the cursor backwards (defensive against a quiet/empty page
  // reporting last_id 0).
  const next = Math.max(cursor, result.last_id);
  if (next > cursor) {
    setCursor(db, next);
  }
  return result;
}
