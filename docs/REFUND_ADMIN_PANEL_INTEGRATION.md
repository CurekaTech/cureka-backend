# Admin Panel — Refund Requests

Paste this file into the **admin panel** Cursor chat. Backend refund-request APIs are live after migration.

This is the **refund request, review, approval, and provider-processing** foundation. Do not invent a department hierarchy, SLA engine, or extra endpoints.

---

## Sidebar / module

Login/me menu already includes this Order Management item when the admin has `refund_requests.read`:

| Field | Value |
|---|---|
| name | Refund Requests |
| key | `orders-refund-requests` |
| href | `/refund-requests` |
| icon | `RotateCcw` (Lucide; fallback `RefreshCcw`) |
| requiredPermissions | `['refund_requests.read']` |

Roles checkbox group already comes from grouped permissions:

- **Orders → Refund Requests**
  - View Refund Requests (`refund_requests.read`)
  - Create Refund Requests (`refund_requests.create`)
  - Update Refund Requests (`refund_requests.update`)
  - Approve Refund Requests (`refund_requests.approve`)
  - Reject Refund Requests (`refund_requests.reject`)
  - Initiate Refund Payments (`refund_requests.status`) — also used for retry and reconcile

Do **not** hardcode role names such as Finance or Purchase Head. Assign these permissions to the appropriate roles from the Admin Panel.

`super_admin` and `admin` receive the permissions through migration. Custom roles must be granted checkboxes.

---

## Base URL

Backend:

```text
GET/POST /api/v1/admin/refund-requests
```

Admin panel typically proxies:

```text
/admin/api/proxy/refund-requests
```

Use the same auth, RBAC, pagination, and response envelope as other admin Order Management APIs.

Success envelope:

```ts
{
  success: true;
  message: string;
  data: T;
  timestamp: string;
}
```

Error envelope may include a machine-readable `code`.

---

## Pages

1. List: `/refund-requests`
2. Detail: `/refund-requests/[id]` — UUID or business `refId` (for example `RFN…`)

---

## RBAC

Protect every action with the matching permission. The list/detail `availableActions[].allowed` flag is **status-based only**. The frontend **must also** check `requiredPermission` against the signed-in admin’s permissions.

| Action | Permission | Endpoint |
|---|---|---|
| List / detail / history | `refund_requests.read` | `GET /admin/refund-requests`, `GET /admin/refund-requests/:id` |
| Manual create | `refund_requests.create` | `POST /admin/refund-requests` |
| Review, assign, comment | `refund_requests.update` | `POST .../review`, `.../assign`, `.../comments` |
| Approve | `refund_requests.approve` | `POST .../approve` |
| Reject | `refund_requests.reject` | `POST .../reject` |
| Initiate / retry / reconcile | `refund_requests.status` | `POST .../initiate`, `.../retry`, `.../reconcile` |

Approve and initiate are **separate permissions**. Approval must not call a payment provider.

---

## List API

```http
GET /api/v1/admin/refund-requests
```

Query parameters:

| Param | Notes |
|---|---|
| `page`, `limit` | Standard pagination (`limit` max 100) |
| `search` | Order number, customer name, email, mobile, provider refund ID, merchant refund reference |
| `status` | See statuses below |
| `reason` | See reasons below |
| `paymentProvider` | `GOKWIK` \| `RAZORPAY` \| `CASHFREE` \| `COD` \| `OTHER` |
| `orderId` | UUID |
| `orderNumber` | Partial ILIKE |
| `customerId` | UUID |
| `assignedTo` | Assigned admin/staff user UUID |
| `createdFrom`, `createdTo` | ISO date/time |
| `sortBy` | `createdAt` (default), `updatedAt`, `status`, `requestedAmount`, `orderNumber` |
| `sortOrder` | `ASC` \| `DESC` (default `DESC`) |
| `slaStatus` | `GREEN` \| `ORANGE` \| `RED` (computed from age; pending client SLA confirmation) |

List item fields:

```ts
{
  id: string;
  refId: string;
  orderId: string;
  orderNumber: string;
  customer: {
    id: string | null;
    name: string | null;
    mobileNumber: string | null;
    email: string | null; // masked, e.g. ab***@domain
  };
  reason: RefundReason;
  requestedAmount: string; // decimal string, e.g. "1299.00"
  approvedAmount: string | null;
  currency: "INR";
  status: RefundRequestStatus;
  originalPaymentMethod: string;
  paymentProvider: RefundPaymentProvider;
  providerRefundId: string | null;
  requestedByType: "CUSTOMER" | "ADMIN" | "SYSTEM";
  assignedToUserId: string | null;
  createdAt: string;
  updatedAt: string;
  ageInHours: number;
  ageInDays: number;
  slaStatus: "GREEN" | "ORANGE" | "RED";
  expectedCreditFrom: string | null;
  expectedCreditTo: string | null;
}
```

Do not expose internal comments, failure stack traces, or full gateway payloads on the list.

---

## Detail API

```http
GET /api/v1/admin/refund-requests/:id
```

`:id` is the UUID or `refId`.

Detail adds:

- `reasonDetails`, `rejectionReason`
- `merchantRefundReference`, `providerPaymentId`, `providerRefundStatus`, `paymentRequestId`
- review / approve / reject / processing timestamps and actor IDs
- `failureCode`, `failureMessage` (admin-only)
- `refundable`: captured, already refunded, pending, refundable amounts
- `history[]` chronological audit trail (`createdAt` ascending)
- `availableActions[]`

History item:

```ts
{
  id: string;
  fromStatus: string | null;
  toStatus: string;
  action: string;
  comment: string | null;
  performedBy: string;
  performedByRole: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
```

History is immutable. Do not offer edit/delete.

---

## Create

```http
POST /api/v1/admin/refund-requests
```

```json
{
  "orderId": "order-uuid",
  "reason": "OUT_OF_STOCK",
  "reasonDetails": "Product unavailable from supplier",
  "requestedAmount": "1299.00",
  "comment": "Customer informed"
}
```

Rules:

- `reasonDetails` is **required** when `reason` is `OTHER`.
- v1 is **full refund only**. `requestedAmount` is validated against the backend refundable captured amount; partial amounts are rejected.
- Do not send a payment provider. The backend resolves GoKwik / Razorpay / Cashfree from payment records.
- Duplicate active requests for the same order return `REFUND_REQUEST_ALREADY_EXISTS`.

---

## Workflow actions

### Review

```http
POST /api/v1/admin/refund-requests/:id/review
```

```json
{ "comment": "Order and payment details verified" }
```

Moves `REQUESTED` → `UNDER_REVIEW`. Does **not** call a gateway.

### Approve

```http
POST /api/v1/admin/refund-requests/:id/approve
```

```json
{
  "approvedAmount": "1299.00",
  "comment": "Approved for refund"
}
```

Moves to `APPROVED`. Does **not** call a gateway. `approvedAmount` must equal the full refundable amount in v1.

### Reject

```http
POST /api/v1/admin/refund-requests/:id/reject
```

```json
{
  "reason": "Order was successfully delivered",
  "comment": "Delivery proof verified"
}
```

`reason` is mandatory (min 3 characters).

### Assign

```http
POST /api/v1/admin/refund-requests/:id/assign
```

```json
{
  "assignedToUserId": "staff-user-uuid",
  "assignedRoleId": "role-uuid",
  "comment": "Assigned to Finance"
}
```

Provide `assignedToUserId` and/or `assignedRoleId`.

### Comment

```http
POST /api/v1/admin/refund-requests/:id/comments
```

```json
{ "comment": "Customer confirmed original payment account" }
```

Internal only. Never show these comments to customers.

### Initiate provider refund (money-moving)

```http
POST /api/v1/admin/refund-requests/:id/initiate
```

```json
{ "comment": "Finance confirmed" }
```

This is the only action that calls GoKwik, Razorpay, or Cashfree.

Requirements:

- Status must be `APPROVED` or `FINANCE_PROCESSING`.
- Frontend **cannot** choose the provider.
- Require `refund_requests.status`.
- Disable the button immediately; ignore double-clicks.
- Show a confirmation dialog: amount, currency, order number, original payment method.
- If already `PROCESSING` / already has a provider refund, the API returns `REFUND_ALREADY_INITIATED` — treat as success-already-in-progress, do not retry automatically.

### Retry

```http
POST /api/v1/admin/refund-requests/:id/retry
```

```json
{ "comment": "Provider confirmed the previous attempt failed" }
```

Allowed only from conclusive `FAILED`. Not allowed when `failureCode` is `PENDING_RECONCILIATION` — use reconcile first. `comment` is required.

### Reconcile

```http
POST /api/v1/admin/refund-requests/:id/reconcile
```

Fetches provider status using the stored refund ID / merchant reference. Does **not** create another refund.

---

## Statuses and transitions

```text
REQUESTED
  → UNDER_REVIEW
  → AWAITING_APPROVAL
  → APPROVED
  → FINANCE_PROCESSING
  → PROCESSING
  → PROCESSED
  → CLOSED
```

Alternate terminals:

```text
REQUESTED | UNDER_REVIEW | AWAITING_APPROVAL → REJECTED
REQUESTED | UNDER_REVIEW → CANCELLED
PROCESSING → FAILED
FAILED → PROCESSING (retry only)
```

v1 APIs:

| Current status | Primary buttons |
|---|---|
| `REQUESTED` | Review, Approve, Reject, Assign, Comment |
| `UNDER_REVIEW` | Approve, Reject, Assign, Comment |
| `AWAITING_APPROVAL` | Approve, Reject, Assign, Comment |
| `APPROVED` | **Initiate Refund**, Assign, Comment |
| `FINANCE_PROCESSING` | **Initiate Refund**, Assign, Comment |
| `PROCESSING` | Reconcile, Assign, Comment |
| `FAILED` | Retry (if not pending reconciliation), Reconcile |
| `PROCESSED` / `CLOSED` / `REJECTED` / `CANCELLED` | View only |

Suggested labels / colors:

| Status | Label | Color |
|---|---|---|
| `REQUESTED` | Requested | gray |
| `UNDER_REVIEW` | Under review | blue |
| `AWAITING_APPROVAL` | Awaiting approval | indigo |
| `APPROVED` | Approved | teal |
| `FINANCE_PROCESSING` | Finance processing | cyan |
| `PROCESSING` | Refund processing | orange |
| `PROCESSED` | Refund processed | green |
| `FAILED` | Refund failed | red |
| `REJECTED` | Rejected | rose |
| `CANCELLED` | Cancelled | slate |
| `CLOSED` | Closed | green |

SLA badge (computed, **pending client confirmation**; currently 24h orange / 72h red):

| `slaStatus` | Meaning |
|---|---|
| `GREEN` | Younger than 24 hours |
| `ORANGE` | 24–72 hours |
| `RED` | 72+ hours |

---

## Reasons

```ts
CUSTOMER_CANCELLATION
OUT_OF_STOCK
WRONG_PRODUCT
DELAYED_DELIVERY
RTO
DAMAGED_PRODUCT
OTHER
```

---

## Error codes

| Code | UI handling |
|---|---|
| `REFUND_REQUEST_NOT_FOUND` | 404 empty state |
| `REFUND_REQUEST_ALREADY_EXISTS` | Link to the existing request |
| `REFUND_NOT_REQUIRED` | COD / no captured online amount |
| `REFUND_AMOUNT_INVALID` | Amount must be > 0 |
| `REFUND_AMOUNT_EXCEEDS_AVAILABLE_AMOUNT` | Recalculate from detail `refundable` |
| `REFUND_FULL_AMOUNT_REQUIRED` | v1: only full captured amount |
| `REFUND_INVALID_STATUS_TRANSITION` | Refresh detail; hide invalid buttons |
| `REFUND_NOT_APPROVED` | Cannot initiate yet |
| `REFUND_ALREADY_INITIATED` | Show processing state; do not click again |
| `REFUND_ALREADY_PROCESSED` | View-only |
| `REFUND_PROVIDER_NOT_FOUND` | Keep in review; original payment source unknown |
| `REFUND_PROVIDER_NOT_SUPPORTED` | COD / unsupported source |
| `REFUND_PROVIDER_REQUEST_FAILED` | Show failure; offer retry if allowed |
| `REFUND_RETRY_NOT_ALLOWED` | Use reconcile or wait |
| `REFUND_PERMISSION_DENIED` | Hide the action |

---

## Detail UI requirements

- Order summary (number, status, payment method)
- Payment summary and refundable breakdown
- Provider (read-only; never a dropdown the user can change)
- Customer summary (mask email already applied)
- Internal comments + chronological history
- Available actions gated by status **and** RBAC
- Confirmation dialogs for Approve, Reject, Initiate, and Retry
- Disable Initiate/Retry after the first click (in-flight lock)
- Do not show customer-facing 5–7 day copy as if the gateway refund already completed

---

## Money-moving confirmation

Initiate Refund dialog must show:

1. Order number
2. Approved amount and currency
3. Original payment method / resolved provider
4. Warning that this sends money through the original gateway and cannot be undone from the Admin Panel
