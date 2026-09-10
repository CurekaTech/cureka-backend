# Return Management — Backend Guide

Item-level return management for the Cureka backend. This document describes what
was built, how it works, and where the boundaries are.

The single most important rule in this module:

> **A customer submitting a return request never receives a refund automatically.**

A refund is only ever created by an admin, after approval, and (when the policy
requires it) after the goods have been picked up, received and QC-cleared. The
state machine physically prevents `REQUESTED → REFUND_*`.

---

## 1. Where it lives

```
modules/returns/
├── constants/          error codes, SLA thresholds, permission codes
├── controllers/        customer, admin, admin-policy
├── dto/                request validation
├── entities/           6 tables
├── enums/              status, resolution, history action, pickup, QC, evidence
├── interfaces/         eligibility, request views, pickup provider port
├── listeners/          notification + refund-completion listener
├── mappers/            entity → API view (customer view is separately filtered)
├── repositories/       data access, including the quantity ledger
├── services/           eligibility, amount, returns, workflow, policy, pickup, evidence
│   └── pickup-providers/  shipway + unicommerce (live when configured), manual fallback
└── utils/              state machine, window maths, money allocation
```

Supporting changes outside the module are listed in §11.

---

## 2. Return policy and the policy snapshot

Policy is resolved with a three-level fallback: **variant → product → conservative
default**.

`products` carries the defaults (`NOT NULL`, so every product has an answer);
`product_variants` carries nullable overrides where `NULL` means "inherit the
product".

| Field | Meaning |
| --- | --- |
| `return_allowed` / `replace_allowed` | pre-existing; whether the SKU can be returned/replaced |
| `return_window_days` / `replace_window_days` | pre-existing; window length |
| `return_window_unit` / `replace_window_unit` | new; `DAYS` or `HOURS` for short-window goods |
| `refund_allowed` | new; a SKU can be returnable-for-replacement but not refundable |
| `return_pickup_required` | new; reverse pickup needed |
| `return_qc_required` | new; warehouse QC needed before resolution |
| `return_evidence_required` | new; photos/video mandatory at submission |
| `no_pickup_refund_allowed` | new; low-value goods can be resolved without collecting them |

### The snapshot

Policy at the time of purchase is what governs the return, not today's catalogue.
`order_items.return_policy_snapshot` (jsonb) is written for every new order in
`OrderItemsRepository.createMany`, which is the single insertion point for all
order paths (standard checkout, GoKwik, admin-created).

**Legacy orders** placed before this column existed have `NULL`. They are not
silently made returnable: `ReturnEligibilityService.resolveSnapshots` loads the
live variant and product and builds a *conservative* fallback via
`buildLegacyFallbackSnapshot`. If the catalogue row is gone, the item is not
returnable.

---

## 3. Eligibility

`ReturnEligibilityService.evaluateOrder` is the only place that answers "can this
be returned". Both the customer-facing eligibility endpoint and the creation path
call it, so the storefront can never be shown one answer and validated against
another.

Checks run in a fixed order, and the first failure wins:

1. `ORDER_IS_RTO` — return-to-origin orders are handled by the RTO process.
2. `ITEM_NOT_DELIVERED` — the order must be `DELIVERED`.
3. `DELIVERY_DATE_UNAVAILABLE` — no delivery timestamp means no window can be computed.
4. `RETURN_NOT_ALLOWED` — policy forbids both return and replacement.
5. `ACTIVE_RETURN_ALREADY_EXISTS` / `RETURN_QUANTITY_EXCEEDED` — nothing left to return.
6. `RETURN_WINDOW_EXPIRED` — the window has closed.

### The expired-product exception

When the customer picks the reason with code `EXPIRED_PRODUCT`, the window check
is waived — and only the window check. A non-returnable product stays
non-returnable, and the quantity ledger still applies. This is asserted directly
in `return-eligibility.service.spec.ts`.

### The quantity ledger

Returns are item-level *and* quantity-level. A customer who bought 3 units may
return 1, then later return another 1.

`ReturnRequestsRepository.sumCommittedQuantityByOrderItem` sums quantity across
every return whose status is in `QUANTITY_BLOCKING_STATUSES` — that is, every
status except `REJECTED` and `CANCELLED_BY_CUSTOMER`. A rejected or withdrawn
return releases its units back; anything else holds them.

`availableQuantity = orderedQuantity − committedQuantity`.

---

## 4. Concurrency

Two customers (or a customer and an admin) submitting simultaneously for the same
order cannot over-return:

```
BEGIN
  SELECT … FROM orders WHERE id = :orderId FOR UPDATE   -- serialises per order
  re-read the committed-quantity ledger
  re-validate every requested quantity  → 409 ACTIVE_RETURN_ALREADY_EXISTS
  INSERT return_requests / return_request_items / return_evidences / history
COMMIT
```

The pre-transaction eligibility check is for a good error message; the in-transaction
re-check is the one that is authoritative.

Every admin transition uses `lockById` (`pessimistic_write` on the return row)
followed by `canTransitionReturnStatus`, inside a transaction.

---

## 5. The state machine

20 states, defined once in `utils/return-status-transition.util.ts`. Nothing in
the module writes a status without going through `canTransitionReturnStatus`.

```
REQUESTED ─┬─> UNDER_REVIEW ─┬─> APPROVED ─┬─> PICKUP_SCHEDULED ─> PICKED_UP
           │                 │             │        ↕ PICKUP_ATTEMPTED
           ├─> ADDITIONAL_INFORMATION_REQUIRED      │
           ├─> REJECTED                             └─> REFUND_PENDING     (no-pickup)
           └─> CANCELLED_BY_CUSTOMER                └─> REPLACEMENT_PENDING (no-pickup)

PICKED_UP ─> IN_TRANSIT_TO_WAREHOUSE ─> RECEIVED_AT_WAREHOUSE
                                          ├─> QC_PENDING ─┬─> QC_PASSED ─┬─> REFUND_PENDING
                                          │               │              └─> REPLACEMENT_PENDING
                                          │               └─> QC_FAILED ─┬─> REJECTED
                                          │                              └─> COMPLETED
                                          ├─> REFUND_PENDING       (qc not required)
                                          └─> REPLACEMENT_PENDING  (qc not required)

REFUND_PENDING ─> REFUND_INITIATED ⇄ (retry) ─> REFUND_COMPLETED ─> COMPLETED
REPLACEMENT_PENDING ─> REPLACEMENT_CREATED ─> COMPLETED
```

Terminal: `COMPLETED`, `REJECTED`, `CANCELLED_BY_CUSTOMER`.

**Self-transitions are rejected.** That is what makes `approve` and `reject`
one-shot: a second approve on an already-`APPROVED` return fails with
`INVALID_STATUS_TRANSITION` instead of re-stamping the decision. Actions that do
not change status (comments, internal notes, assignment) append to
`return_status_history` directly and never call the state machine.

---

## 6. Refund integration

The return module does **not** implement refunds. It hands off to the existing
`RefundRequestsService`, which keeps admin approval, provider resolution,
source-of-funds rules and reconciliation exactly as they were.

`POST /admin/returns/:id/refund` → `ReturnWorkflowService.createRefund` →
`RefundRequestsService.createFromReturn`.

Guards on the way in:

- The return must be in `REFUND_PENDING`. Anything else → `INVALID_STATUS_TRANSITION`.
- If `refundRequestId` is already set → `RETURN_REFUND_ALREADY_CREATED`.

Idempotency is enforced in two places so a retried request can never double-refund:

- `refund_requests.return_request_id` has a partial unique index.
- `return_requests.refund_request_id` has a partial unique index.
- `createFromReturn` looks up by `returnRequestId` first, and recovers from a
  `23505` duplicate-key race by re-reading the existing row.

### The one change to existing refund behaviour

Cancellation refunds have always been all-or-nothing — `persistNewRequest` rejected
anything other than the full refundable amount with `REFUND_FULL_AMOUNT_REQUIRED`.
A return covers specific lines, so it must be able to request a partial amount.

The exemption is scoped strictly to refunds that carry a `returnRequestId`:

```ts
if (params.returnRequestId) {
  // Partial allowed, but never above what is actually refundable.
  if (parseMoney(requestedAmount) > parseMoney(refundable.refundableAmount)) throw …;
} else {
  // Cancellation semantics, unchanged.
  if (parseMoney(requestedAmount) !== parseMoney(refundable.refundableAmount)) throw …;
}
```

`approve()` applies the same split. Cancellation behaviour is byte-for-byte
unchanged, and this is covered by the test
*"still requires the full amount for a cancellation refund"*.

`createFromOrderCancellation` now dedupes via `findActiveCancellationByOrderId`
(which filters `return_request_id IS NULL`) so a return-linked refund can never be
mistaken for an existing cancellation refund.

**The cap holds in every path**: the refund can never exceed
`RefundAmountService.calculateRefundableAmount(order).refundableAmount`, which
already accounts for the captured amount, prior refunds and in-flight refunds.

### Source of funds

Refund routing (`RefundProviderResolver`) is untouched for prepaid money. Online
payments return to the original gateway. **COD has no gateway transaction to
reverse**, so a successful COD return uses a dedicated payout:

1. Customer selects `BANK_ACCOUNT` (default) or `WALLET` when the order has a
   COD-paid portion and the resolution is `REFUND`.
2. Bank account numbers are AES-256-GCM encrypted at rest
   (`BANK_ACCOUNT_ENCRYPTION_KEY`). APIs return only `XXXXXX4321`.
3. After QC (or no-pickup approval) the existing refund request is created.
   Finance still approves it.
4. `POST /admin/refund-requests/:id/initiate` does **not** complete a COD refund.
   Bank transfers stay unpaid until Finance records a UTR.
   Wallet credits happen on initiate and are idempotent on the payout id.
5. Mixed GoKwik partial-COD splits prepaid (GoKwik) and cash-on-delivery
   (bank/wallet). The refund is `PROCESSED` only when every component completes.

There is still no automated bank-payout provider. Razorpay/Cashfree/GoKwik are
collection integrations, not payout integrations. Manual net-banking plus UTR is
the implemented path (`ManualCodPayoutProvider`).

---

## 7. Refund amount calculation

`ReturnAmountService.calculate` produces an immutable breakdown stored on
`return_requests.amount_breakdown` and per-line on
`return_request_items.refundable_amount`.

Order items carry only `unit_price` and `total_price`; discounts are order-level.
`allocateReturnAmounts` therefore prorates them:

```
returnedValue     = lineTotal × (returnQuantity / orderedQuantity)
discountShare     = (returnedValue / orderSubtotal) × order.discountAmount
prepaidShare      = (returnedValue / orderSubtotal) × order.prepaidDiscount
netAmount         = max(0, returnedValue − discountShare − prepaidShare)
```

Two safeguards:

- `capToPool` trims rounding drift from the largest share, so allocated parts can
  never sum above the pool they came from.
- `couponAllocation` is reported as `0` on purpose — `order.discountAmount`
  already contains the coupon value in this schema, so counting it separately
  would deduct it twice.

**Charges** (shipping, COD fee, handling) are refunded only when the whole order
is being returned *and* the corresponding flag in `apps/api/config/returns.config.ts`
is enabled. All three default to `false`.

The final figure is capped at the order's refundable amount, and
`cappedByCapturedAmount` is set on the breakdown when the cap bites.

**Partial acceptance** re-derives the amount at QC time:

```ts
lineRefundable × (acceptedQuantity / requestedQuantity)
```

so a return where 1 of 2 units fails QC refunds half.

---

## 8. Pickup

There is a provider-independent port (`IReturnPickupProviderAdapter`). On
approval, when pickup is required, Cureka notifies **both** logistics systems
independently — the same split used for forward fulfilment:

1. **Unicommerce** — official `POST /services/rest/v1/oms/reversePickup/create`
   so Uniware expects the item (`actionCode: WAC`). Item codes come from
   `POST /services/rest/v1/oms/saleorder/get`, with a fallback to the
   `{orderNumber}-{n}` codes Cureka used on `saleOrder/create`.
2. **Shipway** — documented `POST /api/v2orders` using the **return number** as
   `order_id` so the reverse booking does not collide with the forward shipment.
   The customer's pickup address is the shipping address; `warehouse_id` is
   `SHIPWAY_RETURN_WAREHOUSE_ID` or `SHIPWAY_WAREHOUSE_ID`.
3. **MANUAL** — admin records an AWB booked outside Cureka.

| Adapter | When it runs | Behaviour |
| --- | --- | --- |
| `UNICOMMERCE` | Uniware order push is enabled and credentials are set | Creates a reverse pickup in Uniware |
| `SHIPWAY` | `SHIPWAY_EMAIL` + `SHIPWAY_LICENSE_KEY` are set | Books a reverse order in Shipway |
| `MANUAL` | Explicit `provider: MANUAL`, or neither integration is configured | Stores the AWB the admin typed |

Approval auto-schedules pickup (`RETURN_AUTO_SCHEDULE_ON_APPROVE`, default
`true`). If both providers fail, the return **stays `APPROVED`** so the admin
can retry `POST /admin/returns/:id/pickup`. If one provider fails, the other
still commits and `failureReason` records the partial error.

Inbound Shipway reverse statuses (`RSCH`, `ROOP`, `RPKP`, `RINT`, `RDEL`, …)
are applied when a webhook `order_id` matches `return_pickups.provider_pickup_id`
(the return number) or the reverse AWB. Replay is blocked by `last_event_key`.

`RETURN_NOTIFY_UNICOMMERCE` / `RETURN_NOTIFY_SHIPWAY` (default `true`) can
disable one side without disabling the other. `SHIPWAY_REVERSE_FLAG=true` adds
`return: "1"` to the Shipway body for accounts that require it; it is off by
default because some Shipway tenants reject unknown fields. Optional
`SHIPWAY_REVERSE_CARRIER_ID` selects a reverse courier.

---

## 9. QC, warehouse and inventory

`POST /admin/returns/:id/receive` records warehouse receipt. `POST /admin/returns/:id/qc`
records a per-item verdict:

- `PASS` — all units accepted
- `FAIL` — all units rejected
- `PARTIAL` — split, with `accepted_quantity + rejected_quantity = received_quantity`
  enforced by a DB `CHECK` constraint

Partial acceptance reduces the refundable amount as described in §7.

**Inventory is not restocked when the customer submits.** Stock only moves after
QC accepts units, and even then only if `RETURNS_RESTOCK_ON_QC_PASS` is enabled.
It defaults to **`false`** because Unicommerce is the system of record for
warehouse stock — restocking in both places would double-count. Turn it on only
if Cureka becomes the authority for return stock.

---

## 10. Replacements

The replacement path is deliberately a **boundary, not an implementation**.
`REPLACEMENT_PENDING → REPLACEMENT_CREATED` is driven by
`POST /admin/returns/:id/replacement`, which links an *existing* order id into
`return_requests.replacement_order_id` (partial-unique, so one replacement per
return). `RETURNS_REPLACEMENT_AUTO_CREATE` is `false`.

Automatic replacement-order creation would need pricing, inventory reservation
and payment decisions that are out of scope here. `REPLACEMENT_PENDING →
REFUND_PENDING` exists so an unavailable replacement can be converted to a refund.

---

## 11. Files changed outside `modules/returns`

| File | Change |
| --- | --- |
| `apps/api/app.module.ts` | registers `ReturnsModule` and `returnsConfig` |
| `apps/api/config/returns.config.ts` | **new** — charges, pickup, replacement, inventory switches |
| `apps/api/config/index.ts` | exports `returnsConfig` |
| `modules/product/entities/product.entity.ts` | 7 policy columns |
| `modules/product/entities/product-variant.entity.ts` | 7 nullable override columns |
| `modules/product/enums/policy-window-unit.enum.ts` | **new** |
| `modules/orders/entities/order-item.entity.ts` | `return_policy_snapshot` |
| `modules/orders/interfaces/order-item-return-policy.interface.ts` | **new** |
| `modules/orders/utils/return-policy-snapshot.util.ts` | **new** — snapshot build + legacy fallback |
| `modules/orders/repositories/order-items.repository.ts` | captures the snapshot on insert |
| `modules/master/entities/reason-master.entity.ts` + dto/mapper/interface/service/repository | evidence-count fields, `internal_description`, `is_customer_visible` |
| `modules/master/constants/audit-entity-type.constant.ts` | `RETURN_REQUEST`, `RETURN_POLICY` |
| `modules/refund-requests/entities/refund-request.entity.ts` | `return_request_id` |
| `modules/refund-requests/enums/refund-reason.enum.ts` | `PRODUCT_RETURN` |
| `modules/refund-requests/repositories/refund-requests.repository.ts` | `findActiveCancellationByOrderId`, `findByReturnRequestId` |
| `modules/refund-requests/services/refund-request.service.ts` | `createFromReturn`, scoped partial-amount rule |
| `modules/refund-requests/refund-requests.module.ts` | exports `RefundAmountService` |
| `modules/roles/constants/admin-permissions.constants.ts` | 8 return permission seeds |
| `modules/unicommerce/services/unicommerce-order-api.service.ts` | `getSaleOrder`, `createReversePickup` |
| `modules/unicommerce/services/unicommerce-order.service.ts` | reverse-pickup orchestration + item-code selection |
| `modules/shipping/services/shipway.service.ts` | `isConfigured()`; reverse bookings reuse `pushOrder` |
| `modules/shipping/services/shipping.service.ts` | emits `SHIPWAY_WEBHOOK_RECEIVED` for unmatched reverse order ids |
| `modules/auth/services/admin-auth.service.ts` | sidebar: Return Requests (incl. Create Return), Product Return Policies |
| `modules/uploads/enums/upload-folder.enum.ts` | `RETURN_EVIDENCE` |
| `packages/events/src/events.constants.ts` | 12 return events |

### Migrations

| Timestamp | File | Purpose |
| --- | --- | --- |
| `1785980700000` | `add-return-policy-fields.ts` | `policy_window_unit_enum`; policy columns on `products` / `product_variants`; `order_items.return_policy_snapshot`; reason-master fields |
| `1785980800000` | `create-return-requests.ts` | 9 enums and the 6 return tables with indexes and check constraints |
| `1785980900000` | `link-refund-requests-to-returns.ts` | `refund_requests.return_request_id`, `PRODUCT_RETURN` enum value, both foreign keys |
| `1785981000000` | `add-return-permissions.ts` | 8 permissions (`PER00000346`–`PER00000353`) granted to `super_admin` and `admin` |
| `1785981100000` | `cod-return-refund-payout.ts` | COD bank-detail columns, `cod_refund_payouts`, refund wallet ledger, `refund_payouts.*` permissions |

All are idempotent (`IF NOT EXISTS`, `WHERE NOT EXISTS`, `ON CONFLICT DO NOTHING`)
and reversible, except that Postgres cannot remove a single enum value so
`PRODUCT_RETURN` survives a `down`.

---

## 12. Sending the return to Unicommerce and Shipway

On `POST /admin/returns/:id/approve`, if pickup is required:

1. The return moves to `APPROVED` (no money moves).
2. Cureka immediately schedules reverse logistics (`ReturnPickupService.schedule`).
3. Unicommerce receives `reversePickup/create` for the original sale-order code
   (Cureka `orderNumber`) with unit-level `saleOrderItemCode`s.
4. Shipway receives `POST /api/v2orders` with `order_id = returnNumber`.
5. The return moves to `PICKUP_SCHEDULED` when at least one provider succeeds.
6. Shipway webhooks for that return number update pickup milestones.

If credentials are missing in an environment, the return stays `APPROVED` and
ops can record the pickup with `provider: MANUAL`.

Pending third-party confirmation:

- Confirm with Shipway whether this tenant needs `return: "1"`
  (`SHIPWAY_REVERSE_FLAG`) or a dedicated reverse `carrier_id`
  (`SHIPWAY_REVERSE_CARRIER_ID`).
- Confirm Uniware reverse-pickup reasons match the warehouse reason master
  (Cureka sends the customer-facing reason title, max 500 chars).

---

## 13. Notifications

Twelve events are emitted (`packages/events/src/events.constants.ts`) and consumed
by `ReturnRequestListener`. The listener currently **logs** the customer-facing
message for each event rather than sending it, because **no MSG91 DLT template is
registered for returns**. Indian transactional SMS requires a pre-approved DLT
template; sending without one is rejected by the gateway.

Register the templates and swap the log for the existing notification service call
— the listener is the only file that changes.

`EVENTS.REFUND_PROCESSED` is consumed for real: it drives
`REFUND_INITIATED → REFUND_COMPLETED → COMPLETED`, so the return closes itself
when the existing refund pipeline finishes.

---

## 14. Security and privacy

- Customer endpoints use `SessionCookieGuard` + `VerifiedUserGuard`; every read
  and write asserts `order.userId === session.sub` (`RETURN_ACCESS_DENIED`).
- Admin endpoints use `JwtAuthGuard` + `RolesGuard` + `PermissionsGuard` with the
  permission codes in §15.
- The customer view is built by `mapCustomerReturnDetail`, a *separate* mapper
  that never emits internal notes, admin identities, override justifications or
  QC rejection notes. History is filtered to `is_customer_visible = true`.
- `reason_masters.internal_description` is never returned by the customer reason
  endpoint (`ICustomerReturnReason` has no such field).
- Evidence media uses the existing `StorageUrlEnricher`, so URLs are short-lived
  GCS signed v4 URLs, not permanent public links.
- No bank details, gateway secrets or PII are logged; the return module logs only
  ids, return numbers and statuses.
- Every state change writes both `return_status_history` (timeline) and
  `AuditService.log` (audit trail) with the acting admin.

---

## 15. RBAC

| Code | refId | Used by |
| --- | --- | --- |
| `returns.read` | PER00000346 | list, detail, eligibility, sidebar |
| `returns.create` | PER00000347 | admin-initiated return |
| `returns.update` | PER00000348 | review, request info, assign, comments, internal notes |
| `returns.approve` | PER00000349 | approve, approve-no-pickup, create refund |
| `returns.reject` | PER00000350 | reject |
| `returns.status` | PER00000351 | pickup, receive, QC, replacement link, complete |
| `return_policies.read` | PER00000352 | view product policy |
| `return_policies.update` | PER00000353 | edit product/variant policy |

Approve and reject are deliberately separate codes so a reviewer role can be given
one without the other. Refund creation is behind `returns.approve` rather than
`returns.status`, so operations staff can move goods without releasing money.

Granted to `super_admin` and `admin` by migration; any other role is assigned
through the existing role-permission admin screens.

---

## 16. Testing

`npx jest --testPathPattern='modules/(returns|unicommerce|shipping|refund-requests)/'`
— returns, unicommerce reverse-pickup, shipping webhook and refund suites passing.

| Spec | Covers |
| --- | --- |
| `return-status-transition.util.spec.ts` | happy path, no request/approve → refund shortcut, terminal states, self-transition rejection |
| `return-window.util.spec.ts` | day and hour windows, missing delivery date, boundary instant |
| `return-amount-allocation.util.spec.ts` | proration, partial quantity, discount + prepaid allocation, rounding cap |
| `return-eligibility.service.spec.ts` | rejection codes, expired-product exception, quantity ledger, legacy fallback |
| `return-requests.service.spec.ts` | creates in `REQUESTED`, never refunds, ownership, quantity guard |
| `return-pickup.service.spec.ts` | dual Unicommerce+Shipway notify, partial failure, MANUAL skip, neither configured |
| `shipway-return-pickup-status.util.spec.ts` | reverse status code mapping |
| `admin-returns.controller.spec.ts` | permission metadata, sidebar gating including create + product policies |
| `unicommerce-reverse-pickup.mapper.spec.ts` | unit-code reconstruction and SKU selection |
| `unicommerce-order-api.service.spec.ts` | official reversePickup/create path |
| `unicommerce-order.service.spec.ts` | reverse pickup uses getSaleOrder item codes |
| `refund-request.service.spec.ts` | partial return refund, over-refund rejection, handoff idempotency |

There is no e2e harness in this repository (`test/jest-e2e.json` does not exist),
so coverage is unit and service level.

---

## 17. Known limitations

1. **Shipway reverse flag / reverse carrier** may need tenant confirmation. See §12.
2. **Refund wallet is a ledger, not checkout tender.** Credits are stored on
   `refund_wallet_accounts` / `refund_wallet_ledger` and are idempotent. Spending
   that balance at checkout is not wired yet.
3. **No automated bank-payout API.** Finance records UTR after an offline transfer.
   Do not treat Razorpay/Cashfree/GoKwik as payout providers.
4. **`shipment_items` rows are never created** by the current shipping flow, so
   per-item delivery timestamps are not available. The return window is computed
   from `orders.delivered_at`, which is correct for single-shipment orders and
   generous for split shipments.
5. **Replacement order creation is not automated.** See §10.
6. **Return notifications are logged, not sent.** See §13.
7. **`npm run lint` cannot run in this repository** — `eslint.config.js` requires
   the `typescript-eslint` package, which is not in `devDependencies`. This is
   pre-existing and affects every file, not just this change. Type checking
   (`nest build`) passes.
8. **Pre-existing test failures** unrelated to this work, present on a clean tree:
   `admin-settings.service.spec.ts`, `admin-auth.service.spec.ts`,
   `typesense-product.mapper.spec.ts`, `variant-slug-sync.util.spec.ts`,
   `checkout.service.spec.ts`, `gokwik-cart.mapper.spec.ts`.

---

## 18. Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `RETURN_AUTO_SCHEDULE_ON_APPROVE` | `true` | Book Unicommerce + Shipway when an admin approves a pickup-required return |
| `RETURN_NOTIFY_UNICOMMERCE` | `true` | Create Uniware reverse pickup |
| `RETURN_NOTIFY_SHIPWAY` | `true` | Book Shipway reverse order |
| `RETURN_PICKUP_PROVIDER` | `SHIPWAY` | Preferred provider for explicit schedule; `MANUAL` skips auto logistics |
| `SHIPWAY_REVERSE_CARRIER_ID` | unset | Optional reverse courier; falls back to `SHIPWAY_CARRIER_ID` |
| `SHIPWAY_REVERSE_FLAG` | `false` | When `true`, send `return: "1"` on the Shipway reverse body |
| `SHIPWAY_RETURN_WAREHOUSE_ID` | `SHIPWAY_WAREHOUSE_ID` | Drop warehouse for reverse bookings |
| `UNICOMMERCE_ORDER_PUSH_ENABLED` | — | Must be `true` plus tenant credentials for Uniware reverse pickup |
| `RETURN_SHIPPING_REFUNDABLE` / `RETURN_COD_FEE_REFUNDABLE` / `RETURN_HANDLING_REFUNDABLE` | `false` | Charge-level refund on a full-order return |
| `RETURN_RESTOCK_ON_QC_PASS` | `false` | Leave off; Unicommerce owns warehouse stock |
| `RETURN_REPLACEMENT_AUTO_CREATE_ENABLED` | `false` | Replacement order auto-create stays disabled |
| `RETURN_WALLET_REFUND_ENABLED` | `true` | Allow COD refunds to the Cureka refund wallet |
| `BANK_ACCOUNT_ENCRYPTION_KEY` | unset | 32-byte AES-256-GCM key as 64-char hex or base64. Required before collecting bank details |

---

## 19. Related documents

- `docs/RETURN_MANAGEMENT_ADMIN_PANEL_INTEGRATION.md`
- `docs/RETURN_MANAGEMENT_STOREFRONT_INTEGRATION.md`
