# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in cz-agents-mcp, please report it
**privately** to:

- **Email:** martin.havel@gmail.com
- **GitHub Security Advisory:** https://github.com/martinhavel/cz-agents-mcp/security/advisories/new

Please include:
- A description of the issue and its potential impact
- Steps to reproduce (or a proof-of-concept)
- The affected version(s) or commit hash
- Your suggested mitigation, if any

We aim to acknowledge reports within **48 hours** and provide an initial
assessment within **7 days**. Confirmed issues will be patched and disclosed
coordinated with you.

**Please do not** open public GitHub issues for security vulnerabilities.

## Supported Versions

We patch security issues in the latest minor version of each MCP server
package (currently 0.1.x). Older versions receive fixes only if the issue
is severe and upgrading is not feasible for the ecosystem.

## Data & Privacy

cz-agents-mcp servers are **stateless proxies** over public Czech government
and business APIs (ARES, ČNB). They:

- Do **not** store user queries, responses, or any PII.
- Do **not** require authentication from end users.
- Log only aggregate metrics (request count, response time, error rate) —
  no query contents, no IP addresses beyond ephemeral rate-limit buckets.
- Make **outbound HTTPS** to official Czech government endpoints only
  (`ares.gov.cz`, `www.cnb.cz`).

The hosted Streamable HTTP endpoints at `*.cz-agents.dev` are behind
Cloudflare (EU plan, GDPR-aligned). Edge traffic may be inspected by
Cloudflare per their [privacy policy](https://www.cloudflare.com/privacypolicy/).

## Scope

In scope:
- Remote code execution in server containers
- Authentication/authorization bypass
- Cross-site scripting (XSS) in the landing page (`cz-agents.dev`)
- Upstream API credential leakage (none should exist — public APIs)
- Dependency vulnerabilities with direct exploit paths

Out of scope:
- Upstream ARES / ČNB API vulnerabilities (report those to respective agencies)
- Rate-limit bypass via IP rotation (by design; rate limits are best-effort)
- Self-hosted instances that users deploy themselves (you are responsible)

## Responsible Disclosure

We follow a **90-day coordinated disclosure** window. If we cannot patch
within 90 days, we will discuss a coordinated extended timeline with you.
Credit is given in the advisory unless you prefer anonymity.

## Supply Chain

This project publishes to npm under the `@czagents` scope. We use:

- **2FA-protected** npm tokens (Automation tokens with bypass for CI only)
- **Granular tokens** for limited-scope operations
- Ed25519 DNS-based authentication for the MCP registry
- No build artifacts are committed to git (each release is built fresh from source)

Lock files (`package-lock.json`) pin transitive dependencies.
