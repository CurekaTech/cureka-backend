# Customer frontend — refund request visibility

Use this spec in the **website** Cursor chat. Do not add admin-only fields to customer screens.

A **refund request** is not the same as a completed gateway refund. After cancellation the customer should see that a request was created. The amount is credited only after admin approval **and** provider processing.

---

## Exact customer message

After a refund request is created (including prepaid cancellation), show:

```text
Your refund request has been initiated. Once approved and processed, the amount will be credited to your original payment method within 5–7 working days.
```

This message must **not** claim that the payment gateway has already refunded the money.

---

## Where the data comes from

Do not add a new customer refund list API. Use existing order APIs.

### Order details

```http
GET /api/v1/orders/:id
```

The order payload now includes optional `refund`:

```ts
refund: {
  id: string;
  refId: string;
  status: RefundRequestStatus;
  displayStatus: string;
  amount: string;          // decimal string, e.g. "1299.00"
  currency: "INR";
  requestedAt: string;     // ISO
  processedAt: string | null;
  expectedCreditMessage: string;
  message: string;
} | null
```

`refund` is `null` when the order has no refund request (typical COD with no captured online payment, or no cancellation/refund case).

### Cancellation

```http
PATCH /api/v1/orders/:id/cancel
```

Body still uses the existing cancel DTO (`reason` required).

The cancel response is the same order-details payload, including `refund` when a prepaid captured amount qualifies.

If `refund` is present after cancel, show `refund.message` (the 5–7 working-day copy above).

If `refund` is `null` (COD / no captured online amount), do not show a refund timeline. The order is cancelled; no online refund is due.

---

## Customer-visible statuses

Map `displayStatus` from the backend. Do not invent extra labels unless you need a shorter mobile string; prefer the backend value.

| Backend `status` | `displayStatus` | Meaning |
|---|---|---|
| `REQUESTED`, `UNDER_REVIEW`, `AWAITING_APPROVAL` | Refund request initiated | Request received; not yet paid out |
| `APPROVED`, `FINANCE_PROCESSING` | Refund approved | Approved internally; gateway not necessarily called yet |
| `PROCESSING` | Refund processing | Provider refund has been initiated |
| `PROCESSED`, `CLOSED` | Refund processed | Provider refund completed |
| `FAILED` | Refund failed. Please contact support. | Safe customer copy; no stack traces |
| `REJECTED` | Refund request declined | Do not show internal rejection investigation |
| `CANCELLED` | Refund request cancelled | Request withdrawn |

For `REQUESTED` / `UNDER_REVIEW` / `AWAITING_APPROVAL`, `message` is the full 5–7 working-day sentence.

For later statuses, `expectedCreditMessage` remains:

```text
Once approved and processed, the amount will be credited to your original payment method within 5–7 working days.
```

Use `processedAt` only when the refund is actually processed. Do not treat `requestedAt` as a payout date.

---

## Distinguish request vs processed refund

| Signal | Request created | Gateway refund completed |
|---|---|---|
| `status` | `REQUESTED` / `UNDER_REVIEW` / `AWAITING_APPROVAL` | `PROCESSED` or `CLOSED` |
| `displayStatus` | Refund request initiated | Refund processed |
| `processedAt` | `null` | ISO timestamp |
| Copy | 5–7 working days after approval and processing | Amount credited / processing complete |

Never show “Refunded” solely because the order is cancelled.

---

## Ownership and privacy

- The customer can see only refunds on **their own** orders (existing order ownership).
- Another customer’s order ID returns not found / existing order 404 behaviour.
- **Do not display:**
  - Internal comments
  - Approver / reviewer names
  - Staff assignments
  - Rejection investigation notes
  - `failureCode`, stack traces, gateway payloads
  - Merchant refund reference internals
  - Admin history

Those fields are not returned on the customer `refund` object. Do not call admin refund APIs from the website.

---

## Loading / error behaviour

- Order details: if `refund` is missing, hide the refund card.
- Cancel in-flight: keep the existing cancel spinner; after success, render `refund.message` when present.
- Cancel error: keep existing order-cancel error handling. Do not assume a refund exists.
- Do not let the customer pick GoKwik / Razorpay / Cashfree. The original payment method is already on the order.

---

## Frontend acceptance cases

1. Prepaid Razorpay/Cashfree/GoKwik cancel → order cancelled → `refund` present → 5–7 day message shown → no “already refunded” copy.
2. COD cancel with no captured online amount → order cancelled → `refund` is `null`.
3. GoKwik partial COD cancel → refund amount is the captured prepaid/online component only.
4. Customer cannot open another user’s order refund.
5. After admin processes the refund, order details show `displayStatus: "Refund processed"` and `processedAt` set.
6. After admin rejects, customer sees “Refund request declined” without internal comments.
7. Duplicate cancel does not create a second refund card (one request per order).
