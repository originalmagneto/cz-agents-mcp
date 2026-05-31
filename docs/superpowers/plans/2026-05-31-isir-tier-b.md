# ISIR Tier B — real insolvency_count for realestate — Implementation Plan

> Builds on the ISIR v1.1 spec (`docs/superpowers/specs/2026-05-31-isir-v1.1-design.md`). Tier A was rejected (portál dražeb is execution-only). This is the real ISIR pipeline. **Effort: multi-day, fragile** — recommend executing as a focused dedicated session, not inline.

**Goal:** Populate `RealEstateLead` rows with `sourceType='isir'` + resolved `okresSlug`, so `get_district_aggregate.insolvency_count` reflects real insolvency-driven real-estate sales per okres.

## Recon findings (2026-05-31, live)
- ISIR PublicWS event feed works; events carry `spisova_znacka`, `typ_udalosti` (numeric code), `popis_udalosti`, `dokument_url`, `poznamka` (XML). **No okres, no IČO** on the event.
- The deployed `poll_isir_events` MCP tool returns only a **summary (first_3)** — it is a monitoring tool, NOT a bulk feed. → the ingester must call the **ISIR SOAP WS directly** by reusing `packages/isir/src/client.ts` `IsirClient.pollEvents(idPodnetu)` (full events), not the MCP.
- Event type seen: `185 = "Vyhláška o zahájení insolvenčního řízení"`. The dražba event type code (e.g. "Dražební vyhláška" / "Usnesení o nařízení dražby nemovité věci") must be pinned by sampling (see Task 1).
- Okres is NOT in the event → must come from the **document** (dražební vyhláška names the katastrální území / obec) or the `poznamka` XML. Then map katastrální území/obec → okres via a **ČÚZK RÚIAN číselník** (public dataset: obce/k.ú. → okres).

## Architecture
Extend `@czagents/realestate-ingest` with an ISIR module that runs in the same ingest container/cron:
1. **Event poll** — reuse `IsirClient.pollEvents`, persist a cursor (`RealEstateCrawlState`-style row or a small kv in webapp.db) so each run continues from `last_id`.
2. **Filter** — keep only RE-dražba event types (pinned in Task 1) — by `typ_udalosti` code + `popis_udalosti` regex ("dražební vyhláška", "nemovit", "zpeněžení").
3. **Resolve okres** — for each kept event:
   - (a) parse `poznamka` XML for structured location if present; else
   - (b) fetch `dokument_url` (PDF) → extract text → regex for "katastrální území <X>" / "obec <Y>" / PSČ.
   - map the extracted k.ú./obec/PSČ → okres via a bundled **RÚIAN k.ú.→okres lookup** (downloaded once, stored as a data module or small sqlite table).
4. **Upsert** — `RealEstateLead` with `sourceType='isir'`, `okresSlug`, `spisovaZnacka`, `dokumentUrl`, `ingestedAt`, `status`. Reuse the existing `upsertLeads`.
5. **Archive** — reuse `archiveStale` (events older than the longest window).

## Tasks (high level — each TDD where logic is pure)
1. **Recon/pin** — sample the live ISIR feed (direct WS) to identify the exact `typ_udalosti` code(s) + `popis_udalosti` strings for real-estate dražba, and inspect 2–3 real dražební-vyhláška documents to confirm k.ú./obec is extractable + in what format. Record fixtures.
2. **RÚIAN k.ú.→okres dataset** — download the ČÚZK/RÚIAN číselník (obce + katastrální území with okres), reduce to a `cz-okres-lookup` data module (k.ú. name/code → okresSlug). TDD: lookup("Moravská Ostrava") → "ostrava-mesto".
3. **Event poll + cursor** — wrap `IsirClient.pollEvents`; store/advance cursor in webapp.db. TDD with a recorded event batch fixture.
4. **Filter** — `isReDrazbaEvent(event)` pure predicate. TDD: dražba event → true, "Insolvenční návrh" → false.
5. **Document okres extraction** — `extractKatastr(text)` + `resolveOkres(katastr)`; PDF text via `pdf-parse` (or the WS doc XML if structured). TDD on recorded document text fixtures.
6. **ISIR → leads** — `isirEventToLead(event, okresSlug, now)` → LeadRow with sourceType='isir'. TDD.
7. **Wire into CLI** — run ISIR pass after the portál dražeb pass in `cli.ts`; same DB, same upsert/archive.
8. **Deploy + verify** — push → **UI Deploy** (not CLI redeploy — git-fetch gotcha) → run ingest schedule → verify `insolvency_count > 0` for an okres with known insolvency dražby; spot-check okres correctness against a couple of real proceedings.

## Risks / honest caveats
- **Okres accuracy** depends on document parsing; vyhlášky vary in format → coverage is partial; log unparseable docs rather than guessing.
- **PDF parsing** is the fragile core (scanned PDFs need OCR; many are text). Start text-only; flag OCR as a stretch.
- **Volume/rate** — the ISIR WS is a firehose; the cron must be incremental (cursor) and bounded per run.
- **Property okres vs debtor okres** — the document gives the *property* okres (correct for realestate). Do NOT fall back to debtor address silently.
- Coverage is "insolvency RE sales that reached a dražební vyhláška", not all insolvencies — document this in the tool output, same as realestate's other caveats.

## Recommendation
Execute as a **dedicated focused session** (it's multi-day and fragile). Tasks 1–2 (pin event type + RÚIAN dataset) are the de-risking gate — do them first; if document okres extraction proves unreliable, reconsider scope before building the full ingester.
