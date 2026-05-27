---
applyTo: "**/*.spec.ts"
---

# Cureka Backend — Test Standards

## Framework
- Use **Jest** with the `@nestjs/testing` `TestingModule` setup.
- Unit tests live alongside the source file: `<name>.service.spec.ts` next to `<name>.service.ts`.
- E2E tests live in `apps/api/test/` using Supertest against a `TestingModule`-based Fastify app.

## Unit Tests
- Mock ALL dependencies with `jest.fn()` or `createMock<T>()` (from `@golevelup/ts-jest`).
- Never instantiate repositories or use a real database connection in unit tests.
- Each `describe` block maps to a single class; each `it` block maps to a single method + scenario.
- Naming: `it('should return the admin user when found', ...)`

## Repository Tests
- Use an **in-memory SQLite** database or a dedicated test PostgreSQL schema — never the production DB.
- Reset data with `beforeEach(() => repo.clear())`.

## E2E Tests
- Spin up the full Fastify HTTP app in `beforeAll` and call `app.close()` in `afterAll`.
- Test happy-path and all error paths (400, 401, 403, 404, 409).
- Seed the DB with factory functions, never hardcoded IDs.

## Forbidden Patterns
- No `jest.setTimeout` above 10 000 ms without justification.
- No real HTTP calls to external services in unit tests.
- No `console.log` inside test files — use `Logger` mock or suppress.
- No `expect(true).toBe(true)` — every assertion must test a real invariant.

## Coverage Targets
| Layer | Minimum |
|-------|---------|
| Service | 90% |
| Repository | 80% |
| Controller | 70% |
| Mapper | 100% (pure functions) |
