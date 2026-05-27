# Cureka Backend — AI Engineering Standards

## Project Overview

Cureka Backend is a **production-grade modular monolith** built with NestJS, TypeORM, and PostgreSQL.
This file governs how GitHub Copilot and other AI tools assist in this codebase.

---

## Architecture: Modular Monolith

Each module is **fully self-contained** and follows clean boundaries to enable future extraction into
microservices with minimal refactoring.

```
src/modules/<module-name>/
├── controllers/       # Thin HTTP layer — no business logic
├── services/          # Business/orchestration logic only
├── repositories/      # All DB access — no raw queries in services
├── entities/          # TypeORM entities — source of truth for schema
├── dto/               # Validated input shapes
├── interfaces/        # Output/domain interfaces
├── enums/             # Typed enums used across the module
├── mappers/           # Pure functions: entity → response
├── utils/             # Pure functional helpers
└── <module>.module.ts # NestJS module wiring
```

---

## Non-Negotiable Rules

### Database

- **NEVER use `synchronize: true`** — migrations only, always.
- Entity files are the source of truth for schema.
- All schema changes must go through TypeORM migrations.
- Migration workflow: change entity → generate migration → review SQL → run migration.

### Repository Pattern

- Repositories handle **all TypeORM interactions** (find, save, query builder, etc.).
- Services must **never** import `Repository<T>` or use `EntityManager` directly.
- All query builder logic lives in repositories.

### Services

- Services contain **orchestration and business logic only**.
- No raw SQL, no TypeORM query builders in services.
- Services call repositories; they do not touch the DB directly.

### Controllers

- Controllers are **thin** — validate input, call service, return result.
- No business logic in controllers.
- Use `ParseUUIDPipe` for UUID params, `PaginationQueryDto` for list endpoints.

### Transactions

- Use `DataSource.transaction()` or `EntityManager` passed via repository methods for atomic ops.
- Never leave multi-step writes without transaction protection.

### DTOs & Validation

- All incoming data must use `class-validator` decorated DTOs.
- `ValidationPipe` is global with `whitelist: true` and `forbidNonWhitelisted: true`.
- Never bypass DTO validation.

### Mappers

- Mappers are **pure functions** — entity in, response interface out.
- Never return raw entities from services or controllers.
- Password and sensitive fields must be stripped before mapping.

### Logging

- Use `nestjs-pino` injected logger — never `console.log`.
- Redact `authorization` headers and `password` fields in logs.

### Password Security

- Always hash with bcrypt (min 12 rounds).
- Never log or return passwords.
- `password` column must use `select: false`.

---

## Adding a New Module

1. Create folder: `src/modules/<name>/`
2. Create sub-folders: `controllers/`, `services/`, `repositories/`, `entities/`, `dto/`, `interfaces/`, `enums/`, `mappers/`, `utils/`
3. Create entity extending `BaseEntity`
4. Run `npm run migration:generate -- src/database/migrations/<Name>`
5. Review generated SQL
6. Run `npm run migration:run`
7. Create repository, service, controller, module file
8. Register module in `AppModule`

## Migration Workflow

```bash
# 1. Edit the entity file
# 2. Generate migration
npm run migration:generate -- src/database/migrations/AddMyFeature

# 3. Review the generated file in src/database/migrations/
# 4. Run migrations
npm run migration:run

# 5. To revert last migration
npm run migration:revert
```

---

## TypeScript Standards

- Strict mode enabled — no `any` without justification.
- No `!` non-null assertions without comments explaining safety.
- Prefer explicit return types on public methods.
- Use `const` assertions for config/constant objects.

---

## Future Microservice Extraction Checklist

When extracting a module to a microservice:
- [ ] Module has no direct imports from other business modules
- [ ] All cross-module communication uses service interfaces (not direct repo calls)
- [ ] Module has its own migration set
- [ ] Module has its own `.env` variables documented
