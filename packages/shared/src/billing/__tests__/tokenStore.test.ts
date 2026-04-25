import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TokenStore } from '../tokenStore.js';

describe('TokenStore', () => {
  let tmp: string;
  let store: TokenStore;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'czat-tokens-'));
    store = new TokenStore(join(tmp, 'tokens.db'));
  });

  afterEach(() => {
    store.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('mints a subscription token', () => {
    const t = store.mint({
      service: 'sanctions',
      tier: 'pro',
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      monthly_quota: 50_000,
      credits: null,
    });
    expect(t.token).toMatch(/^czat_/);
    expect(t.tier).toBe('pro');
    expect(t.counter).toBe(0);
    expect(t.monthly_quota).toBe(50_000);
    expect(t.credits).toBeNull();
  });

  it('mints a pay-per-report token with credits', () => {
    const t = store.mint({
      service: 'dd',
      tier: 'pay-per-report',
      stripe_customer_id: 'cus_2',
      stripe_subscription_id: null,
      monthly_quota: null,
      credits: 10,
    });
    expect(t.credits).toBe(10);
    expect(t.monthly_quota).toBeNull();
  });

  it('find returns null for unknown token', () => {
    expect(store.find('czat_nope')).toBeNull();
  });

  it('consume increments counter for subscription', () => {
    const t = store.mint({
      service: 'sanctions', tier: 'starter', stripe_customer_id: 'c', stripe_subscription_id: 's',
      monthly_quota: 3, credits: null,
    });
    store.consume(t.token);
    store.consume(t.token);
    const r = store.find(t.token)!;
    expect(r.counter).toBe(2);
  });

  it('consume throws QUOTA_EXCEEDED at limit', () => {
    const t = store.mint({
      service: 'sanctions', tier: 'starter', stripe_customer_id: 'c', stripe_subscription_id: 's',
      monthly_quota: 2, credits: null,
    });
    store.consume(t.token);
    store.consume(t.token);
    expect(() => store.consume(t.token)).toThrow('QUOTA_EXCEEDED');
  });

  it('consume decrements credits for pay-per-report', () => {
    const t = store.mint({
      service: 'dd', tier: 'pay-per-report', stripe_customer_id: 'c', stripe_subscription_id: null,
      monthly_quota: null, credits: 2,
    });
    store.consume(t.token);
    expect(store.find(t.token)!.credits).toBe(1);
    store.consume(t.token);
    expect(store.find(t.token)!.credits).toBe(0);
    expect(() => store.consume(t.token)).toThrow('CREDITS_EXHAUSTED');
  });

  it('revoke marks token as inactive (find returns null)', () => {
    const t = store.mint({
      service: 'sanctions', tier: 'pro', stripe_customer_id: 'c', stripe_subscription_id: 's',
      monthly_quota: 100, credits: null,
    });
    store.revoke(t.token);
    expect(store.find(t.token)).toBeNull();
  });

  it('revokeBySubscription cancels all matching tokens', () => {
    const t = store.mint({
      service: 'sanctions', tier: 'pro', stripe_customer_id: 'c', stripe_subscription_id: 'sub_x',
      monthly_quota: 100, credits: null,
    });
    expect(store.revokeBySubscription('sub_x')).toBe(1);
    expect(store.find(t.token)).toBeNull();
  });

  it('findBySubscription returns active token', () => {
    const t = store.mint({
      service: 'dd', tier: 'pro', stripe_customer_id: 'c', stripe_subscription_id: 'sub_y',
      monthly_quota: 200, credits: null,
    });
    expect(store.findBySubscription('sub_y')?.token).toBe(t.token);
  });

  it('resetCounter zeros the counter', () => {
    const t = store.mint({
      service: 'dd', tier: 'pro', stripe_customer_id: 'c', stripe_subscription_id: 's',
      monthly_quota: 200, credits: null,
    });
    store.consume(t.token);
    store.resetCounter(t.token);
    expect(store.find(t.token)!.counter).toBe(0);
  });

  it('topUpCredits adds to existing balance', () => {
    const t = store.mint({
      service: 'dd', tier: 'pay-per-report', stripe_customer_id: 'c', stripe_subscription_id: null,
      monthly_quota: null, credits: 5,
    });
    store.topUpCredits(t.token, 10);
    expect(store.find(t.token)!.credits).toBe(15);
  });

  it('stats reports counts grouped by tier', () => {
    store.mint({ service: 'sanctions', tier: 'pro', stripe_customer_id: 'a', stripe_subscription_id: 'sub_a', monthly_quota: 50_000, credits: null });
    store.mint({ service: 'sanctions', tier: 'starter', stripe_customer_id: 'b', stripe_subscription_id: 'sub_b', monthly_quota: 5_000, credits: null });
    store.mint({ service: 'dd', tier: 'agency', stripe_customer_id: 'c', stripe_subscription_id: 'sub_c', monthly_quota: 1_500, credits: null });
    const s = store.stats('sanctions');
    expect(s.active).toBe(2);
    expect(s.by_tier).toEqual({ pro: 1, starter: 1 });
  });
});
