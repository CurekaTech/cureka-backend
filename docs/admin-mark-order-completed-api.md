# Admin — Mark Order Completed (Delivered)

Force-mark an order as **Completed** in admin (`orderStatus = DELIVERED`) for testing / ops.

Also attempts:

1. **GoKwik** — emit `shipment.updated` so existing fulfillment listener pushes AWB status `DELIVERED` (when order is GoKwik-linked **and** shipment has AWB)
2. **UniCommerce** — **skipped for now** (not called; avoids UC merge conflicts with `development`)

---

## Endpoint

```http
PATCH /api/v1/admin/orders/:id/complete
Authorization: Bearer <admin JWT>
Content-Type: application/json
```

**Role:** `SUPER_ADMIN`

`:id` = order UUID **or** business `refId` / order number lookup supported by `findByIdOrRefId`.

### Body (optional)

```json
{
  "reason": "QA force complete for return-window testing"
}
```

| Field | Required | Notes |
|---|---|---|
| `reason` | no | Appended to order `notes` (default: `Admin marked completed`) |

---

## Behaviour

| Step | What happens |
|---|---|
| 1 | Reject if order is `CANCELLED` or `RTO` |
| 2 | Set `orderStatus = DELIVERED`, set `deliveredAt` once |
| 3 | COD + unpaid → `paymentStatus = PAID` (same as Shipway deliver) |
| 4 | All local shipments for the order → `shipmentStatus = DELIVERED` |
| 5 | Emit `SHIPMENT_UPDATED` per shipment → GoKwik AWB update queue |
| 6 | UniCommerce — skipped |

Idempotent if already `DELIVERED` (still re-emits GoKwik notify when shipments exist).

---

## Example

```bash
curl -X PATCH "https://<api-host>/api/v1/admin/orders/ORD20260911001/complete" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Testing returns eligibility"}'
```

### Response `data` (shape)

Same as `GET /admin/orders/:id`, plus:

```json
{
  "integrations": {
    "gokwik": {
      "notified": true,
      "note": "SHIPMENT_UPDATED emitted — GoKwik AWB status push queued when order is GoKwik-linked and AWB exists"
    },
    "unicommerce": {
      "attempted": false,
      "successful": false,
      "method": "skipped",
      "message": "UniCommerce delivered sync disabled for now"
    }
  }
}
```

---

## Admin panel

- Button: **Mark completed** (testing / ops)
- Call `PATCH /admin/orders/{id}/complete`
- Show toast from API message; optionally show `integrations.gokwik` in a debug panel
- Hide / disable for `CANCELLED` and `RTO`
- List filter “Completed” already uses `?status=DELIVERED`

---

## Limits / notes

- Without AWB, Cureka still becomes `DELIVERED`, but **GoKwik AWB update is skipped**
- UniCommerce is **not** updated by this API yet
- This does **not** call Shipway; it only updates Cureka + outbound GoKwik notify
- Prefer real Shipway deliver webhooks in production; this API is mainly for **testing** flows (returns, BoB, admin UI, etc.)
