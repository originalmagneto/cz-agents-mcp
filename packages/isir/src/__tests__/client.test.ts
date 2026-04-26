import { describe, it, expect } from 'vitest';
import { IsirClient } from '../client.js';

describe('IsirClient (stub mode)', () => {
  it('checkActiveInsolvency returns null in stub mode', async () => {
    const c = new IsirClient({ stub: true });
    expect(await c.checkActiveInsolvency('12345678')).toBeNull();
  });

  it('getProceedingDetail returns null in stub mode', async () => {
    const c = new IsirClient({ stub: true });
    expect(await c.getProceedingDetail(1)).toBeNull();
  });

  it('listRecentProceedings returns empty array in stub mode', async () => {
    const c = new IsirClient({ stub: true });
    expect(await c.listRecentProceedings('2026-01-01')).toEqual([]);
  });

  it('non-stub mode throws "not implemented" until v0.2.0', async () => {
    const c = new IsirClient({ stub: false });
    await expect(c.checkActiveInsolvency('12345678')).rejects.toThrow(/not yet implemented/);
  });

  it('defaults to stub when ISIR_SOAP_ENABLED env unset', async () => {
    const prev = process.env.ISIR_SOAP_ENABLED;
    delete process.env.ISIR_SOAP_ENABLED;
    const c = new IsirClient();
    expect(await c.checkActiveInsolvency('12345678')).toBeNull();
    if (prev !== undefined) process.env.ISIR_SOAP_ENABLED = prev;
  });
});
