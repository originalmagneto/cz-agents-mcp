// packages/realestate-ingest/src/isir/runtime.ts
//
// Runtime-only wiring for the ISIR pass (NOT imported by any unit test — it
// pulls in the live SOAP client and the shell/HTTP text extractors). cli.ts
// uses this to build the two injected dependencies `runIsirPass` needs and
// then runs the pass against the same webapp.db.
//
// Kept separate from pass.ts so the orchestration stays unit-testable with
// fixture replayers, while the heavy live deps live here.
import type Database from 'better-sqlite3';
import { IsirClient } from '@czagents/isir';
import { runIsirPass, type IsirPassResult } from './pass.js';
import { fetchText } from './fetchText.js';
import type { IsirEventLike, IsirPollClient } from './poll.js';

/**
 * Live `fetchEventText`: download the event's document and run the in-container
 * hybrid extraction (pdftotext → tesseract -l ces → optional Mistral OCR).
 * Events without a document URL yield empty text (→ gate fails → skipped).
 */
async function liveFetchEventText(event: IsirEventLike): Promise<string> {
  if (!event.dokument_url) return '';
  const { text } = await fetchText(event.dokument_url);
  return text;
}

/**
 * Build the live ISIR poll client. The real `IsirClient` satisfies the
 * structural `IsirPollClient` (it exposes `pollEvents`). It is stub-by-default
 * unless `ISIR_SOAP_ENABLED` is set, so production wiring must enable it.
 */
function liveClient(): IsirPollClient {
  return new IsirClient() as unknown as IsirPollClient;
}

/**
 * Runtime entry point used by cli.ts. Wires the live client + extractor into
 * the pure orchestrator. Caller is responsible for the try/catch guard so an
 * ISIR failure never corrupts seeds/auctions.
 */
export async function runIsirPassLive(
  db: Database.Database,
  nowIso: string,
  maxEvents?: number,
): Promise<IsirPassResult> {
  return runIsirPass(db, {
    client: liveClient(),
    fetchEventText: liveFetchEventText,
    nowIso,
    maxEvents,
  });
}
