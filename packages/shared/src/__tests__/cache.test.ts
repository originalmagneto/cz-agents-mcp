import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TtlCache, TtlMap } from '../cache.js';

describe('TtlCache', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stores and retrieves values', () => {
    const c = new TtlCache<string, number>({ ttlMs: 1000 });
    c.set('a', 1);
    expect(c.get('a')).toBe(1);
  });

  it('expires after TTL', () => {
    const c = new TtlCache<string, number>({ ttlMs: 1000 });
    c.set('a', 1);
    vi.advanceTimersByTime(1001);
    expect(c.get('a')).toBeUndefined();
  });

  it('evicts oldest when maxSize reached (LRU-ish)', () => {
    const c = new TtlCache<string, number>({ ttlMs: 10_000, maxSize: 2 });
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3); // evicts 'a'
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBe(2);
    expect(c.get('c')).toBe(3);
  });

  it('get() refreshes LRU position', () => {
    const c = new TtlCache<string, number>({ ttlMs: 10_000, maxSize: 2 });
    c.set('a', 1);
    c.set('b', 2);
    c.get('a'); // touch → b becomes oldest
    c.set('c', 3); // evicts 'b', not 'a'
    expect(c.get('a')).toBe(1);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('c')).toBe(3);
  });

  it('memoize runs loader once and caches result', async () => {
    const c = new TtlCache<string, string>({ ttlMs: 1000 });
    let calls = 0;
    const loader = async () => { calls++; return 'data'; };
    expect(await c.memoize('k', loader)).toBe('data');
    expect(await c.memoize('k', loader)).toBe('data');
    expect(calls).toBe(1);
  });

  it('clear() empties the cache', () => {
    const c = new TtlCache<string, number>({ ttlMs: 1000 });
    c.set('a', 1);
    c.set('b', 2);
    c.clear();
    expect(c.size).toBe(0);
    expect(c.get('a')).toBeUndefined();
  });
});

describe('TtlMap', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('actively sweeps expired entries without a read', () => {
    const c = new TtlMap<string, number>({ ttlMs: 1000, maxSize: 10, sweepIntervalMs: 1000 });
    c.set('a', 1);
    vi.advanceTimersByTime(1000);
    expect(c.size).toBe(0);
  });

  it('evicts the oldest entry immediately when maxSize is reached', () => {
    const c = new TtlMap<string, number>({ ttlMs: 10_000, maxSize: 2 });
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBe(2);
    expect(c.get('c')).toBe(3);
  });

  it('keeps near-capacity churn bounded', () => {
    let evictions = 0;
    const c = new TtlMap<string, number>({
      ttlMs: 10_000,
      maxSize: 3,
      sweepIntervalMs: false,
      onEvict: () => { evictions += 1; },
    });

    for (let i = 0; i < 100; i += 1) c.set(`key-${i}`, i);

    expect(c.size).toBe(3);
    expect(evictions).toBe(97);
  });

  it('does not re-enter sweep from eviction callbacks', () => {
    let callbackDepth = 0;
    let maxCallbackDepth = 0;
    let c: TtlMap<string, number>;
    c = new TtlMap<string, number>({
      ttlMs: 1000,
      maxSize: 10,
      sweepIntervalMs: false,
      onEvict: () => {
        callbackDepth += 1;
        maxCallbackDepth = Math.max(maxCallbackDepth, callbackDepth);
        c.sweep();
        callbackDepth -= 1;
      },
    });
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    vi.advanceTimersByTime(1000);

    c.sweep();

    expect(c.size).toBe(0);
    expect(maxCallbackDepth).toBe(1);
  });
});
