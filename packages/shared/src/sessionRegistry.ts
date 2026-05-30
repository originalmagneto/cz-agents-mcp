import { TtlMap } from './cache.js';

interface ClosableTransport {
  close(): Promise<void>;
}

const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 10_000;

/**
 * Retains MCP transports while clients reuse a session. Abandoned sessions are
 * closed after TTL; the hard cap prevents hostile session churn from retaining
 * SDK server state indefinitely.
 */
export function createSessionRegistry<T extends ClosableTransport>(): TtlMap<string, T> {
  return new SessionRegistry<T>({
    ttlMs: positiveEnv('MCP_SESSION_TTL_MS', DEFAULT_SESSION_TTL_MS),
    maxSize: positiveEnv('MCP_SESSION_MAX', DEFAULT_MAX_SESSIONS),
    sweepIntervalMs: 60_000,
    onEvict: (_id, transport) => {
      void transport.close().catch((err: unknown) => {
        console.error('[cz-agents/shared] failed to close evicted MCP transport:', err);
      });
    },
  });
}

class SessionRegistry<T extends ClosableTransport> extends TtlMap<string, T> {
  override get(id: string): T | undefined {
    const transport = super.get(id);
    if (transport) this.set(id, transport);
    return transport;
  }
}

function positiveEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
