# Storefront frontend handoff — cancellation and returns

Paste this into the **storefront Cursor agent**. Implement against these backend
contracts only. Do not call Unicommerce, Shipway, or refund providers from the
browser. Eligibility must come from the server — do not guess from a single
`orderStatus`.

Base path: `/api/v1`
Customer auth: existing session cookie + verified user (same as current
`/orders` and `/returns`).

## 1. Order list and detail

`GET /orders`
`GET /orders/:id`

Existing order fields are preserved, including `cancelReason` and status
timestamps. New fields on list and detail:

```json
{
  "actions": {
    "canCancel": true,
    "cancelBlockedReason": null,
    "canReturn": false,
    "returnBlockedReason": "Returns are available after the order is delivered",
    "canWithdrawReturn": false
  },
  "cancellation": {
    "status": "NONE",
    "unicommerceStatus": "NOT_STARTED",
    "shipwayStatus": "NOT_STARTED",
    "reason": null,
    "requestedAt": null,
    "lastAttemptAt": null,
    "attemptCount": 0,
    "lastError": null
  }
}
```

Detail also includes:

```json
{
  "returns": [
    { "id": "uuid", "returnNumber": "RTN…", "status": "REQUESTED", "resolution": "REFUND", "createdAt": "…" }
  ],
  "fulfillmentEvents": [
    {
      "id": "uuid",
      "eventType": "CANCELLATION_REQUESTED",
      "message": "Need to change address",
      "createdAt": "…",
      "isCustomerVisible": true
    }
  ]
}
```

Customer timelines only include `isCustomerVisible` events (internal metadata
is omitted).

**Buttons:**

- Show Cancel when `actions.canCancel === true`. Disable otherwise; tooltip /
  helper = `cancelBlockedReason`.
- Show Return when `actions.canReturn === true`. For item/qty/window use
  `GET /returns/eligibility/:orderId` (unchanged, authoritative per item).
- Show withdraw-return on the return record when `canCancel` on that return
  detail is true (`GET /returns/:id`), not from raw order status.

Invalidate order queries after cancel/return mutations. Do not keep a stale
“Cancel” button from a cached `CONFIRMED` status.

## 2. Cancel order

`PATCH /orders/:id/cancel`
Body: `{ "reason": "at least 3 characters" }`

Response is the order payload above. HTTP 200 means the **request was
accepted**, not that Uniware/Shipway stopped.

Map `cancellation.status`:

| status | Customer copy |
| --- | --- |
| `CONFIRMED` | Order cancelled. Refunds, if any, follow the existing refund request / COD rules and are not instant. |
| `PROCESSING` | We are stopping fulfilment. You will not be able to cancel again. Package may still move until this completes. |
| `REQUIRES_ATTENTION` | We could not fully stop fulfilment. Show a support CTA. Do not say “cancelled”. |
| `REJECTED` | Too late to cancel (already dispatched). |

409: already cancelled or already processing — refresh the order.
400: not cancellable (shipped). Hide the button using `actions`.

Do not submit twice. Disable the button immediately on click; rely on 409 if
the user double-posts.

## 3. Return request

Unchanged create APIs:

- `POST /returns`
- `POST /returns/with-evidence` (multipart)
- `GET /returns/eligibility/:orderId`
- `GET /returns/reasons/RETURN` and `/REPLACEMENT`

Submitting a return never refunds. Copy must say the request is under review.

`GET /returns` now honours `search` (return number / order number) along with
`page` / `limit`.

`GET /returns/:id` pickup/tracking:

- No `tracking.reverseAwbNumber` → do not say “pickup booked”, even if status
  is `APPROVED`.
- `PICKUP_SCHEDULED` + AWB → show courier / tracking URL from `tracking`.
- `canCancel` true → allow withdraw via `POST /returns/:id/cancel`.

Withdraw (`POST /returns/:id/cancel`):

- Allowed through `APPROVED` and, when the backend permits, until pickup is
  collected (`PICKUP_SCHEDULED` / `PICKUP_ATTEMPTED`).
- 409 if a live pickup could not be cancelled: “Pickup is already booked;
  contact support.” Do not mark the UI as withdrawn.

## 4. Refund display

Use existing refund fields on the order (`refund`) and return (`refund`,
`codRefund`). A pending cancellation does not mean money was returned.
COD unpaid cancel has nothing to refund. Do not route a historical payment
through a different checkout provider.

## 5. Cache / errors

- After cancel or return, refetch `GET /orders/:id` and `GET /returns`.
- 401: existing session handling.
- Never surface provider names as if the customer should retry Uniware.

## 6. Acceptance criteria

- [ ] Cancel button uses `actions.canCancel`, not a local status guess.
- [ ] After cancel, UI distinguishes processing vs confirmed vs needs support.
- [ ] History/detail shows the cancellation reason and customer-visible events.
- [ ] Return submit appears in `GET /returns` and on the order’s `returns[]`.
- [ ] Approved return without AWB is not shown as pickup booked.
- [ ] Duplicate cancel/return submits are handled (disabled button + 409).
- [ ] No frontend integration with Shipway or Unicommerce.
