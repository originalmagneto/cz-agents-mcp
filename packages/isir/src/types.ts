/**
 * Public shape returned by ISIR queries. Stable contract — `@czagents/dd`
 * consumes this via the structural `IsirLike` interface in dd/clients.ts.
 *
 * `null` from `checkActiveInsolvency` means "no record found" (not an error).
 * Errors propagate as thrown exceptions.
 */

export interface InsolvencyStatus {
  ico: string;
  has_active: boolean;
  /** Czech case number, e.g. "KSPH 60 INS 999/2025". Present if has_active. */
  spisova_znacka?: string;
  /** ISO date when the proceeding started. */
  started_on?: string;
  /** Free text describing current phase: "konkurs", "oddlužení", "moratorium", … */
  phase?: string;
  /** Source-specific ID for fetching detail later. */
  source_proceeding_id?: string | number;
}

export interface ProceedingDetail extends InsolvencyStatus {
  debtor_name?: string;
  court?: string;
  insolvency_administrator?: string;
  events?: Array<{
    date?: string;
    type?: string;
    description?: string;
  }>;
  raw?: unknown;
}

export interface RecentProceedings {
  since: string;
  until: string;
  proceedings: InsolvencyStatus[];
}
