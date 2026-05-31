// packages/realestate-ingest/src/__tests__/filter.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isReSaleEvent } from '../isir/filter.js';
import type { IsirEventLike } from '../isir/poll.js';

const FIXTURE = fileURLToPath(
  new URL('./fixtures/isir/event-batch.sample.json', import.meta.url),
);
const BATCH = JSON.parse(readFileSync(FIXTURE, 'utf8')) as IsirEventLike[];

function ev(typ: string, popis = 'x'): IsirEventLike {
  return {
    id: 1,
    datum_zalozeni: '2025-01-01',
    datum_zverejneni: '2025-01-01',
    spisova_znacka: 'INS 1/2025',
    typ_udalosti: typ,
    popis_udalosti: popis,
  };
}

describe('isReSaleEvent', () => {
  it('returns true for type 535 (Usnesení o prodeji mimo dražbu)', () => {
    expect(isReSaleEvent(ev('535'))).toBe(true);
  });

  it('returns true for type 1028 (Smlouva o prodeji mimo dražbu)', () => {
    expect(isReSaleEvent(ev('1028'))).toBe(true);
  });

  it("returns 'needs_gate' for type 335 (Dražební vyhláška)", () => {
    expect(isReSaleEvent(ev('335'))).toBe('needs_gate');
  });

  it("returns 'needs_gate' for type 1081 (Vyhláška o zpeněžení)", () => {
    expect(isReSaleEvent(ev('1081'))).toBe('needs_gate');
  });

  it('returns false for unrelated type 50 (Zpráva o průběhu zpeněžení)', () => {
    expect(isReSaleEvent(ev('50'))).toBe(false);
  });

  it('returns false for type 829 (Výpis z katastru nemovitostí)', () => {
    expect(isReSaleEvent(ev('829'))).toBe(false);
  });

  it("returns false for a synthetic 'Insolvenční návrh'", () => {
    expect(isReSaleEvent(ev('1', 'Insolvenční návrh'))).toBe(false);
  });

  it('classifies every event in the recorded fixture batch', () => {
    for (const e of BATCH) {
      const r = isReSaleEvent(e);
      if (e.typ_udalosti === '535' || e.typ_udalosti === '1028') {
        expect(r).toBe(true);
      } else if (e.typ_udalosti === '335' || e.typ_udalosti === '1081') {
        expect(r).toBe('needs_gate');
      } else {
        expect(r).toBe(false);
      }
    }
  });
});
