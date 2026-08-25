# Shipway webhook configuration

Cureka already exposes a Shipway webhook. Harden and configure it — do not add a second URL.

## Endpoint

| Environment | URL |
| --- | --- |
| Local | `POST http://localhost:<port>/api/v1/shipments/webhook` |
| Beta | `POST https://<beta-api-host>/api/v1/shipments/webhook` |
| Production | `POST https://<prod-api-host>/api/v1/shipments/webhook` |

Ask Shipway support (`contact@shipway.in`) to register this callback URL if it is not already set in the Shipway dashboard.

## Supported payload shapes

### Preferred — Shipway panel / carrier sample

This is the format we follow for live status updates:

```json
{
  "store_code": "1",
  "awbno": "12345678901234",
  "company_id": "99999",
  "carrier": "DummyCarrier",
  "scans_current_status": "Delivered to consignee",
  "scans_current_status_time": "2025-01-04 15:00:00",
  "api_input": {
    "awbno": "12345678901234",
    "carrier": "DummyCarrier",
    "carrier_id": "99",
    "current_status": "DEL",
    "current_status_desc": "Delivered",
    "status_time": "2025-01-04 15:00:00",
    "order_id": "99999999",
    "tracking_url": "https://dummytracking.com/track/12345678901234",
    "scans": {
      "0": { "location": "…", "time": "…", "status": "Delivered to consignee" }
    }
  },
  "current_status": "DEL",
  "status_time": "2025-01-04 15:00:00",
  "order_id": "99999999"
}
```

- `order_id` must match `shipments.shipway_order_id` (Cureka order number).
- `current_status` (top-level or `api_input`) drives the order status update.
- `awbno` / `carrier` / `status_time` / `api_input.scans` are stored when present.

### Also accepted

Classic docs (API Version 1.1.2):

```json
{
  "hash": "<md5(SHIPWAY_EMAIL:SHIPWAY_LICENSE_KEY)>",
  "status_feed": [
    { "order_id": "CUR12345", "current_status": "OOD" }
  ]
}
```

Minimal panel ping: `{ "order_id": "99999999", "current_status": "DEL" }` — dummy ids are acknowledged with HTTP 200 (`notFound`).

## Four-step order status mapping

| Step | Label | When Shipway sends | Stored on order |
| --- | --- | --- | --- |
| 1 | Order Confirmed | Confirmed / Pending / Processing / SCH | `CONFIRMED` / `PROCESSING` |
| 2 | Dispatched | INT / In Transit / Picked Up / PKP | `SHIPPED` |
| 3 | Out for Delivery | OOD / OFD / Out for Delivery | `OUT_FOR_DELIVERY` |
| 4 | Delivered | DEL / Delivered / Delivered to consignee | `DELIVERED` |

## Environment variables

| Variable | Purpose |
| --- | --- |
| `SHIPWAY_EMAIL` | Shipway username (API + classic webhook hash) |
| `SHIPWAY_LICENSE_KEY` | Shipway license key (API + classic webhook hash) |
| `SHIPWAY_WEBHOOK_SECRET` | HMAC secret for single-event webhooks |
| `SHIPWAY_WEBHOOK_FRESH_MS` | Prefer local DB over live GET when last sync is fresher than this (default `900000` = 15m) |

### Auth

- `status_feed` + `hash`: `md5(SHIPWAY_EMAIL:SHIPWAY_LICENSE_KEY)` required.
- HMAC header present: `SHIPWAY_WEBHOOK_SECRET` required (misconfigured → 503).
- Panel sample with no hash/HMAC: accepted.

## Behaviour notes

- Updates `shipments.shipment_status` + `shipway_raw_status`, syncs `orders.order_status`, appends `shipment_events` (primary status + optional scans).
- Duplicate events (same fingerprint) are skipped.
- Out-of-order events (older `status_time` / `status_date` than the latest recorded event) are skipped.
- Unknown Shipway statuses are recorded as events but do not overwrite a known `shipment_status`.

## Dashboard checklist

1. Set webhook URL to `…/api/v1/shipments/webhook`.
2. Confirm credentials match env (`SHIPWAY_EMAIL` / `SHIPWAY_LICENSE_KEY`).
3. If using HMAC single-event webhooks, set `SHIPWAY_WEBHOOK_SECRET`.
4. Send a test status change and confirm a `shipment_events` row + updated `orders.order_status`.
