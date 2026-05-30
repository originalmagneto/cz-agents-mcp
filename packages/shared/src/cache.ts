/**
 * Tiny in-memory LRU-ish TTL cache — protects upstream APIs (ARES) from
 * getting hammered with repeated identical queries.
 *
 * Not distributed — per-process. For multi-replica deploy, swap for Redis.
 */

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export interface TtlMapOptions<K, V> {
  ttlMs: number;
  maxSize: number;
  sweepIntervalMs?: number | false;
  onEvict?: (key: K, value: V) => void;
}

/**
 * Process-local Map with a hard entry cap and active expiry. Reads refresh LRU
 * position but not TTL, so frequently-read stale data still expires.
 */
export class TtlMap<K, V> implements Iterable<[K, V]> {
  private readonly map = new Map<K, Entry<V>>();
  private readonly ttlMs: number;
  private readonly maxSize: number;
  private readonly onEvict?: (key: K, value: V) => void;
  private sweeping = false;

  constructor(opts: TtlMapOptions<K, V>) {
    this.ttlMs = opts.ttlMs;
    this.maxSize = opts.maxSize;
    this.onEvict = opts.onEvict;

    const sweepIntervalMs = opts.sweepIntervalMs ?? Math.min(this.ttlMs, 60_000);
    if (sweepIntervalMs !== false) {
      const timer = setInterval(() => this.sweep(), sweepIntervalMs);
      timer.unref();
    }
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.evict(key, entry);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  set(key: K, value: V, ttlMs = this.ttlMs): this {
    this.sweep();
    this.map.delete(key);
    while (this.map.size >= this.maxSize) {
      const oldest = this.map.entries().next();
      if (oldest.done) break;
      const sizeBeforeEviction = this.map.size;
      this.evict(oldest.value[0], oldest.value[1]);
      if (this.map.size >= sizeBeforeEviction) break;
    }
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
    return this;
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  sweep(): void {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const now = Date.now();
      for (const [key, entry] of this.map) {
        if (entry.expiresAt <= now) this.evict(key, entry);
      }
    } finally {
      this.sweeping = false;
    }
  }

  get size(): number {
    this.sweep();
    return this.map.size;
  }

  *[Symbol.iterator](): IterableIterator<[K, V]> {
    this.sweep();
    for (const [key, entry] of this.map) {
      yield [key, entry.value];
    }
  }

  private evict(key: K, entry: Entry<V>): void {
    if (!this.map.delete(key)) return;
    this.onEvict?.(key, entry.value);
  }
}

export class TtlCache<K, V> {
  private readonly map: TtlMap<K, V>;

  constructor(opts: { ttlMs: number; maxSize?: number }) {
    this.map = new TtlMap({ ttlMs: opts.ttlMs, maxSize: opts.maxSize ?? 1000 });
  }

  get(key: K): V | undefined {
    return this.map.get(key);
  }

  set(key: K, value: V): void {
    this.map.set(key, value);
  }

  async memoize<T extends V>(key: K, loader: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached as T;
    const value = await loader();
    this.set(key, value);
    return value;
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
