#!/usr/bin/env node
/**
 * Streamable HTTP entry — for remote MCP clients (Claude Desktop w/ URL,
 * Cursor, Continue, production deployment on Hetzner/Cloudflare Workers).
 *
 * Listens on PORT (default 3030) at path /mcp.
 */
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { buildAresServer } from './server.js';

const PORT = Number(process.env.PORT ?? 3030);
const MCP_PATH = process.env.MCP_PATH ?? '/mcp';

async function main() {
  const server = buildAresServer();

  // Session management: map sessionId → transport (one per connected client)
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const http = createServer(async (req, res) => {
    // Health check
    if (req.url === '/health' || req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'cz-agents/ares', version: '0.1.0' }));
      return;
    }

    if (!req.url?.startsWith(MCP_PATH)) {
      res.writeHead(404);
      res.end('Not found. MCP endpoint at ' + MCP_PATH);
      return;
    }

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, mcp-session-id',
      });
      res.end();
      return;
    }

    const sessionHeader = req.headers['mcp-session-id'];
    const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;

    let transport: StreamableHTTPServerTransport;
    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId)!;
    } else {
      // New session
      const newSessionId = randomUUID();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        onsessioninitialized: (id) => {
          console.error(`[cz-agents/ares] new session: ${id}`);
          transports.set(id, transport);
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) {
          transports.delete(transport.sessionId);
          console.error(`[cz-agents/ares] closed session: ${transport.sessionId}`);
        }
      };
      await server.connect(transport);
    }

    await transport.handleRequest(req, res);
  });

  http.listen(PORT, () => {
    console.error(
      `[cz-agents/ares] Streamable HTTP MCP server listening on :${PORT}${MCP_PATH}`,
    );
  });
}

main().catch((err) => {
  console.error('[cz-agents/ares] fatal:', err);
  process.exit(1);
});
