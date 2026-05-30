import { describe, expect, it } from 'vitest';
import { GleifCache, SEARCH_TTL_MS } from '../gleif-cache.js';

describe('GleifCache', () => {
  it('cache miss returns null', () => {
    const cache = new GleifCache(':memory:');
    expect(cache.get('nonexistent-key')).toBeNull();
  });

  it('cache hit returns stored value', () => {
    const cache = new GleifCache(':memory:');
    const value = { companies: [{ id: 'LEI123', name: 'Test Corp' }], total_results: 1 };
    cache.set('search:DE:TestCorp:10', value);
    expect(cache.get('search:DE:TestCorp:10')).toEqual(value);
  });

  it('expired entry returns null', () => {
    // TTL of 1 ms — entry will expire immediately
    const cache = new GleifCache(':memory:', 1);
    cache.set('lei:EXPIREDLEI', { id: 'EXPIREDLEI', name: 'Old Corp' });
    // Wait a tick to ensure expiry
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(cache.get('lei:EXPIREDLEI')).toBeNull();
        resolve();
      }, 5);
    });
  });

  it('stores and retrieves multiple keys independently', () => {
    const cache = new GleifCache(':memory:');
    cache.set('lei:AAA', { id: 'AAA', name: 'Alpha' });
    cache.set('lei:BBB', { id: 'BBB', name: 'Beta' });
    expect((cache.get('lei:AAA') as { name: string }).name).toBe('Alpha');
    expect((cache.get('lei:BBB') as { name: string }).name).toBe('Beta');
  });

  it('set overwrites existing key', () => {
    const cache = new GleifCache(':memory:');
    cache.set('lei:X', { name: 'First' });
    cache.set('lei:X', { name: 'Second' });
    expect((cache.get('lei:X') as { name: string }).name).toBe('Second');
  });

  it('ttlOverride uses shorter TTL for search results', () => {
    const cache = new GleifCache(':memory:');
    // TTL override of 1 ms — expires immediately
    cache.set('search:NL:Foo:10', { companies: [] }, 1);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(cache.get('search:NL:Foo:10')).toBeNull();
        resolve();
      }, 5);
    });
  });

  it('SEARCH_TTL_MS is less than default TTL', () => {
    expect(SEARCH_TTL_MS).toBeLessThan(7 * 24 * 3600 * 1000);
    expect(SEARCH_TTL_MS).toBe(24 * 3600 * 1000);
  });

  it('prune removes expired entries', () => {
    const cache = new GleifCache(':memory:', 1);
    cache.set('lei:PRUNED', { name: 'Gone' });
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        cache.prune();
        expect(cache.get('lei:PRUNED')).toBeNull();
        resolve();
      }, 5);
    });
  });

  it('evicts entries above maxEntries in :memory: fallback mode', () => {
    const cache = new GleifCache(':memory:', 60_000, 2);
    cache.set('lei:A', { name: 'Alpha' });
    cache.set('lei:B', { name: 'Beta' });
    cache.set('lei:C', { name: 'Gamma' });
    const retained = ['lei:A', 'lei:B', 'lei:C'].filter((key) => cache.get(key) !== null);
    expect(retained).toHaveLength(2);
  });
});
