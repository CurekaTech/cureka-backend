# COD Blocklist — implementation summary

Admins can block **Cash on Delivery only** for a delivery pincode or a customer/mobile. Prepaid, login, cart, and addresses are unchanged. The rule runs only on **native Cureka checkout**. If GoKwik is active (`gokwikCheckoutEnabled`), the custom list is skipped.

---

## Business behaviour

- **PINCODE** entry: 6-digit Indian pincode; COD hidden/rejected for that delivery location.
- **CUSTOMER** entry: existing customer UUID and/or canonical Indian mobile (including guests with no account).
- Inactive or soft-deleted rows do not block.
- Duplicate **active** pincode or customer/mobile is rejected (`409`).
- Customer-facing copy never includes the admin `reason`.
- Precedence when native checkout is used: GoKwik bypass → existing COD min/max → customer block → pincode block → allow.

---

## GoKwik bypass

Uses existing `CheckoutResolverService.isGokwikCheckoutEnabled()` (admin setting `gokwikCheckoutEnabled`, status active **and** truthy value). No second flag. Frontend `isGoKwikActive` is ignored. GoKwik cart (`gokwik-cart.service`) still uses `resolveCodEligibility` only (min/max), not this overlay.

---

## Database

| Migration | File | Purpose |
|---|---|---|
| `CreateCodBlocklistEntries1785980200000` | `apps/api/database/migrations/1785980200000-create-cod-blocklist-entries.ts` | Table `cod_blocklist_entries`, CHECKs, indexes, soft delete |
| `AddCodBlocklistPermissions1785980300000` | `apps/api/database/migrations/1785980300000-add-cod-blocklist-permissions.ts` | Permissions `PER00000342`–`PER00000345`; granted to `super_admin` and `admin` |

Entity: `CodBlocklistEntryEntity` (`modules/cod-blocklist/entities/cod-blocklist-entry.entity.ts`). Extends `BaseEntity` (`id`, `refId`, `createdBy`, `updatedBy`, `createdAt`, `updatedAt`, `deletedAt`). TypeORM `synchronize` is not used.

Unique **active** indexes: pincode, customer id, mobile. Type CHECKs: PINCODE has pincode and no customer fields; CUSTOMER has no pincode and customerId and/or mobile.

---

## Admin APIs (`/api/v1/admin/cod-blocklist`)

| Method | Path | Permission |
|---|---|---|
| `GET` | `/` | `cod_blocklist.read` |
| `GET` | `/customers/search` | `cod_blocklist.read` |
| `GET` | `/:id` | `cod_blocklist.read` |
| `POST` | `/` | `cod_blocklist.create` |
| `PATCH` | `/:id` | `cod_blocklist.update` |
| `DELETE` | `/:id` | `cod_blocklist.delete` (soft delete, `204`) |

JWT + `super_admin` \| `admin` \| `moderator` + permission guard. Customer search is declared **before** `/:id`.

---

## RBAC / sidebar

| Code | Ref | Name |
|---|---|---|
| `cod_blocklist.read` | `PER00000342` | View COD Blocklist |
| `cod_blocklist.create` | `PER00000343` | Create COD Blocklist |
| `cod_blocklist.update` | `PER00000344` | Update COD Blocklist |
| `cod_blocklist.delete` | `PER00000345` | Delete COD Blocklist |

Sidebar: Order Management → **COD Blocklist** (`orders-cod-blocklist`, `/cod-blocklist`, icon `Ban`). Grouped under Orders in role permission UI.

---

## Native checkout integration

Reusable method: `CodBlocklistService.evaluateCodBlock` → `{ blocked, reasonCode, message, matchedBy, matchedEntryId? }`.

Storefront overlay: `overlayNativeCodEligibility` on cart/checkout `cod` (`available`, `message`, `reasonCode`). `matchedEntryId` is not sent to customers.

Enforcement: `assertNativeCodAllowed` → HTTP `400` with `COD_BLOCKED_FOR_PINCODE` or `COD_BLOCKED_FOR_CUSTOMER`.

Wired in:

- `CartPricingService.calculateCartPricing` (native cart totals)
- `CartService.buildEmptyCartResponse` (customer block when user id is known)
- `CheckoutService.validateCheckout` (address pincode + phone; overlay + COD assert)
- `CheckoutService.assertCodPaymentEligible` (min/max first, then blocklist)
- `OrdersService.placeOrder` (re-assert with session user + address — race-safe vs a block added after page load)
- `OrdersService.createDraftOrderFromCart` (same assert if payment method is COD)

Not wired into GoKwik get-cart. Admin payment-request COD wizard is **not** gated (ops override).

---

## Mobile normalization

`canonicalizeIndianMobileNumber` / `parseCanonicalIndianMobileNumber`: `9876543210`, `+919876543210`, `919876543210`, leading `0`. Stored as 10-digit Indian mobile. Customer ID lookups also load the user’s stored mobile so mobile-only rows still match logged-in users.

---

## Error codes

Admin: `COD_BLOCKLIST_INVALID_PINCODE`, `COD_BLOCKLIST_INVALID_CUSTOMER`, `COD_BLOCKLIST_INVALID_MOBILE`, `COD_BLOCKLIST_TYPE_IMMUTABLE`, `COD_BLOCKLIST_SEARCH_TOO_SHORT`, `COD_BLOCKLIST_NOT_FOUND`, `COD_BLOCKLIST_DUPLICATE_PINCODE`, `COD_BLOCKLIST_DUPLICATE_CUSTOMER`.

Storefront: `COD_BLOCKED_FOR_PINCODE`, `COD_BLOCKED_FOR_CUSTOMER`. Existing `COD_MINIMUM_ORDER_NOT_MET` / `COD_MAXIMUM_ORDER_EXCEEDED` preserved.

---

## Caching

No Redis cache for this list. Eligibility is an indexed DB lookup on each cart/checkout/place-order. Correctness over cache.

---

## Files created

- `modules/cod-blocklist/**` (module, entity, DTOs, repository, service, mapper, admin controller, enums, utils)
- `apps/api/database/migrations/1785980200000-create-cod-blocklist-entries.ts`
- `apps/api/database/migrations/1785980300000-add-cod-blocklist-permissions.ts`
- Tests under `modules/cod-blocklist/**/*.spec.ts` and `modules/orders/services/checkout.service.cod-blocklist.spec.ts`
- `docs/COD_BLOCKLIST_ADMIN_PANEL.md`
- `docs/COD_BLOCKLIST_NATIVE_CHECKOUT.md`
- `docs/COD_BLOCKLIST_IMPLEMENTATION_SUMMARY.md`

## Files modified

- `apps/api/app.module.ts` — import `CodBlocklistModule`
- `modules/orders/orders.module.ts` — import `CodBlocklistModule`
- `modules/orders/services/cart-pricing.service.ts` — overlay eligibility
- `modules/orders/services/cart.service.ts` — empty-cart overlay
- `modules/orders/services/checkout.service.ts` — address context + assert
- `modules/orders/services/orders.service.ts` — place-order / draft COD assert
- `modules/orders/interfaces/cart-pricing.interface.ts` — `cod.reasonCode`
- `modules/orders/services/cart-checkout-admin-settings.service.ts` — optional `reasonCode` on `CodEligibility`
- `modules/roles/constants/admin-permissions.constants.ts`
- `modules/roles/services/permissions.service.ts`
- `modules/auth/services/admin-auth.service.ts` — sidebar item

---

## Tests added

- Admin RBAC metadata on controller methods
- CRUD: pincode, customer id, direct mobile, invalid pincode/customer, duplicates, list/filters/search, update, type immutable, delete, 404
- Eligibility: pincode, customer, guest mobile, no match, min-order preserved, overlay, GoKwik bypass, place-order-style assert, min-order still first in `CheckoutService.assertCodPaymentEligible`

---

## Commands / results

| Command | Result |
|---|---|
| `npx jest modules/cod-blocklist modules/orders/services/checkout.service.cod-blocklist.spec.ts modules/orders/services/cart-checkout-admin-settings.service.spec.ts --no-coverage` | **47 passed** (7 suites) |
| `npx tsc --noEmit -p apps/api/tsconfig.app.json` | Pass |
| `npx nest build` | Pass |
| `git diff --check` | Pass |
| Repo `npm run lint` | Not used; ESLint glob does not include `modules/` |
| Live DB `migration:run` | Not executed in this environment. Source `up`/`down` pairs are complete for both COD migrations |

### Deploy

```bash
npm run migration:run
```

### Rollback (newest first)

```bash
npm run migration:revert   # permissions PER00000342–PER00000345
npm run migration:revert   # drop cod_blocklist_entries
```

Revert only these two if they are the latest applied migrations. If later migrations exist, revert those first.

---

## Assumptions

- Native storefront COD is `POST /api/v1/orders` with `paymentMethod: COD`, not payment-requests checkout.
- Guests are still `users` rows (`role=customer`); mobile-only blocks cover numbers with no user.
- Admin COD payment-request wizard remains available for ops and does not use this list.
- Type cannot be changed after create.
- Soft delete matches the rest of the app.

## Remaining Admin Panel / frontend work

- Admin Panel: list/create/edit UI from `docs/COD_BLOCKLIST_ADMIN_PANEL.md` (sidebar already returned by login/me).
- Storefront: hide COD from `cod.available` / `cod.reasonCode` per `docs/COD_BLOCKLIST_NATIVE_CHECKOUT.md`. Recheck checkout after address change.

## Risks / follow-up

- `GET /cart` without an address cannot apply a **pincode** block; customer blocks still apply. Frontend must call checkout with `addressId` after address selection.
- A block added after checkout load is enforced at `POST /orders`.
- If product later needs admin-wizard COD to respect the list, call `assertNativeCodAllowed` from that path too.
