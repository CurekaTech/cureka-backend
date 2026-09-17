# Admin frontend handoff — cancellation and returns

Paste this into the **admin Cursor agent**. Implement against these backend
contracts only. Do not invent APIs. Do not call Unicommerce or Shipway from the
browser.

Base path: `/api/v1`
Admin auth: `Authorization: Bearer <JWT>`
Role for the new history/cancel-retry surfaces: `SUPER_ADMIN` (same as existing
admin orders). Return approve/reject/QC remain on `/admin/returns` with the
existing return permissions.

## 1. History page (this was the missing backend contract)

`GET /admin/order-history`

Query:

| Param | Type | Notes |
| --- | --- | --- |
| `page`, `limit` | number | Existing pagination |
| `search` | string | Order number, refId, customer name/email/phone |
| `requestType` | `CANCELLATION` \| `RETURN` | Omit for both |
| `workflowStatus` | string | Cancellation: `PROCESSING`, `CONFIRMED`, `REQUIRES_ATTENTION`, `HISTORICAL_UNVERIFIED`, … Return: `REQUESTED`, `APPROVED`, `PICKUP_SCHEDULED`, … |
| `fromDate`, `toDate` | ISO date | Filters `requestedAt` |
| `pendingExternalSync` | boolean | In-flight / failed external steps |
| `requiresAttention` | boolean | Ops queue |
| `unverifiedOnly` | boolean | Historical local cancellations never synced |

Example response item:

```json
{
  "recordType": "CANCELLATION",
  "id": "uuid",
  "orderId": "uuid",
  "orderNumber": "ORD…",
  "customerId": "uuid",
  "customerName": "Ada Lovelace",
  "customerEmail": "a@example.com",
  "customerMobile": "9876543210",
  "workflowStatus": "PROCESSING",
  "unicommerceStatus": "PENDING",
  "shipwayStatus": "NOT_REQUIRED",
  "lastError": null,
  "reason": "Need to change address",
  "requestedAt": "2026-09-14T10:00:00.000Z",
  "attemptCount": 1,
  "reverseAwb": null
}
```

Return rows use `recordType: "RETURN"`, `id` = return request id,
`reverseAwb` when booked.

**Do not** show `workflowStatus=CONFIRMED` as “courier cancelled” unless
`unicommerceStatus` / `shipwayStatus` are `CONFIRMED` or `NOT_REQUIRED`.
`HISTORICAL_UNVERIFIED` means “local cancel only — review, do not assume the
warehouse stopped.”

Empty state: “No cancellation or return requests match these filters.”
Loading: skeleton the table, do not invent rows.

## 2. Order detail (enriched, compatible)

`GET /admin/orders/:id`

Existing order payload is preserved (`cancelReason`, timestamps, shipment, …).
New fields:

```json
{
  "cancellation": {
    "status": "PROCESSING",
    "unicommerceStatus": "PENDING",
    "shipwayStatus": "NOT_REQUIRED",
    "reason": "…",
    "requestedAt": "…",
    "lastAttemptAt": "…",
    "attemptCount": 1,
    "lastError": null
  },
  "actions": {
    "canCancel": false,
    "cancelBlockedReason": "A cancellation request is already being processed",
    "canReturn": false,
    "returnBlockedReason": "Returns are available after the order is delivered",
    "canWithdrawReturn": false
  },
  "returns": [
    { "id": "uuid", "returnNumber": "RTN…", "status": "REQUESTED", "resolution": "REFUND", "createdAt": "…" }
  ],
  "fulfillmentEvents": [
    {
      "id": "uuid",
      "requestType": "CANCELLATION",
      "eventType": "CANCELLATION_REQUESTED",
      "fromStatus": null,
      "toStatus": "PROCESSING",
      "message": "Need to change address",
      "actorType": "ADMIN",
      "createdAt": "…",
      "isCustomerVisible": true,
      "metadata": {}
    }
  ]
}
```

Render `fulfillmentEvents` as the timeline. Do not drop `cancelReason`.

`GET /admin/orders` list rows now also include `cancellation` and `actions`
summaries.

## 3. Cancel an order

`PATCH /admin/orders/:id/cancel`
Body: `{ "reason": "string, min 3 chars" }`

Success message: **Cancellation request accepted** (not proof of warehouse
cancel).

Read `cancellation.status` on the response:

| status | UI |
| --- | --- |
| `CONFIRMED` | Cancelled. External steps were not required or both settled. |
| `PROCESSING` | “Stopping fulfilment…” Disable cancel button. |
| `REQUIRES_ATTENTION` | Show `lastError`. Offer retry if eligible. Do **not** show a fake “Mark cancelled” that skips providers. |

409: already cancelled / already processing.
400: already shipped / dispatched.

## 4. Retry external cancellation

`POST /admin/orders/:id/cancellation/retry`

Allowed when `cancellation.status` is `PROCESSING`, `REQUIRES_ATTENTION`, or
`HISTORICAL_UNVERIFIED`. This re-queues Unicommerce/Shipway cancel. It does
**not** fabricate success.

There is no unrestricted “mark cancelled in Uniware” API.

## 5. Returns (existing APIs, stricter pickup meaning)

List/detail unchanged paths:

- `GET /admin/returns`
- `GET /admin/returns/:id`
- `POST /admin/returns/:id/approve`
- `POST /admin/returns/:id/reject`
- `POST /admin/returns/:id/pickup` (retry / schedule)
- `POST /admin/returns/:id/receive`
- `POST /admin/returns/:id/qc`
- `POST /admin/returns/:id/refund` — creates a refund **request**, not a payout

On pickup objects, new first-class fields:

- `unicommerceReversePickupCode`
- `shipwayOrderId`
- `unicommerceSyncStatus`
- `shipwayBookingStatus`
- `failureReason`
- `reverseAwbNumber`

**Labels:**

- Unicommerce reverse pickup created + no reverse AWB → “OMS return recorded — courier not booked”
- `shipwayBookingStatus=CONFIRMED` or `reverseAwbNumber` set → “Pickup booked”
- `shipwayBookingStatus=UNCERTAIN` → “Booking uncertain — do not create another pickup blindly”
- `APPROVED` after failed auto-schedule → show Retry pickup. Do not show “in transit”

Approve still does not refund.

## 6. Permissions and errors

- History / order cancel / retry: Super Admin JWT, same as `/admin/orders`.
- Returns: existing `returns.*` permissions.
- Never display tokens, license keys, or raw provider payloads.
- 401/403: existing admin session handling.
- 409 on pickup already booked: tell ops the AWB is live.

## 7. Acceptance criteria

- [ ] History page loads new cancellation and return requests without a frontend-only mock.
- [ ] Filters/pagination work from the query contract above.
- [ ] Cancelled order detail shows reason, workflow, Unicommerce sync, Shipway sync, AWB, last error, timeline.
- [ ] `PROCESSING` is not shown as fully cancelled.
- [ ] `REQUIRES_ATTENTION` is visible and retryable.
- [ ] `HISTORICAL_UNVERIFIED` is labelled as unverified local history.
- [ ] Return approval without reverse AWB is not labelled pickup booked.
- [ ] Refund button remains the existing post-QC refund-request action.
- [ ] No admin control invents external success.
