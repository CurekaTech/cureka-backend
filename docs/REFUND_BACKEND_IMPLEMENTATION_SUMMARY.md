# Refund backend implementation summary

Manual refund-request workflow: cancellation creates a request; payment-provider refunds run only after an authorized admin clicks **Initiate Refund**.

---

## Existing automatic-refund paths found

| Path | Previous behaviour | Change |
|---|---|---|
| Customer `OrdersService.cancel` | Cancelled order, emitted `ORDER_CANCELLED` | Still cancels; now creates a refund request **before** GoKwik notify; still does not call Razorpay/Cashfree |
| Admin `OrdersService.cancelForAdmin` | Same as customer cancel | Same request-creation change |
| `GokwikCancelListener` → `GokwikCancelService.notifyOrderCancelled` | Notified GoKwik Update Order; historically could send `refund_amount` | **No `refund_amount`**. Sends `order_status: Cancelled` only |
| RTO / out-of-stock / cron / payment reconciliation | No live auto gateway refund | Unchanged; they can later create refund requests via admin API |
| Razorpay / Cashfree services | No refund methods | `createRefund` / fetch methods added; called only from `RefundProcessorService` after approval |
| GoKwik `GokwikWebhookService.initiateRefund` | Existed for gateway refunds | Reused **only** from `RefundProcessorService` after Initiate |

No other live automatic provider-refund callers were found (`refund_amount` remains on the GoKwik Update Order DTO for the approved Initiate path only).

---

## Automatic-refund behaviour removed / changed

1. `GokwikCancelService.notifyOrderCancelled` no longer sends `refund_amount`.
2. Cancellation creates at most one active `refund_requests` row (`CUSTOMER_CANCELLATION`) when a captured online amount exists.
3. COD with no captured online payment does **not** create a request and does **not** call a gateway.
4. GoKwik partial COD refunds only the prepaid/captured online amount, via GoKwik, and only after Initiate.
5. Native checkout: Razorpay → Razorpay refund; Cashfree → Cashfree refund; never crossed, never sent through GoKwik.

---

## Entities and migrations

| Migration | Purpose |
|---|---|
| `CreateRefundRequestTables1785980000000` (`apps/api/database/migrations/1785980000000-create-refund-request-tables.ts`) | `refund_requests` + immutable `refund_request_history`; amount CHECKs `> 0`; unique active request per order; unique `merchant_refund_reference`; partial unique `provider_refund_id` |
| `AddRefundRequestPermissions1785980100000` (`apps/api/database/migrations/1785980100000-add-refund-request-permissions.ts`) | Permissions `PER00000336`–`PER00000341`; granted to `super_admin` and `admin` |

Money columns are `numeric(12,2)` stored as decimal strings. Calculations use `parseMoney` / `roundMoney` / `toMoneyString`. `synchronize` is not used.

v1 **full refunds only**: requested/approved amount must equal the remaining refundable captured amount.

---

## Status workflow

```text
REQUESTED → UNDER_REVIEW → AWAITING_APPROVAL → APPROVED → FINANCE_PROCESSING → PROCESSING → PROCESSED → CLOSED
```

Alternate: `REJECTED`, `CANCELLED`, `FAILED` (retry → `PROCESSING` only if conclusively failed).

Approval and provider initiation are separate. Unapproved requests cannot reach a payment provider.

---

## APIs created / changed

Admin (`/api/v1/admin/refund-requests`):

- `GET /` list
- `POST /` manual create
- `GET /:id` detail + history + available actions
- `POST /:id/review`
- `POST /:id/approve`
- `POST /:id/reject`
- `POST /:id/assign`
- `POST /:id/comments`
- `POST /:id/initiate` — provider call
- `POST /:id/retry`
- `POST /:id/reconcile`

Customer:

- `GET /api/v1/orders/:id` includes `refund`
- `PATCH /api/v1/orders/:id/cancel` returns the order including `refund` when created

---

## RBAC permissions

| Code | Action |
|---|---|
| `refund_requests.read` | List/detail |
| `refund_requests.create` | Manual create |
| `refund_requests.update` | Review, assign, comment |
| `refund_requests.approve` | Approve (no gateway) |
| `refund_requests.reject` | Reject |
| `refund_requests.status` | Initiate, retry, reconcile |

Admin sidebar: Order Management → Refund Requests (`/refund-requests`, `refund_requests.read`).

---

## Provider integration

`RefundProviderResolverService` uses backend records only (GoKwik order link, paid `payment_requests`, order notes `Generated from payment request {refId}`). Frontend cannot select the provider.

`RefundProcessorService`:

- `GOKWIK` → existing `GokwikWebhookService.initiateRefund`
- `RAZORPAY` → `RazorpayPaymentLinksService.createRefund` (amount in paise)
- `CASHFREE` → `CashfreePaymentService.createRefund` (merchant order id = payment request `refId`)
- `COD` / unknown → error, no gateway call

Timeouts / network uncertainty → `PENDING_RECONCILIATION`; do not auto-retry.

---

## Webhook / reconciliation

| Provider | Path | Behaviour |
|---|---|---|
| GoKwik | Existing refund webhook → `processRefund` | Still upserts `gokwik_refunds`; now emits `REFUND_PROVIDER_UPDATED` |
| Razorpay | `POST /api/v1/payment/webhook` events `refund.processed` / `failed` / `created` / `updated` | Signature verified; emits `REFUND_PROVIDER_UPDATED` |
| Cashfree | `POST /api/v1/payment/webhook/cashfree` `REFUND_STATUS_WEBHOOK` / `REFUND_WEBHOOK` | Signature verified; emits `REFUND_PROVIDER_UPDATED` |

`RefundRequestListener` matches by provider refund ID, merchant refund reference, or order ID. Duplicate same-status deliveries are ignored. Terminal `PROCESSED` / `CLOSED` never move backward. Admin `POST .../reconcile` fetches provider state without creating a second refund.

---

## Idempotency and locking

- Unique partial index: one active request per order (`status` not in `REJECTED` / `CANCELLED` / `CLOSED`)
- Unique `merchant_refund_reference`
- Partial unique `provider_refund_id`
- Initiate uses a DB transaction + pessimistic row lock
- `PROCESSING` / `PROCESSED` / `CLOSED` refuse a second gateway call
- Duplicate cancellation returns the existing request
- Failed attempts with `PENDING_RECONCILIATION` cannot be retried until reconciled

---

## Notifications

Domain events (no new MSG91 DLT template; customer copy is on the order `refund` object):

- `REFUND_REQUEST_CREATED`
- `REFUND_REQUEST_APPROVED`
- `REFUND_REQUEST_REJECTED`
- `REFUND_PROCESSING_STARTED`
- `REFUND_PROCESSED`
- `REFUND_FAILED`
- `REFUND_PROVIDER_UPDATED`

Customer-facing created copy:

```text
Your refund request has been initiated. Once approved and processed, the amount will be credited to your original payment method within 5–7 working days.
```

Existing cancel SMS / BOB WhatsApp for order cancellation is unchanged.

---

## Tests added

- `modules/gokwik/services/gokwik-cancel.service.spec.ts` — cancel notify has no `refund_amount`
- `modules/refund-requests/utils/refund-status-transition.util.spec.ts`
- `modules/refund-requests/services/refund-provider-resolver.service.spec.ts`
- `modules/refund-requests/services/refund-processor.service.spec.ts`
- `modules/refund-requests/services/refund-request.service.spec.ts`
- `modules/refund-requests/controllers/admin-refund-requests.controller.spec.ts`
- `modules/refund-requests/mappers/refund-request.mapper.spec.ts`

Existing `gokwik-webhook.service.spec.ts` updated for the current constructor.

---

## Files changed (primary)

- `modules/refund-requests/**` (new module)
- `modules/orders/services/orders.service.ts`, `orders.module.ts`, `mappers/order.mapper.ts`
- `modules/gokwik/services/gokwik-cancel.service.ts`
- `modules/gokwik/services/gokwik-webhook.service.ts` (emit provider update; `initiateRefund` reused)
- `modules/payment-requests/services/razorpay-payment-links.service.ts` (`createRefund`, `fetchRefund`)
- `modules/payment-requests/services/cashfree-payment.service.ts` (`createRefund`, `getRefund`)
- `modules/payment-requests/controllers/payments-webhook.controller.ts`
- `modules/payment-requests/repositories/payment-requests.repository.ts`
- `modules/payment-requests/payment-requests.module.ts`
- `modules/auth/services/admin-auth.service.ts` (sidebar)
- `modules/roles/services/permissions.service.ts`
- `modules/roles/constants/admin-permissions.constants.ts`
- `packages/events/src/events.constants.ts`
- `apps/api/app.module.ts`
- `apps/api/database/migrations/1785980000000-create-refund-request-tables.ts`
- `apps/api/database/migrations/1785980100000-add-refund-request-permissions.ts`

---

## Commands executed

```bash
npm test -- --testPathPattern='modules/refund-requests|modules/gokwik/services/gokwik-cancel.service.spec|modules/gokwik/services/gokwik-webhook.service.spec' --no-coverage
npx nest build
npx tsc --noEmit -p apps/api/tsconfig.app.json
git diff --check
```

Results:

- Tests: **8 suites passed, 36 tests passed**
- `nest build`: succeeded
- `tsc --noEmit -p apps/api/tsconfig.app.json`: succeeded
- `git diff --check`: succeeded (no whitespace errors)

`npm run lint` in this repo only targets `{src,apps,libs,test}/**/*.ts` and does not include `modules/`. Type-check via `tsc` was used instead.

Deploy with:

```bash
npm run migration:run
```

---

## Deployment / rollback

Deploy:

1. `npm run migration:run`
2. Deploy API
3. Grant custom-role permissions in Admin Panel if needed (super_admin/admin already seeded)

Rollback:

1. Revert API
2. `npm run migration:revert` twice (permissions first, then tables) **only if no production refund rows must be retained**

---

## Assumptions

- v1 supports **full refunds only** of the captured online amount.
- Approval does not call the gateway; Initiate does.
- SLA GREEN/ORANGE/RED uses 24h / 72h in `refund-request.constants.ts` until the client confirms timelines.
- No new refund SMS/email template (no DLT template). Customer sees the API message.
- Department-specific SLA / replacement / escalation workflows are not implemented; `dueAt`, `assignedToUserId`, `assignedRoleId`, `escalationLevel`, and events are extension points.
- Native prepaid orders are linked to `payment_requests` via notes, `paymentReference === orderNumber`, or latest PAID request for the same customer + amount. If none match, the request stays identifiable=`false` and Initiate returns `REFUND_PROVIDER_NOT_FOUND`.

---

## Pending client decisions

- Exact SLA timelines and escalation recipients
- Which roles receive approve vs initiate in production (assign via Admin Panel; do not hardcode)
- Whether MSG91/email templates should be created for refund lifecycle events
- Whether v2 should allow partial refunds
- Whether `AWAITING_APPROVAL` / `FINANCE_PROCESSING` need dedicated admin buttons (v1 can approve from `REQUESTED` and initiate from `APPROVED`)
