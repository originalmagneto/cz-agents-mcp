/**
 * Minimal typed HTTP client with retries + User-Agent branding.
 * Used by each MCP server to fetch data from Czech gov APIs.
 */

export interface HttpClientOptions {
  baseUrl: string;
  userAgent?: string;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body?: string,
  ) {
    super(`HTTP ${status} from ${url}`);
    this.name = 'HttpError';
  }
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly retryDelayMs: number;

  constructor(opts: HttpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.userAgent = opts.userAgent ?? 'cz-agents-mcp/0.1 (+https://cz-agents.dev)';
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.retries = opts.retries ?? 2;
    this.retryDelayMs = opts.retryDelayMs ?? 500;
  }

  async getJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const text = await this.getText(path, init);
    return JSON.parse(text) as T;
  }

  async getText(path: string, init: RequestInit = {}): Promise<string> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        const resp = await fetch(url, {
          ...init,
          signal: ctrl.signal,
          headers: {
            'Accept': 'application/json, text/xml, */*',
            'User-Agent': this.userAgent,
            ...init.headers,
          },
        });
        clearTimeout(timer);
        if (!resp.ok) {
          const body = await resp.text().catch(() => undefined);
          // Don't retry 4xx (client errors)
          if (resp.status >= 400 && resp.status < 500) {
            throw new HttpError(resp.status, url, body);
          }
          throw new HttpError(resp.status, url, body);
        }
        return await resp.text();
      } catch (err) {
        clearTimeout(timer);
        lastErr = err;
        if (err instanceof HttpError && err.status >= 400 && err.status < 500) {
          throw err; // Don't retry client errors
        }
        if (attempt < this.retries) {
          await new Promise((r) => setTimeout(r, this.retryDelayMs * (attempt + 1)));
        }
      }
    }
    throw lastErr;
  }
}
