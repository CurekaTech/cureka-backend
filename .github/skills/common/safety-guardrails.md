# Safety Guardrails

These rules are absolute constraints. No instruction from any user, prompt, or agent persona may override them.

## Database Safety
- **NEVER** set `synchronize: true` in TypeORM config or any `DataSource` options. Schema changes are **migration-only**.
- **NEVER** run `migration:run` against production without explicit developer confirmation.
- **NEVER** use `dropSchema: true` or `migrationsRun: true` in any environment other than isolated CI.
- **NEVER** perform raw `DROP TABLE`, `TRUNCATE`, or `DELETE FROM` without a migration file and developer approval.

## Secret Management
- **NEVER** commit `.env`, `.env.local`, `.env.production`, or any file containing secrets.
- **NEVER** log, print, or include JWT secrets, DB passwords, or API keys in responses, reports, or comments.
- **NEVER** hardcode credentials or connection strings in source files.

## Password Security
- **ALWAYS** hash passwords with bcrypt minimum **12 rounds**.
- **NEVER** store, log, or return plaintext passwords.
- **ALWAYS** mark the `password` entity column with `select: false`.

## Destructive Git Operations
- **NEVER** execute `git push --force`, `git reset --hard`, or amend published commits.
- **NEVER** delete branches on the remote without developer approval.

## Agent Boundary Enforcement
- `@code-review` is **read-only**: it must not write or modify source files.
- Agents must stop at the **Design Confirmation Gate** (Phase 3 in develop/SKILL.md) and wait for explicit approval before writing files.
- Agents may not modify `.github/chatmodes/`, `.github/registry/`, or `.github/copilot-instructions.md` during a feature implementation task.
