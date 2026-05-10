# @czagents/realestate

Czech distress real estate MCP server — aggregates insolvency sales (ISIR), public auctions (portál dražeb), and market context (sreality price trends + okres-level aggregates).

## Install

```bash
npm install -g @czagents/realestate
```

## Usage with Claude Desktop

```json
{
  "mcpServers": {
    "realestate": {
      "command": "npx",
      "args": ["-y", "@czagents/realestate"]
    }
  }
}
```

## Tools

- `get_district_aggregate` — distress real-estate statistics for a Czech okres (district): counts by category (insolvency / auction) and average market data. Counts under 5 are suppressed (k-anonymity gate) so individual debtors cannot be identified in low-activity districts. Free tier — no PII exposed.
- `search_distress_properties` — search distress properties (insolvency sales + public auctions) by okres, type, price, date. Free tier returns 1-3 teasers + a total count; paid tier returns full details.
- `get_property_detail` *(re_pro tier+)* — full details of a specific distress property: address, owner, RUIAN parcel, auction house, expert-appraisal link, AI risk score.

Example prompts:

> How many distress properties are currently for sale in okres Mělník?

> Show me upcoming insolvency sales in the Liberec region under 3 000 000 Kč.

## Tiers

| Tier | Price | What you get |
|---|---|---|
| **Free** | 0 Kč | Aggregates with k≥5 suppression, teaser search results, no PII. |
| **Reality Profesional (`re_pro`)** | 1 990 Kč/měs | Full property details, owner names, addresses, RUIAN parcel, appraisal links. |
| **Reality Agency (`re_agency`)** | 5 990 Kč/měs | Multi-seat, REST API + webhooks, higher rate limits, batch search. |

Tier details: https://cz-agents.dev/pricing

## GDPR / opt-out

Owners listed in distress sales are processed under GDPR Art. 6(1)(f) (legitimate interest, public-register data). The server honours an opt-out registry: subjects who have requested removal are filtered out of `search_distress_properties` and `get_property_detail` responses. The aggregate tool is unaffected because it never exposes PII.

## Self-host

Source: https://github.com/martinhavel/cz-agents-mcp

```bash
git clone https://github.com/martinhavel/cz-agents-mcp
cd cz-agents-mcp
npm install
npm run build
node packages/realestate/dist/index.js
```

Self-hosting requires read access to a `cz-agents-webapp`-compatible SQLite database with `RealEstateLead`, `RealEstateExtract`, and `OptOutEntry` tables populated by the daily crawlers in the upstream project.

## License

MIT — see [LICENSE](https://github.com/martinhavel/cz-agents-mcp/blob/main/LICENSE)
