# @czagents/eu-registry

MCP server for non-Czech business registries. Sprint 1 supports UK Companies House.

ARES remains a separate Czech registry package and is not included here.

## Tools

- `search_company(name, country?, limit?)` searches enabled non-CZ registry adapters. Default limit is 10, max 20.
- `get_company(id, country)` fetches a company by national ID and country code.

## Configuration

- `CH_API_KEY` enables UK Companies House. If unset, the adapter returns empty results without throwing.
- `EU_REGISTRY_TIER` gates countries. Supported values are `free`, `compliance`, and `agency`; default is `free`.
- `PORT` controls HTTP mode port; default is `3035`.

## Development

```bash
npm run build
npm test
npm run start:http
```
