# Cureka Backend — Beta CI/CD

All deployment files live in Git. The server only executes tracked scripts from `/var/www/Cureka-backend`.

## Files

| Path | Purpose |
|------|---------|
| `ecosystem.config.js` | PM2 cluster (2 instances), `wait_ready`, `--update-env` |
| `scripts/deploy-beta.sh` | Fetch/reset, conditional ci/build, optional migrations, reload, health, rollback |
| `scripts/rollback.sh` | Restore previous SHA + reload |
| `scripts/cleanup.sh` | Keep last 5 `.deployments/history` records |
| `scripts/health-check.sh` | `GET /api/v1/health` — 15 retries × 2s |
| `.github/workflows/beta-deploy.yml` | Push → SSH → `deploy-beta.sh` |
| `.github/workflows/beta-ci.yml` | PR → `npm ci` + `npm run build` |
| `apps/api/main.ts` | `process.send('ready')` |
| `apps/api/health/health.controller.ts` | `{ "status": "ok" }` |

## Deploy flow

```text
git fetch
git reset --hard origin/beta_development
git clean -fd

if package-lock changed → npm ci
if source changed      → npm run build
if RUN_MIGRATIONS=true → npm run migration:run

pm2 reload ecosystem.config.js --update-env
health check
  └─ on failure → rollback.sh
```

## Migrations

Skipped by default. Enable with:

```bash
RUN_MIGRATIONS=true ./scripts/deploy-beta.sh
# or
./scripts/deploy-beta.sh --run-migrations
```

In GitHub: set secret/variable `BETA_RUN_MIGRATIONS=true`, or use workflow_dispatch → **run_migrations**.

## GitHub Secrets

| Secret | Required |
|--------|----------|
| `BETA_SSH_HOST` | yes |
| `BETA_SSH_USER` | yes |
| `BETA_SSH_PORT` | yes |
| `BETA_SSH_PRIVATE_KEY` | yes |
| `BETA_DEPLOY_PATH` | no (default `/var/www/Cureka-backend`) |
| `BETA_HEALTH_CHECK_URL` | no |
| `BETA_RUN_MIGRATIONS` | no (`true` to always migrate) |

## PM2 rules

- Prefer: `pm2 reload ecosystem.config.js --update-env`
- `pm2 restart` only if reload fails (rollback path)

## First-time VM note

If an old process was named `cureka-api`, rename once:

```bash
pm2 delete cureka-api || true
pm2 start ecosystem.config.js --update-env
pm2 save
```
