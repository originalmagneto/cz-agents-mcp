import { describe, it, expect, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { checkOrigin, _resetOriginAllowlistCache } from '../origin.js';

function mockReq(headers: Record<string, string> = {}): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

function mockRes() {
  const r: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    headersSent: false,
    body: '',
    setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; },
    writeHead(code: number) { this.statusCode = code; this.headersSent = true; },
    end(body?: string) { if (body) this.body = body; this.headersSent = true; },
  };
  return r as ServerResponse & typeof r;
}

afterEach(() => {
  _resetOriginAllowlistCache();
  delete process.env.ALLOWED_ORIGINS;
});

describe('checkOrigin', () => {
  it('allows request without Origin header (server-to-server)', () => {
    expect(checkOrigin(mockReq({}), mockRes())).toBe(true);
  });

  it('allows whitelisted Anthropic origin', () => {
    expect(checkOrigin(mockReq({ origin: 'https://claude.ai' }), mockRes())).toBe(true);
    expect(checkOrigin(mockReq({ origin: 'https://claude.com' }), mockRes())).toBe(true);
  });

  it('allows own marketing origin cz-agents.dev', () => {
    expect(checkOrigin(mockReq({ origin: 'https://cz-agents.dev' }), mockRes())).toBe(true);
  });

  it('allows localhost for development', () => {
    expect(checkOrigin(mockReq({ origin: 'http://localhost:3000' }), mockRes())).toBe(true);
  });

  it('rejects unknown origin with 403', () => {
    const res = mockRes();
    expect(checkOrigin(mockReq({ origin: 'https://evil.example.com' }), res)).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).origin).toBe('https://evil.example.com');
  });

  it('allows app:// Electron origins (Claude Desktop)', () => {
    expect(checkOrigin(mockReq({ origin: 'app://obsidian.md' }), mockRes())).toBe(true);
    expect(checkOrigin(mockReq({ origin: 'app://-' }), mockRes())).toBe(true);
  });

  it('allows browser-extension Origins', () => {
    expect(checkOrigin(mockReq({ origin: 'chrome-extension://abc123' }), mockRes())).toBe(true);
  });

  it('allows claude.ai subdomains via pattern', () => {
    expect(checkOrigin(mockReq({ origin: 'https://api.claude.ai' }), mockRes())).toBe(true);
    expect(checkOrigin(mockReq({ origin: 'https://app.claude.com' }), mockRes())).toBe(true);
  });

  it('allows literal null Origin string (Electron/file://)', () => {
    expect(checkOrigin(mockReq({ origin: 'null' }), mockRes())).toBe(true);
  });

  it('respects ALLOWED_ORIGINS env override', () => {
    process.env.ALLOWED_ORIGINS = 'https://my.app,https://other.io';
    _resetOriginAllowlistCache();
    expect(checkOrigin(mockReq({ origin: 'https://my.app' }), mockRes())).toBe(true);
    expect(checkOrigin(mockReq({ origin: 'https://claude.ai' }), mockRes())).toBe(false);
  });
});
