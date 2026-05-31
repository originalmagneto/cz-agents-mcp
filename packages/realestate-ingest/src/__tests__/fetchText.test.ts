// packages/realestate-ingest/src/__tests__/fetchText.test.ts
//
// Step 4 of the ISIR Tier-B ingester (see
// docs/superpowers/plans/2026-05-31-isir-tier-b.md, NARROWED v1).
//
// The runtime text-extraction *orchestrator*. The real extractors shell out to
// pdftotext / pdftoppm+tesseract / Mistral OCR and are runtime-only — they are
// NEVER invoked in tests. Here we unit-test the PURE chooser (`chooseText`):
// given injected extractor fns, it must try them in order and stop at the first
// that yields good (non-mojibake, non-empty) text, falling through otherwise.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chooseText } from '../isir/fetchText.js';

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`./fixtures/isir/${name}`, import.meta.url)),
    'utf8',
  );
}

const cleanText = fixture('doc-535-prodej-mimo-drazbu-INS43-2024.pdftotext.txt');
// Glyph soup with almost no Czech/latin letters → looksLikeMojibake === true.
const garbled = '� ﬂﬁ ⌂▒░█ ◊◊◊ ¬¬¬ '.repeat(40);

// A dummy PDF buffer; the chooser never inspects bytes, it only routes between
// the injected extractors.
const pdf = Buffer.from('%PDF-1.4 dummy');

describe('chooseText (pure orchestrator)', () => {
  it('returns pdftotext output and skips OCR when it is clean', async () => {
    const pdftotext = vi.fn().mockResolvedValue(cleanText);
    const tesseract = vi.fn().mockResolvedValue('should not run');
    const mistral = vi.fn().mockResolvedValue('should not run');

    const out = await chooseText(pdf, { pdftotext, tesseract, mistral });

    expect(out.text).toBe(cleanText);
    expect(out.method).toBe('pdftotext');
    expect(pdftotext).toHaveBeenCalledOnce();
    expect(tesseract).not.toHaveBeenCalled();
    expect(mistral).not.toHaveBeenCalled();
  });

  it('falls back to tesseract when pdftotext is mojibake/empty', async () => {
    const pdftotext = vi.fn().mockResolvedValue(garbled);
    const tesseract = vi.fn().mockResolvedValue(cleanText);
    const mistral = vi.fn().mockResolvedValue('should not run');

    const out = await chooseText(pdf, { pdftotext, tesseract, mistral });

    expect(out.text).toBe(cleanText);
    expect(out.method).toBe('tesseract');
    expect(pdftotext).toHaveBeenCalledOnce();
    expect(tesseract).toHaveBeenCalledOnce();
    expect(mistral).not.toHaveBeenCalled();
  });

  it('falls back to Mistral only when set AND tesseract is still bad', async () => {
    const pdftotext = vi.fn().mockResolvedValue('');
    const tesseract = vi.fn().mockResolvedValue(garbled);
    const mistral = vi.fn().mockResolvedValue(cleanText);

    const out = await chooseText(pdf, { pdftotext, tesseract, mistral });

    expect(out.text).toBe(cleanText);
    expect(out.method).toBe('mistral');
    expect(pdftotext).toHaveBeenCalledOnce();
    expect(tesseract).toHaveBeenCalledOnce();
    expect(mistral).toHaveBeenCalledOnce();
  });

  it('does NOT call Mistral when the extractor is absent (no API key)', async () => {
    const pdftotext = vi.fn().mockResolvedValue('');
    const tesseract = vi.fn().mockResolvedValue(garbled);

    const out = await chooseText(pdf, { pdftotext, tesseract });

    // No good text anywhere; returns the best (last) attempt, method 'tesseract'.
    expect(out.text).toBe(garbled);
    expect(out.method).toBe('tesseract');
    expect(pdftotext).toHaveBeenCalledOnce();
    expect(tesseract).toHaveBeenCalledOnce();
  });

  it('tolerates a throwing extractor and continues to the next', async () => {
    const pdftotext = vi.fn().mockRejectedValue(new Error('pdftotext: exit 1'));
    const tesseract = vi.fn().mockResolvedValue(cleanText);
    const mistral = vi.fn().mockResolvedValue('should not run');

    const out = await chooseText(pdf, { pdftotext, tesseract, mistral });

    expect(out.text).toBe(cleanText);
    expect(out.method).toBe('tesseract');
    expect(tesseract).toHaveBeenCalledOnce();
    expect(mistral).not.toHaveBeenCalled();
  });

  it('returns empty text + method "none" when every extractor fails', async () => {
    const pdftotext = vi.fn().mockRejectedValue(new Error('boom'));
    const tesseract = vi.fn().mockRejectedValue(new Error('boom'));
    const mistral = vi.fn().mockRejectedValue(new Error('boom'));

    const out = await chooseText(pdf, { pdftotext, tesseract, mistral });

    expect(out.text).toBe('');
    expect(out.method).toBe('none');
  });
});
