import { describe, it, expect } from 'vitest';
import { detectNomineeDirector } from '../patterns/nominee-director.js';
import type { DdReport, StatutoryMember } from '../types.js';

function baseReport(overrides: Partial<DdReport> = {}): DdReport {
  return {
    ico: '12345678',
    retrieved_at: '2026-05-10T10:00:00Z',
    basic_only: false,
    company: { found: true, name: 'Acme s.r.o.', address: 'Praha 1, Testovní 1' },
    vat: { is_payer: false, bank_accounts: [] },
    statutory_body: [],
    sanctions: { any_statutory_match: false },
    red_flags: [],
    risk_score: { value: 0, level: 'low' },
    ...overrides,
  };
}

function fakePerson(
  name: string,
  extra: Partial<StatutoryMember> & { datumNarozeni?: string } = {},
): StatutoryMember {
  const { datumNarozeni, ...rest } = extra;
  const member: StatutoryMember & { datumNarozeni?: string } = {
    name,
    role: 'jednatel',
    is_person: true,
    ...rest,
  };
  if (datumNarozeni !== undefined) {
    (member as Record<string, unknown>)['datumNarozeni'] = datumNarozeni;
  }
  return member;
}

describe('detectNomineeDirector — basic variant (3 indicators)', () => {
  it('clean company — all indicators false, riskScore=0', () => {
    const report = baseReport({
      statutory_body: [fakePerson('Jana Novotná', { datumNarozeni: '1985-06-15' })],
    });
    const result = detectNomineeDirector(report);

    expect(result.total).toBe(3);
    expect(result.fired).toBe(0);
    expect(result.riskScore).toBe(0);
    expect(result.unavailable).toEqual([]);
    expect(result.indicators.every((i) => !i.fired)).toBe(true);
  });

  it('AGE_OUTLIER fires for director younger than 25', () => {
    // DOB = 10 years ago → age 10
    const youngDob = new Date();
    youngDob.setFullYear(youngDob.getFullYear() - 10);
    const report = baseReport({
      statutory_body: [fakePerson('Mladý Jednatel', { datumNarozeni: youngDob.toISOString().slice(0, 10) })],
    });
    const result = detectNomineeDirector(report);

    const ind = result.indicators.find((i) => i.code === 'AGE_OUTLIER')!;
    expect(ind.fired).toBe(true);
    expect(ind.members).toContain('Mladý Jednatel');
    expect(result.riskScore).toBeGreaterThan(0);
  });

  it('AGE_OUTLIER fires for director older than 70', () => {
    const eldDob = new Date();
    eldDob.setFullYear(eldDob.getFullYear() - 75);
    const report = baseReport({
      statutory_body: [fakePerson('Starší Jednatel', { datumNarozeni: eldDob.toISOString().slice(0, 10) })],
    });
    const result = detectNomineeDirector(report);

    const ind = result.indicators.find((i) => i.code === 'AGE_OUTLIER')!;
    expect(ind.fired).toBe(true);
  });

  it('AGE_OUTLIER unavailable when DOB not in report', () => {
    const report = baseReport({
      statutory_body: [fakePerson('Anonymní Jednatel')],
    });
    const result = detectNomineeDirector(report);

    const ind = result.indicators.find((i) => i.code === 'AGE_OUTLIER')!;
    expect(ind.fired).toBe(false);
    expect(ind.available).toBe(false);
    expect(result.unavailable).toContain('AGE_OUTLIER');
  });

  it('MULTI_BOARD fires when director has ≥3 prior bankrupt companies', () => {
    const report = baseReport({
      statutory_body: [
        fakePerson('Serial Founder', {
          prior_bankrupt_companies: [
            { ico: '11111111', name: 'Zkrachovala A s.r.o.' },
            { ico: '22222222', name: 'Zkrachovala B s.r.o.' },
            { ico: '33333333', name: 'Zkrachovala C s.r.o.' },
          ],
        }),
      ],
    });
    const result = detectNomineeDirector(report);

    const ind = result.indicators.find((i) => i.code === 'MULTI_BOARD')!;
    expect(ind.fired).toBe(true);
    expect(ind.members).toContain('Serial Founder');
    expect(result.riskScore).toBeGreaterThanOrEqual(40);
  });

  it('RECENT_APPOINTMENT fires when RECENT_STATUTORY_CHANGE red flag present', () => {
    const report = baseReport({
      red_flags: [
        {
          code: 'RECENT_STATUTORY_CHANGE',
          severity: 'medium',
          weight: 10,
          description: 'Změna před 5 dny.',
          source: 'ares',
        },
      ],
    });
    const result = detectNomineeDirector(report);

    const ind = result.indicators.find((i) => i.code === 'RECENT_APPOINTMENT')!;
    expect(ind.fired).toBe(true);
    expect(result.riskScore).toBeGreaterThanOrEqual(30);
  });

  it('all three indicators fire — riskScore=100', () => {
    const youngDob = new Date();
    youngDob.setFullYear(youngDob.getFullYear() - 19);
    const report = baseReport({
      statutory_body: [
        fakePerson('Risky Director', {
          datumNarozeni: youngDob.toISOString().slice(0, 10),
          prior_bankrupt_companies: [
            { ico: '11111111' },
            { ico: '22222222' },
            { ico: '33333333' },
          ],
        }),
      ],
      red_flags: [
        {
          code: 'RECENT_STATUTORY_CHANGE',
          severity: 'medium',
          weight: 10,
          description: 'Změna včera.',
          source: 'ares',
        },
      ],
    });
    const result = detectNomineeDirector(report);

    expect(result.fired).toBe(3);
    expect(result.riskScore).toBe(100);
    expect(result.unavailable).toHaveLength(0);
  });
});
