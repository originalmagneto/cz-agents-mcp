import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';

export const DEFAULT_TTL_MS = 7 * 24 * 3600 * 1000; // 7 days — for stable LEI detail records
export const SEARCH_TTL_MS = 24 * 3600 * 1000; // 24 hours — search results change as entities are added/removed
export const DEFAULT_MAX_ENTRIES = 50_000;

interface CacheRow {
  value: string;
}

/** SQLite-backed cache for GLEIF API responses. Falls back to :memory: if dbPath is not writable. */
export class GleifCache {
  private readonly db: DatabaseType;
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(dbPath?: string, ttlMs: number = DEFAULT_TTL_MS, maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.db = openDb(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gleif_cache (
        key        TEXT    PRIMARY KEY,
        value      TEXT    NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `);
    // Prune expired entries every 6 hours without blocking the event loop.
    const timer = setInterval(() => this.prune(), 6 * 3600 * 1000);
    timer.unref();
  }

  get(key: string): unknown | null {
    const row = this.db
      .prepare<[string, number], CacheRow>(
        'SELECT value FROM gleif_cache WHERE key = ? AND expires_at > ?',
      )
      .get(key, Date.now());

    if (!row) return null;
    try {
      return JSON.parse(row.value) as unknown;
    } catch {
      console.warn('[cz-agents/eu-registry] GleifCache: corrupt entry for key', key, '— evicting');
      this.db.prepare('DELETE FROM gleif_cache WHERE key = ?').run(key);
      return null;
    }
  }

  /** @param ttlOverrideMs — use SEARCH_TTL_MS for search results, omit for LEI detail (uses constructor TTL) */
  set(key: string, value: unknown, ttlOverrideMs?: number): void {
    const expiresAt = Date.now() + (ttlOverrideMs ?? this.ttlMs);
    this.db
      .prepare(
        'INSERT OR REPLACE INTO gleif_cache (key, value, expires_at) VALUES (?, ?, ?)',
      )
      .run(key, JSON.stringify(value), expiresAt);
    this.prune();
  }

  prune(): void {
    this.db
      .prepare('DELETE FROM gleif_cache WHERE expires_at <= ?')
      .run(Date.now());
    this.db
      .prepare(
        `DELETE FROM gleif_cache WHERE key IN (
          SELECT key FROM gleif_cache
          ORDER BY expires_at ASC
          LIMIT MAX((SELECT COUNT(*) FROM gleif_cache) - ?, 0)
        )`,
      )
      .run(this.maxEntries);
  }
}

function openDb(dbPath?: string): DatabaseType {
  if (!dbPath) return new Database(':memory:');
  try {
    return new Database(dbPath);
  } catch {
    console.warn('[cz-agents/eu-registry] GleifCache: cannot open', dbPath, '— falling back to :memory:');
    return new Database(':memory:');
  }
}
