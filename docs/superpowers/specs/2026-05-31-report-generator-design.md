# Report generator — design (scoping)

**Date:** 2026-05-31
**Status:** scoping (planning-only, not yet approved for build)
**What:** A Claude skill that turns cz-agents MCP outputs into polished `.md` reports — rich text, tables, mermaid diagrams, optionally Excalidraw graphics — with report depth scaled by subject scope/type.

## Problem / goal

The 8 cz-agents MCP servers return structured facts (ARES record, dd risk score + statutory chain, sanctions hits, ISIR/ADIS status, EU parent, realestate distress). The user wants a one-shot way to produce a **readable, well-formatted report** about a subject (company/IČO/person), not raw tool dumps — with diagrams and depth matched to the subject.

## Important overlap (must reconcile)

A `client-research` skill already exists (SK registers + LinkedIn/OSINT → Markdown dossier with risk flags, depth tiers Quick/Standard/Deep). This report generator overlaps heavily on the *synthesis + Markdown dossier* side. To avoid duplication, design this as a **CZ-focused rendering/synthesis layer** that:
- sources facts from the **cz-agents MCP** (CZ registers) — the piece client-research doesn't cover;
- adds **rich rendering** (mermaid ownership/statutory graphs, risk-timeline, formatted tables, optional Excalidraw) that client-research doesn't produce;
- reuses client-research's depth-tier and risk-flag conventions for consistency.

**User directive (2026-05-31):** SK and CZ research must be UNIFIED under one entry point. On launch the skill **asks whether the subject is Slovak or Czech**, then routes:
- **SK** → existing `client-research` sources (ORSR, RPVS, Finstat, SK courts, FS VAT, OpenSanctions, LinkedIn/OSINT).
- **CZ** → the cz-agents MCP servers (ARES, dd, sanctions, ISIR, ADIS, eu-registry, realestate).
The two branches **complement each other** (shared depth tiers, shared risk-flag vocabulary, shared dossier format/output location, and cross-border links — e.g. a CZ subject's SK parent via eu-registry hands off to the SK branch, and vice versa). So the report generator is best implemented as the **rich-rendering + CZ-register layer integrated into a single SK/CZ research entry point**, not a standalone CZ-only skill.

Decision (updated): integrate with `client-research` as a jurisdiction-branching entry point (ask SK/CZ → route → shared synthesis + rich rendering), rather than a separate CZ-only skill. Open question: extend `client-research` in place vs. a thin orchestrator that calls into both — to be settled in the report-gen brainstorm.

## Architecture (proposed)

A skill (`SKILL.md` + templates + a small render helper), NOT deployed infra. Flow:
1. **Resolve subject** — IČO directly, or name → ARES `search_companies` → pick IČO.
2. **Gather** (depth-scaled, parallel where possible) via cz-agents MCP:
   - always: ARES `lookup_by_ico` + dd `get_risk_score`.
   - standard+: dd `get_dd_report` / `get_statutory_chain`, sanctions, ISIR, ADIS.
   - deep: eu-registry parent, realestate distress (if RE-relevant), full statutory chain depth 2–3.
3. **Synthesize → Markdown** using deterministic templates:
   - header (identity, IČO, sídlo, právní forma, vznik), risk banner (score + flags table).
   - tables: statutory body, VAT/accounts, sanctions/insolvency status.
   - **mermaid**: statutory/ownership chain (`graph TD`), optional risk timeline.
   - **Excalidraw** (optional, via excalidraw-diagram skill): visual ownership/structure for deep reports.
4. **Depth tiers** scale sections/diagrams: `quick` (identity + risk + flags), `standard` (+ chain + screening tables), `deep` (+ EU parent, RE, Excalidraw, narrative).
5. **Output** `.md` to a dossiers dir (mirror client-research location), report depth auto-suggested from subject (e.g. holding with deep chain → deeper report) but user-overridable.

## Scope decisions for the user
1. Subject types: companies (IČO) only, or also persons? (persons → sanctions/ISIR person search; no ARES record.)
2. ~~New skill vs extend client-research~~ — DECIDED: unified SK/CZ entry point that asks jurisdiction and routes (see overlap section). Remaining: extend client-research in place vs. thin orchestrator over both.
3. Excalidraw: include in v1 (deep tier only) or defer? (Recommended: defer to v1.1; mermaid covers most needs and is inline-renderable in Markdown.)
4. Output language: Slovak (consistent with the user's other skills) — assume yes.

## Effort
Medium — a skill, no infra/deploy. v1 (md + tables + mermaid, 3 depth tiers, companies): ~1–1.5 days incl. templates + a couple of golden-output tests. Excalidraw adds ~0.5 day (v1.1).

## Phased plan outline
1. Brainstorm/confirm scope decisions above (persons?, new-skill?, excalidraw?).
2. Skill scaffold: `SKILL.md` (triggers, depth tiers, MCP tool map), templates dir.
3. Gather layer: deterministic mapping of subject+depth → ordered MCP calls (documented; the skill drives the live MCP servers — which are now deployed).
4. Render layer: Markdown section templates + mermaid chain builder from `get_statutory_chain` output.
5. Golden test: a known IČO (e.g. Universal One 01874519) → expected report sections present, mermaid valid, flags table correct.
6. (v1.1) Excalidraw structure diagram for deep tier.
