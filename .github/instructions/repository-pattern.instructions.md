---
applyTo: "modules/**/*.repository.ts"
---

# Repository Pattern Instructions

You are working in a **NestJS TypeORM repository file**.

## Rules

- This file handles ALL database access for its module.
- Use `this.repo.createQueryBuilder()` for complex queries.
- Do NOT add business logic — only data access.
- Do NOT throw HTTP exceptions — throw plain errors or return null.
- Expose pagination via `findAllPaginated(options: PaginationOptions)` returning `{ data, total }`.
- Use `buildSkipTake()` from `@shared/utils/pagination.util` for offset calculation.
- Always use `softDelete()` for deletion — never hard delete.
- Columns with `select: false` (e.g., `password`) require `addSelect()` in query builder.

## Required Methods Template

```typescript
async create(data: Partial<Entity>): Promise<Entity>
async findById(id: string): Promise<Entity | null>
async findByEmail(email: string): Promise<Entity | null>
async update(id: string, data: Partial<Entity>): Promise<Entity | null>
async softDelete(id: string): Promise<void>
async findAllPaginated(options: PaginationOptions): Promise<{ data: Entity[]; total: number }>
async existsByEmail(email: string): Promise<boolean>
```
