# @czagents/realestate

MCP server for Czech distress real estate intelligence — aggregates insolvency sales (ISIR), public auctions (portál dražeb), and market context (sreality price trends + okres-level aggregates).

## Status

**Pre-launch** (2026-05-08). Internal testing only. Do not distribute.

## Tools

- `search_distress_properties` — search auctions/insolvency sales by okres, type, price, date
- `get_property_detail` — full property details (paid tier only)
- `get_district_aggregate` — okres-level statistics (k≥5 anonymity gate)
- `get_market_trend` — sreality price trend per kraj/property type
- `get_auctions_calendar` — upcoming auctions calendar (urgency tool)

## Tier model

- **Free**: 30 calls/IP/day, 3 full records/day, unlimited aggregates
- **Profesional** (1 990 Kč/měs): 500 calls/day, full details
- **Business** (5 990 Kč/měs): unlimited, REST API + webhooks

## Self-host

The code is MIT-licensed. Self-hosting requires read access to a `cz-agents-webapp`-compatible SQLite database with `RealEstateLead`, `RealEstateExtract`, and `OptOutEntry` tables populated by daily crawlers.
