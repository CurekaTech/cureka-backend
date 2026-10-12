# `@release-note` — Release Playbook Skill

This skill generates a deployment playbook and a business email draft. It does not deploy, migrate, send email, or change Git history.

---

## Phase 0 — Initialization

1. Load `.github/skills/common/safety-guardrails.md`.
2. Load `.github/skills/common/custom-rules-precedence.md`.
3. Load `.github/skills/release-note/config.md`.
4. Confirm the output root is `reports/releases/<release-id>/`. Refuse any other write target.

---

## Phase 1 — Release intake

Collect these fields before treating a release as ready for review. Ask for anything critical that is missing. Do not guess a branch, commit, path, owner, or command. Optional unknowns are the literal `TBD`.

| Field | Required |
| --- | --- |
| Release name and stable release id | Yes |
| Planned deployment date and time | Yes |
| Repositories explicitly included | Yes. Unselected repositories stay out of the diff. |
| Source branch and intended production branch, per repository | Yes. `TBD` is allowed only as an explicit unknown. |
| Comparison baseline (previous deployed commit or tag) and release target | Yes. `auto`, `HEAD`, and an ambiguous short SHA block the release. |
| Target environment | Yes |
| Dev lead, QA owner, and required approvers | Yes. Names may be `TBD`. |
| Known issues and release constraints | Optional. Use an empty list when none were given. |

Write the intake to a JSON file that matches `scripts/release-note/release-note.example.json`. Keep human edits in that file. The sample file is a fixture, not a real release.

---

## Phase 2 — Read-only Git analysis

Inspect only repositories whose `selected` flag is true. For any other checkout, use the local path in `config.md`. If that path is `TBD`, missing, or not a Git work tree, record the repository as inaccessible and stop. Do not invent commits for it.

Allowed Git commands:

- `git status`
- `git fetch` only after the user explicitly permits a refresh of remote-tracking refs
- `git log`
- `git diff`
- `git show`
- `git rev-parse`
- `git tag --list`
- `git merge-base`

Never run `git reset`, `git checkout`, `git switch`, `git clean`, `git commit`, `git push`, or `git tag` to create or move a tag. Do not overwrite uncommitted work. Do not assume the current branch is the production branch.

Resolve the named baseline and the named target to full SHAs. Record `baselineSha`, `targetSha`, and the range `baselineSha..targetSha`. Compare that pair, not an unrelated branch. Keep `git status` output under `uncommittedChanges`, separate from commits.

If the baseline or target cannot be resolved to one commit, mark the release blocked. Do not write a playbook that pretends the diff is complete.

The builder enforces the same rules when `--collect` is set:

```bash
npm run release-note:build -- --input <release.json> --collect
```

Add `--allow-fetch` only when the user has explicitly allowed `git fetch`.

---

## Phase 3 — Change classification

Group committed changes into the categories that apply:

- Customer-facing features
- API and integration changes
- Admin-panel and operational changes
- Database schema and data migrations
- Environment-variable names and configuration requirements
- Background workers, queues, scheduled jobs, and cron changes
- Dependencies and build or runtime requirements
- Performance, caching, image delivery, and infrastructure
- Security, authentication, authorization, and RBAC
- Bug fixes and technical maintenance

Path names and commit subjects are hints. For backend changes, read the relevant NestJS modules, controllers, services, DTOs, entities, migrations, guards, configuration, workers, queues, and tests before describing runtime behavior. Set `needsHumanReview` when the category came from a path heuristic.

Record migration file names. Record environment-variable names only. Never record a value, connection string, token, or password.

---

## Phase 4 — Cross-repository dependencies

When more than one repository is selected, list dependencies the diffs and the documented deploy scripts actually support.

- Backend migrations run before the backend process reload in `scripts/deploy-beta.sh`. That ordering is confirmed for beta only.
- A backend API change plus a selected website or admin repo is a possible coupling. Mark it for human review unless the intake already confirms the order.
- Do not recommend a production deployment order that is not supported by the selected diffs and `config.md`.

Unselected repositories are excluded. State that exclusion in the business summary.

---

## Phase 5 — Risk assessment

Assign one release level:

- **LOW** — one isolated, backward-compatible change with a straightforward check.
- **MEDIUM** — several interacting changes, configuration, migrations, or customer-facing behavior that needs targeted QA.
- **HIGH** — payment, checkout, login, authorization, a destructive data change, a breaking API, or another production-impacting risk.

Explain every MEDIUM or HIGH reason. Do not lower the level because a test file exists or the diff is small. A human can set `risk.override` to true to keep a reviewed level.

---

## Phase 6 — Deployment and rollback playbook

Include:

- Prerequisites and approvals
- Repository and commit manifest
- Environment-variable names, with values omitted
- Migration and data-change notes
- Build and deployment order
- Service restart or worker notes where the repository documents them
- Post-deployment verification
- Rollback notes and rollback limits
- Known issues and escalation contacts

Use only commands recorded in `config.md`. Beta script names are not production approval. Missing production steps stay `TBD` with the owner who must confirm them. Do not execute deploy, rollback, or migration commands.

---

## Phase 7 — QA checklist

Add a check for each area the selected changes actually touch: API health and contracts, authentication and authorization, catalog or integrations, migrations, configuration names, queues, website or admin when those repos are selected, regression tests, and the critical business flows the dev lead names.

Use `scripts/health-check.sh` as the documented backend health probe. Do not mark a check passed unless a person or a recorded test result says so. Every row has result, evidence, owner, timestamp, and sign-off fields.

---

## Phase 8 — Business summary

Write plain language for non-technical readers:

- Subject
- Short introduction
- Release window
- Customer impact
- Operations impact
- Behind-the-scenes improvements
- Decisions needed, with reply-by dates
- Changes explicitly excluded
- Known customer impact or downtime, only when it was verified
- Contact and escalation details

Do not put commit SHAs, pull-request numbers, source paths, or unverified claims in this summary. Mention every material business-rule change. Phrase open questions as decisions.

The builder fills `scripts/release-note/business-email.template.txt` and writes `business-summary.txt`. If the business summary is omitted, the Word playbook is still created and the email file is not. The interactive agent never sends that draft.

A separate GitHub Actions workflow, `.github/workflows/development-release-note.yml`, can email `release-note.docx` after a pull request is merged into `development`. That message is a development validation note, not production approval. It sends only when the repository variables and secrets in `config.md` are present. Do not run that send while preparing a playbook by hand.

---

## Phase 9 — Output generation

Validate the JSON, then write a new version directory:

```text
reports/releases/<release-id>/v1/release-note.docx
reports/releases/<release-id>/v1/business-summary.txt
reports/releases/<release-id>/v1/manifest.json
reports/releases/<release-id>/LATEST.txt
```

The release id is a single safe directory name. Paths that escape `reports/releases/` are rejected. The Word file is A4 and includes the overview, business summary, manifest, change log, risk, prerequisites, deployment sequence, database and configuration changes, rollback, QA checklist, known issues, and approvals.

```bash
npm run release-note:build -- --input <release.json>
```

---

## Phase 10 — Validation and hand-off

The build fails when required fields are missing, a placeholder in the email template is unknown, a secret value is present, a selected repository cannot be read, or the baseline is not a single resolved commit.

Before handing off, confirm:

- The Word file opened as a document
- The email draft matches the template and still contains "It has not been sent."
- Manifest ranges match the selected comparisons
- Only explicitly selected repositories contribute changes
- Human QA results, approvals, known issues, decisions, and manually edited summary fields survive refresh
- No secret values were written
- The output directory is under `reports/releases/`
- No deploy, email, migration, or Git write ran

Report the file paths, the risk level, unresolved `TBD` items, and what the dev lead and QA owner still need to confirm.

Run the automated checks with:

```bash
npm run release-note:test
```

---

## Refresh policy

Use the same release id when new commits land before code freeze.

```bash
npm run release-note:build -- --input <release.json> --refresh --collect
```

Refresh recalculates Git ranges from the explicit baseline and target in the input. It updates the manifest, change list, risk, dependencies, and deployment notes. It keeps QA results, approval notes, known issues, stakeholder decisions, and business-summary fields listed in `manuallyEditedFields`.

Previously approved changes that disappeared or whose content hash changed are listed in `approvalDrift`. Their old approval text stays visible and is not treated as approval of the new diff.

The new files go to `v2`, `v3`, and so on. `v1` is not overwritten. `LATEST.txt` names the newest version.
