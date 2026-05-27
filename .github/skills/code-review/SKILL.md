# `@code-review` — Audit Skill

This skill defines the structured checklist `@code-review` follows when auditing code changes.

---

## Phase 0 — Initialization
1. Load `.github/skills/common/safety-guardrails.md`.
2. Load `.github/skills/common/custom-rules-precedence.md`.
3. Load `.github/skills/code-review/config.md`.
4. Identify the target: list of files, a diff, a PR branch, or a specific module.

---

## Phase 1 — Scope Definition
- List every file in scope.
- Identify the primary change type: new module, entity change, route addition, bugfix, refactor.
- State which audit categories apply (see Phase 3 checklist).

---

## Phase 2 — Static Analysis
Run (observe output only — do NOT fix):
```bash
npx tsc --noEmit
npm run lint
```
Record all errors and warnings verbatim.

---

## Phase 3 — Structured Audit Checklist

### 3.1 Architecture & Layer Separation
- [ ] Controllers are thin — no business logic, no direct TypeORM calls.
- [ ] Services own all business logic — no TypeORM `EntityManager` injected directly.
- [ ] Repositories own all database access — queries are not spread across services.
- [ ] No cross-module direct repository injection (modules must be self-contained).
- [ ] Mappers are pure functions — no side effects, no injected dependencies.

### 3.2 Database Safety
- [ ] `synchronize: true` is ABSENT from all DataSource and module configs.
- [ ] A migration file exists for every entity change.
- [ ] Migration SQL has been manually reviewed (no unexpected `DROP` or column renames).
- [ ] Entities extend `BaseEntity` from `@packages/database`.

### 3.3 Security
- [ ] `password` column has `select: false` on the entity decorator.
- [ ] Passwords are hashed with `hashPassword()` (bcrypt 12 rounds) before persistence.
- [ ] Plaintext passwords are never logged, returned, or stored.
- [ ] All UUID route params use `ParseUUIDPipe`.
- [ ] All non-public routes have `@UseGuards(JwtAuthGuard)`.
- [ ] No secrets or credentials hardcoded in source files.
- [ ] No sensitive data (tokens, passwords) included in log statements.

### 3.4 TypeScript Rigor
- [ ] Zero TypeScript compilation errors.
- [ ] No untyped `any` without a justifying comment.
- [ ] No non-null assertions (`!`) without an explanatory comment.
- [ ] All public methods have explicit return types.
- [ ] Path aliases (`@modules/*`, `@packages/*`) used — no relative `../../../` chains crossing package boundaries.

### 3.5 Input Validation & DTOs
- [ ] All input DTOs use `class-validator` decorators.
- [ ] DTOs use `class-transformer` for response shaping (no raw entity exposure).
- [ ] A single `<name>.dto.ts` per module (no per-operation separate files).
- [ ] `ValidationPipe` is applied globally in `main.ts`.

### 3.6 Error Handling
- [ ] Services throw typed NestJS exceptions (`NotFoundException`, `ConflictException`, etc.).
- [ ] No unhandled promise rejections (all async methods `await`-ed properly).
- [ ] No `try/catch` blocks that silently swallow errors.

### 3.7 Logging
- [ ] `nestjs-pino` logger used — no `console.log` or `console.error`.
- [ ] No `authorization` header or `password` value appears in log payloads.

### 3.8 Testing
- [ ] At least one unit test file exists for the service.
- [ ] Tests mock all dependencies — no real DB connections.
- [ ] No `expect(true).toBe(true)` or trivially passing assertions.

---

## Phase 4 — Findings Report

Present findings using this format:

```
## Code Review Report — <Feature/Module Name>
**Date**: YYYY-MM-DD
**Auditor**: @code-review
**Scope**: <list of files>

### Summary
| Severity | Count |
|----------|-------|
| 🔴 Blocker | N |
| 🟡 Warning | N |
| 🔵 Nit | N |

### Findings

**[Blocker]** `modules/admin-users/services/admin-users.service.ts` — Raw entity returned
> The `findAll()` method returns `AdminUser[]` directly. Map to `IAdminUserResponse` before returning.

**[Warning]** `modules/admin-users/entities/admin-user.entity.ts` — Missing index
> The `email` column is used in a WHERE clause but has no `@Index()` decorator.

**[Nit]** `modules/admin-users/dto/admin-user.dto.ts` — Redundant `@IsOptional()`
> `@IsOptional()` on a field that already has a default value is redundant.

### Verdict
🔴 **FAIL — Blockers must be resolved before merge.**
```

---

## Phase 5 — Completion
- Save the report to `reports/<YYYY-MM-DD>-<name>.md`.
- Do NOT modify any source files.
- Present the report to the developer.
