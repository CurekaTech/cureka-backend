# Shipway checkpoint — 2026-08-25

## Final conclusion

Test order: `ORD368251938039` (COD / CONFIRMED / GoKwik).

| Step | Result |
| --- | --- |
| Cureka order create | ✅ |
| UniCommerce push | ✅ `CREATED` |
| Shipway push | ❌ `carrier_id does not exist.` |
| `public.shipments` | 0 rows |
| OMS getorders for ORD… | HTTP 200, `No order found` |
| Webhook | Receives events but cannot update (no local shipment) |
| UI | Stays `Order Confirmed` (expected) |

## Primary root cause

Shipway push **is invoked** (not skipped) and **fails** because Shipway rejects the request:

```text
BadRequestException: carrier_id does not exist.
```

Seen for `ORD368251938039` and multiple other GoKwik orders at `shipway-push`.

Failure path:

```text
kickoffFulfillment (source: gokwik-place-order)
→ pushOrderToShipwaySafely
→ ShippingService.pushOrderToShipway
→ ShipwayService.pushOrder
→ POST /api/v2orders
→ rejected (carrier_id)
→ no INSERT into public.shipments
```

Logs showed `carrier_id: null` in the push payload summary.

## Secondary issue (do not mix with primary fix)

Classic Shipway tracking returns `Invalid Username or Password`.  
OMS is reachable but has no order because push never succeeded.

## Tomorrow — first task

**Do not** debug webhook / AWB fallback first.

1. Investigate how `carrier_id` is selected in `buildPushOrderPayload` / push.
2. Confirm whether error is from Cureka validation or Shipway API.
3. Decide: omit field when unset vs populate from valid Shipway carrier source.
4. Minimal fix → fresh test order → confirm `public.shipments` row → then tracking/webhook.

Prompt saved for next session: see chat “Investigate and fix the Shipway order creation failure…” or re-open this checkpoint and run that investigation.

## Related docs

- `docs/shipway-persistence-location.md`
- `docs/shipway-webhook-lookup-investigation.md`
- `docs/shipway-db-verification.md`
