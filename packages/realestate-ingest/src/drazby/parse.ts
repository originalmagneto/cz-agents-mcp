// packages/realestate-ingest/src/drazby/parse.ts
import { slugifyCs } from '@czagents/shared';

export interface NormalizedAuction {
  externalId: string;      // stable upstream id
  spisovaZnacka: string;
  okres: string;           // human okres name, e.g. "Ostrava-město"
  detailUrl: string;
  auctionDateIso: string | null;
  status: 'active' | 'upcoming' | 'finished_sold' | 'finished_unsold';
}

export interface LeadRow {
  id: string;
  sourceType: 'portaldrazeb' | 'isir';
  spisovaZnacka: string;
  courtCode: string;
  ingestedAt: string;
  publishedAt: string | null;
  status: string;
  dokumentUrl: string;
  kuMatchedName: string;
  okresSlug: string;
  auctionStatus: string;
}

export function auctionToLead(a: NormalizedAuction, nowIso: string): LeadRow {
  return {
    id: `portaldrazeb:${a.externalId}`,
    sourceType: 'portaldrazeb',
    spisovaZnacka: a.spisovaZnacka || a.externalId,
    courtCode: '',
    ingestedAt: nowIso,
    publishedAt: a.auctionDateIso,
    status: a.status,
    dokumentUrl: a.detailUrl,
    kuMatchedName: a.okres,
    okresSlug: slugifyCs(a.okres),
    auctionStatus: a.status,
  };
}
