/**
 * Opt-out registry check — GDPR right to object materialized.
 *
 * MUST be called BEFORE tier gate (= opt-out is absolute right, not tier-
 * gated). If any identifier (ICO, owner name, RUIAN parcel) matches an
 * OptOutEntry, the property is treated as "not found" — never expose
 * even at paid tier.
 *
 * Reference: cz-agents-realestate-launch-plan.md Section 12 + Section 7
 * (GDPR self-review).
 */

import { getDb } from './db.js';

export type OptOutKey = {
  ico?: string | null;
  ruianId?: string | null;
  ownerName?: string | null;
};

let _stmt: ReturnType<ReturnType<typeof getDb>['prepare']> | null = null;

function getStmt() {
  if (_stmt) return _stmt;
  _stmt = getDb().prepare(
    'SELECT 1 FROM OptOutEntry WHERE identifier = @value AND identifierType = @type LIMIT 1',
  );
  return _stmt;
}

export function isOptedOut(key: OptOutKey): boolean {
  const stmt = getStmt();
  const checks: Array<{ value: string; type: string }> = [];
  if (key.ico) checks.push({ value: key.ico, type: 'ico' });
  if (key.ruianId) checks.push({ value: key.ruianId, type: 'ruian' });
  if (key.ownerName) checks.push({ value: key.ownerName.toLowerCase().trim(), type: 'name' });
  for (const c of checks) {
    const hit = stmt.get(c);
    if (hit) return true;
  }
  return false;
}
