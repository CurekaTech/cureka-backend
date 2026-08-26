# Shipway persistence location — empty `public.shipments`

**Date:** 2026-08-25  
**Scope:** Read-only code + schema inspection (no code/DB changes)  
**Cloud SQL finding:** `orders` = 233, `shipments` = 0  

---

## Verdict

There is **no alternate Shipway persistence table**.

| Question | Answer |
| --- | --- |
| Where is Shipway data stored? | **`public.shipments`** (plus child `shipment_events`, `shipment_items`) |
| Is `public.shipments` unused dead code? | **No** — it is the intended and only persistence path |
| Why is it empty? | Shipway **push never successfully INSERTed** any rows in this environment (or all pushes failed/skipped before save) |
| Are AWB / courier / Shipway ids on `orders`? | **No** — `orders` has no Shipway columns |
| Can webhooks update anything with 0 rows? | **No** — lookup is `shipments.shipway_order_id = payload.order_id` |

So the live webhook for `order_id=296449` / AWB `11633336564716` fails for a **deeper** reason than ID mismatch alone: **there is no local shipment row to update at all**.

---

## Actual tables (from entities + migrations)

### Shipway-related tables (only these)

| Table | Entity | Role |
| --- | --- | --- |
| `public.shipments` | `ShipmentEntity` | **Primary** store for push response + tracking state |
| `public.shipment_events` | `ShipmentEventEntity` | Scan/timeline history (FK → `shipments.id`) |
| `public.shipment_items` | `ShipmentItemEntity` | Line-item link for multi-shipment (FK → `shipments.id`) |

### Tables that do **NOT** store Shipway shipment data

Confirmed absent / unrelated:

- `order_shipments`, `shipping`, `shipment_tracking`, `delivery`, `fulfillment`, `shipway_orders`, `logistics`, `integrations`
- `gokwik_orders` — GoKwik payment linkage only (`gokwik_order_id`, `payment_id`, …)
- `orders` / `order_items` — no `awb`, `shipway_*`, `courier_*`, `tracking_*` columns
- UniCommerce module — no AWB/shipment DB persistence in this repo
- `admin_setting` key `shipway` — feature/gateway flag only, not shipment data

---

## Exact `public.shipments` columns (Shipway fields)

| Concept | Column |
| --- | --- |
| Our shipment PK | `id` (uuid) |
| Cureka order UUID | `order_id` → `orders.id` |
| Cureka order number | `order_number` |
| Merchant id we send to Shipway / stored as lookup key | `shipway_order_id` (= `order.order_number` on push, e.g. `ORD…`) |
| Shipway booking / shipment id from API | `shipment_id` |
| AWB | `awb_number` |
| Courier | `courier_name`, `courier_id` |
| Tracking / label / invoice URLs | `tracking_url`, `label_url`, `invoice_url` |
| Our mapped status | `shipment_status` |
| Raw Shipway status | `shipway_raw_status` |
| Push / sync times | `pushed_at`, `last_synced_at` |
| Webhook idempotency | `last_webhook_event_id` |
| Timestamps | `created_at`, `updated_at`, `deleted_at` |

Shipway **internal numeric** OMS id (e.g. `296449`) is **not** a dedicated column and is **not** persisted today.

---

## Flow (code)

```text
Order confirm
  → OrdersService.kickoffFulfillment
      → enqueue Unicommerce (independent)
      → pushOrderToShipwaySafely   ← errors are LOGGED and SWALLOWED
          → ShippingService.pushOrderToShipway
              → skip if !isReadyForShipway → return null (NO ROW)
              → ShipwayService.pushOrder (POST /api/v2orders)
                  order_id = order.orderNumber   // ORD…
              → on success ONLY:
                  INSERT/UPDATE public.shipments
                    shipway_order_id = order.orderNumber
                    shipment_id / awb_number / courier_* from response
                    pushed_at = now()
                  UPDATE orders.order_status (PROCESSING / …)
                  emit SHIPMENT_UPDATED

Webhook POST /api/v1/shipments/webhook
  → findByShipwayOrderId(payload.order_id)   // ONLY public.shipments
  → if null → "Shipment for Shipway order … not found"
  → if found → update shipments + shipment_events + orders.order_status
```

### Important nuance: live status without DB rows

`resolveShipmentForOrder` can call Shipway APIs and build an **ephemeral in-memory** shipment (`buildEphemeralShipmentFromTracking`) for order detail UI **without inserting** into `public.shipments`.

So: UI/API can show tracking while Cloud SQL still shows `shipments count = 0`. Webhooks **cannot** use that path — they require a real row.

---

## Why `public.shipments` is empty (most likely)

The table is **actively used** when push succeeds. Zero rows means in this DB environment:

1. **Push never succeeded** (API error, auth, validation) — failures are caught in `pushOrderToShipwaySafely` and do not fail order placement  
2. **Push skipped** via `isReadyForShipway` (e.g. prepaid not `PAID`, or still `PENDING`)  
3. **Shipway orders exist outside Cureka** (manual panel / another system) → webhooks arrive for Shipway ids like `296449`, but Cureka never wrote a matching row  
4. Less likely: wrong database / environment vs the API receiving webhooks  

With `shipments = 0`, **AWB fallback alone cannot fix webhooks** until a row exists (or webhook upserts by AWB/order_number).

---

## Should `public.shipments` normally contain data?

**Yes.** After a successful Shipway push you should see one row per pushed order with:

- `shipway_order_id` = `ORD…`
- `order_id` = Cureka order UUID  
- `awb_number` when Shipway/carrier assigned it  
- `pushed_at` set  

`shipment_events` fills after webhook/polling once a shipment row exists.

---

## READ-ONLY SQL (Cloud SQL Studio)

### 1. Find order `ORD368251938039`

```sql
SELECT
  o.id,
  o.order_number,
  o.order_status,
  o.payment_status,
  o.payment_method,
  o.order_source,
  o.placed_at,
  o.created_at,
  o.updated_at
FROM public.orders o
WHERE o.order_number = 'ORD368251938039'
  AND o.deleted_at IS NULL;
```

**Expect:** 1 row with Cureka UUID and status/payment fields. No AWB columns on this table.

---

### 2. Find any Shipway-related record for that order

```sql
-- 2a: shipments (canonical)
SELECT s.*
FROM public.shipments s
JOIN public.orders o ON o.id = s.order_id
WHERE o.order_number = 'ORD368251938039'
  AND s.deleted_at IS NULL;

-- 2b: shipment_events via that order
SELECT e.*
FROM public.shipment_events e
JOIN public.shipments s ON s.id = e.shipment_id AND s.deleted_at IS NULL
JOIN public.orders o ON o.id = s.order_id
WHERE o.order_number = 'ORD368251938039'
  AND e.deleted_at IS NULL;

-- 2c: shipment_items
SELECT si.*
FROM public.shipment_items si
JOIN public.shipments s ON s.id = si.shipment_id AND s.deleted_at IS NULL
JOIN public.orders o ON o.id = s.order_id
WHERE o.order_number = 'ORD368251938039';

-- 2d: GoKwik payment link (not Shipway, but order-linked)
SELECT g.id, g.order_id, g.gokwik_order_id, g.payment_id, g.payment_method, g.created_at
FROM public.gokwik_orders g
JOIN public.orders o ON o.id = g.order_id
WHERE o.order_number = 'ORD368251938039'
  AND g.deleted_at IS NULL;
```

**Expect:** 2a–2c empty if `shipments` truly has 0 rows. 2d may or may not have a row.

---

### 3. Find AWB `11633336564716`

```sql
SELECT s.id, s.order_id, s.order_number, s.shipway_order_id, s.awb_number,
       s.courier_name, s.shipment_status, s.shipway_raw_status, s.pushed_at
FROM public.shipments s
WHERE s.awb_number = '11633336564716'
  AND s.deleted_at IS NULL;
```

**Expect:** 0 rows given empty table. Confirms AWB is not stored anywhere else in Cureka DB.

---

### 4. Find identifier `296449`

```sql
SELECT 'shipments.shipway_order_id' AS loc, s.id::text, s.order_number
FROM public.shipments s
WHERE s.shipway_order_id = '296449' AND s.deleted_at IS NULL
UNION ALL
SELECT 'shipments.shipment_id', s.id::text, s.order_number
FROM public.shipments s
WHERE s.shipment_id = '296449' AND s.deleted_at IS NULL
UNION ALL
SELECT 'shipments.order_number', s.id::text, s.order_number
FROM public.shipments s
WHERE s.order_number = '296449' AND s.deleted_at IS NULL
UNION ALL
SELECT 'orders.order_number', o.id::text, o.order_number
FROM public.orders o
WHERE o.order_number = '296449' AND o.deleted_at IS NULL
UNION ALL
SELECT 'orders.order_number LIKE', o.id::text, o.order_number
FROM public.orders o
WHERE o.order_number LIKE '%296449%' AND o.deleted_at IS NULL;
```

**Expect:** 0 rows — `296449` is Shipway-side only until we persist it.

---

### 5. Latest 20 Shipway/shipping records (actual table)

```sql
SELECT
  s.id,
  s.order_id,
  s.order_number,
  s.shipway_order_id,
  s.shipment_id AS shipway_booking_id,
  s.awb_number,
  s.courier_name,
  s.courier_id,
  s.shipment_status,
  s.shipway_raw_status,
  s.pushed_at,
  s.last_synced_at,
  s.created_at
FROM public.shipments s
WHERE s.deleted_at IS NULL
ORDER BY s.created_at DESC
LIMIT 20;
```

**Expect:** empty result set (matches count = 0).

Also confirm related tables:

```sql
SELECT
  (SELECT COUNT(*) FROM public.shipments) AS shipments_total,
  (SELECT COUNT(*) FROM public.shipments WHERE deleted_at IS NULL) AS shipments_active,
  (SELECT COUNT(*) FROM public.shipment_events) AS shipment_events_total,
  (SELECT COUNT(*) FROM public.shipment_items) AS shipment_items_total;
```

---

### 6. Confirm `public.shipments` should normally have data

```sql
-- Table exists and is wired for production use
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'shipments'
ORDER BY ordinal_position;

-- How many orders look "ready" for Shipway push but have no shipment row
SELECT
  COUNT(*) AS readyish_orders_without_shipment
FROM public.orders o
WHERE o.deleted_at IS NULL
  AND o.order_status NOT IN ('CANCELLED', 'DELIVERED', 'RTO', 'FAILED_DELIVERY')
  AND (
    o.payment_method = 'COD'
    OR (o.payment_status = 'PAID' AND o.order_status <> 'PENDING')
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.shipments s
    WHERE s.order_id = o.id AND s.deleted_at IS NULL
  );
```

**Expect:** schema lists `shipway_order_id`, `awb_number`, etc.; second query likely a large number — evidence push is not persisting.

---

### Optional: Shipway admin flag (not shipment data)

```sql
SELECT key, status, value, updated_at
FROM public.admin_setting
WHERE key = 'shipway';
```

---

## Run this NEXT

```sql
SELECT
  o.id,
  o.order_number,
  o.order_status,
  o.payment_status,
  o.payment_method,
  o.order_source,
  o.created_at
FROM public.orders o
WHERE o.order_number = 'ORD368251938039'
  AND o.deleted_at IS NULL;
```

Then check app logs for that order around place/confirm for:

- `[FULFILLMENT] Failed to push order to Shipway`
- `Skipping Shipway push because order is not ready`
- `Shipment saved after Shipway push`

That tells you whether the gap is **skip**, **failed push**, or **never called**.

---

## Summary block

```text
Actual Shipway persistence table:
  public.shipments
  (children: public.shipment_events, public.shipment_items)

Actual webhook lookup table:
  public.shipments
  (WHERE shipway_order_id = webhook.order_id — currently only)

Why public.shipments is empty:
  Intended write path is ShippingService.pushOrderToShipway after order confirm.
  Zero rows means no successful persist in this DB (push skipped, failed+swallowed,
  or Shipway orders created outside Cureka). orders has no Shipway columns.
  Webhooks cannot update anything until a shipments row exists.

Next SQL query I should run:
  SELECT id, order_number, order_status, payment_status, payment_method, order_source, created_at
  FROM public.orders
  WHERE order_number = 'ORD368251938039' AND deleted_at IS NULL;
  Then check server logs for that order’s Shipway push skip/fail/success.
```

No code or database data was modified for this document.
