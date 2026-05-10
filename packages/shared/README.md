# @czagents/shared

Internal shared utilities for the `@czagents/*` MCP servers — IČO/DIČ validation, HTTP helpers, simple in-memory rate limiter, request-origin extraction, and billing primitives.

This is **not** an end-user MCP server. It is published to npm so the other `@czagents/*` packages can declare it as a dependency. You normally do not install it directly — `npm install @czagents/ares` (or any of the servers) pulls it in transitively.

## Install

```bash
npm install @czagents/shared
```

## API

Re-exported from the package root:

- `validateIcoInput(ico)`, `isValidIco(ico)` — IČO format + MOD11 checksum (Czech 7-8 digit Business ID)
- `formatDic(dic)`, `isValidDic(dic)`, `icoFromDic(dic)` — DIČ (Czech VAT ID) helpers
- `httpGetJson(url, opts)`, `httpGetText(url, opts)` — small fetch wrapper with timeout + retry
- `RateLimiter` — token-bucket rate limiter for stdio/HTTP MCP servers
- `getRequestOrigin(req)` — extract origin metadata from MCP request context
- `Cache` — minimal TTL cache used across the servers
- `billing/*` — tier helpers (free / paid) and rate-limit policy types shared by the servers

## Self-host

Source: https://github.com/martinhavel/cz-agents-mcp

```bash
git clone https://github.com/martinhavel/cz-agents-mcp
cd cz-agents-mcp
npm install
npm run build -w @czagents/shared
```

## License

MIT — see [LICENSE](https://github.com/martinhavel/cz-agents-mcp/blob/main/LICENSE)
