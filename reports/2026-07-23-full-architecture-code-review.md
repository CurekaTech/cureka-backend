# Code Review & Architecture Audit — Cureka Backend

**Date:** 2026-07-23
**Auditor:** @code-review
**Scope:** Full repository — 22 modules, 8 shared packages, 79 entities, 128 migrations
**Stack:** NestJS 10 + Fastify, TypeORM, PostgreSQL, BullMQ/Redis, Typesense, GCS

---

## Executive Summary

The codebase follows the intended modular monolith structure well at the surface: controllers are thin, the repository pattern is applied consistently, 128 migrations cover all schema changes, and `synchronize` is safely disabled. However, two **Blockers** and fourteen **Warnings** require resolution before this codebase is considered production-hardened.

More critically for the client's stated goal of **future microservice migration**, the single biggest risk is cross-module repository coupling — modules directly inject each other's TypeORM repositories, creating database-level tight coupling that would make any service extraction impossible without a major refactor.

| Severity | Count |
|----------|-------|
| 🔴 Blocker | 2 |
| 🟡 Warning | 14 |
| 🔵 Nit | 5 |

**Verdict: 🔴 FAIL — Blockers must be resolved before next production deploy.**

---

## Part 1 — Code Quality Findings

---

### 3.1 Architecture & Layer Separation

#### 🔴 Blocker — Cross-module direct repository injection

Multiple modules bypass module encapsulation by injecting another module's `Repository<T>` directly instead of going through that module's exported service. This violates the architecture contract and the config rule: *"Cross-module direct repository import → automatic Blocker."*

**Offenders identified:**

| Consumer Module | Repositories Injected From Other Modules |
|----------------|------------------------------------------|
| `product` (bulk-upload, resolver, wizard) | `AttributesRepository`, `BrandsRepository`, `CategoriesRepository`, `UnitsRepository`, `ManufacturersRepository`, `GalleryRepository` |
| `unicommerce` | `ProductsRepository`, `OrdersRepository`, `VariantsRepository` |
| `search` | `ProductsRepository`, `VariantsRepository`, `BrandsRepository`, `CategoriesRepository` |
| `shipping` | `OrdersRepository` |
| `orders` | `ShipmentsRepository` |
| `gokwik` | `CouponsRepository` |
| `payment-requests` | `UsersRepository` |
| `reviews` | `ProductsRepository`, `UsersRepository` |
| `public` | `ProductsRepository`, `BrandsRepository`, `CategoriesRepository` |
| `master` (home-sections) | `ProductsRepository` |
| `admin-users` | `UsersRepository`, `RolesRepository` |

**Why it matters for microservices:** If `ProductModule` is ever extracted as a standalone service, every module in the list above would immediately break because they would no longer share a database connection with it.

**Required fix pattern:**
- Modules must only export **services**, never repositories.
- When module A needs data from module B, it calls `ModuleBService.someMethod()`.
- For read-heavy cross-cutting reads (e.g., search indexing products), define a read-only interface `IProductReadService` and export it from `ProductModule`.
- For write-time synchronization (e.g., Unicommerce syncing product stock), use domain events from `@packages/events` instead of direct repo access.

---

#### 🟡 Warning — Relative cross-module imports in processors

`modules/product/processors/bulk-upload.processor.ts` crosses module boundaries using relative paths:

- **Line 36:** `../../master/utils/manufacturer-stored-name.util` — should be `@modules/master/utils/...`
- **Line 39:** `../../gallery/services/gallery.service` — should be `@modules/gallery/services/...`

Path aliases (`@modules/*`) are already declared in `tsconfig.json`. This is inconsistency, not a technical blocker, but it will cause silent confusion during future service extraction.

---

#### 🟡 Warning — Fat webhook controller

`modules/payment-requests/controllers/payments-webhook.controller.ts` (L21–203) contains:
- Razorpay vs. Cashfree provider detection
- Payment state machine transition logic
- Direct `console.log` of webhook payloads

All of this belongs in a dedicated `PaymentWebhookService`. Controllers must only parse HTTP input, delegate, and return.

---

### 3.2 Database Safety

#### ✅ PASS — `synchronize: false` in all TypeORM configs

Confirmed safe in `database.config.ts:32`, `data-source.ts:22`, and `database.module.ts:21`.

#### ✅ PASS — 128 migrations present

All entity changes appear covered by migration files. DDL is not auto-generated.

---

#### 🟡 Warning — Duplicate migration timestamps (ops risk)

TypeORM executes migrations ordered by their numeric timestamp prefix. When multiple files share the same prefix, execution order is determined by filesystem sort — which is non-deterministic across operating systems and CI runners.

**Affected groups:**

| Timestamp | Files Sharing It |
|-----------|-----------------|
| `1780914000000` | 4 files |
| `1780901000000` | 3 files |
| `1780818000000`, `1780845000000`, `1780855000000` | 2 files each |

**Required fix:** Rename conflicting files to use unique timestamps (increment by 1ms per file). All future migrations must use the actual `Date.now()` value at creation time.

---

#### 🟡 Warning — `ProductVariantEntity` does not extend `BaseEntity`

`modules/product/entities/product-variant.entity.ts` (L26–29) defines its own UUID PK and `deletedAt` columns but skips `@packages/database`'s `BaseEntity`, meaning it has **no `refId`, no `createdBy`, no `updatedBy`**. This is the most commercially critical entity (variants drive SKUs, pricing, inventory) and the absence of audit columns is a data governance gap.

**Options:**
1. Extend `BaseEntity` and add a migration to add the missing columns.
2. Document explicitly why this entity is exempt (e.g., it is always accessed through its parent `ProductEntity`).

---

#### 🔵 Nit — SSL `rejectUnauthorized: false`

`database.config.ts:34`, `data-source.ts:24`, `database.module.ts:23–26` disable TLS certificate validation. This is acceptable for managed cloud Postgres (e.g., Supabase, Cloud SQL) with self-signed certs, but must have a code comment explaining the deliberate decision so future engineers don't mistake it for a configuration bug.

---

### 3.3 Security

#### ✅ PASS — Password handling

- `admin-user.entity.ts` has `select: false` on the password column.
- Repository adds `addSelect('admin_user.password')` only for authentication queries.
- bcrypt with 12 rounds confirmed.

#### ✅ PASS — JWT & session guard coverage

- Admin routes: `JwtAuthGuard + RolesGuard + PermissionsGuard` consistently applied.
- Customer routes: `SessionCookieGuard` / `VerifiedUserGuard`.
- Public catalog routes: intentionally unguarded (correct).
- Webhook routes: signature-based verification instead of JWT (correct pattern).

---

#### 🟡 Warning — GoKwik callback guard can fail-open in non-production

`modules/gokwik/guards/gokwik-callback.guard.ts` (L24–28): when `callbackAuthRequired` is `false` **and** `callbackSecret` is empty, the guard passes **all requests without any validation**.

`gokwik.config.ts` auto-enforces `callbackAuthRequired: true` when `NODE_ENV === 'production'`, but staging and preview environments that have the GoKwik callback URLs enabled would be fully open.

**Required fix:** Add `GOKWIK_CALLBACK_SECRET` as a **required** Joi field in `env.validation.ts` when `NODE_ENV !== 'local'`. This ensures startup fails fast rather than silently accepting unauthenticated callbacks.

---

#### 🟡 Warning — Missing `ParseUUIDPipe` on UUID route params

When a UUID param is not validated at the pipe layer, an attacker can send malformed strings that cause TypeORM to emit SQL errors (information leakage) or unexpected query behaviour.

| Controller | Param | Lines |
|------------|-------|-------|
| `modules/payment-requests/controllers/admin-payment-requests.controller.ts` | `:id` | L73, L94, L103, L113, L126, L138 |
| `modules/product/controllers/product-variants.controller.ts` | `variantId` | L35 |

---

#### 🔵 Nit — Hardcoded seed password

`apps/api/database/seeds/seed.runner.ts:11–12` contains a hardcoded seed password. While this is a seed script (not a live API route), the password should be read from an environment variable so it can be rotated without a code change.

---

### 3.4 TypeScript Rigor

#### 🟡 Warning — Widespread `any` usage without justifying comments

High-density areas:

| File | Approximate Lines |
|------|------------------|
| `modules/product/services/bulk-upload-validator.service.ts` | 208–237, 441 |
| `modules/product/processors/bulk-upload.processor.ts` | 457, 464, 546 |
| `modules/product/services/bulk-upload-parser.service.ts` | 268–276 |
| `modules/product/services/bulk-upload.service.ts` | 125 |
| `modules/payment-requests/services/payment-requests.service.ts` | 843 |
| `modules/payment-requests/controllers/payments-webhook.controller.ts` | 25, 58, 66–68 |
| `apps/api/main.ts` | 52, 69, 73, 80 (Fastify platform cast) |
| `modules/gallery/services/gallery.service.ts` | 22 |

**Acceptable exceptions:** `apps/api/main.ts` Fastify platform casts (`app as any`) are a known NestJS/Fastify interop pattern and can be suppressed with an inline `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comment explaining the reason.

---

#### 🟡 Warning — Missing return types on public HTTP handlers

Virtually all controller handler methods lack explicit return type annotations. TypeScript infers `Promise<any>` in these cases, which defeats type checking on the response shape. This is particularly risky for the raw-entity-return Blocker below.

**Affected broadly:** `admin-orders.controller.ts`, `admin-payment-requests.controller.ts`, `products.controller.ts`, `homepage.controller.ts`, and most others.

---

#### 🔵 Nit — Non-null assertions `!` without explanatory comments

Heavy use in:
- `payment-requests.service.ts` (L87, 179, 279, 288, 343–355, 532, 1239)
- `bulk-upload.processor.ts` (L819, 832, 1054, 1058)
- `home-sections.service.ts` (L152, 161, 223, 279, 303)
- Various master module services

Each `!` assertion bypasses TypeScript's null safety. Where the assertion is genuinely safe, a short comment (`// guarded by the findOrThrow above`) makes reviewer intent clear and prevents future regressions.

---

### 3.5 Input Validation & DTOs

#### ✅ PASS — Global `ValidationPipe` applied

Applied via `APP_PIPE` in `app.module.ts` with `PathAwareLoggingValidationPipe`.

#### ✅ PASS — `class-validator` decorators present on most DTOs

---

#### 🔵 Nit — `RefIdPipe` not applied consistently

`modules/admin-users/controllers/admin-customers.controller.ts` (L63, L71) uses bare `@Param('refId')` without `RefIdPipe`. All peer admin controllers use the pipe for consistent ref-ID format enforcement.

---

### 3.6 Error Handling

#### ✅ PASS — Typed NestJS exceptions throughout services

`NotFoundException`, `BadRequestException`, `ConflictException`, etc. are used correctly. `AllExceptionsFilter` provides global fallback.

---

#### 🟡 Warning — Manual `deletedAt` assignment instead of `repo.softDelete()`

`modules/payment-requests/services/payment-requests.service.ts` (L800–805) manually sets `entity.deletedAt = new Date()` and saves. The correct pattern is `repository.softDelete(id)`, which triggers TypeORM subscribers and listeners. Manual assignment silently bypasses any hooks (e.g., audit logging on delete).

---

### 3.7 Logging

#### 🟡 Warning — `console.log` / `console.error` in source files

`nestjs-pino` is configured as the project logger. All `console.*` calls in application source must be replaced with injected `Logger` from `nestjs-pino`. This ensures logs are structured JSON (not plain strings), include request correlation IDs, and are routed correctly in production.

| File | Lines with `console.*` |
|------|------------------------|
| `modules/product/controllers/bulk-upload.controller.ts` | 25, 93, 107, 127 |
| `modules/product/services/bulk-upload.service.ts` | 70, 90, 100, 127, 149, 162, 168, 177, 209, 226, 232, 247 |
| `modules/product/services/bulk-upload-validator.service.ts` | 328, 566 |
| `modules/product/processors/bulk-upload.processor.ts` | 574, 620, 658 |
| `modules/payment-requests/services/payment-requests.service.ts` | 1055, 1062, 1088, 1095, 1103, 1109 |
| `modules/payment-requests/controllers/payments-webhook.controller.ts` | 72, 90, 95, 98 |
| `modules/auth/controllers/auth.controller.ts` | 145, 147 |
| `modules/master/services/home-sections.service.ts` | 108 |

Note: `apps/api/main.ts:120` uses `console.error` inside a bootstrap catch — acceptable as a last-resort fallback since the Pino logger may not be initialized yet.

---

### 3.8 Testing

#### 🔵 Nit — No unit test files found in `modules/`

The project's `tests.instructions.md` requires at least one unit test file per service. No `*.spec.ts` files were observed during the audit in any of the 22 modules. The `jest` configuration exists in `package.json` and path aliases are mapped, so the test infrastructure is ready — tests just need to be written.

Priority candidates for initial test coverage:
1. `orders.service.ts` — complex state machine (place → confirm → cancel)
2. `payment-requests.service.ts` — financial logic, multi-step writes
3. `products.service.ts` — largest service, most business rules

---

## Part 2 — Architecture Assessment

### Current Structure

```
cureka-backend/
├── apps/api/          → Single NestJS entry point (Fastify)
├── modules/           → 22 domain feature modules
├── packages/          → 8 shared infrastructure packages
└── (one PostgreSQL DB, one Redis, one Node.js process)
```

### What Is Working Well

| Strength | Evidence |
|----------|---------|
| Thin controllers | Controllers across all 22 modules delegate to services; no direct DB calls in controllers |
| Repository pattern | Repositories abstract all TypeORM queries; services do not call `EntityManager` directly |
| Path aliases | `@modules/*` and `@packages/*` are consistently used (with the two exceptions noted) |
| Shared infra packages | `cache`, `queue`, `database`, `logger`, `storage`, `events`, `auth`, `common` are pre-extracted |
| Domain events | `@packages/events` exists and emits `ProductUpdatedEvent`, `BrandUpdatedEvent`, `CategoryUpdatedEvent` |
| Async workers | BullMQ queues decouple bulk-upload and Unicommerce processing from the request cycle |
| Migration discipline | 128 migrations, no `synchronize: true`, complete schema history |
| Soft deletes | Used consistently across all domain entities (products, orders, users, categories, blog, support) |

---

### The Core Problem — Repository Coupling

The module dependency graph as it exists today:

```
ProductModule  ←── MasterModule  ←── GalleryModule
     ↑                  ↑
SearchModule       GokwikModule
     ↑
UnicommerceModule
     ↑
OrdersModule ←──→ ShippingModule
     ↑
PaymentRequestsModule ←── UsersModule
     ↑
ReviewsModule ←── UsersModule
```

All arrows represent **direct repository injection** (not service calls). Every one of these arrows is a future microservice extraction blocker. If any module becomes a standalone service, all modules pointing to it break at the infrastructure level.

---

### Are 22 Modules Too Many?

The number is not the problem. **Coupling density is.**

The `master` module is the worst offender — it has 28 entities spanning two completely different domains:

| Domain | Entities in `master` |
|--------|----------------------|
| Product taxonomy | `brand`, `category`, `attribute`, `health-concern`, `wellness-goal`, `age-group`, `unit`, `manufacturer`, `importer`, `packer`, `product-nature`, `subscription-frequency` |
| CMS / merchandising | `banner`, `home-section`, `testimonial`, `watch-and-shop-item`, `expert-talk-item`, `coupon`, `coupon-*-mapping`, `reason-master`, `country`, `state`, `city` |

These two groups have no legitimate shared queries and should be separate modules.

The `checkout` module exists under `modules/` but is not imported in `AppModule`, making it orphaned code. Its responsibilities appear to have been absorbed into `orders` and `payment-requests`.

---

### Proposed Future Service Boundaries

| Future Microservice | Current Modules | Notes |
|--------------------|-----------------|-------|
| **Catalog Service** | `product`, `master` (taxonomy), `search`, `gallery`, `uploads` | Tightly coupled by design; extract as one unit |
| **Order Service** | `orders`, `cart`, `checkout`, `payment-requests` | End-to-end purchase flow |
| **User Service** | `users`, `auth`, `roles`, `admin-users`, `wishlist`, `reviews` | Identity + user activity |
| **CMS Service** | `blog`, `master` (CMS entities), `admin-settings` | Content management |
| **Fulfillment Service** | `shipping`, `unicommerce`, `gokwik` | Third-party integration adapters |
| **Support Service** | `support` | Independent; no cross-module dependencies |
| **Audit Service** | `audit` | Best kept as a shared library or thin event-consumer sidecar |

---

### Recommended Roadmap

#### Phase 1 — Harden the Monolith (now, before any extraction)

These changes do not split the monolith — they prepare it so future extraction is possible.

1. **Remove all repository exports from `.module.ts` files.** Modules must only export services.
2. **Replace cross-module repository injection with service calls.** Each module adds query methods to its service that other modules call. Example: `ProductsService.findPublishedByIds(ids)` used by search, instead of search injecting `ProductsRepository` directly.
3. **Expand `@packages/events` domain event usage.** When product stock changes, emit `ProductStockChangedEvent`. Unicommerce and Search subscribe to it and update independently — no shared repo needed.
4. **Split `MasterModule`** into `TaxonomyModule` and `CmsModule`. This is the single refactor with the highest leverage.
5. **Remove or absorb `checkout` module.** Either import it in `AppModule` or move its logic where it belongs.

#### Phase 2 — Strangler-Fig Extraction (when traffic justifies it)

- **First candidate:** `SearchModule` — it is already mostly event-driven and stateless.
- Introduce `@nestjs/microservices` transport (TCP or gRPC) for the extracted service.
- Consumer modules switch from direct service injection to an HTTP/gRPC client behind the same interface — call sites do not change.

#### Phase 3 — Full Microservices

- Each service owns its own database schema (split migrations per service).
- `@packages/*` shared packages become published npm packages in a separate monorepo.
- Replace in-process `@packages/events` (EventEmitter2) with a message broker (Kafka or RabbitMQ).

---

## Consolidated Findings Table

| # | Severity | Category | Finding | File(s) |
|---|----------|----------|---------|---------|
| 1 | 🔴 Blocker | Architecture | Cross-module direct repository injection | 11 modules affected |
| 2 | 🔴 Blocker | Security | Raw `PaymentRequestEntity` returned from service/controller public methods | `payment-requests.service.ts`, `admin-payment-requests.controller.ts` |
| 3 | 🟡 Warning | Architecture | Fat webhook controller with business logic | `payments-webhook.controller.ts` |
| 4 | 🟡 Warning | Architecture | Relative cross-module imports in processor | `bulk-upload.processor.ts:36,39` |
| 5 | 🟡 Warning | Database | Duplicate migration timestamps | 4–5 timestamp groups in `migrations/` |
| 6 | 🟡 Warning | Database | `ProductVariantEntity` skips `BaseEntity` (no `refId`, `createdBy`, `updatedBy`) | `product-variant.entity.ts` |
| 7 | 🟡 Warning | Database | SSL `rejectUnauthorized: false` undocumented | `database.config.ts`, `data-source.ts` |
| 8 | 🟡 Warning | Security | GoKwik callback guard can fail-open in non-production | `gokwik-callback.guard.ts` |
| 9 | 🟡 Warning | Security | Missing `ParseUUIDPipe` on UUID params | `admin-payment-requests.controller.ts`, `product-variants.controller.ts` |
| 10 | 🟡 Warning | TypeScript | Widespread `any` usage without justifying comments | `bulk-upload.*`, `payment-requests.*`, `gallery.service.ts` |
| 11 | 🟡 Warning | TypeScript | Missing return types on public HTTP handler methods | All controllers |
| 12 | 🟡 Warning | Error Handling | Manual `deletedAt` assignment bypasses TypeORM soft-delete hooks | `payment-requests.service.ts:800–805` |
| 13 | 🟡 Warning | Logging | `console.log`/`console.error` in 8 source files | See table in §3.7 |
| 14 | 🟡 Warning | Architecture | `master` module overloaded with two distinct domains (taxonomy + CMS) | `modules/master/` |
| 15 | 🟡 Warning | Architecture | `checkout` module is orphaned (not in `AppModule`) | `modules/checkout/` |
| 16 | 🔵 Nit | Security | Hardcoded seed password | `seed.runner.ts:11–12` |
| 17 | 🔵 Nit | TypeScript | Non-null assertions without explanatory comments | `payment-requests.service.ts`, `home-sections.service.ts`, `bulk-upload.processor.ts` |
| 18 | 🔵 Nit | Validation | `RefIdPipe` missing on `admin-customers.controller.ts:63,71` | `admin-customers.controller.ts` |
| 19 | 🔵 Nit | Testing | No unit test files in `modules/` | All module services |
| 20 | 🔵 Nit | Database | Entity `@Index` on `sku` is non-unique at ORM level; uniqueness is DB-only via partial index | `product-variant.entity.ts` |

---

## Recommended Fix Priority

### Immediate (before next production deploy)

1. Add `IPaymentRequestResponse` mapper to `payment-requests` module — eliminate raw entity Blocker
2. Remove all cross-module repository exports from `.module.ts` files — start with the highest-traffic modules (`product`, `orders`, `master`)
3. Add `ParseUUIDPipe` to `admin-payment-requests.controller.ts` (6 routes) and `product-variants.controller.ts`
4. Replace all `console.log` calls with injected `Logger` across the 8 affected files

### Next Sprint

5. Extract `PaymentWebhookService` from the fat webhook controller
6. Fix duplicate migration timestamps
7. Make a decision on `ProductVariantEntity` extending `BaseEntity` and either align or document
8. Add `GOKWIK_CALLBACK_SECRET` as a required env var for non-local environments
9. Fix `RefIdPipe` on `admin-customers.controller.ts`
10. Fix relative cross-module imports in `bulk-upload.processor.ts`

### Architectural Refactor (Phase 1 — before any service extraction)

11. Split `MasterModule` into `TaxonomyModule` and `CmsModule`
12. Remove or absorb `CheckoutModule`
13. Replace all remaining cross-module repository injections with service calls or domain events
14. Write unit tests for `orders.service.ts`, `payment-requests.service.ts`, `products.service.ts`

---

*Report generated by @code-review. Source files were read-only during this audit. No code was modified.*
