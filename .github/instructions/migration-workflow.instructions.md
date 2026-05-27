---
applyTo: "src/database/migrations/**/*.ts"
---

# Migration Instructions

You are writing a **TypeORM migration file** for the Cureka backend.

## Rules

- **NEVER use `synchronize: true`** — migrations are the only way to change schema.
- Migration filenames follow: `{timestamp}-{PascalCaseDescription}.ts`
- Every `up()` must have a corresponding `down()` that reverses it exactly.
- Use `queryRunner.createTable()`, `addColumn()`, `createIndex()` — never raw `ALTER TABLE` unless necessary.
- Always add `IF NOT EXISTS` / `IF EXISTS` guards.
- UUID primary keys use `uuid_generate_v4()` default.
- Timestamp columns use `TIMESTAMPTZ` (timezone-aware).
- Soft delete columns: `deleted_at TIMESTAMPTZ NULL`.

## Workflow

```bash
# After editing entity:
npm run migration:generate -- src/database/migrations/DescribeYourChange

# Review the generated SQL, then:
npm run migration:run

# To roll back:
npm run migration:revert
```
