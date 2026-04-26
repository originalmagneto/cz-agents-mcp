import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { validateIcoInput } from '@czagents/shared';
import { IsirClient } from './client.js';

export function buildIsirServer(client: IsirClient = new IsirClient()): McpServer {
  const server = new McpServer(
    {
      name: 'cz-agents/isir',
      version: '0.1.0',
    },
    {
      capabilities: { tools: {} },
      instructions:
        'Czech insolvency register (ISIR) lookup. Use whenever the user asks about insolvency, ' +
        'bankruptcy, debt restructuring, or "is this Czech company in trouble?". ' +
        'Note: v0.1.0 is alpha — direct SOAP integration is in progress; current responses may be empty.',
    },
  );

  server.tool(
    'check_ico_insolvency',
    'Check whether a Czech company (by IČO) has any active insolvency proceeding in ISIR. Returns spisová značka, start date, and current phase if found. Returns "no record" if not (which is also informative).',
    {
      ico: z.string().describe('Czech IČO — 7 or 8 digits.'),
    },
    async ({ ico }) => {
      const clean = validateIcoInput(ico);
      try {
        const result = await client.checkActiveInsolvency(clean);
        if (!result) {
          return wrap(`IČO ${clean}: žádné aktivní insolvenční řízení v ISIR (k tomuto okamžiku).`);
        }
        return wrap(JSON.stringify(result, null, 2));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: 'text', text: `ISIR query failed: ${msg}` }],
          isError: true,
        };
      }
    },
  );

  return server;
}

function wrap(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}
