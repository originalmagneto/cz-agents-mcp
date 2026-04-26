/**
 * Origin header validation for MCP HTTP transport.
 *
 * Required by Anthropic Connectors Directory submission criteria. The
 * Streamable HTTP MCP spec is browser-fetchable, so without an Origin
 * allowlist a malicious page could trigger MCP calls via the user's
 * authenticated session (CSRF / SSRF blast).
 *
 * Default allowlist covers:
 *   - claude.ai / claude.com / anthropic.com (official MCP clients,
 *     including subdomains)
 *   - cz-agents.dev (own marketing pages doing demo calls)
 *   - localhost / 127.0.0.1 (development)
 *   - app:// (Claude Desktop / Electron MCP clients)
 *   - chrome-extension:// (browser-extension MCP clients)
 *
 * Override via env: ALLOWED_ORIGINS="https://foo.bar,https://baz.qux".
 *
 * Requests with NO Origin header (e.g. direct curl, Claude Desktop stdio
 * tunnelled) are allowed — Origin is a browser-only signal, missing == not
 * a browser request.
 *
 * Rejected origins are logged to stderr (X-Origin-Rejected header echoed
 * for client-side debugging) so we can spot legit clients we forgot to
 * allowlist.
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
  // null Origin (typical for Electron/Claude Desktop without explicit origin)
  'null',
];

const DEFAULT_ALLOWED_PATTERNS: ReadonlyArray<RegExp> = [
  /^app:\/\/.*$/,                    // Claude Desktop / Electron
  /^chrome-extension:\/\/.*$/,        // browser-extension MCP clients
  /^https:\/\/[^/]+\.claude\.ai$/,    // claude.ai subdomains
  /^https:\/\/[^/]+\.claude\.com$/,   // claude.com subdomains
  /^https:\/\/[^/]+\.anthropic\.com$/,// anthropic.com subdomains
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
 * (server-to-server / stdio tunnel cases). Rejected origins are logged
 * to stderr for diagnostics.
 */
export function checkOrigin(req: IncomingMessage, res: ServerResponse): boolean {
  const raw = req.headers.origin;
  const origin = Array.isArray(raw) ? raw[0] : raw;
  if (!origin) return true;

  const allowed = allowedSet();
  if (allowed.has(origin)) return true;

  if (DEFAULT_ALLOWED_PATTERNS.some((re) => re.test(origin))) return true;

  console.error(
    `[origin] rejected origin=${JSON.stringify(origin)} ua=${JSON.stringify(req.headers['user-agent'] ?? '')}`,
  );

  if (!res.headersSent) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Origin-Rejected', origin);
    res.end(JSON.stringify({
      error: 'origin_not_allowed',
      origin,
      hint: 'Set ALLOWED_ORIGINS env var on the server to allow your origin, or contact the operator.',
    }));
  }
  return false;
}

/** For tests: reset memoized allowlist after env mutation. */
export function _resetOriginAllowlistCache(): void {
  cachedAllowed = null;
}
