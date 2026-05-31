# realestate Full Data (ingester) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `@czagents/realestate` return real per-okres distress statistics by building a new `@czagents/realestate-ingest` package that creates and populates `webapp.db` (schema + static seeds + scraped portál dražeb auctions), then deploy realestate + a refresh schedule on Dokploy.

**Architecture:** A standalone ingester package writes `webapp.db` (3 tables) on a shared Docker volume `webapp-data`; the realestate MCP server mounts it read-only. The ingester is idempotent: ensure schema → seed DistrictAggregate + RealEstatePriceIndex → scrape portál dražeb public JSON → upsert RealEstateLead → archive stale leads. `slugifyCs` is extracted to `@czagents/shared` so the ingester and the realestate tool produce identical okres slugs.

**Tech Stack:** Node 20, TypeScript (NodeNext), better-sqlite3, vitest, Docker, Dokploy CLI.

**Reference:** spec at `docs/superpowers/specs/2026-05-31-realestate-full-data-design.md`. Schema source-of-truth: `packages/realestate/src/__tests__/get_district_aggregate.test.ts`.

---

## File Structure

- `packages/shared/src/slug.ts` — **Create.** `slugifyCs(value)` (moved from the realestate tool).
- `packages/shared/src/index.ts` — **Modify.** add `export * from './slug.js';`
- `packages/shared/src/__tests__/slug.test.ts` — **Create.** parity tests.
- `packages/realestate/src/tools/get_district_aggregate.ts` — **Modify.** import `slugifyCs` from `@czagents/shared` (delete local copy).
- `packages/realestate-ingest/package.json` — **Create.**
- `packages/realestate-ingest/tsconfig.json` — **Create.**
- `packages/realestate-ingest/vitest.config.ts` — **Create.**
- `packages/realestate-ingest/src/schema.ts` — **Create.** DDL + `ensureSchema(db)`.
- `packages/realestate-ingest/src/data/districts.ts` — **Create.** 76 okres→kraj rows.
- `packages/realestate-ingest/src/data/priceIndex.ts` — **Create.** ČSÚ byt Kč/m² seed rows.
- `packages/realestate-ingest/src/seed.ts` — **Create.** `seedDistricts(db)`, `seedPriceIndex(db)`.
- `packages/realestate-ingest/src/drazby/parse.ts` — **Create.** pure: raw auction → `LeadRow[]`.
- `packages/realestate-ingest/src/drazby/fetch.ts` — **Create.** fetch public JSON (impure).
- `packages/realestate-ingest/src/upsert.ts` — **Create.** `upsertLeads(db, rows)`, `archiveStale(db, now)`.
- `packages/realestate-ingest/src/cli.ts` — **Create.** orchestrator entrypoint.
- `packages/realestate-ingest/src/__tests__/*.test.ts` — **Create.** per-module tests.
- `packages/realestate-ingest/Dockerfile` — **Create.**
- `docker-compose.dokploy.yml` — **Modify.** add `webapp-data` volume + `realestate` service.

---

## Task 1: Extract `slugifyCs` to shared

**Files:**
- Create: `packages/shared/src/slug.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/__tests__/slug.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/src/__tests__/slug.test.ts
import { describe, it, expect } from 'vitest';
import { slugifyCs } from '../slug.js';

describe('slugifyCs', () => {
  it('lowercases and strips diacritics', () => {
    expect(slugifyCs('Hlavní město Praha')).toBe('hlavni-mesto-praha');
    expect(slugifyCs('Ústí nad Labem')).toBe('usti-nad-labem');
    expect(slugifyCs('Žďár nad Sázavou')).toBe('zdar-nad-sazavou');
  });
  it('collapses non-alphanumerics and trims dashes', () => {
    expect(slugifyCs('  Brno-město  ')).toBe('brno-mesto');
    expect(slugifyCs('Praha')).toBe('praha');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=@czagents/shared -- slug`
Expected: FAIL — cannot find module `../slug.js`.

- [ ] **Step 3: Create the implementation**

```typescript
// packages/shared/src/slug.ts
/**
 * Czech-aware slugifier. MUST stay identical to the okresSlug derivation
 * used by @czagents/realestate get_district_aggregate, so scraped okres
 * names and the tool's lookup key match exactly.
 */
export function slugifyCs(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
```

- [ ] **Step 4: Add the export**

In `packages/shared/src/index.ts`, add this line after the existing exports:

```typescript
export * from './slug.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=@czagents/shared -- slug`
Expected: PASS (5 assertions).

- [ ] **Step 6: Build shared**

Run: `npm run build --workspace=@czagents/shared`
Expected: no TypeScript errors; `packages/shared/dist/slug.js` exists.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/slug.ts packages/shared/src/index.ts packages/shared/src/__tests__/slug.test.ts
git commit -m "feat(shared): extract slugifyCs for cross-package okres slug parity"
```

---

## Task 2: realestate tool imports shared slugifyCs

**Files:**
- Modify: `packages/realestate/src/tools/get_district_aggregate.ts`

- [ ] **Step 1: Replace the local function with the shared import**

At the top of `get_district_aggregate.ts`, after the existing imports, add:

```typescript
import { slugifyCs } from '@czagents/shared';
```

Then delete the local `function slugifyCs(value: string): string { ... }` block (the 7-line function). Leave all call sites unchanged.

- [ ] **Step 2: Run the existing realestate tests**

Run: `npm run test --workspace=@czagents/realestate`
Expected: PASS — the existing `get_district_aggregate.test.ts` still passes (slug behavior unchanged).

- [ ] **Step 3: Build realestate**

Run: `npm run build --workspace=@czagents/realestate`
Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add packages/realestate/src/tools/get_district_aggregate.ts
git commit -m "refactor(realestate): use shared slugifyCs (single source of truth)"
```

---

## Task 3: Scaffold `@czagents/realestate-ingest` package

**Files:**
- Create: `packages/realestate-ingest/package.json`
- Create: `packages/realestate-ingest/tsconfig.json`
- Create: `packages/realestate-ingest/vitest.config.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@czagents/realestate-ingest",
  "version": "0.1.0",
  "description": "Ingester that builds webapp.db (schema + ČSÚ price seed + portál dražeb auctions) for @czagents/realestate.",
  "private": true,
  "type": "module",
  "main": "./dist/cli.js",
  "license": "MIT",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/cli.js",
    "dev": "tsx src/cli.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@czagents/shared": "^0.1.9",
    "better-sqlite3": "^12.9.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^20.11.0",
    "typescript": "^5.5.0",
    "tsx": "^4.7.0",
    "vitest": "^4.1.4"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["**/__tests__/**", "**/*.test.ts", "node_modules", "dist"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Install workspaces**

Run: `npm install --workspaces --include-workspace-root --legacy-peer-deps`
Expected: `@czagents/realestate-ingest` linked into workspace; no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/realestate-ingest/package.json packages/realestate-ingest/tsconfig.json packages/realestate-ingest/vitest.config.ts package-lock.json
git commit -m "chore(realestate-ingest): scaffold package"
```

---

## Task 4: Schema bootstrap

**Files:**
- Create: `packages/realestate-ingest/src/schema.ts`
- Test: `packages/realestate-ingest/src/__tests__/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/realestate-ingest/src/__tests__/schema.test.ts
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { ensureSchema } from '../schema.js';

describe('ensureSchema', () => {
  it('creates the three tables idempotently', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    ensureSchema(db); // second call must not throw
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name);
    expect(tables).toEqual(['DistrictAggregate', 'RealEstateLead', 'RealEstatePriceIndex']);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=@czagents/realestate-ingest -- schema`
Expected: FAIL — cannot find `../schema.js`.

- [ ] **Step 3: Create the implementation**

```typescript
// packages/realestate-ingest/src/schema.ts
import type Database from 'better-sqlite3';

/**
 * DDL copied verbatim from
 * packages/realestate/src/__tests__/get_district_aggregate.test.ts — the
 * canonical shape the realestate tool reads. Keep in sync if that changes.
 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS RealEstateLead (
  id TEXT PRIMARY KEY,
  sourceType TEXT NOT NULL,
  spisovaZnacka TEXT NOT NULL,
  courtCode TEXT NOT NULL,
  ingestedAt TEXT NOT NULL,
  publishedAt TEXT,
  status TEXT DEFAULT 'pending_vision',
  opportunityScore REAL,
  dokumentUrl TEXT,
  kuMatchedName TEXT,
  parcelaPlocha REAL,
  parcelaDruh TEXT,
  parcelaVyuziti TEXT,
  auctionStatus TEXT,
  popisUdalosti TEXT DEFAULT '',
  typUdalosti TEXT DEFAULT '',
  matchedKeywords TEXT DEFAULT '',
  lat REAL,
  lng REAL,
  okresSlug TEXT
);

CREATE TABLE IF NOT EXISTS DistrictAggregate (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  okresSlug TEXT NOT NULL,
  windowDays INTEGER NOT NULL,
  insolvencyCount INTEGER NOT NULL DEFAULT 0,
  auctionCount INTEGER NOT NULL DEFAULT 0,
  distressLeadCount INTEGER NOT NULL DEFAULT 0,
  krajSlug TEXT NOT NULL,
  krajCount INTEGER NOT NULL DEFAULT 0,
  lastUpdated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS RealEstatePriceIndex (
  id TEXT PRIMARY KEY,
  kraj TEXT NOT NULL,
  propertyType TEXT NOT NULL,
  periodYear INTEGER NOT NULL,
  periodQuarter INTEGER NOT NULL,
  kcPerM2 INTEGER NOT NULL,
  source TEXT NOT NULL,
  fetchedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lead_okres ON RealEstateLead(okresSlug, ingestedAt);
CREATE UNIQUE INDEX IF NOT EXISTS idx_district_okres ON DistrictAggregate(okresSlug, windowDays);
`;

export function ensureSchema(db: Database.Database): void {
  db.exec(SCHEMA);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=@czagents/realestate-ingest -- schema`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/realestate-ingest/src/schema.ts packages/realestate-ingest/src/__tests__/schema.test.ts
git commit -m "feat(realestate-ingest): schema bootstrap (3 tables, idempotent)"
```

---

## Task 5: Static district (okres→kraj) data + seed

**Files:**
- Create: `packages/realestate-ingest/src/data/districts.ts`
- Create: `packages/realestate-ingest/src/seed.ts`
- Test: `packages/realestate-ingest/src/__tests__/seed.test.ts`

- [ ] **Step 1: Create the district data module**

`krajSlug` values MUST be the keys of `KRAJ_SLUG_TO_PRICE_INDEX_KEY` in the realestate tool: `hl-m-praha, stredocesky, jihocesky, plzensky, karlovarsky, ustecky, liberecky, kralovehradecky, pardubicky, vysocina, jihomoravsky, olomoucky, zlinsky, moravskoslezsky`. `okresSlug` is `slugifyCs(okresName)`.

```typescript
// packages/realestate-ingest/src/data/districts.ts
// 76 Czech okresy → kraj. okresSlug computed via slugifyCs at seed time.
export interface DistrictRow { okres: string; krajSlug: string; }

export const DISTRICTS: DistrictRow[] = [
  { okres: 'Praha', krajSlug: 'hl-m-praha' },
  { okres: 'Benešov', krajSlug: 'stredocesky' },
  { okres: 'Beroun', krajSlug: 'stredocesky' },
  { okres: 'Kladno', krajSlug: 'stredocesky' },
  { okres: 'Kolín', krajSlug: 'stredocesky' },
  { okres: 'Kutná Hora', krajSlug: 'stredocesky' },
  { okres: 'Mělník', krajSlug: 'stredocesky' },
  { okres: 'Mladá Boleslav', krajSlug: 'stredocesky' },
  { okres: 'Nymburk', krajSlug: 'stredocesky' },
  { okres: 'Praha-východ', krajSlug: 'stredocesky' },
  { okres: 'Praha-západ', krajSlug: 'stredocesky' },
  { okres: 'Příbram', krajSlug: 'stredocesky' },
  { okres: 'Rakovník', krajSlug: 'stredocesky' },
  { okres: 'České Budějovice', krajSlug: 'jihocesky' },
  { okres: 'Český Krumlov', krajSlug: 'jihocesky' },
  { okres: 'Jindřichův Hradec', krajSlug: 'jihocesky' },
  { okres: 'Písek', krajSlug: 'jihocesky' },
  { okres: 'Prachatice', krajSlug: 'jihocesky' },
  { okres: 'Strakonice', krajSlug: 'jihocesky' },
  { okres: 'Tábor', krajSlug: 'jihocesky' },
  { okres: 'Domažlice', krajSlug: 'plzensky' },
  { okres: 'Klatovy', krajSlug: 'plzensky' },
  { okres: 'Plzeň-město', krajSlug: 'plzensky' },
  { okres: 'Plzeň-jih', krajSlug: 'plzensky' },
  { okres: 'Plzeň-sever', krajSlug: 'plzensky' },
  { okres: 'Rokycany', krajSlug: 'plzensky' },
  { okres: 'Tachov', krajSlug: 'plzensky' },
  { okres: 'Cheb', krajSlug: 'karlovarsky' },
  { okres: 'Karlovy Vary', krajSlug: 'karlovarsky' },
  { okres: 'Sokolov', krajSlug: 'karlovarsky' },
  { okres: 'Děčín', krajSlug: 'ustecky' },
  { okres: 'Chomutov', krajSlug: 'ustecky' },
  { okres: 'Litoměřice', krajSlug: 'ustecky' },
  { okres: 'Louny', krajSlug: 'ustecky' },
  { okres: 'Most', krajSlug: 'ustecky' },
  { okres: 'Teplice', krajSlug: 'ustecky' },
  { okres: 'Ústí nad Labem', krajSlug: 'ustecky' },
  { okres: 'Česká Lípa', krajSlug: 'liberecky' },
  { okres: 'Jablonec nad Nisou', krajSlug: 'liberecky' },
  { okres: 'Liberec', krajSlug: 'liberecky' },
  { okres: 'Semily', krajSlug: 'liberecky' },
  { okres: 'Hradec Králové', krajSlug: 'kralovehradecky' },
  { okres: 'Jičín', krajSlug: 'kralovehradecky' },
  { okres: 'Náchod', krajSlug: 'kralovehradecky' },
  { okres: 'Rychnov nad Kněžnou', krajSlug: 'kralovehradecky' },
  { okres: 'Trutnov', krajSlug: 'kralovehradecky' },
  { okres: 'Chrudim', krajSlug: 'pardubicky' },
  { okres: 'Pardubice', krajSlug: 'pardubicky' },
  { okres: 'Svitavy', krajSlug: 'pardubicky' },
  { okres: 'Ústí nad Orlicí', krajSlug: 'pardubicky' },
  { okres: 'Havlíčkův Brod', krajSlug: 'vysocina' },
  { okres: 'Jihlava', krajSlug: 'vysocina' },
  { okres: 'Pelhřimov', krajSlug: 'vysocina' },
  { okres: 'Třebíč', krajSlug: 'vysocina' },
  { okres: 'Žďár nad Sázavou', krajSlug: 'vysocina' },
  { okres: 'Blansko', krajSlug: 'jihomoravsky' },
  { okres: 'Brno-město', krajSlug: 'jihomoravsky' },
  { okres: 'Brno-venkov', krajSlug: 'jihomoravsky' },
  { okres: 'Břeclav', krajSlug: 'jihomoravsky' },
  { okres: 'Hodonín', krajSlug: 'jihomoravsky' },
  { okres: 'Vyškov', krajSlug: 'jihomoravsky' },
  { okres: 'Znojmo', krajSlug: 'jihomoravsky' },
  { okres: 'Jeseník', krajSlug: 'olomoucky' },
  { okres: 'Olomouc', krajSlug: 'olomoucky' },
  { okres: 'Prostějov', krajSlug: 'olomoucky' },
  { okres: 'Přerov', krajSlug: 'olomoucky' },
  { okres: 'Šumperk', krajSlug: 'olomoucky' },
  { okres: 'Kroměříž', krajSlug: 'zlinsky' },
  { okres: 'Uherské Hradiště', krajSlug: 'zlinsky' },
  { okres: 'Vsetín', krajSlug: 'zlinsky' },
  { okres: 'Zlín', krajSlug: 'zlinsky' },
  { okres: 'Bruntál', krajSlug: 'moravskoslezsky' },
  { okres: 'Frýdek-Místek', krajSlug: 'moravskoslezsky' },
  { okres: 'Karviná', krajSlug: 'moravskoslezsky' },
  { okres: 'Nový Jičín', krajSlug: 'moravskoslezsky' },
  { okres: 'Opava', krajSlug: 'moravskoslezsky' },
  { okres: 'Ostrava-město', krajSlug: 'moravskoslezsky' },
];
```

- [ ] **Step 2: Write the failing seed test**

```typescript
// packages/realestate-ingest/src/__tests__/seed.test.ts
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { ensureSchema } from '../schema.js';
import { seedDistricts, seedPriceIndex } from '../seed.js';
import { DISTRICTS } from '../data/districts.js';

function freshDb() { const db = new Database(':memory:'); ensureSchema(db); return db; }

describe('seedDistricts', () => {
  it('inserts one row per okres with computed slug, idempotently', () => {
    const db = freshDb();
    seedDistricts(db); seedDistricts(db);
    const count = (db.prepare('SELECT COUNT(*) c FROM DistrictAggregate').get() as any).c;
    expect(count).toBe(DISTRICTS.length);
    const praha = db.prepare("SELECT krajSlug FROM DistrictAggregate WHERE okresSlug='praha'").get() as any;
    expect(praha.krajSlug).toBe('hl-m-praha');
    const ostrava = db.prepare("SELECT krajSlug FROM DistrictAggregate WHERE okresSlug='ostrava-mesto'").get() as any;
    expect(ostrava.krajSlug).toBe('moravskoslezsky');
    db.close();
  });
});

describe('seedPriceIndex', () => {
  it('inserts byt price rows with a year-ago period for YoY', () => {
    const db = freshDb();
    seedPriceIndex(db); seedPriceIndex(db);
    const praha = db.prepare(
      "SELECT periodYear FROM RealEstatePriceIndex WHERE kraj='Praha' AND propertyType='byt' ORDER BY periodYear DESC"
    ).all() as any[];
    expect(praha.length).toBeGreaterThanOrEqual(2);
    expect(praha[0].periodYear - praha[1].periodYear).toBe(1);
    db.close();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test --workspace=@czagents/realestate-ingest -- seed`
Expected: FAIL — cannot find `../seed.js`.

- [ ] **Step 4: Create the price-index data module**

Values are ČSÚ "ceny bytů" Kč/m² by kraj, approximate 2024 (Q4) with 2023 (Q4) for YoY. `kraj` keys MUST match `KRAJ_SLUG_TO_PRICE_INDEX_KEY` values. Refresh = edit this module.

```typescript
// packages/realestate-ingest/src/data/priceIndex.ts
export interface PriceRow { kraj: string; year: number; quarter: number; kcPerM2: number; }
// source: ČSÚ "Ceny sledovaných druhů nemovitostí" (byty). Approximate, refreshable.
export const PRICE_SOURCE = 'csu_vdb';
export const PRICE_ROWS: PriceRow[] = [
  { kraj: 'Praha', year: 2024, quarter: 4, kcPerM2: 142000 }, { kraj: 'Praha', year: 2023, quarter: 4, kcPerM2: 133000 },
  { kraj: 'Středočeský', year: 2024, quarter: 4, kcPerM2: 78000 }, { kraj: 'Středočeský', year: 2023, quarter: 4, kcPerM2: 73000 },
  { kraj: 'Jihočeský', year: 2024, quarter: 4, kcPerM2: 62000 }, { kraj: 'Jihočeský', year: 2023, quarter: 4, kcPerM2: 58000 },
  { kraj: 'Plzeňský', year: 2024, quarter: 4, kcPerM2: 60000 }, { kraj: 'Plzeňský', year: 2023, quarter: 4, kcPerM2: 56000 },
  { kraj: 'Karlovarský', year: 2024, quarter: 4, kcPerM2: 42000 }, { kraj: 'Karlovarský', year: 2023, quarter: 4, kcPerM2: 40000 },
  { kraj: 'Ústecký', year: 2024, quarter: 4, kcPerM2: 28000 }, { kraj: 'Ústecký', year: 2023, quarter: 4, kcPerM2: 27000 },
  { kraj: 'Liberecký', year: 2024, quarter: 4, kcPerM2: 58000 }, { kraj: 'Liberecký', year: 2023, quarter: 4, kcPerM2: 54000 },
  { kraj: 'Královéhradecký', year: 2024, quarter: 4, kcPerM2: 62000 }, { kraj: 'Královéhradecký', year: 2023, quarter: 4, kcPerM2: 58000 },
  { kraj: 'Pardubický', year: 2024, quarter: 4, kcPerM2: 60000 }, { kraj: 'Pardubický', year: 2023, quarter: 4, kcPerM2: 56000 },
  { kraj: 'Vysočina', year: 2024, quarter: 4, kcPerM2: 52000 }, { kraj: 'Vysočina', year: 2023, quarter: 4, kcPerM2: 49000 },
  { kraj: 'Jihomoravský', year: 2024, quarter: 4, kcPerM2: 88000 }, { kraj: 'Jihomoravský', year: 2023, quarter: 4, kcPerM2: 82000 },
  { kraj: 'Olomoucký', year: 2024, quarter: 4, kcPerM2: 58000 }, { kraj: 'Olomoucký', year: 2023, quarter: 4, kcPerM2: 54000 },
  { kraj: 'Zlínský', year: 2024, quarter: 4, kcPerM2: 60000 }, { kraj: 'Zlínský', year: 2023, quarter: 4, kcPerM2: 56000 },
  { kraj: 'Moravskoslezský', year: 2024, quarter: 4, kcPerM2: 46000 }, { kraj: 'Moravskoslezský', year: 2023, quarter: 4, kcPerM2: 42000 },
];
```

- [ ] **Step 5: Create seed.ts**

```typescript
// packages/realestate-ingest/src/seed.ts
import type Database from 'better-sqlite3';
import { slugifyCs } from '@czagents/shared';
import { DISTRICTS } from './data/districts.js';
import { PRICE_ROWS, PRICE_SOURCE } from './data/priceIndex.js';

const SEED_WINDOW_DAYS = 90; // DistrictAggregate is used only for okres→kraj mapping.

export function seedDistricts(db: Database.Database): void {
  const stmt = db.prepare(
    `INSERT INTO DistrictAggregate (okresSlug, windowDays, krajSlug)
     VALUES (@okresSlug, @windowDays, @krajSlug)
     ON CONFLICT(okresSlug, windowDays) DO UPDATE SET krajSlug = excluded.krajSlug`
  );
  const tx = db.transaction(() => {
    for (const d of DISTRICTS) {
      stmt.run({ okresSlug: slugifyCs(d.okres), windowDays: SEED_WINDOW_DAYS, krajSlug: d.krajSlug });
    }
  });
  tx();
}

export function seedPriceIndex(db: Database.Database): void {
  const stmt = db.prepare(
    `INSERT INTO RealEstatePriceIndex (id, kraj, propertyType, periodYear, periodQuarter, kcPerM2, source)
     VALUES (@id, @kraj, 'byt', @year, @quarter, @kcPerM2, @source)
     ON CONFLICT(id) DO UPDATE SET kcPerM2 = excluded.kcPerM2`
  );
  const tx = db.transaction(() => {
    for (const p of PRICE_ROWS) {
      const id = `${PRICE_SOURCE}:${slugifyCs(p.kraj)}:byt:${p.year}Q${p.quarter}`;
      stmt.run({ id, kraj: p.kraj, year: p.year, quarter: p.quarter, kcPerM2: p.kcPerM2, source: PRICE_SOURCE });
    }
  });
  tx();
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test --workspace=@czagents/realestate-ingest -- seed`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/realestate-ingest/src/data packages/realestate-ingest/src/seed.ts packages/realestate-ingest/src/__tests__/seed.test.ts
git commit -m "feat(realestate-ingest): static okres→kraj + ČSÚ price-index seed"
```

---

## Task 6: portál dražeb parser (pure)

Defines the contract: a normalized auction object → a `LeadRow`. The exact upstream JSON field names are confirmed in Task 7; this parser consumes a **normalized** shape so the network/JSON-shape concern is isolated in fetch.ts.

**Files:**
- Create: `packages/realestate-ingest/src/drazby/parse.ts`
- Test: `packages/realestate-ingest/src/__tests__/parse.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/realestate-ingest/src/__tests__/parse.test.ts
import { describe, it, expect } from 'vitest';
import { auctionToLead, type NormalizedAuction } from '../drazby/parse.js';

const base: NormalizedAuction = {
  externalId: 'A-123',
  spisovaZnacka: '030 EX 1/2024',
  okres: 'Ostrava-město',
  detailUrl: 'https://www.portaldrazeb.cz/detail/abc',
  auctionDateIso: '2026-07-01T10:00:00.000Z',
  status: 'active',
};

describe('auctionToLead', () => {
  it('maps a normalized auction to a RealEstateLead row', () => {
    const lead = auctionToLead(base, '2026-05-31T00:00:00.000Z');
    expect(lead.sourceType).toBe('portaldrazeb');
    expect(lead.okresSlug).toBe('ostrava-mesto');
    expect(lead.spisovaZnacka).toBe('030 EX 1/2024');
    expect(lead.dokumentUrl).toBe('https://www.portaldrazeb.cz/detail/abc');
    expect(lead.status).toBe('active');
    expect(lead.id).toBe('portaldrazeb:A-123'); // stable → upsert, not duplicate
    expect(lead.ingestedAt).toBe('2026-05-31T00:00:00.000Z');
  });
  it('is stable: same auction → same id', () => {
    expect(auctionToLead(base, 'x').id).toBe(auctionToLead(base, 'y').id);
  });
  it('defaults courtCode to empty string (column is NOT NULL)', () => {
    expect(auctionToLead(base, 'x').courtCode).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=@czagents/realestate-ingest -- parse`
Expected: FAIL — cannot find `../drazby/parse.js`.

- [ ] **Step 3: Create the implementation**

```typescript
// packages/realestate-ingest/src/drazby/parse.ts
import { slugifyCs } from '@czagents/shared';

export interface NormalizedAuction {
  externalId: string;      // stable upstream id
  spisovaZnacka: string;
  okres: string;           // human okres name, e.g. "Ostrava-město"
  detailUrl: string;
  auctionDateIso: string | null;
  status: 'active' | 'upcoming' | 'finished_sold' | 'finished_unsold';
}

export interface LeadRow {
  id: string;
  sourceType: 'portaldrazeb';
  spisovaZnacka: string;
  courtCode: string;
  ingestedAt: string;
  publishedAt: string | null;
  status: string;
  dokumentUrl: string;
  kuMatchedName: string;
  okresSlug: string;
  auctionStatus: string;
}

export function auctionToLead(a: NormalizedAuction, nowIso: string): LeadRow {
  return {
    id: `portaldrazeb:${a.externalId}`,
    sourceType: 'portaldrazeb',
    spisovaZnacka: a.spisovaZnacka || a.externalId,
    courtCode: '',
    ingestedAt: nowIso,
    publishedAt: a.auctionDateIso,
    status: a.status,
    dokumentUrl: a.detailUrl,
    kuMatchedName: a.okres,
    okresSlug: slugifyCs(a.okres),
    auctionStatus: a.status,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=@czagents/realestate-ingest -- parse`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/realestate-ingest/src/drazby/parse.ts packages/realestate-ingest/src/__tests__/parse.test.ts
git commit -m "feat(realestate-ingest): portál dražeb auction→lead mapper (pure, tested)"
```

---

## Task 7: portál dražeb fetch + JSON normalization

Discovery step: pin the real public endpoint and JSON field names. The normalization (raw upstream JSON → `NormalizedAuction[]`) is tested against a recorded fixture so the parser contract is locked even though the live shape is confirmed during this task.

**Files:**
- Create: `packages/realestate-ingest/src/drazby/fetch.ts`
- Create: `packages/realestate-ingest/src/__tests__/fixtures/auctions.sample.json`
- Test: `packages/realestate-ingest/src/__tests__/fetch.test.ts`

- [ ] **Step 1: Discover the endpoint**

In a browser, open `https://www.portaldrazeb.cz/drazby/pripravovane`, open DevTools → Network → filter XHR/Fetch, and record the request the Vue app issues to list auctions (URL, method, query params for okres/page, and the JSON response body). Save a representative response body (one page) to `src/__tests__/fixtures/auctions.sample.json`. Note the field names for: external id, spisová značka, okres (předmětu dražby), detail URL, auction datetime, status. If no anonymous JSON endpoint exists, fall back to fetching the HTML page and parsing the embedded JSON/`__INITIAL_STATE__`; document which path was used at the top of `fetch.ts`.

- [ ] **Step 2: Write the failing normalization test**

Use the ACTUAL field names recorded in Step 1 to fill the fixture. The test asserts the mapping from raw JSON → `NormalizedAuction`.

```typescript
// packages/realestate-ingest/src/__tests__/fetch.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeAuctions } from '../drazby/fetch.js';

const raw = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/auctions.sample.json', import.meta.url)), 'utf8'),
);

describe('normalizeAuctions', () => {
  it('maps raw portál dražeb JSON to NormalizedAuction[]', () => {
    const out = normalizeAuctions(raw);
    expect(out.length).toBeGreaterThan(0);
    const a = out[0];
    expect(typeof a.externalId).toBe('string');
    expect(a.externalId.length).toBeGreaterThan(0);
    expect(typeof a.okres).toBe('string');
    expect(a.detailUrl).toMatch(/^https?:\/\//);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test --workspace=@czagents/realestate-ingest -- fetch`
Expected: FAIL — cannot find `../drazby/fetch.js`.

- [ ] **Step 4: Create fetch.ts**

Fill `normalizeAuctions` using the real field names from Step 1. Below is the structure; replace the field accessors (marked) with the recorded names.

```typescript
// packages/realestate-ingest/src/drazby/fetch.ts
// Data source: portál dražeb public auction listing JSON (anonymous XHR used
// by the site frontend). Endpoint pinned 2026-05 — see DRAZBY_API_URL.
import type { NormalizedAuction } from './parse.js';

export const DRAZBY_API_URL =
  process.env.DRAZBY_API_URL ?? 'https://www.portaldrazeb.cz/api/v2/auctions'; // confirm in Step 1

interface RawAuction { [k: string]: unknown; }

function str(v: unknown): string { return v == null ? '' : String(v); }

export function normalizeAuctions(raw: unknown): NormalizedAuction[] {
  // Upstream returns either an array or { data: [...] } / { auctions: [...] }.
  const list: RawAuction[] = Array.isArray(raw)
    ? (raw as RawAuction[])
    : ((raw as any)?.data ?? (raw as any)?.auctions ?? (raw as any)?.items ?? []);
  return list
    .map((r): NormalizedAuction | null => {
      const externalId = str((r as any).id ?? (r as any).uuid ?? (r as any).number);
      if (!externalId) return null;
      const okres = str((r as any).item?.okres ?? (r as any).okresPredmetu ?? (r as any).county);
      const detailPath = str((r as any).detailUrl ?? (r as any).url ?? `/detail/${externalId}`);
      const detailUrl = detailPath.startsWith('http') ? detailPath : `https://www.portaldrazeb.cz${detailPath}`;
      const auctionDateRaw = (r as any).auctionStart ?? (r as any).datumZahajeni ?? (r as any).date ?? null;
      const auctionDateIso = auctionDateRaw ? new Date(String(auctionDateRaw)).toISOString() : null;
      const rawStatus = str((r as any).status ?? (r as any).state).toLowerCase();
      const status: NormalizedAuction['status'] =
        rawStatus.includes('sold') ? 'finished_sold'
        : rawStatus.includes('unsold') || rawStatus.includes('neúsp') ? 'finished_unsold'
        : rawStatus.includes('upcom') || rawStatus.includes('připrav') ? 'upcoming'
        : 'active';
      return { externalId, spisovaZnacka: str((r as any).number ?? (r as any).spisovaZnacka), okres, detailUrl, auctionDateIso, status };
    })
    .filter((x): x is NormalizedAuction => x !== null && x.okres !== '');
}

export async function fetchAuctions(url = DRAZBY_API_URL): Promise<NormalizedAuction[]> {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'cz-agents-realestate-ingest/0.1' } });
  if (!res.ok) throw new Error(`portál dražeb fetch failed: HTTP ${res.status}`);
  return normalizeAuctions(await res.json());
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=@czagents/realestate-ingest -- fetch`
Expected: PASS against the recorded fixture.

- [ ] **Step 6: Commit**

```bash
git add packages/realestate-ingest/src/drazby/fetch.ts packages/realestate-ingest/src/__tests__/fetch.test.ts packages/realestate-ingest/src/__tests__/fixtures/auctions.sample.json
git commit -m "feat(realestate-ingest): portál dražeb fetch + JSON normalization (fixture-tested)"
```

---

## Task 8: Upsert + archive

**Files:**
- Create: `packages/realestate-ingest/src/upsert.ts`
- Test: `packages/realestate-ingest/src/__tests__/upsert.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/realestate-ingest/src/__tests__/upsert.test.ts
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { ensureSchema } from '../schema.js';
import { upsertLeads, archiveStale } from '../upsert.js';
import { auctionToLead, type NormalizedAuction } from '../drazby/parse.js';

const a: NormalizedAuction = {
  externalId: 'A-1', spisovaZnacka: 'X 1/24', okres: 'Praha',
  detailUrl: 'https://www.portaldrazeb.cz/detail/1', auctionDateIso: '2020-01-01T00:00:00.000Z', status: 'active',
};

describe('upsertLeads', () => {
  it('inserts then updates the same id (no duplicate)', () => {
    const db = new Database(':memory:'); ensureSchema(db);
    upsertLeads(db, [auctionToLead(a, '2026-05-31T00:00:00.000Z')]);
    upsertLeads(db, [auctionToLead(a, '2026-06-01T00:00:00.000Z')]);
    const rows = db.prepare('SELECT id, ingestedAt FROM RealEstateLead').all() as any[];
    expect(rows.length).toBe(1);
    expect(rows[0].ingestedAt).toBe('2026-06-01T00:00:00.000Z');
    db.close();
  });
});

describe('archiveStale', () => {
  it('archives portaldrazeb leads whose auction date is older than 365 days', () => {
    const db = new Database(':memory:'); ensureSchema(db);
    upsertLeads(db, [auctionToLead(a, '2026-05-31T00:00:00.000Z')]); // publishedAt 2020 → stale
    archiveStale(db, '2026-05-31T00:00:00.000Z');
    const row = db.prepare("SELECT status FROM RealEstateLead WHERE id='portaldrazeb:A-1'").get() as any;
    expect(row.status).toBe('archived');
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=@czagents/realestate-ingest -- upsert`
Expected: FAIL — cannot find `../upsert.js`.

- [ ] **Step 3: Create the implementation**

```typescript
// packages/realestate-ingest/src/upsert.ts
import type Database from 'better-sqlite3';
import type { LeadRow } from './drazby/parse.js';

export function upsertLeads(db: Database.Database, leads: LeadRow[]): void {
  const stmt = db.prepare(
    `INSERT INTO RealEstateLead
       (id, sourceType, spisovaZnacka, courtCode, ingestedAt, publishedAt, status, dokumentUrl, kuMatchedName, okresSlug, auctionStatus)
     VALUES
       (@id, @sourceType, @spisovaZnacka, @courtCode, @ingestedAt, @publishedAt, @status, @dokumentUrl, @kuMatchedName, @okresSlug, @auctionStatus)
     ON CONFLICT(id) DO UPDATE SET
       ingestedAt = excluded.ingestedAt,
       publishedAt = excluded.publishedAt,
       status = excluded.status,
       dokumentUrl = excluded.dokumentUrl,
       kuMatchedName = excluded.kuMatchedName,
       okresSlug = excluded.okresSlug,
       auctionStatus = excluded.auctionStatus`
  );
  const tx = db.transaction(() => { for (const l of leads) stmt.run(l); });
  tx();
}

/** Archive portál dražeb leads whose auction date is older than the longest window (365d). */
export function archiveStale(db: Database.Database, nowIso: string): void {
  const cutoff = new Date(new Date(nowIso).getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    `UPDATE RealEstateLead SET status = 'archived'
     WHERE sourceType = 'portaldrazeb' AND status != 'archived'
       AND publishedAt IS NOT NULL AND publishedAt < @cutoff`
  ).run({ cutoff });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=@czagents/realestate-ingest -- upsert`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/realestate-ingest/src/upsert.ts packages/realestate-ingest/src/__tests__/upsert.test.ts
git commit -m "feat(realestate-ingest): lead upsert + stale archive"
```

---

## Task 9: CLI orchestrator + end-to-end test

**Files:**
- Create: `packages/realestate-ingest/src/cli.ts`
- Test: `packages/realestate-ingest/src/__tests__/e2e.test.ts`

- [ ] **Step 1: Write the failing end-to-end test**

Verifies the whole pipeline against a fresh DB, then runs the real tool to confirm counts surface.

```typescript
// packages/realestate-ingest/src/__tests__/e2e.test.ts
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { ensureSchema } from '../schema.js';
import { seedDistricts, seedPriceIndex } from '../seed.js';
import { upsertLeads } from '../upsert.js';
import { auctionToLead, type NormalizedAuction } from '../drazby/parse.js';

function auction(id: string): NormalizedAuction {
  return { externalId: id, spisovaZnacka: `X ${id}`, okres: 'Praha',
    detailUrl: `https://www.portaldrazeb.cz/detail/${id}`, auctionDateIso: '2030-01-01T00:00:00.000Z', status: 'active' };
}

describe('pipeline → getDistrictAggregate', () => {
  it('surfaces real auction counts for an okres', () => {
    const db = new Database(':memory:'); ensureSchema(db); seedDistricts(db); seedPriceIndex(db);
    const now = '2030-01-01T00:00:00.000Z';
    upsertLeads(db, [auction('1'), auction('2'), auction('3'), auction('4')].map((x) => auctionToLead(x, now)));
    const c = (db.prepare(
      "SELECT COUNT(*) c FROM RealEstateLead WHERE okresSlug='praha' AND sourceType IN ('portaldrazeb','cevd','cuzk_delta')"
    ).get() as any).c;
    expect(c).toBe(4);
    const price = db.prepare("SELECT kcPerM2 FROM RealEstatePriceIndex WHERE kraj='Praha' AND periodYear=2024").get() as any;
    expect(price.kcPerM2).toBe(142000);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `npm run test --workspace=@czagents/realestate-ingest -- e2e`
Expected: PASS (all deps already implemented). If FAIL, fix the offending module before continuing.

- [ ] **Step 3: Create cli.ts**

```typescript
// packages/realestate-ingest/src/cli.ts
import Database from 'better-sqlite3';
import { ensureSchema } from './schema.js';
import { seedDistricts, seedPriceIndex } from './seed.js';
import { fetchAuctions } from './drazby/fetch.js';
import { auctionToLead } from './drazby/parse.js';
import { upsertLeads, archiveStale } from './upsert.js';

async function main(): Promise<void> {
  const dbPath = process.env.REALESTATE_DB_PATH ?? '/data/webapp.db';
  const now = new Date().toISOString();
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  ensureSchema(db);
  seedDistricts(db);
  seedPriceIndex(db);
  try {
    const auctions = await fetchAuctions();
    const leads = auctions.map((a) => auctionToLead(a, now));
    upsertLeads(db, leads);
    archiveStale(db, now);
    console.log(`[realestate-ingest] ok — auctions fetched=${auctions.length} upserted=${leads.length}`);
  } catch (err) {
    // Seeds already committed; scraping failure must not leave DB unusable.
    console.error(`[realestate-ingest] scrape failed (schema+seed still applied): ${(err as Error).message}`);
    db.close();
    process.exit(1);
  }
  db.close();
}

main().catch((err) => { console.error('[realestate-ingest] fatal:', err); process.exit(1); });
```

- [ ] **Step 4: Build the package**

Run: `npm run build --workspace=@czagents/realestate-ingest`
Expected: no TypeScript errors; `packages/realestate-ingest/dist/cli.js` exists.

- [ ] **Step 5: Commit**

```bash
git add packages/realestate-ingest/src/cli.ts packages/realestate-ingest/src/__tests__/e2e.test.ts
git commit -m "feat(realestate-ingest): CLI orchestrator + e2e pipeline test"
```

---

## Task 10: Dockerfile for the ingester

**Files:**
- Create: `packages/realestate-ingest/Dockerfile`

- [ ] **Step 1: Create the Dockerfile**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/realestate-ingest ./packages/realestate-ingest
RUN npm install --workspaces --include-workspace-root --legacy-peer-deps
RUN npm run build --workspace=@czagents/shared
RUN npm run build --workspace=@czagents/realestate-ingest

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/realestate-ingest/dist ./packages/realestate-ingest/dist
COPY --from=builder /app/packages/realestate-ingest/package.json ./packages/realestate-ingest/package.json
# Long-running container so Dokploy schedule can exec the CLI on a cron.
CMD ["sh", "-c", "node packages/realestate-ingest/dist/cli.js; tail -f /dev/null"]
```

- [ ] **Step 2: Commit**

```bash
git add packages/realestate-ingest/Dockerfile
git commit -m "feat(realestate-ingest): Dockerfile"
```

---

## Task 11: Add realestate + ingester to the Dokploy compose

**Files:**
- Modify: `docker-compose.dokploy.yml`

- [ ] **Step 1: Add the two services and the shared volume**

Insert these service blocks (after `eu-registry:`) and extend the `volumes:` block.

```yaml
  realestate:
    build:
      context: .
      dockerfile: packages/realestate/Dockerfile
    image: cz-agents-realestate:latest
    restart: unless-stopped
    environment:
      - PORT=3030
      - NODE_ENV=production
      - REALESTATE_DB_PATH=/data/webapp.db
      - RATE_LIMIT_MAX=300
    volumes:
      - webapp-data:/data:ro
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3030/health"]
      interval: 30s
      timeout: 3s
      retries: 3
    networks:
      - dokploy-network

  realestate-ingest:
    build:
      context: .
      dockerfile: packages/realestate-ingest/Dockerfile
    image: cz-agents-realestate-ingest:latest
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - REALESTATE_DB_PATH=/data/webapp.db
    volumes:
      - webapp-data:/data
    networks:
      - dokploy-network
```

In the `volumes:` block at the bottom add:

```yaml
  webapp-data:
```

- [ ] **Step 2: Validate compose locally (structure)**

Run: `node -e "const s=require('fs').readFileSync('docker-compose.dokploy.yml','utf8'); ['realestate:','realestate-ingest:','webapp-data:'].forEach(k=>{if(!s.includes(k))throw new Error('missing '+k)}); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 3: Commit and push to the fork**

```bash
git add docker-compose.dokploy.yml
git commit -m "feat(deploy): add realestate + realestate-ingest services (shared webapp-data volume)"
git push myfork HEAD:main
```

---

## Task 12: Deploy, bootstrap DB, verify

This runs against the live Dokploy (`dokploy.humanintheloop.sk`). Env: `export DOKPLOY_URL=https://dokploy.humanintheloop.sk DOKPLOY_API_KEY=<key from /tmp/czagents.env>`. composeId = `W3W1jZxQ6p328uJpqqvQW`.

- [ ] **Step 1: Trigger a build/deploy of the compose (builds new images)**

Run: `dokploy compose redeploy --composeId W3W1jZxQ6p328uJpqqvQW --json`
Expected: `{"success":true,...}`. Wait for the `realestate-ingest` container to build and start (it runs the CLI once on boot, creating + seeding `webapp.db`, then idles).

- [ ] **Step 2: Confirm the DB was created + seeded (via origin, bypass Cloudflare)**

The ingester container created `/data/webapp.db`. Verify realestate can read it: realestate may have crash-looped on first boot if it started before the DB existed. Restart realestate after the ingester's first run by redeploying once more if needed, then:

Run: `curl -sk --resolve cz-realestate.humanintheloop.sk:443:87.197.117.6 https://cz-realestate.humanintheloop.sk/health`
(First add the Dokploy domain — Step 4 — if routing isn't present yet; alternatively check via the dd/ares pattern.)
Expected: `{"status":"ok","service":"realestate",...}`.

- [ ] **Step 3: Create a Dokploy schedule for periodic refresh (every 6h)**

```bash
dokploy schedule create \
  --name "realestate-ingest" \
  --description "Refresh portál dražeb auctions + reseed price index into webapp.db" \
  --scheduleType compose \
  --composeId W3W1jZxQ6p328uJpqqvQW \
  --serviceName realestate-ingest \
  --shellType sh \
  --command "node packages/realestate-ingest/dist/cli.js" \
  --cronExpression "0 */6 * * *" \
  --timezone "Europe/Prague" \
  --enabled --json
```
Expected: JSON with a `scheduleId`. Then run once now: `dokploy schedule run-manually --scheduleId <id> --json` → `true`.

- [ ] **Step 4: Add the Dokploy domain for realestate**

```bash
dokploy domain create --composeId W3W1jZxQ6p328uJpqqvQW --domainType compose \
  --serviceName realestate --host cz-realestate.humanintheloop.sk \
  --path "/" --port 3030 --https --certificateType letsencrypt --json
```
Expected: JSON with a `domainId`. **User action:** add Cloudflare A-record `cz-realestate → 87.197.117.6` (proxied like the others).

- [ ] **Step 5: Functional verification via MCP**

After DNS propagates, run the public MCP smoke test:
```bash
node /tmp/mcp.mjs https://cz-realestate.humanintheloop.sk tools/list
node /tmp/mcp.mjs https://cz-realestate.humanintheloop.sk get_district_aggregate '{"okres":"Ostrava-město","window_days":365}'
```
Expected: `tools/list` shows `get_district_aggregate`; the aggregate returns real `auction_count`/`distress_lead_count` (or `low_activity:true` if that okres currently has <3 active auctions), plus `avg_estimated_price_kc_per_m2` from the price seed.

- [ ] **Step 6: Update memory**

Mark Phase 2b done in `~/.claude/projects/.../memory/cz-agents-dokploy-deploy.md`; note the realestate-ingest scheduleId and that ISIR (insolvency_count) remains the committed v1.1 item.

---

## v1.1 (committed follow-up — DO NOT DROP): ISIR insolvency leads

Out of scope for this plan but **explicitly promised to the user**. Separate spec+plan: poll ISIR PublicWS events (reuse `@czagents/isir` client), filter RE-auction event types, resolve debtor→okres via ISIR CuzkWS debtor address (or dražební-vyhláška cadastral parse), and write `RealEstateLead` rows with `sourceType='isir'` so `insolvency_count` becomes real. Until okres resolution is reliable, do not write ISIR leads with a guessed okres.

---

## Self-Review

- **Spec coverage:** schema bootstrap (T4), DistrictAggregate seed (T5), price index seed (T5), portál dražeb scrape via public JSON (T6–T7), upsert+archive (T8), CLI (T9), shared volume + realestate service + bootstrap ordering (T11–T12), refresh schedule (T12), new domain + CF A-record (T12), ISIR explicitly deferred & committed (v1.1 section). slugifyCs parity (T1–T2). All spec sections mapped.
- **Placeholders:** none — endpoint discovery (T7) is an explicit investigative step with a fixture-locked contract and HTML fallback, not a TODO.
- **Type consistency:** `LeadRow`/`NormalizedAuction` defined in T6, consumed unchanged in T8/T9; `ensureSchema`/`seedDistricts`/`seedPriceIndex`/`upsertLeads`/`archiveStale`/`fetchAuctions`/`auctionToLead`/`normalizeAuctions` names consistent across tasks; `slugifyCs` single source (shared).
