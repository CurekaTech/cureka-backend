---
applyTo: "**"
---

# Cureka Backend — General Standards

## Architecture
- The project is a **NestJS modular monolith** targeting future microservice extraction.
- All business modules live under `modules/<name>/` at the project root, NOT inside `apps/`.
- Shared infrastructure lives in `packages/` (database, queue, cache, events, logger, common).
- `apps/api/` is the NestJS Fastify HTTP app; `apps/worker/` is the BullMQ processor.

## Module Structure
Every business module follows this exact 9-subfolder pattern:
```
modules/<name>/
├── controllers/
├── services/
├── repositories/
├── entities/
├── dto/
├── interfaces/
├── enums/
├── mappers/
├── utils/
└── <name>.module.ts
```
- One DTO file per module: `dto/<name>.dto.ts` (no separate Create/Update files).
- Mappers are **pure functions** — entity → response interface, never entity → raw entity.

## TypeScript
- `strict: true` is enforced — no `any` without an explicit comment justifying it.
- No non-null assertion (`!`) without an explanatory comment.
- Prefer explicit return types on all public methods.
- Path aliases: `@modules/*`, `@packages/*`, `@config/*`, `@common/*`, `@database/*`.

## Layer Rules
| Layer | Responsibility | Forbidden |
|-------|---------------|-----------|
| Controller | Route binding, request parsing, guard attachment | Business logic, DB access |
| Service | Orchestrate business rules, call repositories | Direct TypeORM `EntityManager` access |
| Repository | All DB queries (TypeORM) | Business logic, HTTP concerns |

## Security
- Passwords hashed with bcrypt minimum **12 rounds** via `hashPassword()` from `@packages/common`.
- `password` column **must** have `select: false` on the entity.
- Never log or return passwords.
- Use `ParseUUIDPipe` on all UUID route params.
- JWT guards (`JwtAuthGuard`) required on all non-public routes.

## Logging
- Use **nestjs-pino** injected logger — `this.logger.log(...)` never `console.log`.
- Redact `authorization` headers and `password` fields in log redaction config.

## Error Handling
- Throw typed NestJS exceptions: `NotFoundException`, `ConflictException`, `UnauthorizedException`, etc.
- `AllExceptionsFilter` is registered globally — do not catch exceptions you cannot handle.
