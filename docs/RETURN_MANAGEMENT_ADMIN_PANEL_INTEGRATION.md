# Return Management — Admin Panel Integration

Contract for the Cureka admin panel. Every endpoint, field and error code below is
implemented in this backend; nothing here is aspirational.

- Base path: `/api/v1`
- Auth: `Authorization: Bearer <admin JWT>`
- Roles on `/admin/returns`: `SUPER_ADMIN`, `ADMIN`, `MODERATOR`
- Roles on `/admin/return-policies`: `SUPER_ADMIN`, `ADMIN`, `MODERATOR`
- Every response is wrapped: `{ success, data, message, timestamp }`. Only `data`
  is documented below.
- Every error is `{ success: false, code, message, timestamp }` — branch on `code`,
  never on `message`.

---

## 1. Sidebar

`GET /api/v1/admin/auth/menu` already returns the menu filtered by the signed-in
admin's permissions. A new top-level entry now appears under **Orders**:

```
Orders
├── Refund Requests          refund_requests.read   → /refund-requests
│   ├── All Refunds          refund_requests.read   → /refund-requests
│   └── COD Payouts          refund_payouts.read    → /refund-requests?paymentProvider=COD
├── Return Requests          returns.read          → /returns
│   ├── Create Return        returns.create        → /returns/create
│   ├── All Returns          returns.read          → /returns
│   ├── Pending Review       returns.read          → /returns?status=REQUESTED
│   ├── Pickup & Transit     returns.read          → /returns?status=PICKUP_SCHEDULED
│   ├── Quality Check        returns.status        → /returns?status=QC_PENDING
│   ├── Refund Pending       returns.read          → /returns?status=REFUND_PENDING
│   └── Return Policies      return_policies.read  → /returns/policies
└── COD Blocklist            cod_blocklist.read

Products
└── Return Policies          return_policies.read  → /products/return-policies
```

Detail route (not in the sidebar; open from the list): `/returns/:id` where `:id`
is the UUID, `refId`, or `returnNumber`.

The panel does not need to hard-code this. Keep rendering whatever the menu
endpoint returns; entries the admin lacks permission for are already stripped
server-side. Implement these routes:

- `/returns` — list
- `/returns/create` — admin-initiated return
- `/returns/:id` — detail + actions
- `/returns/policies` and `/products/return-policies` — product/SKU return policy editor (same APIs)

---

## 2. Permissions

| Code | Grants |
| --- | --- |
| `returns.read` | list, detail, eligibility |
| `returns.create` | create a return on the customer's behalf |
| `returns.update` | review, request information, assign, comment, internal note |
| `returns.approve` | approve, approve-without-pickup, **create the refund** |
| `returns.reject` | reject |
| `returns.status` | pickup, receive, QC, link replacement, complete |
| `return_policies.read` | view product/variant policy |
| `return_policies.update` | edit product/variant policy |
| `refund_payouts.read` | view COD payout + masked bank details; audited reveal |
| `refund_payouts.update` | verify bank details, reopen verification |
| `refund_payouts.status` | mark processing / paid (UTR required) / failed / hold / retry |

Seeded by migration for `super_admin` and `admin`. Other roles — including a
Finance role — are granted through the existing role-permission screens. Moderators
do **not** receive `refund_payouts.*` by default.

Approve and reject are separate codes on purpose, and refund creation sits behind
`returns.approve` rather than `returns.status`, so warehouse staff can move goods
without being able to release money. Hide or disable buttons accordingly; the
server enforces it regardless.

---

## 3. Endpoints

### 3.1 List

```
GET /admin/returns
```
`returns.read`

Query parameters (all optional): `page`, `limit`, `search`, `status`, `resolution`,
`orderId`, `orderNumber`, `returnNumber`, `customerId`, `reasonId`, `sku`,
`productId`, `assignedTo`, `pickupRequired`, `qcRequired`, `createdFrom`,
`createdTo`, `deliveredFrom`, `deliveredTo`, `slaStatus` (`GREEN|ORANGE|RED`).

```jsonc
{
  "data": [
    {
      "id": "…", "refId": "RET2026123456", "returnNumber": "RTNRET2026123456",
      "orderId": "…", "orderNumber": "CUR2026000001",
      "customerId": "…", "customerName": "…", "customerMobile": "…",
      "status": "REQUESTED", "resolution": "REFUND",
      "reasonCode": "DAMAGED_ON_ARRIVAL", "reasonTitle": "Damaged on arrival",
      "itemCount": 2, "totalQuantity": 3,
      "estimatedRefundAmount": "1250.00", "approvedRefundAmount": null,
      "currency": "INR",
      "pickupRequired": true, "qcRequired": true,
      "isAdminInitiated": false, "eligibilityOverridden": false,
      "assignedToUserId": null,
      "ageHours": 26, "slaStatus": "GREEN",
      "refundRequestId": null, "replacementOrderId": null,
      "createdAt": "2026-01-14T09:12:00.000Z", "updatedAt": "…"
    }
  ],
  "total": 41, "page": 1, "limit": 20, "totalPages": 3
}
```

`slaStatus` mirrors the refund module: `GREEN` under 48h, `ORANGE` 48–96h, `RED`
beyond 96h, measured from creation and frozen once terminal.

### 3.2 Detail

```
GET /admin/returns/:id
```
`returns.read` · `:id` accepts uuid, `refId` or `returnNumber`.

Adds to the list shape: `items[]`, `evidences[]`, `timeline[]`, `pickup`,
`qcRecords[]`, `refund`, `amountBreakdown`, `pickupAddress`,
`conditionDeclarations`, `customerComments`, `internalJustification`,
`overrideReason`, `eligibilitySnapshot`, and `availableActions[]`.

`availableActions` is the server's own answer to "what can this admin do next",
derived from the state machine. **Drive the action buttons from it** rather than
reimplementing the state machine in the panel:

```jsonc
"availableActions": [
  { "action": "approve", "label": "Approve", "requiredPermission": "returns.approve" },
  { "action": "reject",  "label": "Reject",  "requiredPermission": "returns.reject"  }
]
```

`items[]`:

```jsonc
{
  "id": "…", "orderItemId": "…", "sku": "SKU-1",
  "productName": "…", "variantName": "30ml",
  "quantity": 2, "unitPrice": "500.00", "refundableAmount": "900.00",
  "acceptedQuantity": null, "rejectedQuantity": null, "qcRejectionReason": null,
  "policySnapshot": { "returnable": true, "returnWindow": 7, "returnWindowUnit": "DAYS", … },
  "deliveredAt": "2026-01-10T00:00:00.000Z"
}
```

`timeline[]` on the **admin** endpoint includes internal notes and actor
identities. It is a different projection from the customer timeline — do not
forward it to the storefront.

### 3.3 Eligibility (before creating a return for a customer)

```
GET /admin/returns/eligibility/:orderId?expiredProductClaim=false
```
`returns.read`

Returns per-item `canReturn`, `canReplace`, `canRequestRefund`,
`allowedResolutions`, `orderedQuantity`, `committedQuantity`,
`availableQuantity`, `returnWindowExpiresAt`, and — when blocked —
`ineligibilityCode` + `ineligibilityMessage`.

Use `availableQuantity` as the max on the quantity stepper.

### 3.4 Create on the customer's behalf

```
POST /admin/returns
```
`returns.create`

**JSON** (`Content-Type: application/json`):

```jsonc
{
  "orderId": "uuid",
  "reasonId": "uuid or refId",
  "resolution": "REFUND",                 // or "REPLACEMENT"
  "items": [{ "orderItemId": "uuid", "quantity": 1 }],
  "customerComments": "Customer reported a leak",
  "conditionDeclarations": { "unused": true, "originalPackaging": true },
  "pickupAddress": { … },                 // optional, defaults to the order address

  "overrideEligibility": true,            // optional
  "overrideReason": "Goodwill for a VIP customer",     // required when overriding, min 10 chars
  "internalJustification": "Approved by ops lead",     // never shown to the customer
  "customerVisibleExplanation": "We have made an exception for you"
}
```

**Multipart** (`Content-Type: multipart/form-data`) — use when attaching photos:

| Form field | Contents |
| --- | --- |
| `orderId`, `reasonId`, `resolution`, … | same fields as JSON (text) |
| `items`, `conditionDeclarations`, `pickupAddress` | JSON strings |
| `photos` (repeatable) or `photos0`… / `evidenceFile0`… | image/video files (max 10) |

Example (matches the admin panel):

```js
const form = new FormData();
form.append('orderId', orderId);
form.append('reasonId', reasonId);           // uuid or refId e.g. DAM20266529
form.append('resolution', 'REPLACEMENT');
form.append('items', JSON.stringify([{ orderItemId, quantity: 1 }]));
form.append('conditionDeclarations', JSON.stringify({ unused: true, originalPackaging: true }));
form.append('customerComments', comments);
form.append('overrideEligibility', 'true');
form.append('overrideReason', overrideReason);
form.append('internalJustification', note);
files.forEach((file) => form.append('photos', file));
```

Overriding is fully audited: it sets `eligibility_overridden`, writes a
non-customer-visible `ELIGIBILITY_OVERRIDDEN` timeline entry, and records an audit
log entry against the acting admin. Show a confirmation dialog and require the
justification before enabling the toggle.

Response is the same as the customer create (§3.13) — **status `REQUESTED`, no
refund**.

### 3.5 Review, approve, reject, request information

```
POST /admin/returns/:id/review               returns.update   { comment? }
POST /admin/returns/:id/approve              returns.approve  { pickupRequired?, qcRequired?, comment? }
POST /admin/returns/:id/reject               returns.reject   { reason, internalNote? }
POST /admin/returns/:id/request-information  returns.update   { message }
```

`reject.reason` is shown to the customer (min 3 chars); `internalNote` is not.

**Approving does not refund anything.** It moves the return to `APPROVED` and
commits the estimated amount as `approvedRefundAmount`. What happens next depends
on `pickupRequired`:

- `pickupRequired: true` → the return waits for `POST …/pickup`
- `pickupRequired: false` → the return moves straight to `REFUND_PENDING` or
  `REPLACEMENT_PENDING`

`pickupRequired` and `qcRequired` default to the values derived from the product
policy and the reason; the fields let an admin override per case.

### 3.6 Assignment and comments

```
POST /admin/returns/:id/assign          returns.update  { assignedToUserId?, assignedRoleId?, comment? }
POST /admin/returns/:id/comments        returns.update  { comment }   → customer-visible
POST /admin/returns/:id/internal-notes  returns.update  { comment }   → internal only
```

At least one of `assignedToUserId` / `assignedRoleId` is required. None of these
change the status.

### 3.7 Pickup

```
POST /admin/returns/:id/pickup         returns.status
POST /admin/returns/:id/pickup/status  returns.status
POST /admin/returns/:id/no-pickup      returns.approve
```

Schedule:

```jsonc
{
  "provider": "SHIPWAY",          // omit to auto-notify Unicommerce + Shipway; use MANUAL to type an AWB
  "scheduledAt": "2026-01-16T10:00:00.000Z",
  "reverseAwbNumber": "SW123456789",
  "courierName": "Delhivery",
  "trackingUrl": "https://…",
  "comment": "Scheduled with the customer for the morning slot"
}
```

> **Approval already books reverse logistics.** After `POST /admin/returns/:id/approve`
> Cureka creates a Unicommerce reverse pickup and a Shipway reverse order when
> those credentials are configured. The Schedule Pickup button is a **retry /
> MANUAL fallback** for `APPROVED` returns that did not get a pickup (missing
> credentials or both providers failed). Offer:
>
> - Default / `SHIPWAY` / `UNICOMMERCE` — notify both configured providers (no AWB required).
> - `MANUAL` — require `reverseAwbNumber` from the courier panel.
>
> Pickup rows on the detail payload include `providerPickupId`,
> `unicommerceReversePickupCode`, `shipwayOrderId`, `reverseAwbNumber` and
> `failureReason` (set when one of the two providers failed).

Update status: `{ status, eventAt?, failureReason?, comment? }` where `status` is
one of `SCHEDULED`, `ATTEMPTED`, `PICKED_UP`, `IN_TRANSIT`,
`DELIVERED_TO_WAREHOUSE`, `CANCELLED`, `FAILED`. The return status follows
automatically.

No-pickup: `{ justification (min 10 chars), customerVisibleExplanation? }`. Use
for low-value goods that are not worth collecting. It requires `returns.approve`
because it releases the goods and unblocks the refund.

### 3.8 Warehouse and QC

```
POST /admin/returns/:id/receive  returns.status  { receivedAt?, comment? }
POST /admin/returns/:id/qc       returns.status
```

```jsonc
{
  "items": [
    { "returnRequestItemId": "uuid", "receivedQuantity": 2, "acceptedQuantity": 1,
      "rejectionReason": "One unit had a broken seal", "notes": "Photographed" }
  ],
  "comment": "Partial acceptance"
}
```

`rejectedQuantity` is derived as `received − accepted`, and `rejectionReason` is
required when anything is rejected. A database constraint enforces
`accepted + rejected = received`, so validate in the form too.

Partial acceptance **reduces** the refund proportionally
(`lineRefundable × accepted / requested`). Show the recomputed
`approvedRefundAmount` from the detail response after submitting QC — do not
compute it in the panel.

### 3.9 Refund

```
POST /admin/returns/:id/refund  returns.approve  { comment? }
```

This is the only place money enters the picture. Preconditions:

- status must be `REFUND_PENDING` → otherwise `400 INVALID_STATUS_TRANSITION`
- no refund already linked → otherwise `409 RETURN_REFUND_ALREADY_CREATED`

It creates a **refund request in the existing refund module** in `REQUESTED`
status. It does *not* send money. The refund still has to be approved and
initiated on the existing **Refund Requests** screen, exactly as a cancellation
refund is today. The response includes:

```jsonc
"refund": {
  "refundRequestId": "…", "refundRefId": "REF2026…",
  "status": "REQUESTED", "amount": "900.00", "currency": "INR"
}
```

Deep-link that `refundRequestId` to the existing refund detail page. When the
refund reaches `PROCESSED`, the return advances to `REFUND_COMPLETED` and then
`COMPLETED` on its own — no admin action needed.

**COD refunds are not complete at refund approval.** After initiate:

- Prepaid / online components still go through GoKwik / Razorpay / Cashfree.
- The COD component appears as `codPayout` on the refund detail (masked bank
  details only — never on the return list).
- Finance records UTR via `POST /admin/refund-requests/:id/payout/paid`.
- Wallet COD refunds credit the refund-wallet ledger on initiate.

Customer copy to keep showing:

> Your refund request has been initiated. It may take 5–7 working days after approval.

### 3.12 COD payout (Finance)

All routes sit on the refund request id. List APIs never include bank details.
Every view/update is written to the audit log **without** the full account number.

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/admin/refund-requests/:id/payout` | `refund_payouts.read` |
| POST | `/admin/refund-requests/:id/payout/reveal` | `refund_payouts.read` + SUPER_ADMIN/ADMIN |
| POST | `/admin/refund-requests/:id/payout/verify` | `refund_payouts.update` |
| POST | `/admin/refund-requests/:id/payout/processing` | `refund_payouts.status` |
| POST | `/admin/refund-requests/:id/payout/paid` | `refund_payouts.status` |
| POST | `/admin/refund-requests/:id/payout/fail` | `refund_payouts.status` |
| POST | `/admin/refund-requests/:id/payout/hold` | `refund_payouts.status` |
| POST | `/admin/refund-requests/:id/payout/retry` | `refund_payouts.status` |
| POST | `/admin/refund-requests/:id/payout/reopen-verification` | `refund_payouts.update` |

Mark paid body:

```jsonc
{
  "utr": "SBIN123456789",          // required, min 6
  "transferDate": "2026-09-10",
  "paymentProofPath": "optional/storage/path",
  "customerVisibleNotes": "optional",
  "internalNotes": "optional"
}
```

Payout statuses: `PENDING_DETAILS`, `DETAILS_SUBMITTED`, `UNDER_VERIFICATION`,
`READY_FOR_PAYOUT`, `PROCESSING`, `PAID`, `FAILED`, `ON_HOLD`, `CANCELLED`.

Return detail includes a masked `codRefund` object (`accountNumberMasked` like
`XXXXXX4321`, holder name, IFSC, bank name). Do not show this on the list grid.

If mixed payment, show `amountAllocation` on the refund detail:
`onlineAmount`, `codAmount`, `originalWalletAmount` plus each component status.
The parent refund is complete only when every component is `COMPLETED`.

### 3.10 Replacement

```
POST /admin/returns/:id/replacement  returns.status  { replacementOrderId, comment? }
```

Links an **existing** order as the replacement. The backend does not create
replacement orders (see the backend guide, §10), so the panel should let the admin
place the replacement order through the normal order flow and then paste its id
here.

### 3.11 Complete

```
POST /admin/returns/:id/complete  returns.status  { comment? }
```

Only valid from `REFUND_COMPLETED`, `REPLACEMENT_CREATED` or `QC_FAILED`.

### 3.12 Return policies

```
GET   /admin/return-policies/products/:productId   return_policies.read
PATCH /admin/return-policies/products/:productId   return_policies.update
PATCH /admin/return-policies/variants/:variantId   return_policies.update
```

`GET` returns the product policy plus every variant, so one screen can show
inherited versus overridden values.

`PATCH` body (all fields optional; send only what changed):

```jsonc
{
  "returnAllowed": true, "replaceAllowed": false, "refundAllowed": true,
  "returnWindowDays": 7, "replaceWindowDays": 7,
  "returnWindowUnit": "DAYS",        // or "HOURS"
  "replaceWindowUnit": "DAYS",
  "returnPickupRequired": true, "returnQcRequired": true,
  "returnEvidenceRequired": false, "noPickupRefundAllowed": false,
  "returnPolicy": "Free returns within 7 days of delivery."
}
```

On a **variant**, omitting a field leaves it inheriting the product. To clear an
override back to inherited, send `null`. Render inherited values greyed out with
an "override" toggle.

Policy edits are audited and apply to **future** orders only. Existing orders keep
the snapshot captured at purchase time — say so in the UI so nobody expects a
policy edit to retroactively open a closed window.

### 3.13 Response shape of a create

```jsonc
{
  "returnRequestId": "…",
  "returnNumber": "RTNRET2026123456",
  "status": "REQUESTED",
  "message": "Your return request has been submitted and is under review."
}
```

---

## 4. Status reference

| Status | Meaning |
| --- | --- |
| `REQUESTED` | submitted, not yet looked at |
| `UNDER_REVIEW` | an admin has picked it up |
| `ADDITIONAL_INFORMATION_REQUIRED` | waiting on the customer |
| `APPROVED` | approved; no money has moved |
| `REJECTED` | terminal |
| `CANCELLED_BY_CUSTOMER` | terminal; quantity released |
| `PICKUP_SCHEDULED` / `PICKUP_ATTEMPTED` / `PICKED_UP` | reverse logistics |
| `IN_TRANSIT_TO_WAREHOUSE` / `RECEIVED_AT_WAREHOUSE` | inbound |
| `QC_PENDING` / `QC_PASSED` / `QC_FAILED` | inspection |
| `REFUND_PENDING` | ready for an admin to create the refund |
| `REFUND_INITIATED` / `REFUND_COMPLETED` | mirrors the refund module |
| `REPLACEMENT_PENDING` / `REPLACEMENT_CREATED` | replacement path |
| `COMPLETED` | terminal |

Suggested badge colours: grey for `REQUESTED`/`UNDER_REVIEW`, amber for
`ADDITIONAL_INFORMATION_REQUIRED` and the pickup/QC group, blue for the refund
group, green for `COMPLETED`, red for `REJECTED`.

---

## 5. Error codes

| Code | HTTP | Panel behaviour |
| --- | --- | --- |
| `RETURN_REQUEST_NOT_FOUND` | 404 | show not-found state |
| `RETURN_ORDER_NOT_FOUND` | 404 | invalid order id |
| `RETURN_ITEM_NOT_FOUND` | 404 | item does not belong to the order |
| `INVALID_STATUS_TRANSITION` | 400 | refresh the detail — someone else moved it |
| `RETURN_REFUND_ALREADY_CREATED` | 409 | refresh; link to the existing refund |
| `ACTIVE_RETURN_ALREADY_EXISTS` | 409 | refresh eligibility |
| `RETURN_QUANTITY_EXCEEDED` | 400 | reduce the quantity |
| `RETURN_WINDOW_EXPIRED` | 400 | offer the override toggle |
| `RETURN_NOT_ALLOWED` | 400 | offer the override toggle |
| `ITEM_NOT_DELIVERED` | 400 | not returnable yet |
| `RETURN_ORDER_IS_RTO` | 400 | handled by the RTO process |
| `RETURN_OVERRIDE_JUSTIFICATION_REQUIRED` | 400 | focus the justification field |
| `RETURN_PICKUP_PROVIDER_UNAVAILABLE` | 400 | fall back to MANUAL |
| `RETURN_PICKUP_NOT_REQUIRED` | 400 | hide the pickup tab |
| `RETURN_QC_QUANTITY_INVALID` | 400 | highlight the QC row |
| `RETURN_EVIDENCE_LIMIT_EXCEEDED` | 400 | max 10 files |
| `INVALID_RETURN_REASON` | 400 | reload the reason list |
| `RETURN_ACCESS_DENIED` | 403 | not this admin's record |
| `BANK_DETAILS_REQUIRED` | 400 | customer has not submitted an account yet |
| `COD_PAYOUT_UTR_REQUIRED` | 400 | UTR is mandatory to mark paid |
| `COD_PAYOUT_ALREADY_PAID` | 409 | do not create a second transfer |
| `COD_PAYOUT_INVALID_STATUS` | 400 | refresh payout status |
| `COD_PAYOUT_NOT_FOUND` | 404 | this refund has no COD component |

---

## 6. Things the panel must not do

- **Do not show a refund as done when a return is approved.** Approval and refund
  are separate stages with separate permissions. Copy on the approve dialog should
  say "approve the return", never "refund the customer".
- **Do not forward the admin timeline to any customer-facing surface.** It contains
  internal notes, override justifications, QC rejection reasons and admin
  identities.
- **Do not reimplement the state machine.** Use `availableActions`.
- **Do not compute refund amounts.** Read `amountBreakdown` and
  `approvedRefundAmount`.
- **Do not treat approval as a refund.** After approve, if pickup was required,
  expect `status` to become `PICKUP_SCHEDULED` when Unicommerce/Shipway succeed.
  If it stays `APPROVED`, show the retry pickup action (`availableActions.schedulePickup`).
- **Do not put full bank account numbers on list pages, logs or screenshots.**
  Use `accountNumberMasked`. Reveal is an audited Finance action.
- **Do not mark a COD refund complete because Finance approved the refund request.**
  Complete it only after wallet credit or a paid payout with UTR.
