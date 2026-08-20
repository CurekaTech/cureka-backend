# Cureka Backend — Beta Deploy (only)

Simplest pipeline: **nothing runs until you merge into `beta_development`**, then a single deploy workflow runs.

## Flow

```text
feature/* → development     → No GitHub Actions (from this setup)
Open PR → beta_development  → No GitHub Actions
Merge PR → beta_development → Beta Deploy (one workflow)
```

Only workflow file:

```text
.github/workflows/beta-deploy.yml
```

Trigger:

```yaml
on:
  push:
    branches:
      - beta_development
  workflow_dispatch:
```

No `pull_request`. No `development` branch triggers. No separate CI workflow.

## Deploy steps (on the VM)

```text
git fetch / reset --hard origin/beta_development
git clean -fd
npm ci                 # always
npm run build          # always
npm run migration:run  # always
pm2 reload ecosystem.config.js --update-env
GET /api/v1/health → 200
  └─ on failure → rollback.sh
```

## SSH / nvm note

Non-interactive SSH often cannot find `npm` if Node was installed with nvm.  
`scripts/deploy-beta.sh` and `scripts/rollback.sh` load:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
export PATH="$PATH:/usr/local/bin:/usr/bin"
```

## Health

`GET /api/v1/health` → `{ "status": "ok" }` (HTTP 200). No DB/Redis.

## Secrets

| Secret | Required |
|--------|----------|
| `BETA_SSH_HOST` | yes |
| `BETA_SSH_USER` | yes |
| `BETA_SSH_PORT` | yes |
| `BETA_SSH_PRIVATE_KEY` | yes |
| `BETA_DEPLOY_PATH` | no (default `/var/www/Cureka-backend`) |
| `BETA_HEALTH_CHECK_URL` | no |

## PM2

- Prefer: `pm2 reload ecosystem.config.js --update-env`
- `pm2 restart` only if reload fails during rollback
