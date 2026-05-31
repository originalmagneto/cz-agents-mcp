// packages/realestate-ingest/src/data/priceIndex.ts
export interface PriceRow { kraj: string; year: number; quarter: number; kcPerM2: number; }
// source: ČSÚ "Ceny sledovaných druhů nemovitostí" (byty). Approximate, refreshable.
export const PRICE_SOURCE = 'csu_vdb';
export const PRICE_ROWS: PriceRow[] = [
  { kraj: 'Praha', year: 2024, quarter: 4, kcPerM2: 142000 }, { kraj: 'Praha', year: 2023, quarter: 4, kcPerM2: 133000 },
  { kraj: 'Středočeský', year: 2024, quarter: 4, kcPerM2: 78000 }, { kraj: 'Středočeský', year: 2023, quarter: 4, kcPerM2: 73000 },
  { kraj: 'Jihočeský', year: 2024, quarter: 4, kcPerM2: 62000 }, { kraj: 'Jihočeský', year: 2023, quarter: 4, kcPerM2: 58000 },
  { kraj: 'Plzeňský', year: 2024, quarter: 4, kcPerM2: 60000 }, { kraj: 'Plzeňský', year: 2023, quarter: 4, kcPerM2: 56000 },
  { kraj: 'Karlovarský', year: 2024, quarter: 4, kcPerM2: 42000 }, { kraj: 'Karlovarský', year: 2023, quarter: 4, kcPerM2: 40000 },
  { kraj: 'Ústecký', year: 2024, quarter: 4, kcPerM2: 28000 }, { kraj: 'Ústecký', year: 2023, quarter: 4, kcPerM2: 27000 },
  { kraj: 'Liberecký', year: 2024, quarter: 4, kcPerM2: 58000 }, { kraj: 'Liberecký', year: 2023, quarter: 4, kcPerM2: 54000 },
  { kraj: 'Královéhradecký', year: 2024, quarter: 4, kcPerM2: 62000 }, { kraj: 'Královéhradecký', year: 2023, quarter: 4, kcPerM2: 58000 },
  { kraj: 'Pardubický', year: 2024, quarter: 4, kcPerM2: 60000 }, { kraj: 'Pardubický', year: 2023, quarter: 4, kcPerM2: 56000 },
  { kraj: 'Vysočina', year: 2024, quarter: 4, kcPerM2: 52000 }, { kraj: 'Vysočina', year: 2023, quarter: 4, kcPerM2: 49000 },
  { kraj: 'Jihomoravský', year: 2024, quarter: 4, kcPerM2: 88000 }, { kraj: 'Jihomoravský', year: 2023, quarter: 4, kcPerM2: 82000 },
  { kraj: 'Olomoucký', year: 2024, quarter: 4, kcPerM2: 58000 }, { kraj: 'Olomoucký', year: 2023, quarter: 4, kcPerM2: 54000 },
  { kraj: 'Zlínský', year: 2024, quarter: 4, kcPerM2: 60000 }, { kraj: 'Zlínský', year: 2023, quarter: 4, kcPerM2: 56000 },
  { kraj: 'Moravskoslezský', year: 2024, quarter: 4, kcPerM2: 46000 }, { kraj: 'Moravskoslezský', year: 2023, quarter: 4, kcPerM2: 42000 },
];
