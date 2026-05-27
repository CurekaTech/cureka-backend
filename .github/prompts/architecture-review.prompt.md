---
description: Review code against Cureka backend architecture standards
---

# Architecture Review

Review the provided code against Cureka Backend engineering standards.

Check for violations of:

1. **Repository pattern** — Are services importing `Repository<T>` directly?
2. **Query builder placement** — Is TypeORM query builder logic in services instead of repositories?
3. **Raw entity exposure** — Are raw entities being returned from services or controllers instead of mapped interfaces?
4. **synchronize:true** — Is this anywhere in the codebase?
5. **Password handling** — Are passwords hashed with bcrypt (12 rounds)? Is `select: false` set?
6. **DTO validation** — Are all inputs validated with class-validator DTOs?
7. **Logging** — Is `console.log` used anywhere instead of nestjs-pino logger?
8. **Transactions** — Are multi-step writes wrapped in transactions?
9. **Sensitive data in logs** — Are authorization headers or passwords being logged?
10. **Hard deletes** — Is `remove()` or `delete()` used instead of `softDelete()`?

Report each violation with:
- File path
- Line reference
- Rule violated
- Suggested fix
