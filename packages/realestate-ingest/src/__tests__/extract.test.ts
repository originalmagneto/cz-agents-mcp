// packages/realestate-ingest/src/__tests__/extract.test.ts
//
// Step 3 of the ISIR Tier-B ingester (see
// docs/superpowers/plans/2026-05-31-isir-tier-b.md, NARROWED v1).
//
// Pure text + okres extraction. Tested against the committed fixtures only —
// no live network / pdftotext / tesseract / Mistral. The text-extraction step
// is runtime-only and injectable; here we feed the recorded .txt files.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  looksLikeMojibake,
  passesContentGate,
  extractKatastrAndObec,
  resolveOkresSlug,
} from '../isir/extract.js';

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`./fixtures/isir/${name}`, import.meta.url)),
    'utf8',
  );
}

const doc535 = fixture('doc-535-prodej-mimo-drazbu-INS43-2024.pdftotext.txt');
const doc1081 = fixture('doc-1081-vyhlaska-o-zpenezeni-INS12503-2024.pdftotext.txt');
const doc335 = fixture('doc-335-drazebni-vyhlaska-INS16194-2023.ocr-ces.txt');
const doc829 = fixture('doc-829-vypis-katastr-INS7918-2025.ocr-ces.txt');

describe('looksLikeMojibake', () => {
  it('is false for clean Czech text (pdftotext doc-535)', () => {
    expect(looksLikeMojibake(doc535)).toBe(false);
  });

  it('is false for clean Czech OCR output (doc-829)', () => {
    expect(looksLikeMojibake(doc829)).toBe(false);
  });

  it('is true for a garbled Identity-H pdftotext dump (no ToUnicode CMap)', () => {
    // Synthetic sample mimicking the real failure mode: glyph soup with almost
    // no Czech/latin letters, mostly control/symbol bytes.
    const garbled =
      '� ﬂﬁ ⌂▒░█ ◊◊◊ ¬¬¬ ‡‡‡ ™™™ ®®®  ';
    expect(looksLikeMojibake(garbled.repeat(40))).toBe(true);
  });
});

describe('passesContentGate', () => {
  it('passes for a real-estate sale doc with cadastre tokens (doc-535)', () => {
    expect(passesContentGate(doc535)).toBe(true);
  });

  it('fails for a movable-property auction (doc-335: sewing machines)', () => {
    expect(passesContentGate(doc335)).toBe(false);
  });

  it('fails for a final-report notice with no property location (doc-1081)', () => {
    expect(passesContentGate(doc1081)).toBe(false);
  });

  it('fails for a negative cadastre extract (doc-829: owns nothing)', () => {
    expect(passesContentGate(doc829)).toBe(false);
  });
});

describe('extractKatastrAndObec', () => {
  it('pulls katastrální území and obec from doc-535 (wrapped across a line)', () => {
    expect(extractKatastrAndObec(doc535)).toEqual({
      katastr: 'Nový Bohumín',
      obec: 'Bohumín',
    });
  });

  it('returns nothing extractable for a movable-property doc (doc-335)', () => {
    const out = extractKatastrAndObec(doc335);
    expect(out.katastr).toBeUndefined();
    expect(out.obec).toBeUndefined();
  });
});

describe('resolveOkresSlug', () => {
  it('resolves via katastrální území (preferred) → okres slug', () => {
    expect(resolveOkresSlug({ katastr: 'Nový Bohumín', obec: 'Bohumín' })).toBe(
      'karvina',
    );
  });

  it('resolves via obec when katastr is absent', () => {
    expect(resolveOkresSlug({ obec: 'Bohumín' })).toBe('karvina');
  });

  it('end-to-end: doc-535 gated text → okresSlug karvina', () => {
    expect(passesContentGate(doc535)).toBe(true);
    const loc = extractKatastrAndObec(doc535);
    expect(resolveOkresSlug(loc)).toBe('karvina');
  });

  it('returns null for unresolvable / empty location', () => {
    expect(resolveOkresSlug({})).toBeNull();
    expect(resolveOkresSlug({ katastr: 'Nonexistent KÚ', obec: 'Nowhere' })).toBeNull();
  });
});
