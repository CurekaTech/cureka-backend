# Cureka Backend — Beta CI/CD

All deployment files live in Git. The server only executes tracked scripts from `/var/www/Cureka-backend`.

See also: [beta-cicd-fixes.md](./beta-cicd-fixes.md) (latest trigger/health fixes).

## Flow

```text
feature/* → development → Beta CI
PR → beta_development → merge → Beta Deploy
```

| Workflow | Trigger | Action |
|----------|---------|--------|
| `beta-ci.yml` | PR/push → `development` | `npm ci` + `npm run build` (Node 22) |
| `beta-deploy.yml` | push → `beta_development` | SSH → `./scripts/deploy-beta.sh` |

## Deploy flow

```text
git fetch
git reset --hard origin/beta_development
git clean -fd

if package-lock changed → npm ci
if source changed      → npm run build

pm2 reload ecosystem.config.js --update-env
health check  (GET /api/v1/health → 200)
  └─ on failure → rollback.sh
```

**Migrations are manual** — never run by CI/CD.

## Files

| Path | Purpose |
|------|---------|
| `ecosystem.config.js` | PM2 cluster × 2, `wait_ready`, `--update-env` |
| `scripts/deploy-beta.sh` | Deploy + rollback on failure |
| `scripts/rollback.sh` | Restore previous SHA + reload |
| `scripts/cleanup.sh` | Keep last 5 deploy history records |
| `scripts/health-check.sh` | `GET /api/v1/health` — 15 retries × 2s |
| `apps/api/main.ts` | `process.send('ready')` |
| `apps/api/health/health.controller.ts` | `{ "status": "ok" }` |

## GitHub Secrets

| Secret | Required |
|--------|----------|
| `BETA_SSH_HOST` | yes |
| `BETA_SSH_USER` | yes |
| `BETA_SSH_PORT` | yes |
| `BETA_SSH_PRIVATE_KEY` | yes |
| `BETA_DEPLOY_PATH` | no (default `/var/www/Cureka-backend`) |
| `BETA_HEALTH_CHECK_URL` | no |

## PM2 rules

- Prefer: `pm2 reload ecosystem.config.js --update-env`
- `pm2 restart` only if reload fails (rollback path)
