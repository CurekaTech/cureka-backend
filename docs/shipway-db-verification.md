# Shipway DB verification — webhook identifier mismatch

**Date:** 2026-08-25  
**Scope:** Read-only inspection + SELECT queries only  
**Do not:** modify code, run migrations, or INSERT/UPDATE/DELETE any rows  

**Webhook under investigation:**

| Field | Value |
| --- | --- |
| `order_id` | `296449` |
| `awb` | `11633336564716` |
| `current_status` | `INT` |
| `carrier` | `Delhivery` |

---

## Schema confirmed from code

Sources:

- `modules/shipping/entities/shipment.entity.ts`
- `modules/shipping/entities/shipment-event.entity.ts`
- `modules/orders/entities/order.entity.ts`
- `packages/database/src/base.entity.ts`
- `apps/api/database/migrations/1780855000000-CreateShippingTables.ts`
- `apps/api/database/migrations/1780914000000-CompleteGokwikPersistence.ts` (`group_key`)
- `modules/shipping/repositories/shipments.repository.ts`

**Schema:** `public` (migrations create types as `"public"."…"`; tables are unqualified `"shipments"` / `"orders"` → public).

### Tables

| Table | Purpose |
| --- | --- |
| `public.shipments` | One row per pushed/booked Shipway shipment |
| `public.shipment_events` | Tracking timeline (webhook / polling) |
| `public.orders` | Cureka order |

### Relationships

```text
orders.id  <── FK ──  shipments.order_id
shipments.id  <── FK ──  shipment_events.shipment_id
```

Unique constraints of interest:

- `shipments.shipway_order_id` UNIQUE
- `(shipments.order_id, shipments.group_key)` UNIQUE (`UQ_shipments_order_group`)
- `orders.order_number` UNIQUE

Soft deletes: all three tables have `deleted_at`. App lookups via TypeORM exclude soft-deleted rows (`deleted_at IS NULL`). Queries below filter the same way unless noted.

### Identifier column map

| Concept | PostgreSQL column | Notes |
| --- | --- | --- |
| Cureka order UUID | `orders.id` / `shipments.order_id` | uuid |
| Cureka order number | `orders.order_number` / `shipments.order_number` | e.g. `ORD…` |
| Shipway order ID **as we store it** | `shipments.shipway_order_id` | Set to `order.orderNumber` on push — **not** Shipway’s numeric OMS id |
| Shipway shipment / booking ID | `shipments.shipment_id` | varchar from Shipway `shipment_id` response; **not** our PK |
| Our shipment PK | `shipments.id` | uuid |
| AWB | `shipments.awb_number` | nullable; indexed |
| Shipment status (ours) | `shipments.shipment_status` | enum `shipments_shipment_status_enum` |
| Raw Shipway status | `shipments.shipway_raw_status` | varchar |
| Courier | `shipments.courier_name`, `shipments.courier_id` | |
| Timestamps | `created_at`, `updated_at`, `pushed_at`, `last_synced_at` | |
| Event FK | `shipment_events.shipment_id` | uuid → `shipments.id` (name collision with Shipway booking id above) |

**Columns that do NOT exist** (do not query them):

- `shipwayOrderId` (camelCase property only)
- `external_order_id`
- separate `shipway_internal_order_id`
- `awb` / `awbno` as DB columns (API only)

### Why webhook lookup fails (code path)

```ts
// shipments.repository.ts — only method used by webhook
findByShipwayOrderId(shipwayOrderId) → WHERE shipway_order_id = :payload.order_id
```

Expected for live event: `WHERE shipway_order_id = '296449'` → **0 rows** if we stored `ORD…`.

---

## How to use these queries

Paste into **Google Cloud SQL Studio** (PostgreSQL). All are `SELECT` only.

**Run Query A first** — if AWB `11633336564716` returns a row, AWB fallback can fix the webhook without needing `296449` to exist in `shipway_order_id`.

---

## A. Find shipment by AWB `11633336564716`

**Expect:** 0 or 1+ rows. A hit with `shipway_order_id` like `ORD…` (not `296449`) confirms identifier mismatch + AWB fallback viability.

```sql
SELECT
  s.id,
  s.ref_id,
  s.order_id,
  s.order_number,
  s.group_key,
  s.shipway_order_id,
  s.shipment_id AS shipway_booking_shipment_id,
  s.awb_number,
  s.courier_name,
  s.courier_id,
  s.shipment_status,
  s.shipway_raw_status,
  s.tracking_url,
  s.pushed_at,
  s.last_synced_at,
  s.last_webhook_event_id,
  s.created_at,
  s.updated_at,
  s.deleted_at
FROM public.shipments s
WHERE s.awb_number = '11633336564716'
  AND s.deleted_at IS NULL;
```

Also check soft-deleted (should normally be empty):

```sql
SELECT s.id, s.awb_number, s.shipway_order_id, s.deleted_at
FROM public.shipments s
WHERE s.awb_number = '11633336564716'
  AND s.deleted_at IS NOT NULL;
```

---

## B. Find any shipment / order containing identifier `296449`

**Expect:** Likely **0 rows** on `shipway_order_id` / `order_number`. A hit on `shipment_id` would mean Shipway’s booking id equals `296449` (useful but still not what webhook lookup uses today).

Only columns that actually exist and could plausibly hold this value:

```sql
-- B1: shipments — exact match on identifier columns
SELECT
  'shipments' AS source_table,
  s.id,
  s.order_id,
  s.order_number,
  s.shipway_order_id,
  s.shipment_id AS shipway_booking_shipment_id,
  s.awb_number,
  s.pickup_id,
  s.last_webhook_event_id,
  s.shipment_status,
  s.created_at
FROM public.shipments s
WHERE s.deleted_at IS NULL
  AND (
    s.shipway_order_id = '296449'
    OR s.shipment_id = '296449'
    OR s.order_number = '296449'
    OR s.awb_number = '296449'
    OR s.pickup_id = '296449'
    OR s.last_webhook_event_id = '296449'
    OR s.ref_id = '296449'
    OR s.courier_id = '296449'
    OR s.warehouse_id = '296449'
    OR s.return_warehouse_id = '296449'
  );
```

```sql
-- B2: shipments — substring / contains (catch ORD296449 or padded values)
SELECT
  s.id,
  s.order_number,
  s.shipway_order_id,
  s.shipment_id AS shipway_booking_shipment_id,
  s.awb_number,
  s.pickup_id,
  s.last_webhook_event_id
FROM public.shipments s
WHERE s.deleted_at IS NULL
  AND (
    s.shipway_order_id LIKE '%296449%'
    OR s.shipment_id LIKE '%296449%'
    OR s.order_number LIKE '%296449%'
    OR s.awb_number LIKE '%296449%'
    OR COALESCE(s.pickup_id, '') LIKE '%296449%'
    OR COALESCE(s.last_webhook_event_id, '') LIKE '%296449%'
  );
```

```sql
-- B3: orders — order_number / ref_id
SELECT
  o.id,
  o.order_number,
  o.ref_id,
  o.order_status,
  o.payment_status,
  o.placed_at,
  o.created_at
FROM public.orders o
WHERE o.deleted_at IS NULL
  AND (
    o.order_number = '296449'
    OR o.order_number LIKE '%296449%'
    OR o.ref_id = '296449'
  );
```

```sql
-- B4: simulate current webhook lookup exactly
SELECT s.*
FROM public.shipments s
WHERE s.shipway_order_id = '296449'
  AND s.deleted_at IS NULL;
-- Expect: 0 rows (matches log "Shipment for Shipway order 296449 not found")
```

---

## C. Related Cureka order for AWB (JOIN)

**Expect:** If Query A finds a shipment, this returns the linked `orders` row and shows `orders.order_number` vs `shipments.shipway_order_id` (should match each other if push path ran correctly).

```sql
SELECT
  s.id AS shipment_uuid,
  s.awb_number,
  s.shipway_order_id,
  s.shipment_id AS shipway_booking_shipment_id,
  s.shipment_status,
  s.shipway_raw_status,
  s.courier_name,
  s.pushed_at,
  s.last_synced_at,
  o.id AS order_uuid,
  o.order_number AS cureka_order_number,
  o.order_status,
  o.payment_status,
  o.order_source,
  o.placed_at,
  o.created_at AS order_created_at,
  (s.shipway_order_id = o.order_number) AS shipway_order_id_equals_order_number
FROM public.shipments s
INNER JOIN public.orders o
  ON o.id = s.order_id
 AND o.deleted_at IS NULL
WHERE s.awb_number = '11633336564716'
  AND s.deleted_at IS NULL;
```

---

## D. Latest 10 shipments with Shipway identifiers

**Expect:** Recent rows show `shipway_order_id` in `ORD…` form; `awb_number` may be null until booking/sync; `shipment_id` may be a Shipway booking id when present.

```sql
SELECT
  s.id,
  s.order_id,
  s.order_number,
  s.group_key,
  s.shipway_order_id,
  s.shipment_id AS shipway_booking_shipment_id,
  s.awb_number,
  s.courier_name,
  s.shipment_status,
  s.shipway_raw_status,
  s.pushed_at,
  s.last_synced_at,
  s.created_at,
  s.updated_at
FROM public.shipments s
WHERE s.deleted_at IS NULL
ORDER BY s.created_at DESC
LIMIT 10;
```

---

## E. Latest 10 Cureka orders and order numbers

**Expect:** `order_number` values like `ORD…`, never bare `296449` as the normal format.

```sql
SELECT
  o.id,
  o.order_number,
  o.order_status,
  o.payment_status,
  o.order_source,
  o.grand_total,
  o.placed_at,
  o.created_at,
  o.updated_at
FROM public.orders o
WHERE o.deleted_at IS NULL
ORDER BY o.created_at DESC
LIMIT 10;
```

---

## F. Status history for shipment with AWB `11633336564716`

**Expect:** Events only if we previously synced/polled successfully. If webhook lookup always failed, this may be **empty** even when the shipment row exists.

```sql
SELECT
  e.id AS event_uuid,
  e.shipment_id AS shipment_uuid,
  e.status,
  e.description,
  e.location,
  e.happened_at,
  e.source,
  e.created_at,
  s.awb_number,
  s.shipway_order_id,
  s.order_number
FROM public.shipment_events e
INNER JOIN public.shipments s
  ON s.id = e.shipment_id
 AND s.deleted_at IS NULL
WHERE s.awb_number = '11633336564716'
  AND e.deleted_at IS NULL
ORDER BY e.happened_at NULLS LAST, e.created_at ASC;
```

---

## G. Duplicate shipment rows for the same AWB

**Expect:** Ideally 0 duplicate groups. More than one active row with the same AWB would make naive AWB fallback ambiguous (need deterministic pick, e.g. latest non-deleted).

```sql
SELECT
  s.awb_number,
  COUNT(*) AS row_count,
  ARRAY_AGG(s.id ORDER BY s.created_at) AS shipment_uuids,
  ARRAY_AGG(s.shipway_order_id ORDER BY s.created_at) AS shipway_order_ids,
  ARRAY_AGG(s.order_number ORDER BY s.created_at) AS order_numbers
FROM public.shipments s
WHERE s.deleted_at IS NULL
  AND s.awb_number = '11633336564716'
GROUP BY s.awb_number
HAVING COUNT(*) > 1;
```

Broader check (any duplicated AWBs recently):

```sql
SELECT
  s.awb_number,
  COUNT(*) AS row_count
FROM public.shipments s
WHERE s.deleted_at IS NULL
  AND s.awb_number IS NOT NULL
  AND s.awb_number <> ''
GROUP BY s.awb_number
HAVING COUNT(*) > 1
ORDER BY row_count DESC
LIMIT 20;
```

---

## H. NULL / missing AWB on recent Shipway shipments

**Expect:** Some recent pushed rows may have `awb_number IS NULL` until carrier assignment. High null rate means AWB-only fallback will miss early webhooks that only send Shipway numeric `order_id`.

```sql
SELECT
  COUNT(*) AS total_recent,
  COUNT(*) FILTER (WHERE s.awb_number IS NULL OR s.awb_number = '') AS missing_awb,
  COUNT(*) FILTER (WHERE s.awb_number IS NOT NULL AND s.awb_number <> '') AS has_awb,
  COUNT(*) FILTER (WHERE s.pushed_at IS NOT NULL) AS pushed_count
FROM public.shipments s
WHERE s.deleted_at IS NULL
  AND s.created_at >= NOW() - INTERVAL '30 days';
```

```sql
SELECT
  s.id,
  s.order_number,
  s.shipway_order_id,
  s.shipment_id AS shipway_booking_shipment_id,
  s.awb_number,
  s.shipment_status,
  s.shipway_raw_status,
  s.pushed_at,
  s.created_at
FROM public.shipments s
WHERE s.deleted_at IS NULL
  AND s.created_at >= NOW() - INTERVAL '30 days'
  AND (s.awb_number IS NULL OR s.awb_number = '')
ORDER BY s.created_at DESC
LIMIT 20;
```

---

## Optional: quick decision helper (single result set)

Run after A/B if you want a one-screen summary:

```sql
SELECT
  (SELECT COUNT(*) FROM public.shipments s
     WHERE s.awb_number = '11633336564716' AND s.deleted_at IS NULL) AS rows_by_awb,
  (SELECT COUNT(*) FROM public.shipments s
     WHERE s.shipway_order_id = '296449' AND s.deleted_at IS NULL) AS rows_by_webhook_order_id,
  (SELECT COUNT(*) FROM public.shipments s
     WHERE s.shipment_id = '296449' AND s.deleted_at IS NULL) AS rows_by_shipway_booking_id,
  (SELECT COUNT(*) FROM public.orders o
     WHERE o.order_number = '296449' AND o.deleted_at IS NULL) AS orders_by_number_296449,
  (SELECT s.shipway_order_id FROM public.shipments s
     WHERE s.awb_number = '11633336564716' AND s.deleted_at IS NULL
     ORDER BY s.created_at DESC LIMIT 1) AS stored_shipway_order_id_for_awb,
  (SELECT s.order_number FROM public.shipments s
     WHERE s.awb_number = '11633336564716' AND s.deleted_at IS NULL
     ORDER BY s.created_at DESC LIMIT 1) AS stored_order_number_for_awb;
```

**How to read it:**

| Result pattern | Meaning |
| --- | --- |
| `rows_by_awb ≥ 1`, `rows_by_webhook_order_id = 0`, `stored_shipway_order_id_for_awb` starts with `ORD` | Confirms root cause; **AWB fallback solves this event** |
| `rows_by_awb = 0` | Shipment never stored / AWB never synced — fallback alone is insufficient |
| `rows_by_webhook_order_id ≥ 1` | Unexpected: we somehow stored numeric Shipway id — investigate that push path |

---

## Run this FIRST

**Query A** (find by AWB `11633336564716`).

That is the fastest proof that:

1. The shipment exists in our DB, and  
2. AWB fallback would have found it when `shipway_order_id = '296449'` failed.

Then run **B4** (exact current webhook lookup) to confirm zero rows for `296449`, and **C** to see the linked Cureka `ORD…` order.

---

## Interpretation checklist (after you run)

- [ ] AWB row exists? → AWB fallback can fix this webhook  
- [ ] `shipway_order_id` on that row is `ORD…` not `296449`? → confirms mismatch  
- [ ] `296449` appears in any column? → if only nowhere, we never persisted Shipway internal id  
- [ ] Duplicate AWBs? → design deterministic fallback  
- [ ] Many NULL AWBs? → also need order_number / persist Shipway internal id later  

No code or data changes were made for this document.
