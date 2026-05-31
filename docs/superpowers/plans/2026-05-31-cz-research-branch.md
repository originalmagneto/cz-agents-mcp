# CZ research branch for client-research — Implementation Plan

> **For agentic workers:** additive extension of the existing `client-research` skill. Author skill files (Markdown + one Node helper). No TDD/unit tests (skill content); verification = a golden dossier run on a known IČO. Steps use `- [ ]`.

**Goal:** Add a Czech jurisdiction branch to the existing `client-research` skill: Phase-1 asks SK/CZ, CZ routes to 7 CZ source playbooks driven by the deployed cz-agents MCP (public HTTPS endpoints), with bidirectional SK↔CZ cross-border hand-off and mermaid-rich rendering.

**Skill root (source-of-truth, symlinked live):** `/Users/Magneto/PROJECTS/AI-SKILLS/client-research/`
**Constraint:** ADDITIVE — do not break the existing SK flow. Mirror the structure/format of the existing SK playbooks (`references/sources/sk-companies.md`) and agents (`agents/cr-orsr-agent.md`).

**cz-agents endpoints (free tier, no auth):** `https://cz-<svc>.humanintheloop.sk/mcp` for svc ∈ {ares,cnb,sanctions,isir,adis,dd,eu-registry,realestate}. MCP is Streamable-HTTP, stateful, JSON responses; handshake initialize → notifications/initialized → tools/call with `mcp-session-id` header.

**cz-agents tools (name {args}):**
- ARES: `lookup_by_ico{ico}`, `search_companies{query}`, `get_statutaries{ico}`, `check_vat_payer{ico}`, `get_bank_accounts{ico}`, `get_history{ico}`, `validate_dic{dic}`, `search_by_address`, `search_by_nace`
- dd: `get_risk_score{ico}`, `get_dd_report{ico,depth}`, `get_statutory_chain{ico,max_depth}`
- sanctions: `search_person{name,dob?,nationality?,threshold?}`, `search_entity{name,country?,threshold?}`, `check_ico{ico,name?}`, `get_listing{id}`, `list_recent_updates{since,source?}`
- isir: `check_ico_insolvency{ico}`, `search_person_insolvency{ico?,rc?,dob?,firstname?,surname?}`, `poll_isir_events{since}`
- adis: `check_dph_payer{ico|dic}`, `check_bulk_dph_payer`, `list_unreliable_payers`
- eu-registry: `get_eu_company{country,id}`, `get_eu_parent{ico}`, `get_eu_dd_report{country,id}`
- realestate: `get_district_aggregate{okres,window_days}`

---

## File Structure
- Create `scripts/cz-mcp.mjs` — bundled MCP client (call any cz-agents tool, prints JSON).
- Create `references/sources/cz-companies.md` — ARES identity (company + person search).
- Create `references/sources/cz-dd.md` — dd risk score + statutory chain (+ mermaid hint).
- Create `references/sources/cz-insolvency.md` — ISIR.
- Create `references/sources/cz-vat.md` — ADIS DPH reliability.
- Create `references/sources/cz-sanctions.md` — sanctions (EU+OFAC) person/entity/IČO.
- Create `references/sources/cz-eu-registry.md` — EU parent / cross-border.
- Create `references/sources/cz-realestate.md` — distress RE by okres (conditional).
- Create `agents/cr-cz-agent.md` — one CZ source subagent driving the suite via cz-mcp.mjs.
- Modify `references/workflows/source-matrix.md` — add "## Companies (CZ)" + "## Persons (CZ)" tables + bidirectional cross-border trigger note.
- Modify `SKILL.md` — Phase-1 jurisdiction step (SK/CZ), CZ dispatch note, bidirectional hand-off.
- Modify `references/templates/company-dossier-index.md.tmpl` — add a "Risk banner" + "Štruktúra (mermaid)" section (shared SK/CZ, optional-fill).

---

## Task 1: Bundled CZ MCP client
**Files:** Create `scripts/cz-mcp.mjs`

- [ ] **Step 1: Write the client** (adapted from the verified /tmp/mcp.mjs)

```javascript
#!/usr/bin/env node
// Minimal MCP Streamable-HTTP client for the deployed cz-agents servers.
// Usage: node cz-mcp.mjs <svc> <tool|tools/list> [jsonArgs]
//   node cz-mcp.mjs dd get_risk_score '{"ico":"01874519"}'
//   node cz-mcp.mjs ares search_companies '{"query":"Universal One"}'
const [svc, what, argsJson] = process.argv.slice(2);
if (!svc || !what) { console.error('usage: cz-mcp.mjs <svc> <tool|tools/list> [jsonArgs]'); process.exit(2); }
const url = `https://cz-${svc}.humanintheloop.sk/mcp`;
const ACCEPT = 'application/json, text/event-stream';
async function rpc(body, sid) {
  const headers = { 'Content-Type': 'application/json', Accept: ACCEPT };
  if (sid) headers['mcp-session-id'] = sid;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  const m = text.match(/data:\s*(\{[\s\S]*\})/);
  let json = null; try { json = JSON.parse(m ? m[1] : text); } catch {}
  return { sid: res.headers.get('mcp-session-id'), json, status: res.status, text };
}
const init = await rpc({ jsonrpc:'2.0', id:1, method:'initialize', params:{ protocolVersion:'2024-11-05', capabilities:{}, clientInfo:{ name:'client-research-cz', version:'1.0' } } });
if (!init.sid) { console.error('INIT FAILED', init.status, init.text.slice(0,300)); process.exit(1); }
await rpc({ jsonrpc:'2.0', method:'notifications/initialized', params:{} }, init.sid);
const body = what === 'tools/list'
  ? { jsonrpc:'2.0', id:2, method:'tools/list', params:{} }
  : { jsonrpc:'2.0', id:2, method:'tools/call', params:{ name:what, arguments: argsJson ? JSON.parse(argsJson) : {} } };
const out = await rpc(body, init.sid);
console.log(JSON.stringify(out.json ?? out.text, null, 2));
```

- [ ] **Step 2: Smoke-test it**

Run: `node /Users/Magneto/PROJECTS/AI-SKILLS/client-research/scripts/cz-mcp.mjs dd get_risk_score '{"ico":"01874519"}'`
Expected: JSON containing `"company_name": "Universal One, s.r.o."` and `"value": 5`.

- [ ] **Step 3: Commit** (`git -C /Users/Magneto/PROJECTS/AI-SKILLS/client-research` if it's a repo; otherwise skip commit — note in summary).

---

## Tasks 2-8: CZ source playbooks (one per source — parallelizable)

For EACH playbook below: read the closest SK equivalent (`references/sources/sk-companies.md` for structure, `sk-vat-status.md`, `int-sanctions.md`, `sk-courts.md`) to mirror frontmatter + section style, then write the CZ playbook using the cz-agents tools via `scripts/cz-mcp.mjs`. Frontmatter keys: `source, source_name, access: node (cz-mcp.mjs → https), tools, output, subject_types, modes`. Each must: state "When this fires" (per source-matrix), "Inputs", numbered "Procedure" with exact `node scripts/cz-mcp.mjs <svc> <tool> '<args>'` calls, save raw JSON to `evidence/NN-cz-<src>.raw.json`, and cite `[src: https://cz-<svc>.humanintheloop.sk/mcp tool=<tool> retrieved YYYY-MM-DD]`.

- [ ] **Task 2 — `cz-companies.md`** (ARES). Company: `lookup_by_ico`, `get_statutaries`, `check_vat_payer`, `get_bank_accounts`, `get_history`; name → `search_companies` first. Person: `search_companies{query=name}` (appearances). Identity bedrock, all modes.
- [ ] **Task 3 — `cz-dd.md`** (dd). `get_risk_score{ico}` (Quick+), `get_statutory_chain{ico,max_depth}` (Standard+, depth 2 / Deep 3), `get_dd_report{ico,depth}` (Deep). Output includes a **mermaid `graph TD`** of the statutory chain (instruct how to build it from the chain JSON) for the dossier.
- [ ] **Task 4 — `cz-insolvency.md`** (ISIR). Company: `check_ico_insolvency{ico}`. Person: `search_person_insolvency{firstname,surname,dob?}`. Note v0.1 alpha limitations.
- [ ] **Task 5 — `cz-vat.md`** (ADIS). `check_dph_payer{ico}` → status (ANO/NE/NENALEZEN), transparent accounts, unreliable-since.
- [ ] **Task 6 — `cz-sanctions.md`** (sanctions). Person: `search_person{name,dob?}`; entity: `search_entity{name}`; company: `check_ico{ico,name}`. EU+OFAC; threshold default 80.
- [ ] **Task 7 — `cz-eu-registry.md`** (eu-registry). `get_eu_parent{ico}` (cross-border parent via GLEIF/LEI); `get_eu_company{country,id}` for a found SK/foreign parent → **bidirectional hand-off** note (SK parent → SK branch). Standard trigger-only / Deep ●.
- [ ] **Task 8 — `cz-realestate.md`** (realestate, conditional). `get_district_aggregate{okres,window_days}` for the subject's okres (from ARES sídlo) — distress context. Deep / RE-relevant only.

Each task: write the file, then commit (or note). No tests beyond the cz-mcp.mjs smoke check.

---

## Task 9: CZ source subagent
**Files:** Create `agents/cr-cz-agent.md`

- [ ] **Step 1:** Mirror `agents/cr-orsr-agent.md` frontmatter/format. `name: cr-cz-agent`; description (spawned by client-research for CZ runs; drives the cz-agents MCP suite via `scripts/cz-mcp.mjs`); `tools: Read, Write, Bash, WebSearch`; `model: sonnet`. Body: read the CZ playbook(s) named in the invocation, run the `node scripts/cz-mcp.mjs …` calls, write source notes to `sources/NN-cz-<src>.md` via the source-note template, save raw to `evidence/`, cite every line, return only the output path. Hard rules identical to SK agents (no recursion, fill template on failure).
- [ ] **Step 2: Commit.**

---

## Task 10: source-matrix + intake + template wiring
**Files:** Modify `references/workflows/source-matrix.md`, `SKILL.md`, `references/templates/company-dossier-index.md.tmpl`

- [ ] **Step 1 — source-matrix:** add "## Companies (CZ)" and "## Persons (CZ)" tables mirroring the SK ones, columns Ultraquick/Quick/Standard/Deep/Access/Playbook, rows: ARES(cz-companies ● all), dd(cz-dd ● Quick+), ADIS(cz-vat ● Quick+), ISIR(cz-insolvency ● Quick+), sanctions(cz-sanctions ● Standard+), eu-registry(cz-eu-registry trigger/Deep ●), realestate(cz-realestate Deep/conditional), media+LinkedIn (reuse existing). Update the cross-border trigger to be **bidirectional** (SK→CZ and CZ→SK).
- [ ] **Step 2 — SKILL.md Phase 1:** after the person/company step, add: "**Jurisdiction.** SK or CZ? (IČO format/registry hint may pre-fill; else ask.) CZ → use the CZ source-matrix + cr-cz-agent. Cross-border owners trigger the other jurisdiction's sources." Add a one-line CZ dispatch note in Phase 2 (spawn `cr-cz-agent` per CZ playbook, same parallel caps).
- [ ] **Step 3 — template:** in `company-dossier-index.md.tmpl` add two optional sections: "## Risk banner" (score/level/top flags table — filled from dd `get_risk_score`) and "## Štruktúra (mermaid)" (the `graph TD` statutory chain). Keep them optional so SK dossiers without them still render.
- [ ] **Step 4: Commit.**

---

## Task 11: Golden verification (the real test)
- [ ] **Step 1:** Dry-run the CZ Quick path manually for **Universal One s.r.o. (IČO 01874519)** using `cz-mcp.mjs`: ARES `lookup_by_ico` + dd `get_risk_score` + sanctions `check_ico` + isir `check_ico_insolvency` + adis `check_dph_payer`. Confirm each returns data.
- [ ] **Step 2:** Confirm the playbooks' documented calls match the live tool outputs (field names). Fix any drift.
- [ ] **Step 3:** Confirm a mermaid `graph TD` can be built from `get_statutory_chain{ico:"01874519",max_depth:2}` output (sanity: valid mermaid).
- [ ] **Step 4:** Summary: list created/modified files; note the skill is live (symlinked); CZ branch ready; Excalidraw = v1.1; ISIR-into-realestate = separate deferred item.

---

## Self-Review
- Coverage: jurisdiction intake (T10), 7 CZ sources (T2–T8), CZ agent (T9), matrix+template+mermaid (T10), bidirectional cross-border (T7,T10), client (T1), golden run (T11). Persons handled in cz-companies/cz-sanctions/cz-insolvency. Excalidraw explicitly deferred.
- Additive-only: all new files except additive edits to source-matrix/SKILL/template — SK flow untouched.
- Tool names/args match the live cz-agents servers (verified during Phase-1/2b testing).
