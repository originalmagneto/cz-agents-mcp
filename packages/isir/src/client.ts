/**
 * IsirClient — talks to the ISIR public web service.
 *
 * Status (v0.1.0): SCAFFOLDED.
 *
 * Real upstream is the SOAP web service at
 *   https://isir.justice.cz:8443/isir_public_ws/IsirWsPublicService
 * The WSDL exposes `getIsirWsCuzkData` and related operations that take an IČO
 * (or RČ) and return registered insolvency proceedings + events. WSDL is
 * mirrored at github.com/rpliva/HlidacStatu-InsolvencniRejstrik for reference.
 *
 * v0.1.0 ships the right *interface* — a structurally-typed client matching
 * what `@czagents/dd` consumes — backed by a stub that returns "no data found"
 * gracefully. This lets `dd` claim ISIR support today (as a best-effort
 * downgrade) without committing to a fragile half-built SOAP integration.
 *
 * v0.2.0 will swap the stub for a real SOAP+caching implementation. The
 * interface and tool surface are stable; only the internals change.
 *
 * Why not ship a half-built scrape?
 *   The justice.cz web search form requires session+CSRF state we'd have to
 *   reverse-engineer. Failing silently on production traffic is worse than
 *   shipping null and being honest about it.
 */
import { HttpClient } from '@czagents/shared';
import type { InsolvencyStatus, ProceedingDetail } from './types.js';

export interface IsirClientOptions {
  /** Override for the SOAP service URL. Defaults to public production endpoint. */
  endpoint?: string;
  /** When true, the client always returns null/[]. Useful in tests and CI. */
  stub?: boolean;
}

const DEFAULT_ENDPOINT =
  'https://isir.justice.cz:8443/isir_public_ws/IsirWsPublicService';

export class IsirClient {
  private readonly http: HttpClient;
  private readonly endpoint: string;
  private readonly stub: boolean;

  constructor(opts: IsirClientOptions = {}) {
    this.endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
    this.stub = opts.stub ?? !process.env.ISIR_SOAP_ENABLED;
    this.http = new HttpClient({
      baseUrl: this.endpoint,
      timeoutMs: 15_000,
      retries: 1,
    });
  }

  /**
   * Returns active insolvency status for an IČO, or null if no proceeding
   * is recorded. v0.1.0 stub returns null pending real SOAP integration —
   * see file header for migration plan.
   */
  async checkActiveInsolvency(ico: string): Promise<InsolvencyStatus | null> {
    if (this.stub) return null;
    // v0.2.0: build SOAP envelope, POST to this.endpoint, parse fast-xml,
    // map to InsolvencyStatus. Cache result with TtlCache (1 hour).
    throw new Error('Real SOAP integration is not yet implemented (v0.1.0). Set ISIR_SOAP_ENABLED only when v0.2.0 client lands.');
  }

  /** Detail for a known proceeding ID. v0.2.0+. */
  async getProceedingDetail(_id: string | number): Promise<ProceedingDetail | null> {
    if (this.stub) return null;
    throw new Error('Real SOAP integration is not yet implemented (v0.1.0).');
  }

  /** Recent proceedings since a date. v0.2.0+. */
  async listRecentProceedings(_sinceIso: string): Promise<InsolvencyStatus[]> {
    if (this.stub) return [];
    throw new Error('Real SOAP integration is not yet implemented (v0.1.0).');
  }
}
