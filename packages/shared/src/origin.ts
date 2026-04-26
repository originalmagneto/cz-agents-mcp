/**
 * Origin header validation for MCP HTTP transport.
 *
 * Required by Anthropic Connectors Directory submission criteria. The
 * Streamable HTTP MCP spec is browser-fetchable, so without an Origin
 * allowlist a malicious page could trigger MCP calls via the user's
 * authenticated session (CSRF / SSRF blast).
 *
 * Default allowlist covers:
 *   - claude.ai / claude.com / anthropic.com (official MCP clients)
 *   - cz-agents.dev (own marketing pages doing demo calls)
 *   - localhost / 127.0.0.1 (development)
 *
 * Override via env: ALLOWED_ORIGINS="https://foo.bar,https://baz.qux".
 *
 * Requests with NO Origin header (e.g. direct curl, Claude Desktop stdio
 * tunnelled) are allowed — Origin is a browser-only signal, missing == not
 * a browser request.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

const DEFAULT_ALLOWED = [
  'https://claude.ai',
  'https://claude.com',
  'https://www.claude.com',
  'https://anthropic.com',
  'https://www.anthropic.com',
  'https://cz-agents.dev',
  'https://www.cz-agents.dev',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
];

let cachedAllowed: ReadonlySet<string> | null = null;

function allowedSet(): ReadonlySet<string> {
  if (cachedAllowed) return cachedAllowed;
  const env = process.env.ALLOWED_ORIGINS;
  const list = env
    ? env.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_ALLOWED;
  cachedAllowed = new Set(list);
  return cachedAllowed;
}

/**
 * Validates the Origin header. Returns true to continue request, false
 * if the response was already finalized (403). Missing Origin = allowed
 * (server-to-server / stdio tunnel cases).
 */
export function checkOrigin(req: IncomingMessage, res: ServerResponse): boolean {
  const raw = req.headers.origin;
  const origin = Array.isArray(raw) ? raw[0] : raw;
  if (!origin) return true;

  const allowed = allowedSet();
  if (allowed.has(origin)) return true;

  if (!res.headersSent) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'origin_not_allowed', origin }));
  }
  return false;
}

/** For tests: reset memoized allowlist after env mutation. */
export function _resetOriginAllowlistCache(): void {
  cachedAllowed = null;
}
