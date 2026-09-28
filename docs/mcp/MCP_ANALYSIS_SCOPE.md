# MCP scope for the Cureka analysis agent

What an MCP-connected analysis agent can see across Cureka, which questions
each service answers, what it cannot answer, and the order to roll it out.
Setup steps: [SETUP.md](./SETUP.md). Agent: `.claude/agents/system-analyst.md`.

Sources: `cureka-backend` and `cureka-frontend` code (Sep 2026), CI workflows,
`.env.example`, and the existing investigations in `docs/analysis/` and
`cureka-frontend/docs/analysis/`.

## 1. System map (what there is to observe)

```text
Browser ── GTM (GTM-N2GRSJH) ──► GA4  (page_view, ecommerce events, web_vitals)
   │
   ▼
Cloudflare zone cureka.com  (proxy, cache, WAF, DNS, bot score)
   │
   ▼
GCP project cureka-501005, VM cureka-beta-v (asia-south1-c), PM2:
   ├─ cureka-frontend   Next.js 16, :3001, fork x1      → PM2 text logs (not JSON)
   ├─ cureka-backend    NestJS/Fastify, :3000, cluster x2 → pino JSON → Ops Agent → Cloud Logging
   └─ cureka-image-worker  (autostart off)               → pino JSON
        │
        ├─ Cloud SQL PostgreSQL   (~130 tables, TypeORM migrations)
        ├─ Redis                  (cache + 15 BullMQ queues)
        ├─ GCS private bucket     (media, derivatives, sitemaps)
        └─ Typesense              (product search)

Third parties (outbound + webhooks): GoKwik / KwikPass, Razorpay, Cashfree,
Shipway, Unicommerce, BOB (WhatsApp), MSG91, Google Merchant Center.
Deploys: GitHub Actions on push to beta_development → IAP SSH → PM2 reload.
```

Correlation keys already in place: backend `x-request-id` header ↔
`jsonPayload.requestId` in logs; BullMQ `jobId` + `queue` in worker logs;
`orders.ref_id` across DB, logs and provider webhooks.

## 2. Services in scope

Priority: **P1** = set up now (core debugging), **P2** = next, **P3** = optional.

### 2.1 Google Analytics 4 — P1

Server: `analytics-mcp` (Google, official). Read-only by design (Data API + Admin API reads).

| Capability | Tools | Cureka use |
| --- | --- | --- |
| Property discovery | `get_account_summaries`, `get_property_details`, `list_google_ads_links` | Confirm the right property / Ads link |
| Reporting | `run_report` (any dimension × metric, filters, date ranges) | Sessions/users by `date`, `hour`, `sessionDefaultChannelGroup`, `sessionCampaignName`, `landingPagePlusQueryString`, `deviceCategory`, `city` |
| Realtime | `run_realtime_report` | "Is traffic back right now?" after a fix or deploy |
| Schema | `get_custom_dimensions_and_metrics` | Discover `metric_name`, `metric_rating`, `page_type` |

Events the storefront sends (`src/shared/analytics/`): `page_view`,
`view_item_list`, `select_item`, `view_item`, `add_to_cart`,
`remove_from_cart`, `view_cart`, `begin_checkout`, `add_shipping_info`,
`add_payment_info`, `purchase`, `search`, `web_vitals`.

Questions it answers: channel/landing-page breakdown of a traffic drop (the
12 Sep Performance Max drop was found this way), checkout funnel step
drop-off, revenue by item/brand, real-user Web Vitals share of *good* by
`page_type` (once the GTM/GA4 steps in `WEB_VITALS_SETUP.md` are done).

Limits: no raw hits, sampling/thresholding on small segments, no p75 (needs
BigQuery export), data from ~1 Sep 2026 only, revenue from 16 Sep.

### 2.2 Google Search Console — P1

Server: `mcp-server-gsc` (community). Uses the Search Console API (read scope).

Use: organic clicks/impressions/CTR/position by page, query, device, date;
sitemap status; URL inspection (index status, canonical Google chose). This
is the source for the post-migration organic decline (72% impressions drop,
404s, sitemap on the wrong host) described in `TRAFFIC_DROP_ANALYSIS.md`.

Limits: 2–3 day data delay, 16 months history, URL inspection quota
(~2,000/day/property). Community package: pin a version after first use.

### 2.3 Cloudflare — P1

Remote servers (OAuth), from `cloudflare/mcp-server-cloudflare`:

| Server | Scope | Cureka use |
| --- | --- | --- |
| `cloudflare-graphql` | GraphQL Analytics API: `httpRequestsAdaptiveGroups`, `httpRequests1hGroups`, `firewallEventsAdaptive`, cache status, edge/origin timing | Server-side truth for visits (independent of GA/consent/ad-blockers); 4xx/5xx and 52x by path; cache hit ratio for `/_next/*`, `/shop/*`, media; origin response time; bot vs. human; WAF blocks of Googlebot or payment webhooks |
| `cloudflare-dns-analytics` | DNS query analytics, record config | DNS mistakes after migration, resolution failures |
| `cloudflare-audit-logs` | Account audit log | "Who changed a cache rule / WAF rule / redirect at 09:30?" |
| `cloudflare-browser` | Browser Rendering: fetch HTML/markdown/screenshot | See a page as a crawler sees it from the edge; verify redirects, canonicals, soft 404s |
| `cloudflare-docs` | Documentation search | Rule/header semantics |

Not useful for Cureka today: Workers observability/bindings/builds,
containers, AI Gateway, AutoRAG (the site does not run on Workers). The
**Logpush** server manages Logpush jobs only; per-request edge logs require
Logpush (Enterprise). Without it, GraphQL adaptive datasets (sampled,
~30 days on paid plans, shorter on lower plans) are the edge data source.

### 2.4 GCP — P1

**`gcp-observability`** (`@google-cloud/observability-mcp`, Google):
Cloud Logging queries, Monitoring time series and alert policies, Trace,
Error Reporting.

Useful log queries (backend logs are GCP-shaped pino JSON: `severity`,
`message`, `service`, `environment`, `requestId`, `req.url`,
`res.statusCode`, `responseTimeMs`, `context`, `jobId`, `queue`):

```text
jsonPayload.service="cureka-backend" AND severity>=ERROR
jsonPayload.context="http" AND jsonPayload.responseTimeMs>2000
jsonPayload.requestId="<x-request-id from a failing call>"
jsonPayload.context="worker" AND jsonPayload.queue="unicommerce"
jsonPayload.message=~"gokwik|razorpay|cashfree|shipway"
```

Metrics: VM CPU / memory / disk (Ops Agent), Cloud SQL CPU, connections,
disk, replication lag, deadlocks; uptime checks if configured.

**`gcloud`** (`@google-cloud/gcloud-mcp`, Google): runs `gcloud` as the
read-only SA. Use for inventory and config: VM state and metadata, firewall
rules, Cloud SQL flags / maintenance / operations / backups, IAM policy,
bucket listing, Cloud Asset search. The SA has no SSH / IAP / write roles,
so any mutating command fails with 403.

Limits: nothing on the VM that is not shipped to Cloud Logging (PM2 status,
`.env` flags, nginx if any). Frontend PM2 logs are plain text with a date
prefix; unless the Ops Agent tails them, Next.js server errors are invisible.

### 2.5 Cloud SQL PostgreSQL (read-only) — P1

Server: MCP Toolbox for Databases, `cloud-sql-postgres` prebuilt (Google).
Connects through the Cloud SQL connector with the `mcp_readonly` role
(`docs/mcp/sql/mcp_readonly_role.sql` — tested: writes, DDL and PII columns
are rejected; timeouts applied).

Prebuilt tools include SQL execution, table/index/schema listing, active
queries, query plans, and Postgres health checks (locks, bloat, vacuum,
invalid indexes, top queries from `pg_stat_statements`; exact names depend
on the Toolbox version).

Debugging domains the DB covers:

| Domain | Tables |
| --- | --- |
| Orders & checkout | `orders`, `order_items`, `carts`, `cart_items`, `coupons`, `coupon_usages`, `payment_requests`, `payment_request_items` |
| GoKwik | `gokwik_orders`, `gokwik_webhook_events`, `gokwik_abandoned_carts`, `gokwik_refunds`, `gokwik_sync_states` |
| Shipping | `shipments`, `shipment_items`, `shipment_events`, `shipway_webhook_unresolved`, `order_fulfillment_events` |
| Returns / refunds | `return_requests`, `return_pickups`, `return_qc_records`, `refund_requests`, `refund_wallet_ledger`, `cod_refund_payouts` (bank fields masked) |
| Subscriptions | `user_product_subscriptions`, `subscription_*`, `membership_*` |
| Catalogue / SEO | `products`, `product_variants`, `product_media`, `categories`, `brands`, `cms_pages`, `blog_posts` (slugs, OOS, meta, "undefined" URLs) |
| Media | `image_assets`, `image_pipeline_checkpoints` |
| Notifications | `bob_notify_outbox`, `bob_abandoned_cart_outbox` |
| Admin actions | `audit_logs`, `bulk_uploads` |

Masked (never readable): emails, phones, names, addresses, DOB, IPs, OTPs,
tokens, bank details, raw gateway payloads; `otp_logs` and `user_sessions`
are blocked entirely.

### 2.6 Redis / BullMQ — P2

Server: `redis-mcp-server` (Redis, official) with a `+@read` ACL user through
an IAP tunnel. Queues (`packages/queue/src/queue.constants.ts`):
`notifications`, `emails`, `oos-email`, `order-processing`, `analytics`,
`unicommerce`, `unicommerce-products`, `gokwik`,
`product-subscription-renewal`, `product-subscription-reminder`,
`membership-renewal`, `membership-reminder`, `sitemap`,
`bob-abandoned-cart`, `image-pipeline`.

Use: backlog (`LLEN bull:<q>:wait`), stuck jobs (`bull:<q>:active`),
failures (`ZCARD bull:<q>:failed`, `HGETALL bull:<q>:<id>` → `failedReason`),
delayed/repeat jobs (abandoned-cart scan, sitemap regeneration), cache
memory and eviction (`INFO memory`, `INFO stats`).

Limits: tunnel needed per session; the server also exposes write tools —
the ACL, not the server, keeps it read-only.

### 2.7 Browser / performance — P2

`chrome-devtools-mcp` (Google): drives a local Chrome — performance traces
with LCP/CLS/INP breakdown, network waterfall, console errors, CPU/network
throttling. Use to reproduce what GA4 `web_vitals` reports as poor for a
`page_type`. Pair with `cloudflare-browser` for an edge-side view.

### 2.8 GitHub — P1 (already available)

The GitHub MCP (Claude Code on the web has it; locally use the GitHub
remote MCP) gives commits, PRs and Actions runs for both repos — the deploy
timeline for "what changed at the change point". Deploys are pushes to
`beta_development`.

### 2.9 Optional (P3)

| Service | Server | Why | Note |
| --- | --- | --- | --- |
| BigQuery (GA4 export) | Toolbox `--prebuilt bigquery` | p75 Web Vitals, raw event paths, user-level funnels | Enable GA4 → BigQuery export first; run `setup-gcp-readonly.sh --bigquery` |
| Google Ads | `google-ads-mcp` (Google, read-only) | PMax / Shopping spend, disapprovals — root cause of the 12 Sep drop | Needs an Ads developer token |
| Merchant Center | none official | Product disapprovals / "Limited" items | Use Content API via `gcloud`/scripts; `google-merchant` module has feed logic |
| GCS | `@google-cloud/storage-mcp` (Google) | Inspect sitemap XML and media derivatives | Bucket-level `objectViewer` only |
| Razorpay | Razorpay official MCP | Payment / refund status by id | Use a read-only key if the dashboard supports it; otherwise skip |
| Cashfree | Cashfree MCP | Same for Cashfree | Same caution |
| GoKwik, Shipway, Unicommerce, BOB, MSG91, Typesense | none | — | Covered indirectly by webhook/outbox tables and logs |

Connectors present in some Claude sessions but **not relevant** here:
Cloudflare Developer Platform (Workers/KV/R2/D1), Vercel, Neon — Cureka runs
on a GCP VM with Cloud SQL.

## 3. Coverage matrix

`●` primary source, `○` supporting.

| Problem | GA4 | GSC | Cloudflare | Logging / Monitoring | Postgres | Redis | Browser | GitHub |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| Traffic drop | ● | ● | ● | | ○ | | | ○ |
| Organic / indexing / sitemap | | ● | ○ | ○ | ○ | | ● | ○ |
| Conversion / checkout drop | ● | | ○ | ● | ● | | | ○ |
| Payment / webhook failures | | | ● (WAF) | ● | ● | ○ | | |
| Slow pages / Web Vitals | ● | | ● | ● | ○ | | ● | ○ |
| API 5xx / latency | | | ● | ● | ● | ○ | | ○ |
| Shipping / Unicommerce sync | | | | ● | ● | ● | | |
| Queue backlog / stuck jobs | | | | ● | ○ | ● | | |
| Image pipeline stuck | | | | ● | ● | ● | ○ | |
| Infra saturation (VM, DB) | | | ○ | ● | ● | ○ | | |
| Bot / abuse / OTP spam | ○ | | ● | ● | ○ | | | |
| "What changed?" | | | ● (audit) | ○ | ○ (`audit_logs`) | | | ● |

## 4. Gaps that limit the agent (recommended fixes)

1. **Edge ↔ origin correlation.** The backend does not log `cf-ray` or
   `cf-connecting-ip`, so a Cloudflare 5xx cannot be matched to a log line.
   Log `cf-ray` in the pino `req` serializer (`packages/logger/src/pino-http.options.ts`).
2. **Frontend server logs.** Next.js runs under PM2 with text logs and a date
   prefix; SSR/ISR errors, `/api/csp-report` and revalidation failures are not
   in Cloud Logging as structured entries. Ship `logs/pm2-*.log` via the Ops
   Agent (or log JSON) with `service=cureka-frontend`.
3. **GA4 BigQuery export** is needed for p75 Web Vitals and unsampled funnels.
4. **Uptime checks / alerting.** Add Cloud Monitoring uptime checks for
   `/api/v1/health`, `/api/v1/health/redis`, the homepage and one PDP so the
   agent has an availability series and not just logs.
5. **No read replica.** The agent queries production; the role caps it at
   15 s and 3 connections. A small replica removes the risk entirely.
6. **Third parties without APIs in MCP** (GoKwik, Shipway, Unicommerce):
   keep webhook/outbox tables complete — they are the only history the agent
   can read.
7. **Environments.** CI targets `cureka-beta-v`; confirm which VM and Cloud SQL
   instance serve `www.cureka.com` and record them in `.env.mcp.example`.

## 5. Risks and controls

| Risk | Control |
| --- | --- |
| Agent writes to prod | Credential-level read-only everywhere (SA viewer roles, `SELECT`-only role, Redis `+@read`, read-only Cloudflare member). Prompt rules are a second layer only |
| Customer PII reaching the model (DPDP) | Column masking in the DB role; pino already redacts headers/OTPs; agent reports by id |
| Heavy queries on prod DB | `statement_timeout=15s`, `lock_timeout=2s`, connection limit 3 |
| Prompt injection from logs, webhook payloads or fetched pages | Treat as data; no write capability to exploit |
| Credential leakage | No SA keys; impersonation; `.env.mcp` gitignored; revocation steps in SETUP.md |
| API quotas / cost | GA4 Data API token quotas, GSC inspection quota, BigQuery bytes billed — agent uses aggregates and bounded windows |

## 6. Rollout

1. **Phase 1 (day 1):** GCP SA + GA4 + Search Console + Cloudflare + Cloud SQL
   role + GitHub. Run `doctor.sh`. Re-run the September traffic-drop analysis
   end-to-end through the agent as the acceptance test.
2. **Phase 2 (week 1):** Redis ACL + tunnel, chrome-devtools, uptime checks,
   `cf-ray` logging, frontend logs into Cloud Logging.
3. **Phase 3:** GA4 → BigQuery, Google Ads MCP, read replica, payment-provider MCPs.
