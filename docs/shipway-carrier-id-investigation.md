# Shipway `carrier_id` investigation + minimal fix

**Date:** 2026-08-26  
**Scope:** Primary `/api/v2orders` push failure (`carrier_id does not exist.`)  
**Out of scope (until push works):** webhook AWB fallback, schema changes  

---

## 1. Primary root cause

Shipway push payload included an invalid / empty `carrier_id` (logged as `null`). Shipway OMS rejected `POST /api/v2orders` with message `carrier_id does not exist.` Cureka wrapped that message in `BadRequestException`, so no row was inserted into `public.shipments`.

Intended product behavior (already documented in config):

> Optional Carrier ID… When empty, Shipway will auto-select based on serviceability.

The bug was that we still **attached** `carrier_id` to the push object even when unset/invalid, which can serialize as JSON `null` (`NaN` → `null` via `JSON.stringify`) or confuse Shipway when present as null.

---

## 2. Exact source of `carrier_id`

| Source | Used? |
| --- | --- |
| Env `SHIPWAY_CARRIER_ID` → `shipway.carrierId` (`apps/api/config/shipway.config.ts`) | **Yes — only source** |
| Request / GoKwik / order payload | No |
| DB / courier master / warehouse table | No |
| Serviceability / recommendation call at push time | No (not wired into push) |
| Hardcoded default | No |

Flow:

```text
kickoffFulfillment
→ pushOrderToShipwaySafely
→ ShippingService.pushOrderToShipway
→ buildPushOrderPayload
     carrierId = configService.get('shipway.carrierId')  // was always assigned
→ ShipwayService.pushOrder
→ JSON.stringify(payload) → POST {SHIPWAY_BASE_URL}/api/v2orders
```

There is **no** pre-push carrier selection UI/rule. Optional env only.

`ShipwayService.getCarriers()` (`GET /api/carriers`) exists but was **never** called during order push.

---

## 3. Why `carrier_id` becomes null / invalid

1. `.env` has `SHIPWAY_CARRIER_ID=` (empty) — common in `.env.example`.
2. Old config: empty → `undefined`; invalid non-empty → `parseInt` → **`NaN`**.
3. Old payload always set `carrier_id: carrierId`.
4. Log summarizer used `payload.carrier_id ?? null` → logs always showed `null` when unset.
5. `JSON.stringify({ carrier_id: NaN })` → **`"carrier_id": null`** in the real HTTP body.
6. Even `undefined` on the object is unsafe to rely on; classic `/api/track` already omitted unset `carrier_id` — push did not.

Not specific to GoKwik COD — any order hitting Shipway push with empty/invalid env hit the same error (matches multi-order logs).

---

## 4. Error originates from: **Shipway**, rethrown by Cureka

Not Cureka validation. `validateShipwayPayload()` does **not** check `carrier_id`.

Exact path:

```ts
// shipway.service.ts — HTTP OK returns body as-is
return data;

// shipping.service.ts
if (!response.success) {
  throw new BadRequestException(response.message || 'Shipway rejected order push');
}
```

So:

- HTTP: typically **200** with `success: false` (or falsy) and `message: "carrier_id does not exist."`
- Exception type `BadRequestException` is **ours**, text is **Shipway’s**.

(If HTTP non-2xx, `ShipwayService` throws `ServiceUnavailableException` instead — not what the logs showed.)

---

## 5. Actual final `/api/v2orders` payload structure

Built fields (PII redacted in logs):

| Field | Source |
| --- | --- |
| `order_id` | `orders.order_number` (`ORD…`) |
| `payment_type` | `C` for COD, `P` for prepaid |
| `products[]` | order line items |
| `shipping_*` / `billing_*` | order address |
| `order_total` / `discount` / `shipping` | order money fields |
| `order_weight` / `box_*` | variant dims or `SHIPWAY_DEFAULT_*` |
| `warehouse_id` / `return_warehouse_id` | `SHIPWAY_WAREHOUSE_ID` / return env |
| `carrier_id` | **was always set from env; now only if valid positive int** |
| `email` / `order_date` | order user email / placed_at |

**Before fix (bad):** body could contain `"carrier_id": null` (or an invalid numeric id).  
**After fix (intended):** key **omitted** when `SHIPWAY_CARRIER_ID` is empty/invalid.

---

## 6. Should `carrier_id` be omitted or populated?

**Omit when unset** (OPTION A) — matches `shipway.config.ts` comment and classic track helper pattern.

Populate **only** when ops sets a **known-valid** Shipway carrier id in `SHIPWAY_CARRIER_ID` (from Shipway panel or `GET /api/carriers`).

Do **not** hardcode a random id.

---

## 7. Correct source for a valid `carrier_id`

1. Prefer leave empty → Shipway auto-select.  
2. If account requires a forced courier: call / use Shipway `GET /api/carriers` (`ShipwayService.getCarriers()`), pick active carrier id for the account, set `SHIPWAY_CARRIER_ID=<id>`, restart.  
3. No in-repo courier master table.

---

## 8. Minimal code changes made

1. **`buildPushOrderPayload`** — only assign `carrier_id` when `resolveOptionalCarrierId()` returns a positive finite int.  
2. **`ShipwayService.pushOrder`** — delete invalid/null `carrier_id` before `JSON.stringify` (defense in depth) + sanitized outbound log.  
3. **`shipway.config.ts`** — parse env safely (no `NaN`).  
4. **Push logs** — `carrierIdPresent`, `carrierId`, `warehouseId`.  
5. **`.env.example`** — clarify optional carrier id.

**Not changed:** webhook logic, AWB fallback, DB schema, GoKwik/UniCommerce flows.

---

## 9. Files changed

- `modules/shipping/services/shipping.service.ts`
- `modules/shipping/services/shipway.service.ts`
- `apps/api/config/shipway.config.ts`
- `.env.example`
- `docs/shipway-carrier-id-investigation.md` (this file)

---

## 10. Build / test result

```text
npx tsc -p apps/api/tsconfig.app.json --noEmit  → exit 0
```

**Not production-verified.** Fix is only confirmed after a fresh GoKwik COD order creates a `public.shipments` row.

---

## 11. Deploy / restart

1. Deploy this backend build (or restart local API so Nest reloads config + code).  
2. Confirm env: `SHIPWAY_CARRIER_ID` empty **or** set to a valid Shipway carrier id (not `null` / garbage).  
3. Confirm `SHIPWAY_EMAIL`, `SHIPWAY_LICENSE_KEY`, `SHIPWAY_BASE_URL`, and ideally `SHIPWAY_WAREHOUSE_ID` are set for label mode.  
4. **Do not** manually INSERT into `public.shipments`.

---

## 12. Fresh-order test instructions (manual)

1. Place a **new** GoKwik COD checkout (do not reuse `ORD368251938039`).  
2. Note the new `ORD…` order number.  
3. In API logs, search for that order number and confirm sequence:

```text
[FULFILLMENT] Calling Shipway synchronously
[Shipway] Push payload ready — carrierIdPresent: false (if env empty)
[Shipway] POST /api/v2orders — sanitized outbound body
[Shipway] API response … ok / success
Shipment saved after Shipway push
[FULFILLMENT] Shipway synchronous push finished  (shipmentId not null)
```

Must **not** see: `carrier_id does not exist.`

If push still fails with the same message after omit → set a real id from `GET /api/carriers` into `SHIPWAY_CARRIER_ID` and retry another fresh order (account may require forced carrier).

---

## 13. Cloud SQL verification (READ-ONLY)

```sql
SELECT
  s.id,
  s.order_id,
  s.order_number,
  s.shipway_order_id,
  s.shipment_id,
  s.awb_number,
  s.courier_name,
  s.courier_id,
  s.shipment_status,
  s.shipway_raw_status,
  s.pushed_at,
  s.created_at
FROM public.shipments s
WHERE s.order_number = '<NEW_ORDER_NUMBER>'
  AND s.deleted_at IS NULL;
```

**Expected:** ≥1 row; `shipway_order_id` = same `ORD…`; `pushed_at` set; AWB/courier may be null until carrier assignment.

---

## 14. OMS verification

After DB row exists, confirm Shipway OMS finds the merchant order id (same as `shipway_order_id`):

```text
GET {SHIPWAY_BASE_URL}/api/getorders?orderid=<NEW_ORD>
Basic Auth: SHIPWAY_EMAIL / SHIPWAY_LICENSE_KEY
```

**Expected:** not `"No order found"`. Returned AWB / courier / shipment id should align with `public.shipments` when present.

---

## 15. Webhook verification plan (only after 12–14 succeed)

**Do not change webhook code yet.**

1. Trigger a real Shipway status for the **new** order (panel or live scan).  
2. Confirm `POST /api/v1/shipments/webhook` → 200.  
3. Confirm lookup finds local row (`shipway_order_id = ORD…` if webhook sends merchant id).  
4. Confirm `shipments.shipment_status` / `shipway_raw_status` update; `shipment_events` row; `orders.order_status` mapping (`INT`→shipped path, `OFD`/`OOD`→out for delivery, `DEL`→delivered).  
5. If webhook still sends numeric Shipway internal id only → then revisit AWB fallback (separate task).

---

## 16. UI verification

After Shipway status exists locally or via live resolve: shipment UI should leave permanent “Order Confirmed” and follow Dispatched → Out for Delivery → Delivered per mapped status.

---

## Secondary: classic tracking credentials

| Item | Detail |
| --- | --- |
| Endpoint | `{SHIPWAY_TRACKING_BASE_URL}` default `https://shipway.in` — e.g. `POST /api/getOrderShipmentDetails`, `POST /api/track` |
| Credential type | JSON body `username` + `password` |
| Config keys used | `SHIPWAY_EMAIL` → username; `SHIPWAY_LICENSE_KEY` → password |
| OMS push/auth | Same email/license as **HTTP Basic** on `{SHIPWAY_BASE_URL}` (`https://app.shipway.com`) |

`Invalid Username or Password` on classic means classic host rejects that username/password pair (mismatch, classic-only credentials, or wrong tracking host). **Separate** from `carrier_id` on `/api/v2orders`. OMS can work while classic fails.

Do not print secret values. Fix later by aligning classic credentials / `SHIPWAY_TRACKING_BASE_URL` with Shipway panel docs.

---

## Checkpoint

```text
Primary root cause:
  Invalid/empty carrier_id still sent on POST /api/v2orders; Shipway rejects with
  "carrier_id does not exist." → no public.shipments row.

Error originates from:
  Shipway API response message; Cureka rethrows as BadRequestException when success is falsy.

Current carrier_id source:
  Env SHIPWAY_CARRIER_ID → shipway.carrierId only (optional).

Why carrier_id fails:
  Empty/invalid env produced null/NaN/absent-but-assigned field; Shipway rejects null/invalid id.
  Systemic for all pushes with that env, not GoKwik-specific.

Correct carrier_id behavior:
  Omit field when unset → Shipway auto-select.
  Set SHIPWAY_CARRIER_ID only to a valid id from Shipway (GET /api/carriers / panel).

Minimal fix applied:
  Omit invalid carrier_id in buildPushOrderPayload + pushOrder sanitize; safe env parse; better logs.

Build status:
  tsc apps/api — PASS

Ready for fresh GoKwik COD order test: YES

Classic tracking credential issue:
  Separate — classic shipway.in username/password (SHIPWAY_EMAIL / SHIPWAY_LICENSE_KEY)
  returns Invalid Username or Password; does not block this carrier_id fix.

Next manual action for me:
  Deploy/restart API → place a NEW GoKwik COD order → confirm Shipway push success logs
  → run shipments SQL for the new ORD… → then OMS → then webhook/UI.
```
