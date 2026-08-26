# Shipway webhook investigation — shipment lookup failure

**Date:** 2026-08-25  
**Scope:** Root-cause analysis only (no code changes in this pass)  
**Symptom:** Webhook received + HTTP 200, but `Shipment for Shipway order 296449 not found`

---

## Root cause

**Identifier mismatch.**

| Direction | Identifier used |
| --- | --- |
| We **push** to Shipway | `order_id = orders.order_number` (format `ORD{timestamp}{rand}`, e.g. `ORD123456780012`) |
| We **store** | `shipments.shipway_order_id = order.orderNumber` (same `ORD…` value) |
| We **lookup** on webhook | `findByShipwayOrderId(payload.order_id)` only |
| Shipway **sent** (real event) | `order_id = "296449"` (numeric) |

`296449` is **not** a Cureka order number (`ORD…`). It is almost certainly Shipway’s **internal OMS order id** (or a merchant id used only inside Shipway), **not** the merchant `order_id` we pushed.

So:

```text
findByShipwayOrderId("296449") → null → NotFoundException
Batch handler catches NotFound → HTTP 200 with notFound++
```

That explains: webhook ✅, parse ✅, status ✅, DB update ❌, still HTTP 200.

Classic Shipway docs say webhook `order_id` should be the merchant-provided id. The live panel / carrier webhook shape appears to send Shipway’s internal numeric id instead (or the shipment was never pushed with our `ORD…` id).

---

## Current webhook flow

```text
POST /api/v1/shipments/webhook
  → ShipwayWebhookController.webhook
  → verifyWebhookAuth (hash / HMAC / unsigned panel OK)
  → normalizeEvents(payload)
       order_id ← payload.order_id | api_input.order_id
       status   ← current_status | status | …
       awb      ← awbno | awb | awb_number | …
  → ShippingService.handleShipwayWebhookBatch(events)
  → ShippingService.handleShipwayWebhook(event)
       ★ ONLY lookup:
         shipmentsRepository.findByShipwayOrderId(payload.order_id)
       if null → NotFoundException("Shipment for Shipway order … not found")
  → map status → update shipment + order + shipment_events
  → emit SHIPMENT_UPDATED
```

**Why HTTP 200 anyway:** `handleShipwayWebhookBatch` catches `NotFoundException` per event, increments `notFound`, continues, returns `{ received: true, processed, skipped, notFound }`.

---

## How `order_id` is currently resolved

```ts
// shipping.service.ts — handleShipwayWebhook
const shipment = await this.shipmentsRepository.findByShipwayOrderId(payload.order_id);
```

```ts
// shipments.repository.ts
findByShipwayOrderId(shipwayOrderId: string) {
  return repository.findOne({ where: { shipwayOrderId }, relations: { events: true } });
}
```

**No fallback** to:

- AWB (`awb_number`)
- `orders.order_number`
- `shipments.shipment_id` (Shipway booking id)
- `orders.id` (UUID)

---

## What identifier is `296449`?

| Candidate | Fit for `296449`? |
| --- | --- |
| Cureka `orders.order_number` | **No** — generated as `ORD` + 8 digit time + 4 digit rand |
| Cureka `orders.id` / `shipments.id` | **No** — UUIDs |
| `shipments.shipway_order_id` as we store it | **No** — equals `ORD…` |
| Shipway **internal** order / panel id | **Yes** — matches numeric panel IDs |
| Dummy sample `99999999` | Dummy; expected not found |

**AWB in the same event:** `11633336564716`  
This is the strongest secondary key if we persisted it at push time (`shipments.awb_number`).

---

## What Shipway identifier we store today

### On push (`ShippingService` after `POST /api/v2orders`)

| DB column | Source | Example |
| --- | --- | --- |
| `shipments.shipway_order_id` | `order.orderNumber` (what we sent as Shipway `order_id`) | `ORD1724…0012` |
| `shipments.order_number` | same denormalized | `ORD…` |
| `shipments.order_id` | Cureka order UUID | uuid |
| `shipments.shipment_id` | Shipway push response `shipment_id` | may be set |
| `shipments.awb_number` | Shipway push response `awb_number` | e.g. `11633336564716` if returned |
| `shipments.courier_name` / `courier_id` | push response | Delhivery, … |

We do **not** persist a separate Shipway-internal numeric order id if Shipway returns one (push response interface only has `awb_number`, `shipment_id`, courier, urls — no `shipway_internal_order_id` field captured).

### Push payload (merchant id we send)

```ts
// buildPushOrderPayload
order_id: order.orderNumber  // ORD…
```

---

## Exact DB fields involved

**Table `shipments`**

| Column | Role in webhook today |
| --- | --- |
| `shipway_order_id` | **Only** lookup key (must equal webhook `order_id`) |
| `awb_number` | Updated from webhook if found; **not** used for find |
| `shipment_id` | Updated if present; **not** used for find |
| `order_number` | Denormalized Cureka number; **not** used for find |
| `order_id` | FK to orders UUID; **not** used for find |
| `shipment_status` / `shipway_raw_status` | Updated after successful lookup |
| `last_webhook_event_id` | Idempotency |

**Repository:** no `findByAwbNumber` / `findByOrderNumber` on shipments.

---

## Is AWB fallback required?

**Yes — recommended as the primary fix for live panel webhooks** that send numeric Shipway ids.

Priority (recommended):

```text
1. shipway_order_id == webhook.order_id          (merchant ORD… — docs / classic status_feed)
2. awb_number == webhook.awb | awbno | awb_number (live carrier/panel payloads)
3. order_number == webhook.order_id               (if Shipway ever echoes ORD…)
4. (optional later) shipway_internal_id column if we start storing Shipway’s numeric id
```

For event `296449` + AWB `11633336564716`:  
If a shipment row exists with that AWB, AWB fallback would resolve and apply `INT`.

**Also verify in DB:**

```sql
-- Does any shipment have this AWB?
SELECT id, order_number, shipway_order_id, awb_number, shipment_status
FROM shipments
WHERE awb_number = '11633336564716';

-- Does anything store 296449?
SELECT id, order_number, shipway_order_id, awb_number
FROM shipments
WHERE shipway_order_id = '296449'
   OR order_number = '296449'
   OR shipment_id = '296449';

-- Cureka order numbers look like ORD…
SELECT order_number FROM orders WHERE order_number LIKE 'ORD%' ORDER BY created_at DESC LIMIT 5;
```

If AWB query is empty → shipment was never pushed / AWB never saved → need push/sync fix, not just webhook lookup.

---

## Status mapping review

Incoming real status: `current_status = "INT"`.

| Shipway code | ShipmentStatus | OrderStatus (via map) |
| --- | --- | --- |
| `INT` | `IN_TRANSIT` | `SHIPPED` (Dispatched step) |
| `OOD` / `OFD` | `OUT_FOR_DELIVERY` | `OUT_FOR_DELIVERY` |
| `DEL` | `DELIVERED` | `DELIVERED` |
| `SCH` | `PROCESSING` | `PROCESSING` |
| `PKP` / Picked Up | `PICKUP_COMPLETE` | `SHIPPED` |
| Narrative `Bag Received at Facility` | `IN_TRANSIT` (if used as status) | `SHIPPED` |

**Verdict:** Mapping for `INT` / `DEL` / `OFD`/`OOD` is correct. Lookup fails **before** mapping runs.

Scan narrative on the real event (`Bag Received at Facility`) is informational; driver is `current_status: INT`.

---

## Files / services involved

| File | Role |
| --- | --- |
| `modules/shipping/controllers/shipway-webhook.controller.ts` | Receive, normalize `order_id` / `awb` |
| `modules/shipping/services/shipping.service.ts` | `handleShipwayWebhook` — **single-key lookup** |
| `modules/shipping/repositories/shipments.repository.ts` | `findByShipwayOrderId` only |
| `modules/shipping/entities/shipment.entity.ts` | Column definitions |
| `modules/shipping/constants/shipway-status.constants.ts` | Status maps |
| `modules/shipping/mappers/shipway-status.mapper.ts` | Resolve codes → shipment/order |
| `modules/orders/services/orders.service.ts` | `generateOrderNumber` → `ORD…` |

---

## Recommended fix (minimal, safe)

### Do now (no API contract change)

1. Add `ShipmentsRepository.findByAwbNumber(awb: string)`.
2. In `handleShipwayWebhook`, resolve shipment:

```text
by shipway_order_id(order_id)
  ?? by awb_number(awb)
  ?? by order_number(order_id)   // optional safety
```

3. Log which key matched (`matchedBy: 'shipway_order_id' | 'awb' | 'order_number'`).
4. Keep batch `notFound` → 200 behaviour (Shipway retries).

### Do next (hardening)

5. On push / OMS poll, if Shipway returns an internal numeric order id, persist it (new nullable column `shipway_internal_order_id` **or** secondary index) and include in lookup priority.
6. Confirm with Shipway support whether panel webhooks intentionally send internal id vs merchant `order_id`.
7. Ops: for AWB `11633336564716`, confirm a shipment row exists and `shipway_order_id` is `ORD…`.

### Migration

- **AWB fallback alone:** no migration.
- **Persist Shipway internal id:** yes — nullable `varchar` + index on `shipments`.

---

## Minimal implementation plan

1. Confirm SQL for AWB `11633336564716` and `296449` on beta/prod (ops).
2. Implement AWB (+ optional order_number) fallback in `handleShipwayWebhook`.
3. Unit tests: webhook with numeric `order_id` + matching AWB → processed; wrong AWB → not_found.
4. Replay real payload (or Shipway resend) and confirm shipment/order update for `INT` → `SHIPPED`.
5. Only if AWB also missing: investigate push path / persist Shipway internal id.

---

## Summary

| Step | Status |
| --- | --- |
| Webhook received | ✅ |
| HTTP 200 | ✅ (notFound still 200) |
| Payload parsed | ✅ |
| Status `INT` mapping | ✅ (would work if found) |
| Lookup `296449` as `shipway_order_id` | ❌ mismatch vs stored `ORD…` |
| AWB fallback | ❌ not implemented |
| DB update | ❌ never reached |

**Bottom line:** Webhook works; we look up the wrong id. Store merchant `ORD…` in `shipway_order_id`, but live webhook sends numeric Shipway id `296449`. Use **AWB** (and optionally store Shipway internal id) to resolve the shipment.
