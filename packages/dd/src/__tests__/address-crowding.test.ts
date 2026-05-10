import { describe, it, expect } from 'vitest';
import { detectAddressCrowding, pickSample } from '../patterns/address-crowding.js';
import type { AddressCrowdingInput } from '../patterns/address-crowding.js';
import type { AresSearchHit } from '../clients.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fakeCompany(ico = '12345678') {
  return {
    ico,
    sidlo: {
      nazevUlice: 'Testovní',
      nazevObce: 'Praha',
      psc: 11000,
    },
  };
}

function fakeHits(count: number, startIco = 10000000): AresSearchHit[] {
  return Array.from({ length: count }, (_, i) => ({
    ico: String(startIco + i),
    obchodniJmeno: `Acme Imports ${i} s.r.o.`,
  }));
}

function input(
  companyCount: number,
  totalCount?: number,
  icoOverride = '12345678',
): AddressCrowdingInput {
  const hits = fakeHits(companyCount);
  return {
    company: fakeCompany(icoOverride),
    companiesAtAddress: hits,
    totalCountAtAddress: totalCount ?? companyCount,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('detectAddressCrowding — basic variant', () => {
  it('1 company at address (solo) → none risk, riskScore=1', () => {
    const result = detectAddressCrowding(input(1, 1));

    expect(result.riskSignal).toBe('none');
    expect(result.threshold).toBe('normal');
    expect(result.riskScore).toBe(1);
    expect(result.companyCountAtAddress).toBe(1);
    // sampleCompanyIcos excludes queried IČO — the one hit may be the company itself
    expect(result.sampleCompanyIcos.length).toBeLessThanOrEqual(10);
  });

  it('5 companies → none risk, riskScore=5', () => {
    const result = detectAddressCrowding(input(5, 5));

    expect(result.riskSignal).toBe('none');
    expect(result.threshold).toBe('normal');
    expect(result.riskScore).toBe(5);
  });

  it('30 companies → low risk, riskScore 20-40', () => {
    const result = detectAddressCrowding(input(30, 30));

    expect(result.riskSignal).toBe('low');
    expect(result.threshold).toBe('normal');
    expect(result.riskScore).toBeGreaterThanOrEqual(20);
    expect(result.riskScore).toBeLessThanOrEqual(40);
  });

  it('100 companies → medium risk, riskScore 50-70', () => {
    const result = detectAddressCrowding(input(100, 100));

    expect(result.riskSignal).toBe('medium');
    expect(result.threshold).toBe('crowded');
    expect(result.riskScore).toBeGreaterThanOrEqual(50);
    expect(result.riskScore).toBeLessThanOrEqual(70);
  });

  it('500 companies → high risk, riskScore 80-100', () => {
    // Page capped at 200 — simulate 500 total with 200 returned
    const result = detectAddressCrowding(input(200, 500));

    expect(result.riskSignal).toBe('high');
    expect(result.threshold).toBe('shell-hotel');
    expect(result.riskScore).toBeGreaterThanOrEqual(80);
    expect(result.riskScore).toBeLessThanOrEqual(100);
    expect(result.companyCountAtAddress).toBe(500);
    expect(result.cappedAt).toBe(200);
  });

  it('company without address → graceful, returns empty address fields', () => {
    const noAddressInput: AddressCrowdingInput = {
      company: { ico: '12345678', sidlo: undefined },
      companiesAtAddress: fakeHits(0),
      totalCountAtAddress: 0,
    };
    const result = detectAddressCrowding(noAddressInput);

    expect(result.address.ulice).toBeUndefined();
    expect(result.address.obec).toBeUndefined();
    expect(result.address.psc).toBeUndefined();
    expect(result.riskSignal).toBe('none');
    expect(result.companyCountAtAddress).toBe(0);
  });

  it('sampleCompanyIcos limited to max 10, queried IČO excluded', () => {
    // 50 companies at address, queried IČO is 12345678 (not in the hits)
    const result = detectAddressCrowding(input(50, 50, '12345678'));

    expect(result.sampleCompanyIcos.length).toBeLessThanOrEqual(10);
    expect(result.sampleCompanyIcos).not.toContain('12345678');
  });

  it('address fields are correctly mapped from sidlo', () => {
    const result = detectAddressCrowding(input(3, 3));

    expect(result.address.ulice).toBe('Testovní');
    expect(result.address.obec).toBe('Praha');
    expect(result.address.psc).toBe(11000);
    expect(result.ico).toBe('12345678');
  });
});

describe('pickSample', () => {
  it('returns all when array shorter than n', () => {
    expect(pickSample(['a', 'b', 'c'], 10)).toHaveLength(3);
  });

  it('returns exactly n when array longer', () => {
    const arr = Array.from({ length: 100 }, (_, i) => String(i));
    expect(pickSample(arr, 10)).toHaveLength(10);
  });

  it('does not modify original array', () => {
    const arr = ['a', 'b', 'c', 'd', 'e'];
    pickSample(arr, 3);
    expect(arr).toHaveLength(5);
  });
});
