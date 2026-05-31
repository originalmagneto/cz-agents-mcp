# realestate — full data (self-hosted) — design

**Date:** 2026-05-31
**Status:** approved (design), pending spec review
**Context:** Deployment of cz-agents-mcp on Dokploy (dokploy.humanintheloop.sk). Phase 1 (7 servers) is live. This spec covers Phase 2b: making the `@czagents/realestate` server return real data without the upstream (non-public) `cz-agents-webapp` writer.

## Problem

`@czagents/realestate` exposes one free-tier tool, `get_district_aggregate({ okres, window_days })`. It reads a **read-only** SQLite at `/data/webapp.db` (opened with `fileMustExist: true`) produced by the separate `cz-agents-webapp` Prisma app, which is **not public**. Without that writer the DB does not exist and realestate cannot boot.

The DB schema is fully recoverable from `packages/realestate/src/__tests__/get_district_aggregate.test.ts`. The tool reads three tables:

- `RealEstateLead` — distress leads. Relevant columns: `id`, `sourceType`, `spisovaZnacka`, `courtCode`, `ingestedAt`, `status`, `kuMatchedName`, `okresSlug` (+ optional geo/parcel fields). Aggregation rules:
  - `distressCount` = rows where (`okresSlug = slug` OR (`okresSlug IS NULL` AND `kuMatchedName = okres`)) AND `ingestedAt >= since` AND `status != 'archived'`.
  - `insolvencyCount` = same + `sourceType = 'isir'`.
  - `auctionCount` = same + `sourceType IN ('portaldrazeb','cevd','cuzk_delta')`.
- `DistrictAggregate` — used ONLY to map `okresSlug → krajSlug` (to pick the price-index kraj). One row per okres suffices.
- `RealEstatePriceIndex` — `kcPerM2` by `kraj`, `propertyType`, `periodYear`, `periodQuarter`, `source`. Tool picks latest period for `propertyType='byt'` and the same quarter a year earlier for YoY trend. `kraj` must match the values in `KRAJ_SLUG_TO_PRICE_INDEX_KEY` (e.g. "Praha", "Středočeský", … "Moravskoslezský").

K-anonymity gate: `distress_lead_count < 3` ⇒ `low_activity: true`.

## Goal (v1)

realestate returns **real** `auction_count`, `distress_lead_count`, `avg_estimated_price_kc_per_m2`, and `trend_yoy_pct` per okres, sourced from the public portál dražeb auction data + seeded ČSÚ price index. `insolvency_count` is 0 in v1 (see v1.1).

## Architecture

New workspace package **`@czagents/realestate-ingest`** in the fork (`originalmagneto/cz-agents-mcp`). Separate Docker image. It writes `webapp.db` on a shared named volume `webapp-data`; the `realestate` server mounts the same volume **read-only**.

### Ingester responsibilities (idempotent, safe to re-run)

1. **Schema bootstrap** — create `webapp.db` + the 3 tables if absent (DDL copied verbatim from the test schema, kept in one `schema.ts` module so it stays in sync).
2. **Seed `DistrictAggregate`** — static map of all 76 CZ okresy → kraj (`okresSlug`→`krajSlug`), one row each. Deterministic; committed as a data module.
3. **Seed `RealEstatePriceIndex`** — `kcPerM2` for `propertyType='byt'` per kraj, for the latest available quarter and the same quarter one year earlier (enables YoY), from published ČSÚ figures. Committed as a data module; refresh is a manual data-module update for now.
4. **Scrape portál dražeb** — call the public JSON XHR endpoint the portaldrazeb.cz Vue frontend uses for `pripravované` + `online` auctions (no JWT). The exact endpoint is pinned during implementation by inspecting the site's network calls; DOM parsing is the documented fallback. For each auction upsert a `RealEstateLead`:
   - `id` = stable hash of spisová značka + item id (so re-runs upsert, not duplicate)
   - `sourceType = 'portaldrazeb'`
   - `okresSlug = slugifyCs(okres)` (same slugify as the tool)
   - `spisovaZnacka`, `dokumentUrl` (detail link), `ingestedAt = now`, `status = 'active'` (or 'finished_*')
   - `courtCode` best-effort (may be empty)
   - Leads not seen for N days transition to `status='archived'` (so stale auctions drop out of windows) — TBD-free rule: archive when auction date is in the past beyond the longest window (365d).

A shared `slugifyCs` must produce identical output to the tool's copy in `get_district_aggregate.ts`. To avoid drift, extract it to `@czagents/shared` and have both import it (small, targeted refactor within scope).

## Deployment (Dokploy)

- Add to `docker-compose.dokploy.yml`:
  - named volume `webapp-data`
  - `realestate` service: build `packages/realestate/Dockerfile`, `REALESTATE_DB_PATH=/data/webapp.db`, mount `webapp-data:/data:ro`, `PORT=3030`, `dokploy-network`, healthcheck `/health`.
  - `realestate-ingest` build target (image only; not a long-running service).
- **Bootstrap ordering** (realestate opens DB with `fileMustExist:true`):
  1. Run the ingester **once manually** (Dokploy schedule `run-manually`) to create + seed + first scrape → `webapp.db` exists and is populated.
  2. Then deploy/start `realestate`.
- Periodic refresh: Dokploy **schedule** running the ingester every 6 h (compose type, serviceName/container with the ingest image, command `node packages/realestate-ingest/dist/cli.js`).
- New public host `cz-realestate.humanintheloop.sk` → user adds **one Cloudflare A-record → 87.197.117.6** (proxied like the others). Dokploy domain: serviceName `realestate`, port 3030, letsencrypt.

## Testing

TDD for the pure logic:
- `slugifyCs` parity with the tool (table of okres names → expected slug).
- portál dražeb response parser: fixture JSON → expected `RealEstateLead` rows (okresSlug, spisovaZnacka, status, dates).
- schema bootstrap: open fresh DB, run bootstrap, assert tables + a seeded okres/price row, then run `getDistrictAggregate` against it and assert real counts.
- idempotency: run scrape twice over the same fixture ⇒ no duplicate leads.

## Out of scope for v1 (explicit)

- **ISIR insolvency leads** — `insolvency_count` stays 0 in v1. **Committed v1.1 deliverable (do NOT drop — user explicitly wants this solved).** Approach for v1.1: poll ISIR PublicWS events, filter RE-auction event types, and resolve debtor → okres. Okres resolution options to evaluate in v1.1: (a) ISIR CuzkWS debtor address (`urlDetailRizeni`/address) → okres; (b) document/text parse of dražební vyhláška for cadastral area → okres. Until reliable okres resolution exists, ISIR leads must not be written with a guessed okres (would corrupt counts).
- portál dražeb authenticated API (JWT) — declined in favour of public JSON.
- Paid tools (`search_distress_properties`, `get_property_detail`) — closed-source `realestate-pro`, not self-hostable.

## Risks

- Public JSON endpoint may change / be rate-limited → keep parser isolated, add DOM fallback, back off politely, log coverage.
- ČSÚ price seed goes stale → it's a committed data module; refresh cadence documented.
- okresSlug mismatch between scraped okres names and the tool's slugify → mitigated by shared slugify + parity test.
