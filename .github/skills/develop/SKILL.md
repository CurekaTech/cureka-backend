# `@develop` — Feature Implementation Skill

This skill defines the Phase 0–12 end-to-end lifecycle for the `@develop` agent on the Cureka NestJS backend.

---

## Phase 0 — Intake & Routing
1. Load all shared guardrails from `.github/skills/common/`:
   - `safety-guardrails.md`
   - `output-format-preservation.md`
   - `verification-before-completion.md`
   - `custom-rules-precedence.md`
2. Load `.github/skills/develop/config.md`.
3. Parse the incoming task: extract the **story title**, **Acceptance Criteria (ACs)**, affected module(s), and any attached context or design notes.
4. Establish and state the scope boundary — `feature`, `bugfix`, `migration-only`, or `refactor`.

---

## Phase 1 — Repo & Branch Setup
1. Confirm the current branch is `main` (or the designated base trunk from `config.md`).
2. Generate the feature branch name using the prefix convention from `config.md`:
   - Feature: `feature/<jira-id>-<short-slug>`
   - Bugfix: `bugfix/<jira-id>-<short-slug>`
   - Hotfix: `hotfix/<jira-id>-<short-slug>`
3. Create and checkout the branch:
   ```bash
   git checkout -b feature/<jira-id>-<short-slug> origin/main
   ```
4. Confirm the working tree is clean before proceeding.

---

## Phase 2 — Context Loading
Read the following to build the implementation baseline:
- `apps/api/app.module.ts` — existing module imports.
- `apps/api/config/` — environment variable shapes and validation.
- `modules/` — existing module patterns (follow the 9-subfolder convention).
- `packages/common/src/index.ts` — pagination, response builders, hash utils.
- `packages/database/src/index.ts` — `BaseEntity`, `buildSkipTake`.
- Any existing entity, service, or migration if this is a modification task.
- Identify the target module name and confirm the folder does not already exist.

---

## Phase 3 — Design Confirmation (**STOP GATE**)
Draft and present a comprehensive change summary:

```
## Phase 3 — Design Proposal

### Story
<One-sentence restatement of the task>

### Acceptance Criteria
- [ ] AC1
- [ ] AC2

### New / Modified Files
| File | Action | Reason |
|------|--------|--------|
| modules/<name>/entities/<name>.entity.ts | CREATE | New entity |
| apps/api/database/migrations/<Timestamp>-<Name>.ts | GENERATE | Schema change |

### API Routes
| Method | Path | Guard | DTO |
|--------|------|-------|-----|
| POST   | api/v1/<name> | JwtAuthGuard | Create<Name>Dto |

### Migration Plan
- Migration name: `Add<Name>Table`
- Columns: (list with types, constraints, nullable flags)
- Indexes: (list)
- FK constraints: (list, if any)

### Risk Assessment
- Breaking changes: (yes/no + detail)
- Data impact: (yes/no + detail)
```

**? STOP. Do not write any code until the developer explicitly approves this proposal.**

---

## Phase 4 — Implementation
Execute in this exact order to maintain dependency integrity:

1. **Entity**: `modules/<name>/entities/<name>.entity.ts` — extend `BaseEntity` from `@packages/database`, define all columns with explicit TypeORM decorators, apply `select: false` on sensitive fields (e.g., `password`).
2. **Migration**: Run `npm run migration:generate -- apps/api/database/migrations/<Name>`, inspect generated SQL, wait for developer confirmation, then run `npm run migration:run`.
3. **Interfaces**: `modules/<name>/interfaces/<name>.interface.ts` — response interfaces only (no entity shapes).
4. **Enums**: `modules/<name>/enums/<name>-*.enum.ts` — if applicable.
5. **DTO**: `modules/<name>/dto/<name>.dto.ts` — single file containing all DTOs (Create, Update, Login, Response), using `class-validator` decorators.
6. **Repository**: `modules/<name>/repositories/<name>.repository.ts` — all TypeORM queries, `buildSkipTake` for pagination.
7. **Mapper**: `modules/<name>/mappers/<name>.mapper.ts` — pure function, entity ? response interface. No side effects, no DI.
8. **Service**: `modules/<name>/services/<name>.service.ts` — business logic, typed NestJS exceptions (`NotFoundException`, `ConflictException`, `UnauthorizedException`).
9. **Controller**: `modules/<name>/controllers/<name>.controller.ts` — thin, `@UseGuards(JwtAuthGuard)` on protected routes, `ParseUUIDPipe` on all UUID params, returns mapped interfaces.
10. **Module**: `modules/<name>/<name>.module.ts` — register entity, repository, service, controller; import shared packages as needed.
11. **AppModule**: Import the new module in `apps/api/app.module.ts`.

For scratchpad or greenfield experiments, isolate work in `develop/.temp/<feature>/` — never in the main source tree.

---

## Phase 5 — Unit Tests
For every service created or modified:
1. Create `modules/<name>/services/<name>.service.spec.ts`.
2. Mock ALL dependencies with `jest.fn()` — no real database connections.
3. Cover: happy path, `NotFoundException`, `ConflictException`, and all branch conditions.
4. Follow `tests.instructions.md` coverage targets (Service = 90%, Mapper = 100%).

---

## Phase 6 — Lint & Format
```bash
npm run lint
```
Fix all errors. Zero ESLint errors required before Phase 7.

---

## Phase 7 — Type Check
```bash
npx tsc --noEmit
```
Fix all TypeScript compilation errors. Zero errors required before Phase 8.

---

## Phase 8 — Self Review
Scan the Git diff of the current branch against `main`:
- [ ] No raw entities returned from controllers or services.
- [ ] No TypeORM access directly in services (repository layer only).
- [ ] No `console.log` or debug artifacts.
- [ ] All cross-layer integrations complete (module registered, route reachable).
- [ ] Migration ran successfully and entity definition matches migration SQL.
- [ ] No `.env` values hardcoded in source files.

---

## Phase 9 — Local Verification
```bash
npm run test
npm run test:e2e
```
All tests must pass. Document any skipped E2E tests with a reason if DB infrastructure is unavailable.

---

## Phase 10 — Pre-Push Code Review
Invoke the `@code-review` agent internally against all changed files:
- Execute the Phase 3 audit checklist from `.github/skills/code-review/SKILL.md`.
- Any **Blocker** finding must be resolved before Phase 11.
- Log **Warning** and **Nit** findings as follow-up tickets.

---

## Phase 11 — Commit & Push
Stage only files related to the current story:
```bash
git add <specific files>
git commit -m "<type>(<scope>): <short description> [<JIRA-ID>]"
git push origin <branch-name>
```
Conventional Commit types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`.
Example: `feat(admin-users): add login endpoint and JWT auth [CUR-42]`

---

## Phase 12 — Open PR
Create a pull request with the following structure:

```
Title: feat(<module>): <story title> [<JIRA-ID>]

## Summary
<2-3 sentence description of what was implemented and why>

## Changes
- New module: `modules/<name>/`
- Migration: `Add<Name>Table`
- Routes: POST /api/v1/<name>, GET /api/v1/<name>, GET /api/v1/<name>/:id

## Acceptance Criteria
- [x] AC1 — verified
- [x] AC2 — verified
- [ ] AC3 — deferred (link to follow-up ticket)

## Testing
- Unit tests: ? X passing
- E2E tests: ? X passing / ?? skipped (reason)
- TypeScript: ? 0 errors
- Lint: ? 0 errors

## JIRA
Closes <JIRA-ID>
```

Target branch: `main`. Assign reviewers per `config.md` conventions.