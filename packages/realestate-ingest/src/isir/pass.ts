// packages/realestate-ingest/src/isir/pass.ts
//
// Step 6 of the ISIR Tier-B ingester (see
// docs/superpowers/plans/2026-05-31-isir-tier-b.md, NARROWED v1).
//
// Orchestration glue that runs ONE bounded ISIR pass and is invoked from
// cli.ts after the portál dražeb pass. Wires the pure Step 1–5 pieces together:
//
//   poll (cursor-incremental, bounded by maxEvents)
//     → filter (isReSaleEvent: 535/1028 outright, 335/1081 gated)
//       → fetchEventText (injected; runtime = download + hybrid extract)
//         → content gate (passesContentGate: drop movables / negative cadastre)
//           → extract k.ú./obec → resolveOkresSlug (skip if unresolvable)
//             → isirEventToLead → upsertLeads (sourceType 'isir')
//
// The two side-effecting dependencies — the SOAP poll client and the
// text-extraction step — are injected, so this orchestrator is unit-tested
// against the committed fixtures with no live network / pdftotext / tesseract /
// Mistral. The cli.ts call site supplies the real implementations and guards
// the whole pass in try/catch so an ISIR failure never corrupts seeds/auctions.
import type Database from 'better-sqlite3';
import { ensureCrawlState, pollIsirEvents, type IsirEventLike, type IsirPollClient } from './poll.js';
import { isReSaleEvent } from './filter.js';
import {
  passesContentGate,
  extractKatastrAndObec,
  resolveOkresSlug,
} from './extract.js';
import { isirEventToLead } from './lead.js';
import { upsertLeads } from '../upsert.js';

/** Default per-run event budget (the WS is a firehose; keep runs bounded). */
export const DEFAULT_MAX_EVENTS = 500;

/** Fetch the already-extracted text for one event's document. Injected. */
export type FetchEventText = (event: IsirEventLike) => Promise<string>;

export interface RunIsirPassOptions {
  /** Injected SOAP poll client (real IsirClient or a fixture replayer). */
  client: IsirPollClient;
  /** Injected text extractor (real download+hybrid, or fixture replayer). */
  fetchEventText: FetchEventText;
  /** Ingest timestamp. */
  nowIso: string;
  /** Max events to process this run (default DEFAULT_MAX_EVENTS). */
  maxEvents?: number;
}

export interface IsirPassResult {
  /** Events fetched from the poll (post-cursor). */
  polled: number;
  /** Events actually considered this run (≤ maxEvents). */
  considered: number;
  /** Leads written (gated + okres-resolved). */
  upserted: number;
}

/**
 * Run one bounded ISIR pass and upsert the real-estate-sale leads it finds.
 *
 * Robustness: a single event's document fetch / parse failure is swallowed so
 * one bad PDF never aborts the batch; unresolvable okres → skip (never guess).
 * The poll cursor is advanced by `pollIsirEvents` regardless, so the next run
 * continues forward even if individual docs were skipped.
 */
export async function runIsirPass(
  db: Database.Database,
  opts: RunIsirPassOptions,
): Promise<IsirPassResult> {
  const maxEvents = opts.maxEvents ?? DEFAULT_MAX_EVENTS;
  ensureCrawlState(db);

  const poll = await pollIsirEvents(db, opts.client);
  const batch = poll.events.slice(0, Math.max(0, maxEvents));

  const leads = [];
  for (const event of batch) {
    const verdict = isReSaleEvent(event);
    if (verdict === false) continue;

    // verdict is true (535/1028) or 'needs_gate' (335/1081). Both must clear
    // the content gate AND resolve to an okres before we write a lead.
    let lead;
    try {
      const text = await opts.fetchEventText(event);
      if (!passesContentGate(text)) continue;
      const okresSlug = resolveOkresSlug(extractKatastrAndObec(text));
      if (!okresSlug) continue; // log+skip; never guess
      lead = isirEventToLead(event, okresSlug, opts.nowIso);
    } catch {
      // One failing document must not abort the batch.
      continue;
    }
    leads.push(lead);
  }

  if (leads.length > 0) {
    upsertLeads(db, leads);
  }

  return {
    polled: poll.events.length,
    considered: batch.length,
    upserted: leads.length,
  };
}
