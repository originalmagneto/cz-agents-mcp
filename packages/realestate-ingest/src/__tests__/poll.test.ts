// packages/realestate-ingest/src/__tests__/poll.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import {
  ensureCrawlState,
  getCursor,
  setCursor,
  pollIsirEvents,
  type IsirEventLike,
  type IsirPollClient,
} from '../isir/poll.js';

const FIXTURE = fileURLToPath(
  new URL('./fixtures/isir/event-batch.sample.json', import.meta.url),
);
const BATCH = JSON.parse(readFileSync(FIXTURE, 'utf8')) as IsirEventLike[];

/** Stub client that replays the recorded fixture batch — no network/WS. */
function fixtureClient(batch: IsirEventLike[]): IsirPollClient {
  const calls: number[] = [];
  return {
    calls,
    async pollEvents(idPodnetu: number) {
      calls.push(idPodnetu);
      // Mimic the real WS: only return events with id > idPodnetu.
      const events = batch.filter((e) => e.id > idPodnetu);
      const last_id = events.reduce(
        (m, e) => (e.id > m ? e.id : m),
        idPodnetu,
      );
      return { events, last_id, status: 'OK' as const };
    },
  } as IsirPollClient & { calls: number[] };
}

describe('crawl_state kv table', () => {
  it('ensureCrawlState creates table; getCursor defaults to 0', () => {
    const db = new Database(':memory:');
    ensureCrawlState(db);
    expect(getCursor(db)).toBe(0);
    db.close();
  });

  it('setCursor persists and getCursor reads it back', () => {
    const db = new Database(':memory:');
    ensureCrawlState(db);
    setCursor(db, 12345);
    expect(getCursor(db)).toBe(12345);
    db.close();
  });

  it('uses key isir_last_id in crawl_state', () => {
    const db = new Database(':memory:');
    ensureCrawlState(db);
    setCursor(db, 99);
    const row = db
      .prepare("SELECT value FROM crawl_state WHERE key='isir_last_id'")
      .get() as { value: string };
    expect(Number(row.value)).toBe(99);
    db.close();
  });
});

describe('pollIsirEvents', () => {
  it('returns parsed events from the fixture batch', async () => {
    const db = new Database(':memory:');
    ensureCrawlState(db);
    const client = fixtureClient(BATCH);
    const res = await pollIsirEvents(db, client);
    expect(res.events.length).toBe(BATCH.length);
    expect(res.events[0].spisova_znacka).toBe('INS 12503/2024');
    db.close();
  });

  it('advances the stored cursor to last_id', async () => {
    const db = new Database(':memory:');
    ensureCrawlState(db);
    const client = fixtureClient(BATCH);
    const maxId = Math.max(...BATCH.map((e) => e.id)); // 70021629
    const res = await pollIsirEvents(db, client);
    expect(res.last_id).toBe(maxId);
    expect(getCursor(db)).toBe(maxId);
    db.close();
  });

  it('starts from the persisted cursor (incremental)', async () => {
    const db = new Database(':memory:');
    ensureCrawlState(db);
    setCursor(db, 70001701); // already seen up to the 535 event
    const client = fixtureClient(BATCH) as IsirPollClient & { calls: number[] };
    const res = await pollIsirEvents(db, client);
    expect(client.calls[0]).toBe(70001701);
    // only events with id > cursor come back
    expect(res.events.every((e) => e.id > 70001701)).toBe(true);
    expect(res.events.length).toBeLessThan(BATCH.length);
    db.close();
  });

  it('leaves cursor unchanged when no new events', async () => {
    const db = new Database(':memory:');
    ensureCrawlState(db);
    const maxId = Math.max(...BATCH.map((e) => e.id));
    setCursor(db, maxId);
    const client = fixtureClient(BATCH);
    const res = await pollIsirEvents(db, client);
    expect(res.events.length).toBe(0);
    expect(getCursor(db)).toBe(maxId);
    db.close();
  });
});
