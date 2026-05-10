import { describe, it, expect } from 'vitest';
import { buildTimeline } from '../patterns/risk-timeline.js';
import type { DdReport, StatutoryMember } from '../types.js';

function baseReport(overrides: Partial<DdReport> = {}): DdReport {
  return {
    ico: '12345678',
    retrieved_at: '2026-05-10T10:00:00Z',
    basic_only: false,
    company: { found: true, name: 'Acme s.r.o.' },
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
  extra: Partial<StatutoryMember> = {},
): StatutoryMember {
  return {
    name,
    role: 'jednatel',
    is_person: true,
    ...extra,
  };
}

describe('buildTimeline — basic variant', () => {
  it('minimal company — only "today" anchor event', () => {
    const result = buildTimeline(baseReport());

    expect(result.events.length).toBe(1);
    expect(result.events[0].title).toBe('Tento DD report');
    expect(result.events[0].severity).toBe('info');
    expect(result.riskScore).toBe(0);
  });

  it('company with registration date — includes vznik event', () => {
    const result = buildTimeline(
      baseReport({
        company: { found: true, name: 'Acme s.r.o.', registered_on: '2015-03-20' },
      }),
    );

    const vzniklEvent = result.events.find((e) => e.title === 'Vznik firmy');
    expect(vzniklEvent).toBeDefined();
    expect(vzniklEvent?.severity).toBe('info');
    expect(vzniklEvent?.source).toBe('ARES');
  });

  it('insolvency event appears with alert severity and correct date', () => {
    const result = buildTimeline(
      baseReport({
        insolvency: {
          has_active_proceeding: true,
          started_on: '2023-06-01',
          spisova_znacka: 'INS 123/2023',
        },
      }),
    );

    const insolEvent = result.events.find((e) => e.title.includes('insolvenční'));
    expect(insolEvent).toBeDefined();
    expect(insolEvent?.severity).toBe('alert');
    expect(insolEvent?.date).toBe('2023-06-01');
    expect(insolEvent?.detail).toBe('INS 123/2023');
    // Alert event should push riskScore above 0
    expect(result.riskScore).toBeGreaterThan(0);
  });

  it('VAT unreliable event appears with alert severity', () => {
    const result = buildTimeline(
      baseReport({
        vat: {
          is_payer: true,
          bank_accounts: [],
          unreliable_since: '2022-11-15',
        },
      }),
    );

    const vatEvent = result.events.find((e) => e.title.includes('nespolehlivý'));
    expect(vatEvent).toBeDefined();
    expect(vatEvent?.severity).toBe('alert');
    expect(vatEvent?.source).toBe('ADIS / MFČR');
  });

  it('statutory appointment within 30 days uses warn severity', () => {
    // Use a date 10 days ago
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const recentDate = tenDaysAgo.toISOString().slice(0, 10);

    const result = buildTimeline(
      baseReport({
        statutory_body: [fakePerson('Nový Jednatel', { since: recentDate })],
      }),
    );

    const apptEvent = result.events.find((e) => e.title.includes('Jmenování'));
    expect(apptEvent).toBeDefined();
    expect(apptEvent?.severity).toBe('warn');
  });

  it('events are sorted chronologically ascending', () => {
    const result = buildTimeline(
      baseReport({
        company: { found: true, name: 'Acme s.r.o.', registered_on: '2010-01-01' },
        insolvency: {
          has_active_proceeding: true,
          started_on: '2023-03-01',
        },
        vat: { is_payer: true, bank_accounts: [], unreliable_since: '2020-07-15' },
      }),
    );

    const dates = result.events
      .filter((e) => e.dateLabel !== 'aktuální' && e.dateLabel !== 'dnes')
      .map((e) => e.date);

    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] >= dates[i - 1]).toBe(true);
    }
  });

  it('riskScore reflects count of alert and warn events', () => {
    // 2 alert events (insolvency + VAT) = 6pts, 0 warn = total 6
    const result = buildTimeline(
      baseReport({
        insolvency: { has_active_proceeding: true, started_on: '2023-01-01' },
        vat: { is_payer: true, bank_accounts: [], unreliable_since: '2022-01-01' },
      }),
    );

    expect(result.riskScore).toBeGreaterThanOrEqual(6);
  });
});
