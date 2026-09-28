# MCP setup for the analysis agent

How to connect Claude Code to GA4, Search Console, Cloudflare, GCP and the
Cloud SQL database **read-only**, so the `system-analyst` agent
(`.claude/agents/system-analyst.md`) can debug the whole system.

What each server can do, and what is out of scope: [MCP_ANALYSIS_SCOPE.md](./MCP_ANALYSIS_SCOPE.md).

## Principle: read-only is enforced by credentials, not by prompts

Every server runs as an identity that **cannot** write:

| Service | Identity | Why it can't write |
| --- | --- | --- |
| GCP (logs, metrics, VM, Cloud SQL admin API) | `mcp-readonly@cureka-501005` SA, impersonated | Only `*.viewer` roles + `cloudsql.client` |
| GA4, Search Console | same SA | Viewer / Restricted user on the property |
| PostgreSQL | `mcp_readonly` DB role | Only `SELECT`, PII columns masked, read-only transactions, 15 s timeout |
| Redis | `mcp_readonly` ACL user | `+@read` only |
| Cloudflare | your Cloudflare login (OAuth) | Use a member with a read-only role (e.g. *Analytics* + *Audit Logs Viewer*) |

No service-account key is created. Analysts impersonate the SA.

## 1. One-time admin setup

### 1.1 GCP service account

```bash
./scripts/mcp/setup-gcp-readonly.sh --user analyst@cureka.com                 # review
./scripts/mcp/setup-gcp-readonly.sh --user analyst@cureka.com --bucket <sitemap-or-media-bucket> --apply
```

Add `--bigquery` once GA4 → BigQuery export is on (needed for p75 Web Vitals).

### 1.2 GA4 and Search Console

- GA4 → Admin → Property access management → add
  `mcp-readonly@cureka-501005.iam.gserviceaccount.com` as **Viewer**.
- Search Console → Settings → Users and permissions → add the same address as
  **Restricted**.

### 1.3 Cloud SQL read-only role

Connect as an admin (Cloud SQL Studio, or the Auth Proxy) and run:

```bash
psql "<admin connection>" -v mcp_password="$(openssl rand -base64 24)" \
  -f docs/mcp/sql/mcp_readonly_role.sql
```

The script grants `SELECT` only, hides PII columns (email, phone, names,
addresses, OTPs, tokens, bank details, raw gateway payloads), blocks
`otp_logs` / `user_sessions`, sets a 15 s statement timeout and a 3-connection
cap, and grants `pg_monitor` for query/lock diagnostics. Re-run it after
migrations that add tables. Point it at a read replica if you create one.

Store the password in Secret Manager; hand it to analysts through
`.env.mcp`, never through git.

### 1.4 Redis read-only ACL (queues and cache)

On the Redis host:

```
ACL SETUSER mcp_readonly on >STRONG_PASSWORD ~* -@all +@read +info +ping +scan +type +ttl -keys
ACL SAVE
```

`-keys` blocks `KEYS *` (it stalls Redis on a large keyspace).

### 1.5 Cloudflare

The Cloudflare MCP servers use OAuth. Give each analyst a Cloudflare account
member with read-only permissions on the `cureka.com` zone (Analytics, Logs
read, Firewall read, DNS read, Audit Logs). They log in from `/mcp` inside
Claude Code.

## 2. Analyst machine

Install: Node 20+, `gcloud`, `pipx`, `uv` (for `uvx`), optionally `redis-cli`.

```bash
cp .env.mcp.example .env.mcp          # fill in the blanks
gcloud auth login
gcloud auth application-default login \
  --impersonate-service-account=mcp-readonly@cureka-501005.iam.gserviceaccount.com \
  --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/analytics.readonly,https://www.googleapis.com/auth/webmasters.readonly
./scripts/mcp/doctor.sh
```

Redis and a private-IP database are reached through IAP (you need
`roles/iap.tunnelResourceAccessor`, which the analysis SA does **not** have):

```bash
gcloud compute start-iap-tunnel cureka-beta-v 6379 \
  --local-host-port=localhost:16379 --zone=asia-south1-c
```

Start Claude Code with the env loaded, approve the project servers, and log
in to Cloudflare:

```bash
set -a; source .env.mcp; set +a
claude
> /mcp                      # approve servers, authenticate Cloudflare
> /agents                   # system-analyst should be listed
```

Example prompts:

- "Use system-analyst: sessions dropped since yesterday 10:00 IST — find where."
- "Use system-analyst: checkout conversion fell this week; split by payment provider."
- "Use system-analyst: why are product pages slow on mobile?"

## 3. Server reference (`.mcp.json`)

| Server | Package / URL | Auth |
| --- | --- | --- |
| `google-analytics` | `analytics-mcp` (Google, official) via `pipx run` | ADC (impersonated SA) |
| `search-console` | `mcp-server-gsc` (community) via `npx` | ADC or `MCP_GSC_CREDENTIALS` |
| `gcloud` | `@google-cloud/gcloud-mcp` (Google, official) | gcloud + `CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT` |
| `gcp-observability` | `@google-cloud/observability-mcp` (Google, official) | ADC |
| `cloudsql-postgres` | MCP Toolbox for Databases `@toolbox-sdk/server --prebuilt cloud-sql-postgres` | ADC (connector) + `mcp_readonly` password |
| `redis` | `redis-mcp-server` (Redis, official) via `uvx` | `mcp_readonly` ACL user |
| `cloudflare-graphql` | `https://graphql.mcp.cloudflare.com/mcp` | OAuth |
| `cloudflare-dns-analytics` | `https://dns-analytics.mcp.cloudflare.com/mcp` | OAuth |
| `cloudflare-audit-logs` | `https://auditlogs.mcp.cloudflare.com/mcp` | OAuth |
| `cloudflare-browser` | `https://browser.mcp.cloudflare.com/mcp` | OAuth |
| `cloudflare-docs` | `https://docs.mcp.cloudflare.com/mcp` | none |
| `chrome-devtools` | `chrome-devtools-mcp` (Google, official) | none (local Chrome) |

If the Cloud SQL instance has no public IP, set `MCP_CLOUDSQL_IP_TYPE=private`
and run Claude Code from a machine in the VPC, or swap the server to the
plain `postgres` prebuilt through an Auth Proxy:

```json
"cloudsql-postgres": {
  "command": "npx",
  "args": ["-y", "@toolbox-sdk/server", "--prebuilt", "postgres", "--stdio"],
  "env": {
    "POSTGRES_HOST": "127.0.0.1", "POSTGRES_PORT": "5432",
    "POSTGRES_DATABASE": "${MCP_CLOUDSQL_DATABASE}",
    "POSTGRES_USER": "mcp_readonly", "POSTGRES_PASSWORD": "${MCP_CLOUDSQL_PASSWORD}"
  }
}
```

Package names and tool lists of third-party servers change; if one fails to
start, check its README before changing credentials.

## 4. Revoking access

- Remove the analyst's `serviceAccountTokenCreator` binding on the SA.
- `ALTER ROLE mcp_readonly NOLOGIN;` disables DB access for everyone at once.
- `ACL SETUSER mcp_readonly off` for Redis.
- Remove the member in Cloudflare.
