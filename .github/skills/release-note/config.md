# `@release-note` — Configuration

Values below were taken from this repository and from local checkouts that were present when the workflow was added. Anything not confirmed is `TBD`. Do not replace `TBD` with a guess.

The generator reads a release JSON file. This document tells the agent what may be copied into that file.

## Output

| Setting | Value |
| --- | --- |
| Output root | `reports/releases/<release-id>/vN/` |
| Playbook | `release-note.docx` |
| Email draft | `business-summary.txt` |
| Manifest | `manifest.json` |
| Latest pointer | `reports/releases/<release-id>/LATEST.txt` |
| Build command | `npm run release-note:build -- --input <release.json>` |
| Test command | `npm run release-note:test` |
| Email template | `scripts/release-note/business-email.template.txt` |
| Example input | `scripts/release-note/release-note.example.json` |

## Business email

| Setting | Value |
| --- | --- |
| Draft sender | `dev.budtech@gmail.com` |
| Dev lead contact | `dev.budtech@gmail.com` |
| Dev lead name | `TBD` |
| Recipients | `TBD` |
| QA owner | `TBD` |
| Required approvers | `TBD` |
| Notification timing | `TBD` |
| Send behavior | The interactive agent never sends `business-summary.txt`. It stays a draft. The development workflow below can send a separate notification with the Word file attached. |

Template placeholders: `subject`, `introduction`, `releaseWindow`, `customerImpact`, `operationsImpact`, `behindTheScenes`, `decisions`, `excludedChanges`, `knownCustomerImpact`, `contacts`, `sender`, `notificationTiming`. Any other `{{token}}` fails the build.

## Shared rules

| Topic | Rule |
| --- | --- |
| Production branch | `TBD` for every repository. Do not treat the current branch as production. |
| Allowed release branches | `TBD`. Select the branch in the release intake. |
| Beta branch documented by existing scripts | `beta_development` for the beta scripts and the admin beta workflow. This is not confirmation that beta is production. |
| Sensitive paths | `.env`, `.env.local`, `.env.production`, `secrets/**`, `docs/gokwik-test-credentials.json` |
| Secret handling | Record environment-variable names only. Never write values, connection strings, tokens, or passwords. |
| Git access | Read-only commands listed in `SKILL.md`. `git fetch` only when the user explicitly allows it. |
| Development pull-request notes | `.github/workflows/development-release-note.yml` generates one playbook after a pull request is merged into `development`. That branch is a test target, not production. |
| Database recovery | `TBD`. `npm run migration:revert` rolls back the last migration only. It is not a restore procedure. |

## Development notification email

The settings and the reason a merge does not send mail are in `docs/release-note-email.md`. The workflow reads those GitHub Actions names. It does not read addresses or passwords from source files.

## cureka-backend

| Setting | Value |
| --- | --- |
| Repository id | `cureka-backend` |
| Role | NestJS API, workers, and PostgreSQL migrations |
| Local checkout path | `TBD`. The workflow was added inside this repository. Confirm the absolute path before `--collect`. |
| Observed remotes | `origin` `https://github.com/Budventure-Technologies-Pvt-Ltd/Cureka-backend.git`; `cureka` `https://github.com/CurekaTech/cureka-backend.git` |
| Production branch | `TBD` |
| Beta branch in `scripts/deploy-beta.sh` | `beta_development` (`BRANCH` override exists; default is not a production decision) |
| Deployment documentation | Beta only: `bash scripts/deploy-beta.sh`. The script documents `npm ci`, `npm run build`, `npm run migration:run`, then `pm2 reload ecosystem.config.js --update-env`. Production command: `TBD`. |
| Process names in `ecosystem.config.js` | `cureka-backend`, `cureka-image-worker` |
| Worker note | `cureka-image-worker` is `autostart: false`. Reload it only when the release changes the image pipeline. Production process manager: `TBD`. |
| Rollback documentation | Beta only: `bash scripts/rollback.sh` or `bash scripts/rollback.sh --sha <commit>`. Production rollback: `TBD`. |
| Health check | `bash scripts/health-check.sh` polls `GET /api/v1/health` for HTTP 200. `GET /api/v1/health/redis` exists and is not part of that script. |
| Migrations | TypeORM files in `apps/api/database/migrations/`, named `{timestamp}-{PascalCaseDescription}.ts`. Apply with `npm run migration:run`. Revert the last one with `npm run migration:revert`. `synchronize: true` is forbidden. |
| Environment names | Names are documented in `.env.example`. Do not copy values from `.env` or `.env.example` into a release artifact. |
| Queues | `packages/queue/src/queue.constants.ts` |
| Smoke checks | Health script above, plus the repo test command `npm test`. Do not claim either passed unless a result was recorded. |
| Owners | Dev lead contact `dev.budtech@gmail.com`. Name, QA owner, and approvers: `TBD`. |

## cureka-frontend

| Setting | Value |
| --- | --- |
| Repository id | `cureka-frontend` |
| Role | Customer website |
| Local checkout path | `TBD`. A checkout was observed in the sibling folder `Cureka-frontend/Cureka-frontend`. The parent `Cureka-frontend` directory was not itself a Git repo. Confirm the absolute path before selecting this repository. |
| Observed remotes | `origin` `https://github.com/Budventure-Technologies-Pvt-Ltd/Cureka-frontend.git`; `cureka` `https://github.com/CurekaTech/cureka-frontend.git` |
| Production branch | `TBD` |
| Beta branch in `scripts/deploy-beta-frontend.sh` | `beta_development` |
| Deployment documentation | Beta only: `bash scripts/deploy-beta-frontend.sh`. Production command: `TBD`. |
| Process name | `cureka-frontend` |
| Rollback documentation | Beta only: `bash scripts/rollback-frontend.sh` or `bash scripts/rollback-frontend.sh --sha <commit>`. Production rollback: `TBD`. |
| Health check | The beta script calls `scripts/health-check.sh` for `GET /`. Public production URL: `TBD`. |
| Migrations | Not in this repository. |
| Environment names | `TBD`. Confirm the frontend env example before listing names. |
| Smoke checks | `TBD` beyond the beta health script. |
| Owners | `TBD` |

Include this repository only when the release intake sets `selected` to true.

## cureka-admin

| Setting | Value |
| --- | --- |
| Repository id | `cureka-admin` |
| Display name | Cureka Admin Panel |
| Local checkout path | `TBD`. A checkout was observed in the sibling folder `cureka-admin/Cureka-Admin-Panel`. Confirm the absolute path before selecting this repository. |
| Observed remotes | `origin` `https://github.com/Budventure-Technologies-Pvt-Ltd/Cureka-Admin-Panel.git`; `cureka-tech` `https://github.com/CurekaTech/cureka-admin.git` |
| Production branch | `TBD` |
| Beta branch | `beta_development`, from `.github/workflows/beta-deploy.yml` in that checkout |
| Deployment documentation | Beta workflow: `.github/workflows/beta-deploy.yml`. It reloads PM2 process `cureka-admin`. Production command: `TBD`. |
| Rollback documentation | `TBD`. No rollback script was found in that checkout. |
| Health check | The beta workflow checks the admin login route on the beta host. Public production URL: `TBD`. |
| Cloud identifiers | Do not copy project ids, service accounts, VM names, or server paths into the playbook or the email. |
| Migrations | Not in this repository. |
| Environment names | `TBD` |
| Smoke checks | `TBD` beyond the beta workflow check. |
| Owners | `TBD` |

Include this repository only when the release intake sets `selected` to true.

## Deployment order

| Step | When it is confirmed |
| --- | --- |
| Backend `npm run migration:run` before backend `pm2 reload` | Confirmed for the beta script `scripts/deploy-beta.sh` only. Production: `TBD`. |
| Website or admin before or after the API | `TBD` unless the selected diffs and a person confirm a coupling. The generator marks inferred couplings as unconfirmed. |
