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

### 1. Classic Shipway (`status_feed`) — documented on shipway.in

```json
{
  "hash": "<md5(SHIPWAY_EMAIL:SHIPWAY_LICENSE_KEY)>",
  "status_feed": [
    { "order_id": "CUR12345", "current_status": "OOD" }
  ]
}
```

- `order_id` must match `shipments.shipway_order_id` (Cureka order number).
- `current_status` is a Shipway code (`INT`, `OOD`, `DEL`, …) mapped via `ShipwayStatusMapper`.
- Auth: body `hash` = `md5(email:license_key)` using the same credentials as API calls.

### 2. Single-event (HMAC)

```json
{
  "event_id": "optional-unique-id",
  "order_id": "CUR12345",
  "status": "Out for Delivery",
  "status_date": "2026-08-17T10:00:00.000Z",
  "awb_number": "…",
  "message": "…"
}
```

- Auth: HMAC-SHA256 hex of the **raw body**, sent as `x-webhook-signature` or `x-shipway-signature`.
- Secret: `SHIPWAY_WEBHOOK_SECRET`.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `SHIPWAY_EMAIL` | Shipway username (API + classic webhook hash) |
| `SHIPWAY_LICENSE_KEY` | Shipway license key (API + classic webhook hash) |
| `SHIPWAY_WEBHOOK_SECRET` | HMAC secret for single-event webhooks |
| `SHIPWAY_WEBHOOK_FRESH_MS` | Prefer local DB over live GET when last sync is fresher than this (default `900000` = 15m) |

### Production (fail-closed)

- Classic `status_feed`: `SHIPWAY_EMAIL` + `SHIPWAY_LICENSE_KEY` **required** (misconfigured → 503).
- Single-event HMAC: `SHIPWAY_WEBHOOK_SECRET` **required** (misconfigured → 503).
- Non-production may skip verification when secrets are empty (logged warning only).

## Behaviour notes

- Updates `shipments.shipment_status` + `shipway_raw_status` and appends `shipment_events`.
- Duplicate events (same `event_id` or AWB+status+timestamp+message fingerprint) are skipped.
- Out-of-order events (older `status_date` than the latest recorded event) are skipped.
- Unknown Shipway statuses are recorded as events but do not overwrite a known `shipment_status`.
- Order Details prefers the DB when the local row is webhook/sync-fresh; otherwise live Shipway GET remains the fallback.

## Dashboard checklist

1. Set webhook URL to `…/api/v1/shipments/webhook` (existing path — not `/api/v1/webhooks/shipway`).
2. Confirm credentials match env (`SHIPWAY_EMAIL` / `SHIPWAY_LICENSE_KEY`).
3. If using HMAC single-event webhooks, set `SHIPWAY_WEBHOOK_SECRET` to the shared secret from Shipway.
4. Send a test status change and confirm a `shipment_events` row + updated `shipments` row.
