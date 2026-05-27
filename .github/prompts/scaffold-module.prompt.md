---
description: Generate a complete NestJS module following Cureka modular monolith standards
---

# Scaffold a new Cureka module

Generate a complete NestJS module for **{{moduleName}}** following our modular monolith architecture.

## What to create

Generate all files under `src/modules/{{moduleName}}/`:

- `entities/{{moduleName}}.entity.ts` — TypeORM entity extending `BaseEntity`
- `enums/` — Any relevant enums
- `interfaces/{{moduleName}}.interface.ts` — Response interface (no password/sensitive fields)
- `dto/create-{{moduleName}}.dto.ts` — Create DTO with class-validator
- `dto/update-{{moduleName}}.dto.ts` — Update DTO using `PartialType(OmitType(...))`
- `mappers/{{moduleName}}.mapper.ts` — Pure function: entity → interface
- `utils/{{moduleName}}.util.ts` — Pure functional helpers
- `repositories/{{moduleName}}.repository.ts` — All DB access using TypeORM repository
- `services/{{moduleName}}.service.ts` — Business logic, calls repository only
- `controllers/{{moduleName}}.controller.ts` — Thin HTTP layer
- `{{moduleName}}.module.ts` — Module wiring

## Constraints

- Follow ALL rules in `.github/copilot-instructions.md`
- Never use `synchronize: true`
- Never put query builder logic in services
- Never return raw entities — always use mapper
- Use `ParseUUIDPipe` for ID params
- Use `PaginationQueryDto` for list endpoints
- Remind me to run `npm run migration:generate -- apps/api/src/database/migrations/Create{{PascalModuleName}}`
