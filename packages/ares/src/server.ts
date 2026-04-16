import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { validateIcoInput, isValidDic, icoFromDic, formatDic } from '@czagents/shared';
import { AresClient } from './client.js';

/**
 * Build an MCP server exposing ARES (Czech Business Register) tools.
 * Transport-agnostic — wrap with stdio or streamable-http in entry files.
 */
export function buildAresServer(): McpServer {
  const server = new McpServer(
    {
      name: 'cz-agents/ares',
      version: '0.1.0',
    },
    {
      capabilities: { tools: {} },
      instructions:
        'Czech Business Register (ARES) lookup. Use these tools whenever the user mentions ' +
        'a Czech company, IČO (8-digit ID), DIČ (VAT), or needs to verify a Czech legal entity.',
    },
  );

  const ares = new AresClient();

  server.tool(
    'lookup_by_ico',
    'Get a single Czech company record by its IČO (8-digit Business ID). Returns official name, registered address, legal form, VAT ID (DIČ), founding date, and trade license activities. Returns null if IČO is not found in ARES.',
    {
      ico: z
        .string()
        .describe('Czech IČO — 7 or 8 digits. Examples: "27074358", "61388581". Auto-validated with MOD11 checksum.'),
    },
    async ({ ico }) => {
      const clean = validateIcoInput(ico);
      const subject = await ares.getByIco(clean);
      if (!subject) {
        return {
          content: [
            { type: 'text', text: `Žádný subjekt s IČO ${clean} v ARES nenalezen.` },
          ],
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(subject, null, 2) }],
      };
    },
  );

  server.tool(
    'search_companies',
    'Full-text search ARES by company name or other filters. Useful when the user knows the name but not the IČO. Returns up to 100 results with IČO, name, and address.',
    {
      query: z.string().describe('Partial or full company name (obchodní jméno).').optional(),
      city: z.string().describe('Filter by city (nazev obce).').optional(),
      psc: z.number().int().describe('Filter by postal code (PSČ).').optional(),
      pocet: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(10)
        .describe('Max results to return (1-100, default 10).'),
      start: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe('Pagination offset (default 0).'),
    },
    async ({ query, city, psc, pocet, start }) => {
      const result = await ares.search({
        query,
        sidlo: city || psc ? { nazevObce: city, psc } : undefined,
        pocet,
        start,
      });
      const summary = result.ekonomickeSubjekty
        .map(
          (s) =>
            `${s.ico}  ${s.obchodniJmeno ?? '(bez jména)'} — ${
              s.sidlo?.textovaAdresa ?? 'bez adresy'
            }`,
        )
        .join('\n');
      return {
        content: [
          {
            type: 'text',
            text: `Nalezeno ${result.pocetCelkem} subjektů (zobrazeno ${result.ekonomickeSubjekty.length}):\n\n${summary}\n\nFull JSON:\n${JSON.stringify(result, null, 2)}`,
          },
        ],
      };
    },
  );

  server.tool(
    'get_bank_accounts',
    'Get transparent bank accounts published for this company (only available for VAT-registered subjects). Useful to verify payment details on an invoice match the company.',
    {
      ico: z.string().describe('Czech IČO (7-8 digits).'),
    },
    async ({ ico }) => {
      const clean = validateIcoInput(ico);
      const accounts = await ares.getBankAccounts(clean);
      if (accounts.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `Subjekt ${clean} nemá v ARES zveřejněné žádné transparentní účty (nebo není plátce DPH).`,
            },
          ],
        };
      }
      const summary = accounts
        .map(
          (a) =>
            `${a.cisloUctu}/${a.kodBanky} (${a.menaUctu ?? 'CZK'}) — zveřejněno ${a.datumZverejneni ?? 'N/A'}`,
        )
        .join('\n');
      return {
        content: [
          {
            type: 'text',
            text: `Transparentní účty subjektu ${clean}:\n${summary}`,
          },
        ],
      };
    },
  );

  server.tool(
    'get_statutaries',
    'Get current statutory body (jednatelé, představenstvo, etc.) of a Czech company — who can legally act on its behalf. Returns active members only (with valid zápis, not yet removed). Essential for due diligence and compliance checks.',
    {
      ico: z.string().describe('Czech IČO (7-8 digits).'),
    },
    async ({ ico }) => {
      const clean = validateIcoInput(ico);
      const vr = await ares.getVrRecord(clean);
      if (!vr) {
        return {
          content: [
            { type: 'text', text: `Subjekt ${clean} nemá záznam ve Veřejném rejstříku.` },
          ],
        };
      }
      const active = (vr.statutarniOrgany ?? []).filter((o) => !o.datumVymazu);
      if (active.length === 0) {
        return {
          content: [
            { type: 'text', text: `Subjekt ${clean} (${vr.obchodniJmeno ?? '-'}) nemá aktuální statutární orgán.` },
          ],
        };
      }
      const lines: string[] = [`${vr.obchodniJmeno ?? clean} — aktuální statutární orgány:`, ''];
      for (const organ of active) {
        lines.push(`▸ ${organ.nazevOrganu ?? '—'}`);
        const activeMembers = (organ.clenoveOrganu ?? []).filter((m) => !m.datumVymazu);
        if (activeMembers.length === 0) {
          lines.push('  (bez aktuálních členů)');
        }
        for (const m of activeMembers) {
          const fo = m.fyzickaOsoba;
          const po = m.pravnickaOsoba;
          const funkce = m.funkce?.nazev ?? 'člen';
          if (fo) {
            const jmeno = [fo.titulPredJmenem, fo.jmeno, fo.prijmeni, fo.titulZaJmenem]
              .filter(Boolean).join(' ').trim();
            lines.push(`  • ${funkce}: ${jmeno}${fo.datumNarozeni ? ` (nar. ${fo.datumNarozeni})` : ''}`);
          } else if (po) {
            lines.push(`  • ${funkce}: ${po.obchodniJmeno ?? '-'} (IČO ${po.ico ?? '?'})`);
          }
        }
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  server.tool(
    'validate_dic',
    'Validate a Czech DIČ (VAT ID). Format check: "CZ" + 8-10 digits. For 8-digit tail (legal entities) also runs MOD11 checksum against the embedded IČO.',
    {
      dic: z.string().describe('Czech DIČ — e.g., "CZ26168685". Whitespace and case tolerated.'),
    },
    async ({ dic }) => {
      const formatted = formatDic(dic);
      const valid = isValidDic(dic);
      const embedded = icoFromDic(dic);
      if (!valid) {
        return {
          content: [{ type: 'text', text: `DIČ "${formatted}" NENÍ platné (špatný formát nebo checksum).` }],
          isError: true,
        };
      }
      const hint = embedded
        ? ` Obsažené IČO: ${embedded} — použij lookup_by_ico pro detaily firmy.`
        : ' (personální DIČ — rodné číslo, detaily nelze dohledat přes ARES).';
      return {
        content: [{ type: 'text', text: `DIČ ${formatted} je platné formátem i checksum.${hint}` }],
      };
    },
  );

  server.tool(
    'check_vat_payer',
    'Check whether a Czech company is a registered VAT payer (plátce DPH). If yes, returns DIČ, financial office, and any transparent bank accounts (payment details).',
    {
      ico: z.string().describe('Czech IČO (7-8 digits).'),
    },
    async ({ ico }) => {
      const clean = validateIcoInput(ico);
      const subject = await ares.getByIco(clean);
      if (!subject) {
        return {
          content: [{ type: 'text', text: `Subjekt s IČO ${clean} v ARES nenalezen.` }],
        };
      }
      if (!subject.dic) {
        return {
          content: [
            {
              type: 'text',
              text: `${subject.obchodniJmeno ?? clean} — NENÍ registrovaný plátce DPH v ARES (bez DIČ).`,
            },
          ],
        };
      }
      const accounts = await ares.getBankAccounts(clean);
      const accountStr = accounts.length > 0
        ? '\n\nTransparentní účty:\n' + accounts.map((a) => `  ${a.cisloUctu}/${a.kodBanky} (${a.menaUctu ?? 'CZK'})`).join('\n')
        : '\n(Žádné transparentní účty zveřejněny.)';
      return {
        content: [
          {
            type: 'text',
            text: `${subject.obchodniJmeno ?? clean} — PLÁTCE DPH.\nDIČ: ${subject.dic}\nFinanční úřad: ${subject.financniUrad ?? 'neznámý'}${accountStr}`,
          },
        ],
      };
    },
  );

  server.tool(
    'get_history',
    'Get historical record of a company (previous names, registered address changes, trade license history). Useful for due diligence.',
    {
      ico: z.string().describe('Czech IČO (7-8 digits).'),
    },
    async ({ ico }) => {
      const clean = validateIcoInput(ico);
      const history = await ares.getHistory(clean);
      if (!history) {
        return {
          content: [
            { type: 'text', text: `Žádná historie pro IČO ${clean} není v ARES k dispozici.` },
          ],
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(history, null, 2) }],
      };
    },
  );

  return server;
}
