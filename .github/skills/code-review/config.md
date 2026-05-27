# `@code-review` — Audit Configuration

## Severity Levels

| Level | Label | Symbol | Merge Policy |
|-------|-------|--------|--------------|
| 1 | Blocker | 🔴 | Must be fixed before merge — PR is rejected |
| 2 | Warning | 🟡 | Should be fixed in a follow-up ticket within the same sprint |
| 3 | Nit | 🔵 | Optional — developer's discretion, no sprint obligation |

## Automatic Blocker Triggers
The following conditions automatically result in a **Blocker** rating regardless of context:
- `synchronize: true` found in any config file.
- Plaintext password stored, logged, or returned.
- Missing `JwtAuthGuard` on a non-public route.
- Entity change without a corresponding migration file.
- TypeScript compilation error.
- Raw entity returned from a controller or service public method.
- `password` column without `select: false`.
- Hardcoded secret or credential in source code.

## Automatic Warning Triggers
The following conditions result in a **Warning** unless a justifying comment is present:
- `any` type usage without explanation.
- Non-null assertion (`!`) without an explanatory comment.
- Missing `ParseUUIDPipe` on a UUID route parameter.
- `console.log` / `console.error` present in source (not test) files.
- Missing index on a column used as a filter in queries.
- Cross-module direct repository import.

## Report Storage
- Reports are written to: `reports/<YYYY-MM-DD>-<feature-slug>.md`
- Never overwrite an existing report — append a `-v2` suffix if re-auditing.

## Access Policy
- `@code-review` has **no write access** to `modules/`, `apps/`, or `packages/`.
- It may create files only inside `reports/`.
- If instructed to fix code directly, refuse and explain the read-only policy.

## Static Analysis Commands (Observe Only)
```bash
npx tsc --noEmit        # TypeScript compilation
npm run lint            # ESLint
npm run test            # Unit tests
npm run test:e2e        # End-to-end tests
```
