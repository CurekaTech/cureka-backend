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

## Follow-up (2026-08-26)

Minimal fix applied: omit invalid/empty `carrier_id` on push.  
See `docs/shipway-carrier-id-investigation.md`.

**Still required:** deploy/restart → **fresh** GoKwik COD order → confirm `public.shipments` row.  
Do not treat as fixed until that passes. Webhook/AWB fallback still deferred.

## Related docs

- `docs/shipway-persistence-location.md`
- `docs/shipway-webhook-lookup-investigation.md`
- `docs/shipway-db-verification.md`
