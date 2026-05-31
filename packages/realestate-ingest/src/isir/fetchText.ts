// packages/realestate-ingest/src/isir/fetchText.ts
//
// Step 4 of the ISIR Tier-B ingester (see
// docs/superpowers/plans/2026-05-31-isir-tier-b.md, NARROWED v1).
//
// Runtime text-extraction orchestrator for an ISIR vyhláška PDF. The actual
// extraction shells out to external binaries (pdftotext, pdftoppm+tesseract)
// and an optional HTTP OCR (Mistral) — none of which run in unit tests. The
// PURE routing logic (`chooseText`) is therefore separated from the shell/HTTP
// extractors and is the only thing exercised by fetchText.test.ts.
//
// Extraction hybrid, in priority order:
//   1. pdftotext (poppler-utils) — clean, text-layer PDFs.
//   2. tesseract -l ces on pages rasterized via pdftoppm — for Identity-H /
//      scanned PDFs where pdftotext emits mojibake or nothing.
//   3. Mistral OCR API (PDF → markdown) — best-effort, ONLY if MISTRAL_API_KEY
//      is set. Never hard-required.
// PDF-Portfolio (a wrapper PDF whose payload is one or more embedded PDFs) is
// flattened with `pdfdetach -saveall` before any of the above.
//
// The pure logic stops at the first extractor whose output is "good"
// (non-empty, not mojibake per the Step-3 heuristic). Extractor errors are
// swallowed so a single failing tool never aborts the run.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { looksLikeMojibake } from './extract.js';

const execFileAsync = promisify(execFile);

/** A single text extractor: PDF bytes → extracted text (may throw). */
export type Extractor = (pdf: Buffer) => Promise<string>;

/** The extractors the chooser routes between. `mistral` is optional. */
export interface Extractors {
  pdftotext: Extractor;
  tesseract: Extractor;
  mistral?: Extractor;
}

export type ExtractionMethod = 'pdftotext' | 'tesseract' | 'mistral' | 'none';

export interface ChosenText {
  text: string;
  method: ExtractionMethod;
}

/** Good text = non-empty after trim and not mojibake (Step-3 heuristic). */
function isGood(text: string): boolean {
  return text.trim().length > 0 && !looksLikeMojibake(text);
}

/**
 * PURE orchestrator. Runs the injected extractors in priority order
 * (pdftotext → tesseract → mistral), returning the first whose output passes
 * the quality gate. If none is good, returns the best non-empty attempt seen
 * (last extractor wins, matching the runtime "OCR is most likely closest"
 * preference); if every extractor is empty or throws, returns
 * `{ text: '', method: 'none' }`. A throwing extractor is treated as "no
 * output" and the chooser moves on. The `mistral` step is skipped entirely
 * when no extractor was injected (i.e. MISTRAL_API_KEY unset at wiring time).
 *
 * No I/O, no shell, no network: every external effect is in the injected fns,
 * so this is fully unit-testable with mocked extractors.
 */
export async function chooseText(
  pdf: Buffer,
  extractors: Extractors,
): Promise<ChosenText> {
  const steps: { method: Exclude<ExtractionMethod, 'none'>; fn?: Extractor }[] = [
    { method: 'pdftotext', fn: extractors.pdftotext },
    { method: 'tesseract', fn: extractors.tesseract },
    { method: 'mistral', fn: extractors.mistral },
  ];

  let fallback: ChosenText = { text: '', method: 'none' };

  for (const step of steps) {
    if (!step.fn) continue; // e.g. mistral absent (no API key)
    let out: string;
    try {
      out = await step.fn(pdf);
    } catch {
      continue; // tool failed; try the next one
    }
    if (isGood(out)) {
      return { text: out, method: step.method };
    }
    // Keep the latest non-empty (but imperfect) attempt as a best-effort
    // fallback so we still return *something* when nothing passes the gate.
    if (out.trim().length > 0) {
      fallback = { text: out, method: step.method };
    }
  }

  return fallback;
}

// ───────────────────────── runtime wiring (not unit-tested) ─────────────────────────

/**
 * Download a document URL to a Buffer. Thin wrapper over global fetch so the
 * caller can pass a custom impl in integration tests if ever needed.
 */
export async function downloadPdf(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Buffer> {
  const resp = await fetchImpl(url);
  if (!resp.ok) {
    throw new Error(`download failed: ${resp.status} ${resp.statusText} (${url})`);
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  return buf;
}

/**
 * If `pdf` is a PDF-Portfolio (a collection PDF wrapping embedded PDFs),
 * extract the embedded files with `pdfdetach -saveall` and return the first
 * embedded PDF's bytes; otherwise return the input unchanged. Best-effort: any
 * failure (not a portfolio, pdfdetach missing) returns the original buffer.
 */
export async function flattenPortfolio(pdf: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'isir-portfolio-'));
  try {
    const src = join(dir, 'in.pdf');
    await writeFile(src, pdf);
    // -saveall dumps every embedded file into the cwd of the output dir.
    await execFileAsync('pdfdetach', ['-saveall', '-o', dir, src], {
      cwd: dir,
    });
    const entries = await readdir(dir);
    const embedded = entries
      .filter((f) => f !== 'in.pdf' && f.toLowerCase().endsWith('.pdf'))
      .sort();
    const first = embedded[0];
    if (!first) return pdf;
    return await readFile(join(dir, first));
  } catch {
    return pdf; // not a portfolio / pdfdetach unavailable → use original
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** pdftotext extractor: writes bytes to a temp file and reads UTF-8 text. */
export const pdftotextExtractor: Extractor = async (pdf) => {
  const dir = await mkdtemp(join(tmpdir(), 'isir-pdftotext-'));
  try {
    const src = join(dir, 'in.pdf');
    await writeFile(src, pdf);
    // `-` ⇒ write text to stdout; `-enc UTF-8` for Czech diacritics.
    const { stdout } = await execFileAsync(
      'pdftotext',
      ['-enc', 'UTF-8', src, '-'],
      { maxBuffer: 32 * 1024 * 1024 },
    );
    return stdout;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/**
 * tesseract extractor: rasterizes the PDF to PNGs with `pdftoppm`, OCRs each
 * page with `tesseract -l ces`, and concatenates the page texts.
 */
export const tesseractExtractor: Extractor = async (pdf) => {
  const dir = await mkdtemp(join(tmpdir(), 'isir-tesseract-'));
  try {
    const src = join(dir, 'in.pdf');
    await writeFile(src, pdf);
    // Rasterize → page-1.png, page-2.png, …  (150 DPI is enough for OCR).
    await execFileAsync('pdftoppm', ['-r', '150', '-png', src, join(dir, 'page')]);
    const pages = (await readdir(dir))
      .filter((f) => f.startsWith('page') && f.endsWith('.png'))
      .sort();
    const texts: string[] = [];
    for (const page of pages) {
      // `stdout` ⇒ tesseract writes recognized text to stdout.
      const { stdout } = await execFileAsync(
        'tesseract',
        ['-l', 'ces', join(dir, page), 'stdout'],
        { maxBuffer: 32 * 1024 * 1024 },
      );
      texts.push(stdout);
    }
    return texts.join('\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/**
 * Mistral OCR extractor (PDF → markdown). Best-effort; only wired when
 * MISTRAL_API_KEY is present. Uploads the document inline (base64 data URI) to
 * the OCR endpoint and concatenates the per-page markdown.
 */
export function makeMistralExtractor(apiKey: string): Extractor {
  return async (pdf) => {
    const resp = await fetch('https://api.mistral.ai/v1/ocr', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-ocr-latest',
        document: {
          type: 'document_url',
          document_url: `data:application/pdf;base64,${pdf.toString('base64')}`,
        },
      }),
    });
    if (!resp.ok) {
      throw new Error(`Mistral OCR failed: ${resp.status} ${resp.statusText}`);
    }
    const json = (await resp.json()) as {
      pages?: { markdown?: string }[];
    };
    return (json.pages ?? []).map((p) => p.markdown ?? '').join('\n');
  };
}

/**
 * Runtime entry point: download the document, flatten any PDF-Portfolio, then
 * run the hybrid extraction chooser. Builds the real (shell/HTTP-backed)
 * extractors and wires Mistral only when MISTRAL_API_KEY is set. Returns the
 * best text plus the method used. A hard download failure throws (it happens
 * outside the chooser); per-extractor failures are swallowed by `chooseText`.
 */
export async function fetchText(
  dokumentUrl: string,
  opts: { fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv } = {},
): Promise<ChosenText> {
  const env = opts.env ?? process.env;
  const raw = await downloadPdf(dokumentUrl, opts.fetchImpl);
  const pdf = await flattenPortfolio(raw);

  const extractors: Extractors = {
    pdftotext: pdftotextExtractor,
    tesseract: tesseractExtractor,
    mistral: env.MISTRAL_API_KEY
      ? makeMistralExtractor(env.MISTRAL_API_KEY)
      : undefined,
  };

  return chooseText(pdf, extractors);
}
