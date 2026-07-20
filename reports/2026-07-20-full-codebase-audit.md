## Code Review Report — Full Codebase Audit
**Date**: 2026-07-20
**Auditor**: @code-review
**Branch**: `dev-sahil` (clean working tree, up to date with `origin/dev-sahil`)
**Scope**: Full NestJS modular monolith — `modules/`, `apps/`, `packages/` (~688 module files, 76 controllers, 76 entities, ~100 services)

### Summary
| Severity | Count |
|----------|-------|
| 🔴 Blocker | 3 |
| 🟡 Warning | 14 |
| 🔵 Nit | 6 |

### Static Analysis

#### TypeScript (`npx tsc --noEmit`)
```
Exit code: 0 — no compilation errors
```

#### ESLint (`npm run lint`)
```
Error: Cannot find module 'typescript-eslint'
Require stack:
- C:\Budtech\cureka\cureka-backend\eslint.config.js
```
Lint pipeline is **non-functional** — dependency `typescript-eslint` is missing from `node_modules`.

#### Unit Tests (`npm run test`)
```
Test Suites: 3 failed, 20 passed, 23 total
Tests:       1 failed, 77 passed, 78 total

FAIL modules/auth/services/admin-auth.service.spec.ts
  AdminAuthService - Menu Filtering › getMenuForUser › should filter menu items strictly based on user permissions
  Expected keys NOT to contain "masters"; received ["dashboard","masters","products","orders","role-management","settings"]

FAIL modules/gokwik/mappers/gokwik-cart.mapper.spec.ts
  TypeError: Reflect.getMetadata is not a function (PaginationQueryDto decorators)

FAIL modules/search/mappers/typesense-product.mapper.spec.ts
  TypeError: Reflect.getMetadata is not a function (PaginationQueryDto decorators)
```

---

### Findings

**[Blocker]** `modules/users/controllers/staff-users.controller.ts` — `JwtAuthGuard` disabled on admin routes
> Lines 24–26 comment out `@UseGuards(JwtAuthGuard, RolesGuard)` with a note "Temporarily disabled so all /staff-users APIs can be checked during local bootstrap." All `/staff-users` CRUD endpoints are publicly accessible without authentication. Automatic blocker per `config.md` (missing `JwtAuthGuard` on non-public route).

**[Blocker]** `modules/users/controllers/staff-users.controller.ts` — Unauthenticated requests escalate to `SUPER_ADMIN`
> `getActingAdmin()` (lines 85–91) returns a hardcoded `SUPER_ADMIN` payload when no JWT is present. Combined with disabled guards, any anonymous caller can create, list, update, and deactivate staff users with super-admin privileges.

**[Blocker]** `apps/api/database/seeds/seed.runner.ts` — Hardcoded credential in source
> `const SEED_PASSWORD = 'Admin@1234'` (line 12) is a plaintext credential committed to source. Automatic blocker per `config.md` (hardcoded secret or credential). Password is also printed to stdout on seed run (line 42).

**[Warning]** `modules/payment-requests/controllers/payments-webhook.controller.ts` — `console.log` with webhook signature
> Cashfree webhook handler logs `signature` and `timestamp` via `console.log` (lines 72–78). Webhook signatures are sensitive verification material and must not appear in logs. Also logs full `payload` via `this.logger.log` (line 80).

**[Warning]** `modules/payment-requests/services/payment-requests.service.ts` — Debug `console.log` in payment handlers
> `handleCashfreePaymentSuccess`, `handlePaymentLinkPaid`, and `handlePaymentCaptured` use `console.log` instead of `nestjs-pino` logger (lines 1055–1109). Payment flow observability should use structured logger only.

**[Warning]** `modules/auth/controllers/auth.controller.ts` — `console.log` logs session/auth result
> `guestLogin` logs `device` and full `result` objects (lines 145–147). Result may contain session tokens or user identifiers. Remove before production.

**[Warning]** `modules/product/services/bulk-upload.service.ts` + `modules/product/processors/bulk-upload.processor.ts` — Extensive debug logging
> 15+ `[BULK_UPLOAD_DEBUG]` `console.log` statements across service and processor. Not gated behind a debug flag; violates logging policy (use `nestjs-pino`).

**[Warning]** `modules/master/services/coupons.service.ts` — Cross-module direct repository injection in service
> Service injects `@InjectRepository(CategoryEntity)`, `BrandEntity`, and `ProductEntity` from other modules (lines 35–40) instead of routing through module-owned repositories or a shared resolver. Automatic warning per `config.md`.

**[Warning]** `modules/public/services/public-products.service.ts` — Cross-module repository injection (7 repositories)
> Directly imports repositories from `@modules/product/` and `@modules/master/` (lines 18–27). Public module bypasses layer boundaries by querying foreign module repositories directly.

**[Warning]** `modules/support/services/order-support-reasons.service.ts` — `@InjectRepository(OrderEntity)` in service
> Service layer performs direct TypeORM repository access on a foreign module entity instead of delegating to `OrdersRepository`.

**[Warning]** `modules/product/services/product-faqs.service.ts` — `@InjectRepository(ProductFaqEntity)` in service
> Repository access in service layer; should use `ProductFaqsRepository`.

**[Warning]** Multiple admin controllers — Missing `ParseUUIDPipe` on UUID route parameters
> Only 6 of 76 controllers use `ParseUUIDPipe`. Examples without it: `admin-orders.controller.ts` (`:id`), `admin-payment-requests.controller.ts` (`:id` on 6 routes), `orders.controller.ts`, `user-addresses.controller.ts`. Malformed IDs reach services instead of returning 400 early.

**[Warning]** Unit test coverage critically low
> ~100 service files exist; only ~20 `.spec.ts` files found (mostly unicommerce, auth, roles, admin-settings, shipping mappers). 3 test suites currently fail. Checklist §3.8 requires at least one unit test per service.

**[Warning]** ESLint pipeline broken
> `npm run lint` fails with missing `typescript-eslint` module. CI lint gate cannot run until dependency is restored.

**[Warning]** `modules/auth/services/admin-auth.service.spec.ts` — Failing permission-filter test
> Menu filtering test expects `masters` and `products` to be excluded for a limited-permission user, but they are included. Indicates RBAC menu filtering regression or stale test expectations.

**[Warning]** `modules/gokwik/mappers/gokwik-cart.mapper.spec.ts` + `modules/search/mappers/typesense-product.mapper.spec.ts` — Missing `reflect-metadata` in Jest setup
> Both suites fail at import time with `Reflect.getMetadata is not a function` when loading `PaginationQueryDto` decorators from `@packages/common`.

**[Warning]** DTO file organization — Multiple DTO files per module
> Checklist §3.5 requires a single `<name>.dto.ts` per module. Violations include: `gokwik/` (7 DTO files), `payment-requests/` (4), `orders/` (3), `users/` (4), `product/` (8+). Increases maintenance surface.

**[Nit]** `modules/product/dto/variant.dto.ts` — Untyped `any` on `status` field (line 243)
> `status?: any` lacks justification comment. Should use `VariantStatus` enum.

**[Nit]** `modules/product/services/bulk-upload-validator.service.ts` — Widespread `any` in map callbacks (lines 203–232)
> Multiple `(n: any)`, `(b: any)` etc. without explanatory comments.

**[Nit]** `modules/product/entities/bulk-upload.entity.ts` — `errorSummary!: any[]` (line 38)
> JSONB column typed as `any[]`; prefer `Record<string, unknown>[]` or a typed interface.

**[Nit]** 18 entities do not extend `BaseEntity`
> Junction/child entities (`ProductVariantEntity`, `ShipmentItemEntity`, `CouponProductMappingEntity`, `OtpEntity`, `UserSessionEntity`, `AuditLogEntity`, etc.) use custom PK/timestamp columns. Acceptable for join tables but inconsistent with checklist §3.2.

**[Nit]** `apps/api/main.ts` — Bootstrap fatal error uses `console.error` (line 120)
> Acceptable for pre-logger bootstrap failure, but consider routing through a minimal stderr helper for consistency.

**[Nit]** `modules/public/controllers/homepage.controller.ts` — Cross-module service injection at controller level
> Injects `HomeSectionsService` from `@modules/master/` directly (line 12). Prefer a facade or event-driven cache sync to preserve module boundaries.

---

### Architecture Checklist (Phase 3)

| Category | Status | Notes |
|----------|--------|-------|
| 3.1 Layer separation | ⚠️ Partial | Widespread cross-module repository injection; some services use `@InjectRepository` directly |
| 3.2 Database safety | ✅ Pass | `synchronize: false` in all DataSource configs; no `synchronize: true` in runtime code |
| 3.3 Security | 🔴 Fail | Staff-users guard disabled; hardcoded seed password; debug logging of auth/payment data |
| 3.4 TypeScript rigor | ✅ Pass | `tsc --noEmit` clean; scattered `any` usage |
| 3.5 Input validation | ✅ Pass | Global `PathAwareLoggingValidationPipe` in `app.module.ts` |
| 3.6 Error handling | ✅ Pass | No silent `catch {}` blocks found in modules |
| 3.7 Logging | ⚠️ Partial | Many `console.log` in production paths; pino used elsewhere |
| 3.8 Testing | 🔴 Fail | 3 failing suites; ~80% of services lack unit tests |

---

### Positive Observations
- `synchronize: false` consistently enforced across `data-source.ts`, `database.module.ts`, and `database.config.ts`.
- `AdminUserEntity.password` correctly uses `select: false` and `hashPassword()` with bcrypt 12 rounds.
- Webhook controllers (Razorpay, Cashfree, Shipway, GoKwik) verify signatures before processing — appropriate alternative to JWT for webhook endpoints.
- Public storefront controllers (`public/products`, `public/homepage`, `public/search`) are intentionally unguarded.
- Global validation pipe (`PathAwareLoggingValidationPipe`) is registered via `APP_PIPE` in `app.module.ts`.

---

### Verdict
🔴 **FAIL — Blockers must be resolved before merge.**

**Required before merge:**
1. Re-enable `JwtAuthGuard` + `RolesGuard` on `StaffUsersController` and remove the `SUPER_ADMIN` fallback in `getActingAdmin()`.
2. Remove or externalize hardcoded `SEED_PASSWORD` from `seed.runner.ts` (use env var with no default in source).
3. Address the three failing test suites.

**Recommended same-sprint follow-ups:**
- Replace all production `console.log` with `nestjs-pino` logger; redact signatures/tokens from log payloads.
- Restore `typescript-eslint` dependency so lint gate is functional.
- Add `ParseUUIDPipe` to admin UUID route params.
- Refactor cross-module repository access in `public-products.service.ts` and `coupons.service.ts`.
