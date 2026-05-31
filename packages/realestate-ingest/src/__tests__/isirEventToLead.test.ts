// packages/realestate-ingest/src/__tests__/isirEventToLead.test.ts
//
// Step 5 of the ISIR Tier-B ingester (see
// docs/superpowers/plans/2026-05-31-isir-tier-b.md, NARROWED v1).
//
// PURE mapping from a gated+resolved ISIR event to a RealEstateLead row. The
// upstream cursor/filter/extract steps have already decided this is a real
// estate sale and resolved its okresSlug; this step only builds the row with a
// stable id and persists via the shared upsertLeads.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { ensureSchema } from '../schema.js';
import { upsertLeads } from '../upsert.js';
import { isirEventToLead } from '../isir/lead.js';
import type { IsirEventLike } from '../isir/poll.js';

function ev(overrides: Partial<IsirEventLike> = {}): IsirEventLike {
  return {
    id: 70000220,
    datum_zalozeni: '2025-04-23T13:37:07.000+02:00',
    datum_zverejneni: '2025-04-23T13:37:06.000+02:00',
    spisova_znacka: 'INS 12503/2024',
    typ_udalosti: '535',
    popis_udalosti: 'Usnesení o prodeji mimo dražbu',
    dokument_url: 'https://isir.justice.cz:8443/isir_public_ws/doc/Document?idDokument=70355048',
    ...overrides,
  };
}

const NOW = '2026-05-31T00:00:00.000Z';

describe('isirEventToLead', () => {
  it('builds a stable id of isir:<spisovaZnacka> and sets sourceType isir', () => {
    const lead = isirEventToLead(ev(), 'praha-vychod', NOW);
    expect(lead.id).toBe('isir:INS 12503/2024');
    expect(lead.sourceType).toBe('isir');
  });

  it('maps okresSlug, spisovaZnacka, dokumentUrl, status and ingestedAt', () => {
    const lead = isirEventToLead(ev(), 'praha-vychod', NOW);
    expect(lead.okresSlug).toBe('praha-vychod');
    expect(lead.spisovaZnacka).toBe('INS 12503/2024');
    expect(lead.dokumentUrl).toBe(
      'https://isir.justice.cz:8443/isir_public_ws/doc/Document?idDokument=70355048',
    );
    expect(lead.status).toBe('pending_vision');
    expect(lead.ingestedAt).toBe(NOW);
  });

  it('produces the same id for the same spisovaZnacka regardless of nowIso', () => {
    const a = isirEventToLead(ev(), 'praha-vychod', '2026-05-31T00:00:00.000Z');
    const b = isirEventToLead(ev(), 'praha-vychod', '2026-06-01T00:00:00.000Z');
    expect(a.id).toBe(b.id);
  });

  it('uses an empty string when the event has no dokument_url', () => {
    const lead = isirEventToLead(ev({ dokument_url: undefined }), 'praha-vychod', NOW);
    expect(lead.dokumentUrl).toBe('');
  });

  it('upserts without duplicating on re-ingest of the same spisovaZnacka', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    upsertLeads(db, [isirEventToLead(ev(), 'praha-vychod', '2026-05-31T00:00:00.000Z')]);
    upsertLeads(db, [isirEventToLead(ev(), 'praha-vychod', '2026-06-01T00:00:00.000Z')]);
    const rows = db
      .prepare("SELECT id, ingestedAt, sourceType, okresSlug FROM RealEstateLead")
      .all() as Array<{ id: string; ingestedAt: string; sourceType: string; okresSlug: string }>;
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe('isir:INS 12503/2024');
    expect(rows[0].sourceType).toBe('isir');
    expect(rows[0].okresSlug).toBe('praha-vychod');
    expect(rows[0].ingestedAt).toBe('2026-06-01T00:00:00.000Z');
    db.close();
  });
});
