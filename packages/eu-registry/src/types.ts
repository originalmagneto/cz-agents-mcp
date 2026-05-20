export type CompanyStatus = 'active' | 'dissolved' | 'unknown';

export interface Company {
  id: string;
  country: string;
  name: string;
  status: CompanyStatus;
  address?: string;
  registered_on?: string;
  lei?: string;
  source_url?: string;
}

export interface CompanySearchResult {
  companies: Company[];
  total_results: number;
}

export interface RegistryAdapter {
  searchByName(name: string, limit?: number): Promise<CompanySearchResult>;
  getById(id: string): Promise<Company | null>;
}
