import { describe, it, expect } from 'vitest';
import { slugifyCs } from '../slug.js';

describe('slugifyCs', () => {
  it('lowercases and strips diacritics', () => {
    expect(slugifyCs('Hlavní město Praha')).toBe('hlavni-mesto-praha');
    expect(slugifyCs('Ústí nad Labem')).toBe('usti-nad-labem');
    expect(slugifyCs('Žďár nad Sázavou')).toBe('zdar-nad-sazavou');
  });
  it('collapses non-alphanumerics and trims dashes', () => {
    expect(slugifyCs('  Brno-město  ')).toBe('brno-mesto');
    expect(slugifyCs('Praha')).toBe('praha');
  });
});
