# Beta CI/CD (PM2 / GitHub Actions)

Near-zero-downtime deployment for the Cureka NestJS API on a Debian VM using PM2 cluster reload — no Docker/Kubernetes.

Keep this pipeline simple. Improve it only after real deploy pain shows up.

## What is in scope

| Path | Purpose |
|------|---------|
| `ecosystem.config.js` | PM2 cluster config, `.env` load, graceful reload |
| `scripts/deploy-beta.sh` | Main deploy script |
| `scripts/health-check.sh` | Post-deploy `GET /api/v1/health` probe |
| `.github/workflows/beta-ci.yml` | PR CI (`npm ci` + build) |
| `.github/workflows/beta-deploy.yml` | Push → SSH deploy |
| `apps/api/health/health.controller.ts` | `GET /api/v1/health` liveness (HTTP 200) |
| `apps/api/main.ts` | `process.send('ready')` for PM2 `wait_ready` |

Intentionally **not** included (beta simplicity):

- Automatic rollback
- Deploy history JSON / `cleanup.sh`
- `flock` deploy lock on the VM (GitHub Actions `concurrency` is enough)

## Deploy pipeline

```text
git fetch
git reset --hard origin/beta_development

npm ci                 # only if package-lock.json changed / node_modules missing
npm run build          # skip when sources unchanged and dist exists
verify dist/apps/api/main.js
npm run migration:run
pm2 reload ecosystem.config.js --update-env
health check           # GET /api/v1/health → 200
```

## GitHub Secrets

**Required**

| Secret | Purpose |
|--------|---------|
| `BETA_SSH_HOST` | VM hostname or IP |
| `BETA_SSH_USER` | SSH user |
| `BETA_SSH_PRIVATE_KEY` | Full PEM private key |

**Optional** (secret or variable)

| Name | Default |
|------|---------|
| `BETA_SSH_PORT` | `22` |
| `BETA_DEPLOY_PATH` | `/var/www/Cureka-backend` |
| `BETA_HEALTH_CHECK_URL` | `http://127.0.0.1:<PORT>/api/v1/health` |

## Workflows

### `beta-ci.yml`

Trigger: `pull_request` → `beta_development`

- Node 22 + npm cache
- `npm ci`
- `npm run build`
- Verify `dist/apps/api/main.js`

### `beta-deploy.yml`

Trigger: `push` → `beta_development` (+ `workflow_dispatch`)

```yaml
concurrency:
  group: beta-deployment
  cancel-in-progress: true

timeout-minutes: 15
```

SSH into the VM and run `./scripts/deploy-beta.sh`.

## Health endpoint

Must return **HTTP 200**:

```text
GET /api/v1/health
```

```json
{ "status": "ok", "service": "api", "timestamp": "…" }
```

If this 404s, the health controller change is not deployed yet — deploy once with that commit, or temporarily set `BETA_HEALTH_CHECK_URL` to a known-good URL.

## One-time VM bootstrap

```bash
cd /var/www/Cureka-backend
git checkout beta_development
chmod +x scripts/deploy-beta.sh scripts/health-check.sh
npm ci && npm run build
npm run migration:run
pm2 start ecosystem.config.js --update-env
pm2 save
```

## Manual deploy

```bash
cd /var/www/Cureka-backend
./scripts/deploy-beta.sh
./scripts/deploy-beta.sh --force-npm-ci --force-build
./scripts/health-check.sh
```

## PM2 policy

- Normal deploy: **only** `pm2 reload ecosystem.config.js --update-env`
- Do **not** use `pm2 restart` for normal deploys

## Checklist before first merge

- [x] `ecosystem.config.js`
- [x] `deploy-beta.sh`
- [x] `health-check.sh`
- [x] `beta-ci.yml`
- [x] `beta-deploy.yml`
- [x] PM2 cluster + reload
- [x] `npm run migration:run` in deploy
- [x] Health endpoint returns 200
- [ ] GitHub Secrets configured
- [ ] One successful manual `./scripts/deploy-beta.sh` on the VM
