import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const sandboxHmacSecret = process.env.SANDBOX_HMAC_SECRET;
if (!sandboxHmacSecret) {
  throw new Error('SANDBOX_HMAC_SECRET env var is required for sandbox endpoint');
}
const SANDBOX_HMAC_SECRET: string = sandboxHmacSecret;

const DAILY_LIMIT = 3;
const sandboxLimits = new Map<string, { count: number; resetAt: number }>();

function nextMidnightUTC(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

// IPv6: bucket on /64 prefix to prevent trivial address rotation.
// IPv4-mapped IPv6 (::ffff:1.2.3.4) is normalised to plain IPv4.
function normalizeIp(raw: string): string {
  if (raw.startsWith('::ffff:')) return raw.slice(7);
  if (raw.includes(':')) {
    const groups = raw.split(':');
    return groups.slice(0, 4).join(':') + '::/64';
  }
  return raw;
}

function rawClientIp(req: IncomingMessage): string {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.length > 0) return cf;
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const xr = req.headers['x-real-ip'];
  if (typeof xr === 'string' && xr.length > 0) return xr;
  return req.socket.remoteAddress ?? 'unknown';
}

// Exported so http.ts can use the same IP for getSandboxMeta — avoids divergence.
export function getSandboxIp(req: IncomingMessage): string {
  return normalizeIp(rawClientIp(req));
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function getOrCreateEntry(ip: string): { count: number; resetAt: number } {
  const now = Date.now();
  let entry = sandboxLimits.get(ip);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: nextMidnightUTC() };
    sandboxLimits.set(ip, entry);
  }
  return entry;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of sandboxLimits) {
    if (entry.resetAt <= now) sandboxLimits.delete(ip);
  }
}, 60 * 60_000).unref();

export function signSandboxToken(ip: string, date: string, count: number): string {
  return createHmac('sha256', SANDBOX_HMAC_SECRET)
    .update(ip + ':' + date + ':' + count)
    .digest('base64url');
}

// checkSandboxLimit is synchronous — all read/validate/increment runs in one
// event-loop tick (Node.js single-threaded), so no concurrent interleaving.
export function checkSandboxLimit(req: IncomingMessage, res: ServerResponse): boolean {
  const ip = getSandboxIp(req);
  const today = todayUTC();
  const entry = getOrCreateEntry(ip);

  if (entry.count >= DAILY_LIMIT) {
    writeJson(res, 429, {
      error: 'sandbox_limit_reached',
      message: 'Anon sandbox: 3 calls/day. Get free API key (30 calls/day).',
      signup: 'https://cz-agents.dev/pricing.html',
    });
    return false;
  }

  if (entry.count > 0) {
    const tokenHeader = req.headers['x-continue-token'];
    const provided = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
    const expected = signSandboxToken(ip, today, entry.count);
    const providedBuffer = Buffer.from(provided ?? '', 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');

    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      writeJson(res, 403, {
        error: 'invalid_token',
        message: 'X-Continue-Token is missing or invalid. Each response includes _sandbox.token — pass it back to continue.',
      });
      return false;
    }
  }

  entry.count += 1;
  res.setHeader('X-Sandbox-Remaining', (DAILY_LIMIT - entry.count).toString());
  res.setHeader('X-Sandbox-Reset', new Date(entry.resetAt).toISOString());
  return true;
}

export function getSandboxMeta(ip: string): { remaining: number; token: string; resets_at: string } {
  const entry = getOrCreateEntry(ip);
  const today = todayUTC();
  return {
    remaining: DAILY_LIMIT - entry.count,
    token: signSandboxToken(ip, today, entry.count),
    resets_at: new Date(entry.resetAt).toISOString(),
  };
}
