# Cancellation and return backend

This document describes the Cureka cancellation and reverse-logistics integration
after the 2026-09 implementation. It is the source of truth for what the backend
actually does.

## 1. Confirmed original root causes

These were confirmed from code, not inferred from the fact that forward shipping works.

1. **Customer and admin cancel were local-only.**
   `OrdersService.executeCancel` set `orders.order_status = CANCELLED`, restored
   stock, and emitted `ORDER_CANCELLED`. It never called Unicommerce
   `saleOrder/cancel`. Shipway `POST /api/cancel` existed but was only used for
   return reverse AWBs.
   Files: `modules/orders/services/orders.service.ts`,
   `modules/unicommerce/services/unicommerce-order-api.service.ts`,
   `modules/shipping/services/shipway.service.ts`.

2. **There was no admin history API for cancellations.**
   Cancelled orders remained in `GET /admin/orders` unless filtered. There was
   no order-level fulfilment event table and no combined cancellation/return
   history endpoint. The admin “history” page had nothing dedicated to query.
   Dashboard metrics that exclude `CANCELLED` are a separate reporting concern
   and were not the list-API bug.

3. **A local status change was treated as a completed cancellation.**
   `isReadyForUnicommercePush` skipped `CANCELLED` orders, so future export
   stopped, but an order already pushed to Uniware/Shipway kept fulfilling.
   HTTP 200 from `PATCH /orders/:id/cancel` was not provider success.

4. **Return reverse pickup already existed on admin approval, with two gaps.**
   Approval (default `RETURN_AUTO_SCHEDULE_ON_APPROVE=true`) called both
   Unicommerce `reversePickup/create` and Shipway `POST /api/v2orders`. The
   workflow then moved the return to `PICKUP_SCHEDULED` even when only the OMS
   record succeeded. Pickup codes lived in `return_pickups.provider_payload`
   JSON, not first-class columns. Customer `GET /returns` accepted `search`
   but did not pass it to the repository.

5. **Forward integration ownership (confirmed).**
   Cureka pushes to Unicommerce (`PUSH_ORDER` BullMQ job) and to Shipway
   independently (`kickoffFulfillment`). Unicommerce does not create the
   Shipway shipment. Shipway is used for booking and tracking, not tracking-only.
   There is no Unicommerce–Shipway connector in this repository. Reverse pickup
   follows the same split. Unverified: whether a Uniware UI connector could also
   book Shipway independently of Cureka.

6. **Unicommerce reverse-pickup cancel is unverified / unsupported.**
   Official create is documented. No reverse-pickup cancel contract is
   implemented. Withdrawal cancels the Shipway AWB when present and logs that
   Uniware RMA must be closed in Uniware by ops.

## 2. What changed

| Area | Change |
| --- | --- |
| Unicommerce | `POST /services/rest/v1/oms/saleOrder/cancel` via `UnicommerceOrderApiService.cancelSaleOrder`. Inspects `successful`, not HTTP-only. |
| Shipway cancel | Existing `POST /api/cancel` now used for **forward** AWB cancellation as well as reverse. |
| Queue | `cancel-order-fulfillment` job on the existing `unicommerce` BullMQ queue. Pending push jobs are removed when possible. |
| Order model | Separate cancellation workflow + Unicommerce/Shipway sync columns. `order_status` is still fulfilment status. |
| History | `order_fulfillment_events` table + `GET /admin/order-history`. Order detail includes `cancellation`, `actions`, `returns`, `fulfillmentEvents`. |
| Returns | First-class pickup sync columns. OMS record alone does not move the return to `PICKUP_SCHEDULED`. Reverse Shipway webhooks (`RTN…` / `RET…` order ids) are not applied to forward shipments. Customer return search is applied. Withdrawal cancels a booked Shipway pickup when an AWB exists. |
| Refunds | Still created only as **requests**, and only after cancellation is **confirmed**. No auto-execute. COD unpaid cancel still creates no gateway refund. |

Changed files (principal):

- `modules/unicommerce/services/unicommerce-order-api.service.ts`
- `modules/unicommerce/services/order-fulfillment-cancel.service.ts`
- `modules/unicommerce/services/unicommerce-order-queue.service.ts`
- `modules/unicommerce/processors/unicommerce-order.processor.ts`
- `modules/orders/services/orders.service.ts`
- `modules/orders/services/order-history.service.ts`
- `modules/orders/controllers/admin-order-history.controller.ts`
- `modules/orders/entities/order.entity.ts`
- `modules/orders/entities/order-fulfillment-event.entity.ts`
- `modules/returns/services/return-pickup.service.ts`
- `modules/returns/services/return-workflow.service.ts`
- `modules/returns/services/return-requests.service.ts`
- `modules/shipping/services/shipping.service.ts`
- `apps/api/database/migrations/1785981200000-add-order-cancellation-integration.ts`

## 3. Workflow

### Cancellation (distinct from `order_status`)

`NONE → REQUESTED/PROCESSING → CONFIRMED | REJECTED | REQUIRES_ATTENTION`

Historical rows that were already `order_status=CANCELLED` before this migration
are `HISTORICAL_UNVERIFIED`. They are **not** replayed.

External step statuses (Unicommerce and Shipway, independently):

`NOT_STARTED | NOT_REQUIRED | PENDING | CONFIRMED | FAILED | UNCERTAIN | REJECTED | UNSUPPORTED`

Confirmed cancellation requires every **applicable** step to be `CONFIRMED` or
`NOT_REQUIRED`.

- Never exported (`PENDING` order, no remote sale order, no AWB): confirmed
  immediately. Future export is blocked.
- Remote sale order exists: `saleOrder/cancel` with
  `cancelPartially=false`, `cancelOnChannel=false`, `cancelledBySeller=true`,
  `cancellationReason` truncated to 100 chars. Cureka is the channel of record;
  `cancelOnChannel=false` avoids a channel callback loop.
- AWB exists: Shipway `POST /api/cancel` with `awb_number`. Deleting a tracking
  row is not cancellation. No AWB → Shipway step `NOT_REQUIRED`.
- Provider says already dispatched: `REQUIRES_ATTENTION`. The order is **not**
  marked cancelled. Do not book a delivered-order return pickup for goods still
  in transit.
- Timeout after a possible success: `UNCERTAIN`, retried by BullMQ. The job
  reconciles with `getSaleOrder` before posting cancel again.
- Duplicate customer cancel while `PROCESSING`: HTTP 409.

Late events cannot move `CONFIRMED` back to an earlier success state; retries
are allowed only from `PROCESSING`, `REQUIRES_ATTENTION`, and
`HISTORICAL_UNVERIFIED`.

### Return

Existing statuses are unchanged. Conceptual mapping:

- Request stored: `REQUESTED`
- Admin approved, courier **not** booked: stays `APPROVED` (pickup row may exist
  with `FAILED` / `UNCERTAIN`)
- Courier booked: `PICKUP_SCHEDULED`
- Then existing pickup/QC/refund statuses

`PICKUP_SCHEDULED` is not set from a Unicommerce reverse-pickup record alone.

## 4. Data model and migration

Migration:
`apps/api/database/migrations/1785981200000-add-order-cancellation-integration.ts`

Do **not** run this against production from a development session.

It:

- Adds cancellation sync columns on `orders`
- Backfills existing `CANCELLED` orders to `HISTORICAL_UNVERIFIED` (read-only
  marker; no provider calls)
- Creates `order_fulfillment_events`
- Adds `unicommerce_reverse_pickup_code`, `shipway_order_id`,
  `unicommerce_sync_status`, `shipway_booking_status` on `return_pickups`

Apply in the target environment with the project’s normal `migration:run`
process after review.

## 5. Integration ownership

```
Cureka ──createSaleOrder──► Unicommerce (OMS)
Cureka ──POST /api/v2orders──► Shipway (forward booking + tracking)
Cureka ──saleOrder/cancel──► Unicommerce
Cureka ──POST /api/cancel──► Shipway (forward AWB, when present)
Cureka ──reversePickup/create──► Unicommerce (warehouse RMA)
Cureka ──POST /api/v2orders (order_id = RTN…)──► Shipway (reverse booking)
```

Unicommerce does not own Shipway in this codebase. Do not enable both a Uniware
Shipway connector **and** Cureka Shipway reverse booking for the same return
without an ops decision — Cureka currently books reverse courier itself.

## 6. Provider contracts used

| Action | Endpoint | Notes |
| --- | --- | --- |
| UC create | `POST /services/rest/v1/oms/saleOrder/create` | Existing |
| UC get | `POST /services/rest/v1/oms/saleorder/get` | Existing; used before cancel and reverse pickup |
| UC cancel | `POST /services/rest/v1/oms/saleOrder/cancel` | Documented; inspect `successful` |
| UC reverse create | `POST /services/rest/v1/oms/reversePickup/create` | Existing; `actionCode: WAC` |
| UC reverse cancel | **not implemented** | Unsupported; explicit log |
| Shipway push | `POST /api/v2orders` | Forward and reverse |
| Shipway cancel | `POST /api/cancel` | Requires `awb_number` |

No invented Shipway endpoints.

## 7. Configuration (names only)

- `UNICOMMERCE_ORDER_PUSH_ENABLED`
- `UNICOMMERCE_TENANT`, `UNICOMMERCE_USERNAME`, `UNICOMMERCE_PASSWORD`
- `UNICOMMERCE_CHANNEL`, `UNICOMMERCE_DEFAULT_FACILITY_CODE`
- `UNICOMMERCE_ORDER_TIMEOUT_MS`
- `SHIPWAY_EMAIL`, `SHIPWAY_LICENSE_KEY`, `SHIPWAY_BASE_URL`
- `SHIPWAY_WAREHOUSE_ID`, `SHIPWAY_RETURN_WAREHOUSE_ID`
- `SHIPWAY_REVERSE_FLAG` (optional reverse flag on Shipway payload)
- `RETURN_AUTO_SCHEDULE_ON_APPROVE` (default true)
- `RETURN_NOTIFY_UNICOMMERCE`, `RETURN_NOTIFY_SHIPWAY`
- `RETURN_PICKUP_PROVIDER`
- `RETURN_RESTOCK_ON_QC_PASS` (default false; Unicommerce remains stock SoT)

No new secrets were added.

## 8. Queue, retry, reconciliation

- Queue: `unicommerce` (existing). Job names: `push-order-to-unicommerce`,
  `cancel-order-fulfillment`.
- Cancel job id: `unicommerce-cancel-{orderId}` (deduped).
- Attempts: 8, exponential backoff 30s.
- Retriable: timeouts, 5xx-style thrown errors, `UNCERTAIN`, generic
  `successful: false`.
- Permanent: dispatched/rejected business errors, missing credentials
  (`UNSUPPORTED`), confirmed success, not-required.
- After exhausted retries the row stays `REQUIRES_ATTENTION` for admin retry:
  `POST /admin/orders/:id/cancellation/retry`.
- Historical unverified cancellations are listed on
  `GET /admin/order-history?unverifiedOnly=true`. They are not auto-replayed.

## 9. Refund interaction

- Cancellation request ≠ refund.
- Confirmed cancellation may create a **refund request** through the existing
  `createFromOrderCancellation` path (prepaid only). Finance still approves
  and initiates. Original payment provider routing is unchanged.
- COD unpaid cancel: nothing to refund through a gateway.
- Return approval / pickup / QC still do not execute refunds. Admin
  `POST /admin/returns/:id/refund` creates a request after the existing QC
  gates.

## 10. Historical records

Existing cancelled orders are marked `HISTORICAL_UNVERIFIED`. Some of those
parcels may already have been delivered. Ops must review; the backend will not
invent Unicommerce/Shipway success.

## 11. Test results

Ran locally (mocked providers, no live Uniware/Shipway/refunds):

- 15 related Jest suites, **125 passed**
- Includes: never-exported cancel, in-flight push race, Unicommerce
  `successful=true` / business failure / timeout, Shipway failure after
  Unicommerce success, OMS reverse pickup ≠ courier booked, reverse webhook
  isolation, admin history pagination binds, server-derived `actions`,
  refund-provider routing, return eligibility/window/duplicates

Not verified:

- Live Unicommerce `saleOrder/cancel`
- Live Shipway `/api/cancel` or reverse `/api/v2orders`
- Nest production bootstrap / circular DI in a running PM2 cluster
- Frontend admin history page (backend contract only)

`npx nest build` passed.

Partial item cancellation is **not** in the public API. Existing
`CancelOrderDto` is whole-order `reason` only. Shipped units are rejected by
dispatch checks rather than a per-item cancel payload.

## 12. Deployment

1. Review and apply `1785981200000-add-order-cancellation-integration` in the
   target environment.
2. Deploy API processes that run the Unicommerce BullMQ worker (same as forward
   push today).
3. Confirm Unicommerce and Shipway credentials in that environment.
4. Confirm `UNICOMMERCE_ORDER_PUSH_ENABLED` matches the environment’s intent.
5. Do not execute live cancellations, pickups, refunds, or production
   migrations from a developer workstation as a “test”.

## 13. External blockers / activation

- Unicommerce cancel is fully coded against the official sale-order cancel
  contract. Live success still requires tenant credentials, channel settings
  that allow seller cancel, and the order not being dispatched in Uniware.
- Shipway forward cancel is fully coded against the existing `/api/cancel`
  adapter. Live success requires credentials and a real AWB. If Shipway rejects
  cancel after dispatch, the request stays `REQUIRES_ATTENTION`.
- Unicommerce reverse-pickup **cancel** remains an explicit blocker.
- Mock tests ≠ live courier integration.
- “Request stored” is not “order cancelled.”
- “Return created” / “OMS reverse pickup created” is not “pickup booked.”
