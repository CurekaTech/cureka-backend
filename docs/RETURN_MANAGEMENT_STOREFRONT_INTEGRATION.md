# Return Management — Storefront Integration

Contract for the Cureka storefront (web and app). Every endpoint and field below is
implemented; nothing here is aspirational.

- Base path: `/api/v1`
- Auth: the existing session cookie. All endpoints require a **verified** user
  (`SessionCookieGuard` + `VerifiedUserGuard`) — the same guards the order screens
  already use. No extra header is needed.
- Every response is wrapped: `{ success, data, message, timestamp }`. Only `data`
  is documented below.
- Errors are `{ success: false, code, message, timestamp }`. **Branch on `code`.**

## The one rule to build the UI around

Submitting a return does **not** refund the customer. It creates a request that a
human reviews. Copy must never say "your money will be refunded" at submission
time. The backend returns the exact safe wording to display:

> "Your return request has been submitted and is under review."

Show a refund amount only as an **estimate**, clearly labelled, and only after the
customer sees that approval is required.

---

## 1. Flow

```
Order detail
  └─ "Return / Replace" button
       └─ GET /returns/eligibility/:orderId        → which items, how many, until when
            └─ item + quantity picker
                 └─ GET /returns/reasons/return    → reason list, evidence rules
                      └─ condition checkboxes + optional photos
                           └─ POST /returns  or  POST /returns/with-evidence
                                └─ "Under review" confirmation
```

---

## 2. Eligibility

```
GET /returns/eligibility/:orderId
GET /returns/eligibility/:orderId?expiredProductClaim=true
```

Call this before showing the return button. Do not decide eligibility on the
client from order status or delivery date — the server owns the rule.

```jsonc
{
  "orderId": "…", "orderNumber": "CUR2026000001",
  "orderStatus": "DELIVERED", "isRto": false,
  "hasEligibleItems": true,
  "paymentMethod": "COD",
  "codRefund": {
    "required": true,
    "allowedMethods": ["BANK_ACCOUNT", "WALLET"],
    "defaultMethod": "BANK_ACCOUNT",
    "walletEnabled": true,
    "message": "This order includes a cash-on-delivery amount. Choose bank transfer or Cureka Wallet for that portion."
  },
  "items": [
    {
      "orderItemId": "…", "sku": "SKU-1",
      "productName": "Vitamin C Serum", "variantName": "30ml",
      "orderedQuantity": 3,
      "committedQuantity": 1,       // already inside another return
      "availableQuantity": 2,       // ← the max on the stepper
      "unitPrice": "500.00",
      "canReturn": true, "canReplace": false, "canRequestRefund": true,
      "allowedResolutions": ["REFUND"],
      "deliveredAt": "2026-01-10T00:00:00.000Z",
      "returnWindowExpiresAt": "2026-01-17T00:00:00.000Z",
      "replacementWindowExpiresAt": null,
      "ineligibilityCode": null,
      "ineligibilityMessage": null
    }
  ]
}
```

- Hide the button entirely when `hasEligibleItems` is `false`.
- For a blocked item, render `ineligibilityMessage` verbatim — it is already
  written for customers.
- Cap the quantity stepper at `availableQuantity`. An item bought 3× with 1 already
  returned allows 2 more.
- `allowedResolutions` decides whether to offer Refund, Replacement, or both.
- Use `returnWindowExpiresAt` for a "N days left to return" countdown.

### The expired-product exception

If the customer says the product arrived expired, pass
`?expiredProductClaim=true`. That waives the **window** check only — a
non-returnable product stays non-returnable. Pair it with the reason whose code is
`EXPIRED_PRODUCT`; picking that reason at submission applies the same waiver
server-side.

---

## 3. Reasons

```
GET /returns/reasons/return
GET /returns/reasons/replacement
```

```jsonc
[
  {
    "id": "…", "refId": "REA00000012",
    "code": "DAMAGED_ON_ARRIVAL",
    "title": "Damaged on arrival",
    "description": "The item was broken or leaking when it arrived",
    "commentsRequired": true,
    "imagesRequired": true, "videoRequired": false,
    "minImages": 1, "maxImages": 5,
    "minVideos": 0, "maxVideos": 1,
    "pickupMode": "PICKUP_REQUIRED"
  }
]
```

Drive the form from these flags:

- `commentsRequired` → make the comment box mandatory, **minimum 10 characters**
  (the server rejects shorter with `RETURN_COMMENTS_REQUIRED`)
- `imagesRequired` / `minImages` → require at least that many photos
- `videoRequired` / `minVideos` → require a video
- `maxImages` / `maxVideos` → cap the picker
- `pickupMode` → when `NO_PICKUP_REQUIRED`, tell the customer they keep the item

Only customer-visible reasons are returned. Internal reason notes are never sent
to the storefront.

---

## 4. Submitting

### Without evidence

```
POST /returns
Content-Type: application/json
```

```jsonc
{
  "orderId": "uuid",
  "reasonId": "uuid or refId",
  "resolution": "REFUND",                  // or "REPLACEMENT"
  "items": [
    { "orderItemId": "uuid", "quantity": 1 },
    { "orderItemId": "uuid", "quantity": 2, "replacementVariantId": "uuid" }
  ],
  "customerComments": "The bottle was leaking inside the box.",
  "conditionDeclarations": {
    "unused": true,
    "originalPackaging": true,
    "allAccessoriesIncluded": true
  },
  "pickupAddress": {                        // optional — defaults to the delivery address
    "recipientName": "Asha Menon",
    "phoneNumber": "9876543210",
    "addressLine1": "12 MG Road",
    "addressLine2": "Apt 4B",
    "landmark": "Near the metro station",
    "city": "Bengaluru",
    "state": "Karnataka",
    "pincode": "560001"
  },
  "refundMethod": "BANK_ACCOUNT",           // required when eligibility.codRefund.required
  "bankDetails": {                          // required when refundMethod is BANK_ACCOUNT
    "accountHolderName": "Asha Menon",
    "accountNumber": "123456789012",
    "confirmAccountNumber": "123456789012",
    "ifsc": "HDFC0001234",
    "bankName": "HDFC Bank"
  }
}
```

`conditionDeclarations` is a free-form map of checkbox key → boolean. **Every entry
you send must be `true`**; any `false` is rejected with
`RETURN_CONDITIONS_NOT_CONFIRMED`. Send only the checkboxes you actually showed.

`replacementVariantId` is only meaningful when `resolution` is `REPLACEMENT`.

### With photos or video

```
POST /returns/with-evidence
Content-Type: multipart/form-data
```

| Form field | Contents |
| --- | --- |
| `data` | the entire JSON body above, as a string |
| `evidenceFile0`, `evidenceFile1`, … | the files, indexed from 0 |

Maximum **10** files per request (`RETURN_EVIDENCE_LIMIT_EXCEEDED`). Type is
derived from the file extension, so use real `.jpg` / `.png` / `.mp4` names.

```js
const form = new FormData();
form.append('data', JSON.stringify(payload));
files.forEach((file, i) => form.append(`evidenceFile${i}`, file));
```

### Response — read this carefully

```jsonc
{
  "returnRequestId": "…",
  "returnNumber": "RTNRET2026123456",
  "status": "REQUESTED",
  "message": "Your return request has been submitted and is under review."
}
```

There is deliberately **no refund id, no refund status and no promise of money**.
Show `message` as-is and route to the return detail screen.

---

## 5. Reading returns

```
GET /returns?page=1&limit=20
GET /returns/:id
```

`:id` accepts the uuid, the `refId` or the `returnNumber`.

```jsonc
{
  "id": "…",
  "returnNumber": "RET0000123",
  "orderId": "…",
  "orderNumber": "CUR2026000001",
  "status": "PICKUP_SCHEDULED",
  "displayStatus": "Pickup scheduled",
  "resolution": "REFUND",
  "reasonTitle": "Damaged on arrival",
  "customerComments": "The bottle arrived cracked",
  "estimatedRefundAmount": "900.00",
  "approvedRefundAmount": "900.00",
  "currency": "INR",
  "pickupRequired": true,
  "pickupAddress": {
    "recipientName": "Ada Lovelace",
    "phoneNumber": "9876543210",
    "addressLine1": "1 Street",
    "addressLine2": null,
    "landmark": null,
    "city": "Chennai",
    "state": "TN",
    "pincode": "600001"
  },
  "canCancel": false,
  "canSubmitAdditionalInformation": false,
  "informationRequestMessage": null,
  "outcomeMessage": null,
  "items": [
    {
      "id": "…",
      "orderItemId": "…",
      "sku": "SKU-1",
      "productName": "Vitamin C Serum",
      "variantName": "30ml",
      "quantity": 1,
      "unitPrice": "500.00",
      "refundableAmount": "500.00",
      "acceptedQuantity": null,
      "rejectedQuantity": null
    }
  ],
  "evidence": [{ "mediaType": "IMAGE", "file": { "url": "https://storage.googleapis.com/…" } }],
  "tracking": {
    "status": "SCHEDULED",
    "scheduledAt": "2026-01-16T10:00:00.000Z",
    "courierName": "Delhivery",
    "reverseAwbNumber": "SW123456789",
    "trackingUrl": "https://track.shipway.com/t/SW123456789",
    "pickedUpAt": null
  },
  "timeline": [
    {
      "id": "…",
      "fromStatus": null,
      "toStatus": "REQUESTED",
      "action": "CREATED",
      "comment": null,
      "createdAt": "2026-01-14T09:12:00.000Z"
    },
    {
      "id": "…",
      "fromStatus": "APPROVED",
      "toStatus": "PICKUP_SCHEDULED",
      "action": "PICKUP_SCHEDULED",
      "comment": null,
      "createdAt": "2026-01-15T11:00:05.000Z"
    }
  ],
  "refund": { "status": null, "amount": null, "message": null },
  "createdAt": "…"
}
```

Notes:

- **`displayStatus` is the string to render.** It is plain-language and written for
  customers. `status` is the machine value — use it for icons and logic, not copy.
- `timeline` here is a **filtered** projection. Internal notes, admin names,
  override justifications and QC rejection reasons are removed server-side. There
  is no way to reach them from a customer session.
- Evidence `url` values are **short-lived signed URLs**. Do not cache or persist
  them; re-fetch the detail when they expire.
- `refund` is `null` until an admin creates the refund. Its presence with status
  `REQUESTED` still does not mean money has moved — only `PROCESSED` does.
- `estimatedRefundAmount` is an estimate until QC. Label it as such. If part of the
  return fails inspection, the final amount will be lower.

---

## 6. Cancelling

```
POST /returns/:id/cancel
{ "comment": "Changed my mind" }        // comment is optional
```

Allowed while the status is `REQUESTED`, `UNDER_REVIEW`,
`ADDITIONAL_INFORMATION_REQUIRED` or `APPROVED` — that is, until operations commit
to a pickup. Use `canCancel` on the detail response instead of hard-coding that
list.

After a pickup is scheduled the customer must contact support; the endpoint
returns `RETURN_CANCELLATION_NOT_ALLOWED`.

Cancelling releases the reserved quantity, so the customer can start a fresh
request for the same item.

---

## 7. Replying to a request for more information

When the status is `ADDITIONAL_INFORMATION_REQUIRED`, the latest customer-visible
timeline entry carries what was asked for. Reply with:

```
POST /returns/:id/additional-information
{ "message": "Here is a clearer photo of the seal" }
```

or, with files:

```
POST /returns/:id/additional-information/with-evidence
Content-Type: multipart/form-data
  data           → { "message": "…" }
  evidenceFile0  → file
```

The status returns to `UNDER_REVIEW`.

---

## 8. Status → customer copy

Render `displayStatus` from the API. This table is for choosing icons and grouping.

| Status | Group | Suggested copy |
| --- | --- | --- |
| `REQUESTED` | Submitted | Return requested |
| `UNDER_REVIEW` | Submitted | We are reviewing your request |
| `ADDITIONAL_INFORMATION_REQUIRED` | Action needed | We need a bit more information |
| `APPROVED` | Approved | Return approved |
| `REJECTED` | Closed | Return not approved |
| `CANCELLED_BY_CUSTOMER` | Closed | Return cancelled |
| `PICKUP_SCHEDULED` | Pickup | Pickup scheduled |
| `PICKUP_ATTEMPTED` | Pickup | Pickup attempted |
| `PICKED_UP` | Pickup | Item picked up |
| `IN_TRANSIT_TO_WAREHOUSE` | In transit | On its way back to us |
| `RECEIVED_AT_WAREHOUSE` | Received | We have received your item |
| `QC_PENDING` | Received | Quality check in progress |
| `QC_PASSED` | Received | Quality check passed |
| `QC_FAILED` | Closed | Quality check did not pass |
| `REFUND_PENDING` | Refund | Refund being prepared |
| `REFUND_INITIATED` | Refund | Refund initiated |
| `REFUND_COMPLETED` | Refund | Refund completed |
| `REPLACEMENT_PENDING` | Replacement | Replacement being arranged |
| `REPLACEMENT_CREATED` | Replacement | Replacement order created |
| `COMPLETED` | Closed | Return completed |

---

## 9. Error codes

| Code | HTTP | What to show |
| --- | --- | --- |
| `ITEM_NOT_DELIVERED` | 400 | "You can request a return once your order is delivered." |
| `RETURN_WINDOW_EXPIRED` | 400 | "The return window for this item has closed." |
| `RETURN_NOT_ALLOWED` | 400 | "This product is not eligible for return." |
| `RETURN_QUANTITY_EXCEEDED` | 400 | reduce the quantity and refresh eligibility |
| `ACTIVE_RETURN_ALREADY_EXISTS` | 409 | "A return for this item is already in progress." |
| `RETURN_ORDER_IS_RTO` | 400 | direct to support |
| `INVALID_RETURN_REASON` | 400 | reload the reason list |
| `RETURN_COMMENTS_REQUIRED` | 400 | focus the comment box (min 10 characters) |
| `EVIDENCE_REQUIRED` | 400 | focus the file picker |
| `RETURN_EVIDENCE_LIMIT_EXCEEDED` | 400 | "You can attach up to 10 files." |
| `RETURN_CONDITIONS_NOT_CONFIRMED` | 400 | highlight the unchecked boxes |
| `RETURN_RESOLUTION_NOT_ALLOWED` | 400 | re-read `allowedResolutions` |
| `RETURN_CANCELLATION_NOT_ALLOWED` | 400 | "This return can no longer be cancelled online." |
| `RETURN_REQUEST_NOT_FOUND` | 404 | not-found screen |
| `RETURN_ACCESS_DENIED` | 403 | not this customer's return |
| `PICKUP_ADDRESS_REQUIRED` | 400 | ask for a pickup address |
| `COD_REFUND_METHOD_REQUIRED` | 400 | ask the customer to choose bank or wallet |
| `BANK_DETAILS_REQUIRED` | 400 | show the bank-detail form |
| `BANK_ACCOUNT_MISMATCH` | 400 | "Account numbers do not match" |
| `INVALID_IFSC` | 400 | "Enter a valid IFSC" |
| `WALLET_REFUND_NOT_ENABLED` | 400 | hide wallet; only bank is available |
| `BANK_DETAILS_LOCKED` | 400 | "Bank details cannot be changed after approval" |
| `BANK_DETAILS_NOT_APPLICABLE` | 400 | do not collect bank details for prepaid-only refunds |

All 4xx errors from this module carry a `code`. Anything without one is a genuine
server error — show a generic retry.

---

## 10. Notifications

The backend emits events for every stage, but **return SMS is not being sent yet**:
no MSG91 DLT template is registered for returns, and Indian transactional SMS
requires a pre-approved template. Until those templates exist, the storefront is
the only place a customer sees progress.

Practical consequence: make the return detail screen easy to reach — link it from
the order detail page and from the order list — and refresh it on focus rather than
relying on a push.

---

## 11. Things the storefront must not do

- **Do not tell the customer they have been refunded at submission time.** Use the
  returned `message`.
- **Do not compute eligibility, windows or refund amounts on the client.** Every
  number in this document comes from the server, and the server re-validates
  everything at submission anyway.
- **Do not persist evidence URLs.** They are signed and expire.
- **Do not assume `refund != null` means money has arrived.** Only refund status
  `PROCESSED` means that.
- **Do not offer a bank-account field for an online-payment refund.** Prepaid money
  always returns to the original Razorpay / Cashfree / GoKwik instrument.
- **Do collect bank or wallet choice when `codRefund.required` is true.** That is
  only the cash-on-delivery portion. Confirmation of the account number is
  validated and never stored. Display only `XXXXXX4321` afterwards.

Customer-visible refund copy (COD and prepaid):

> Your refund request has been initiated. It may take 5–7 working days after approval.

Correct bank details before approval with:

```
POST /returns/:id/bank-details
{ "refundMethod": "BANK_ACCOUNT", "bankDetails": { … same as create … } }
```

After approval the fields are locked (`codRefund.bankDetails.locked`). Finance must
reopen verification for a correction.
