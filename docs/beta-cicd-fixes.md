# Beta CI/CD Fixes — Change Summary

> **Update:** Beta CI no longer touches `development`. Pipelines are linked only to `beta_development`. Migrations run on every deploy (`npm run migration:run`). See [beta-cicd.md](./beta-cicd.md).

## Desired flow (current)

```text
development              ← existing pipelines only (beta workflows do not run)

PR → beta_development    ← Beta CI
merge → beta_development ← Beta Deploy (includes migration:run every time)
```

---

## 1. Files changed

| File | Change |
|------|--------|
| `.github/workflows/beta-ci.yml` | Trigger moved from `beta_development` → `development` (PR + push) |
| `.github/workflows/beta-deploy.yml` | Removed migration inputs/wiring; deploy-only on `beta_development` |
| `apps/api/health/health.controller.ts` | Confirmed `GET /api/v1/health` → `{ "status": "ok" }` with `@RawResponse()` |
| `scripts/deploy-beta.sh` | Removed all `migration:run` / `RUN_MIGRATIONS` paths |
| `docs/beta-cicd-fixes.md` | **This file** — change log and confirmations |
| `docs/beta-cicd.md` | Aligned with final behaviour |

**Reviewed, no code changes required**

| File | Result |
|------|--------|
| `ecosystem.config.js` | Already correct: cluster × 2, `wait_ready`, `listen_timeout: 10000`, `kill_timeout: 5000` |
| `apps/api/main.ts` | Already has `process.send('ready')` |
| `scripts/health-check.sh` | Already probes `http://127.0.0.1:${PORT}/api/v1/health` (15 × 2s) |
| `scripts/rollback.sh` | OK — restore SHA, reload, restart only if reload fails |
| `scripts/cleanup.sh` | OK — keep last 5 history records |

---

## 2. Explanation for each change

### `beta-ci.yml` — CI on `development` only

**What:** `on.pull_request` / `on.push` branches set to `development`.  
**Why:** Merging into `beta_development` was running both CI and Deploy. CI belongs on `development`; deploy belongs on `beta_development`.

### `beta-deploy.yml` — deploy only, no migrations

**What:** Removed `run_migrations` input, `BETA_RUN_MIGRATIONS`, and related flags.  
**Why:** Migrations must stay manual. Workflow stays a single SSH → `deploy-beta.sh` job on Node 22 toolchain for checkout only (deploy runs on the VM).

### `health.controller.ts` — real liveness endpoint

**What:** `GET /api/v1/health` returns `{ "status": "ok" }` with `@RawResponse()` (no API envelope). No DB/Redis on this route.  
**Why:** Deploy failed after successful `pm2 reload` because health returned **404**. Previously only `GET /api/v1/health/redis` existed on older builds; the liveness route must exist and return HTTP 200 so `health-check.sh` can pass.

### `deploy-beta.sh` — strip migrations

**What:** Removed `RUN_MIGRATIONS` / `--run-migrations` / `npm run migration:run`.  
**Why:** Keep migrations manual after deployment. Deploy path remains: fetch → reset → conditional `npm ci` → conditional build → `pm2 reload` → health → rollback on failure.

---

## 3. Why each change was required

| Issue | Root cause | Fix |
|-------|------------|-----|
| CI + Deploy both fired on merge to `beta_development` | `beta-ci.yml` targeted `beta_development` | Point CI at `development` |
| Deploy failed with health 404 | No lightweight `GET /api/v1/health` on running build (or only redis probe) | Ship liveness at `/api/v1/health` returning 200 |
| Risk of CI/CD running migrations | Optional migrate flags in workflow/script | Remove migrate paths entirely |

---

## 4. Near-zero downtime — confirmed

Deployment still uses:

```bash
pm2 reload ecosystem.config.js --update-env
```

with PM2 cluster mode (`instances: 2`), `wait_ready: true`, and `process.send('ready')` after listen.  
`pm2 restart` is only used inside `rollback.sh` if reload fails.

---

## 5. Migrations remain manual — confirmed

- Not in `beta-ci.yml`
- Not in `beta-deploy.yml`
- Not in `scripts/deploy-beta.sh`

Run on the VM when needed:

```bash
cd /var/www/Cureka-backend
npm run migration:run
```

---

## First deploy after this merge

If a previous deploy rolled back before the liveness route was live, this merge should:

1. Build (health controller changed)
2. `pm2 reload`
3. Pass `GET /api/v1/health` → 200

Quick verify on the VM after deploy:

```bash
curl -i "http://127.0.0.1:${PORT:-3000}/api/v1/health"
# Expect: HTTP/1.1 200  and  {"status":"ok"}
```

If you still see 404, force a rebuild once:

```bash
./scripts/deploy-beta.sh --force-build
```
