import { describe, expect, it } from 'vitest';

describe('cleanupSessionTimes', () => {
  it('caps the number of tracked session IPs', async () => {
    process.env.SANDBOX_HMAC_SECRET = 'test-secret';
    const { cleanupSessionTimes, MAX_SESSION_IPS } = await import('../http.js');
    const sessionTimes = new Map<string, number[]>();
    const now = Date.now();
    for (let i = 0; i <= MAX_SESSION_IPS; i += 1) {
      sessionTimes.set(`ip-${i}`, [now + i]);
    }

    cleanupSessionTimes(sessionTimes);

    expect(sessionTimes.size).toBeLessThanOrEqual(MAX_SESSION_IPS);
    expect(sessionTimes.has('ip-0')).toBe(false);
    expect(sessionTimes.has(`ip-${MAX_SESSION_IPS}`)).toBe(true);
  });
});
