// packages/realestate-ingest/src/__tests__/isirPass.test.ts
//
// Step 6 — ISIR pass orchestration (poll → filter → fetchText → gate →
// resolve okres → upsert), bounded per run. The poll client and the text
// fetcher are injected so this exercises the PURE orchestration against the
// committed fixtures with NO live WS / pdftotext / tesseract / Mistral.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { ensureSchema } from '../schema.js';
import { runIsirPass } from '../isir/pass.js';
import type { IsirEventLike, IsirPollResult } from '../isir/poll.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string =>
  readFileSync(join(here, 'fixtures', 'isir', name), 'utf8');

const events = JSON.parse(
  fixture('event-batch.sample.json'),
) as IsirEventLike[];

// Map a fixture event's dokument_url → the recorded extracted text, by
// matching on spisová značka (the fixtures are named by INS number).
const TEXT_BY_ZNACKA: Record<string, string> = {
  'INS 43/2024': fixture('doc-535-prodej-mimo-drazbu-INS43-2024.pdftotext.txt'),
  'INS 12503/2024': fixture('doc-1081-vyhlaska-o-zpenezeni-INS12503-2024.pdftotext.txt'),
  'INS 16194/2023': fixture('doc-335-drazebni-vyhlaska-INS16194-2023.ocr-ces.txt'),
  'INS 7918/2025': fixture('doc-829-vypis-katastr-INS7918-2025.ocr-ces.txt'),
};

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  ensureSchema(db);
  return db;
}

/** Poll client replaying the committed event batch in one page. */
function fakePollClient(batch: IsirEventLike[]) {
  return {
    async pollEvents(idPodnetu = 0): Promise<IsirPollResult> {
      const fresh = batch.filter((e) => e.id > idPodnetu);
      const lastId = fresh.reduce((m, e) => Math.max(m, e.id), idPodnetu);
      return { events: fresh, last_id: lastId, status: 'OK' as const };
    },
  };
}

/** fetchText replayer keyed by spisová značka; throws for unknown docs. */
async function fakeFetchText(ev: IsirEventLike): Promise<string> {
  const t = TEXT_BY_ZNACKA[ev.spisova_znacka];
  if (t == null) throw new Error(`no fixture text for ${ev.spisova_znacka}`);
  return t;
}

describe('runIsirPass', () => {
  it('writes exactly one isir lead (doc-535 → okres karvina) from the batch', async () => {
    const db = makeDb();
    const res = await runIsirPass(db, {
      client: fakePollClient(events),
      fetchEventText: fakeFetchText,
      nowIso: '2030-01-01T00:00:00.000Z',
    });

    const rows = db
      .prepare("SELECT id, okresSlug, spisovaZnacka FROM RealEstateLead WHERE sourceType='isir'")
      .all() as { id: string; okresSlug: string; spisovaZnacka: string }[];

    expect(rows).toHaveLength(1);
    expect(rows[0].okresSlug).toBe('karvina');
    expect(rows[0].id).toBe('isir:INS 43/2024');
    expect(res.upserted).toBe(1);
    db.close();
  });

  it('advances the crawl cursor to the batch last_id', async () => {
    const db = makeDb();
    await runIsirPass(db, {
      client: fakePollClient(events),
      fetchEventText: fakeFetchText,
      nowIso: '2030-01-01T00:00:00.000Z',
    });
    const maxId = events.reduce((m, e) => Math.max(m, e.id), 0);
    const cur = db.prepare("SELECT value FROM crawl_state WHERE key='isir_last_id'").get() as
      | { value: string }
      | undefined;
    expect(Number(cur?.value)).toBe(maxId);
    db.close();
  });

  it('respects maxEvents (processes at most N events, skips the rest)', async () => {
    const db = makeDb();
    // Only the first event (typ 1081, fails gate) is considered → no leads.
    const res = await runIsirPass(db, {
      client: fakePollClient(events),
      fetchEventText: fakeFetchText,
      nowIso: '2030-01-01T00:00:00.000Z',
      maxEvents: 1,
    });
    expect(res.considered).toBe(1);
    expect(res.upserted).toBe(0);
    db.close();
  });

  it('does not throw when an event document fetch fails (best-effort)', async () => {
    const db = makeDb();
    const res = await runIsirPass(db, {
      client: fakePollClient(events),
      // every fetch throws
      fetchEventText: async () => {
        throw new Error('network down');
      },
      nowIso: '2030-01-01T00:00:00.000Z',
    });
    expect(res.upserted).toBe(0);
    expect(
      (db.prepare("SELECT COUNT(*) c FROM RealEstateLead WHERE sourceType='isir'").get() as { c: number })
        .c,
    ).toBe(0);
    db.close();
  });
});
