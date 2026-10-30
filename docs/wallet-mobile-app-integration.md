# Cureka Wallet — Mobile App Integration

Use this spec so the **mobile app wallet** behaves the same as the Cureka website.

Source of truth on web:

- Wallet screen: `WalletPageView` → `GET /wallet` + `GET /wallet/transactions`
- Checkout toggle: `CheckoutPaymentSection` “Cureka Wallet” row
- Pay: `runCheckout("online")` in `checkoutSlice` with `useWallet: true` only when that row is on
- Bill preview: `applyWalletToBillSummary` (display only)
- Success / order detail: `walletAmountPaise` and `gatewayAmountPaise` from the order

Related: `docs/pdp-buy-now-mobile-app-integration.md` (Buy Now must not send wallet on GoKwik).

---

## 1. Product rules (must match website)

Cureka Wallet is a **refund balance**. Customers spend it on **prepaid** checkout. They cannot add money.

| Rule | Website behavior |
|---|---|
| Top-up / “Add money” | **Do not build.** There is no customer credit API. The live wallet screen has no add-money button. |
| Where it can be used | Checkout payment step, only with **Prepaid (Online Payment)** |
| COD | Never. Do not send `useWallet` with `paymentMethod: "COD"`. |
| GoKwik | Never. Do not send `useWallet` when `checkoutProvider` is `gokwik`. GoKwik does not show Cureka Wallet. |
| Amount | Client never sends a wallet amount. Send only `useWallet: true`. The server applies the maximum it can. |
| Spendable balance | `available` from `GET /wallet`. Do not spend `balance` or `reserved`. |
| Feature flag | Show the row as usable only when `GET /public/checkout/provider` returns `walletCheckoutEnabled: true`. The server still rejects a stale client. |

Wallet money comes from refunds (return → refund approved to wallet). That credit flow is backend/admin. The app only **reads** the wallet and **opts in** at prepaid checkout.

---

## 2. Auth and money

Same verified customer session as the rest of the app.

```http
Authorization: Bearer <customer_session>
Accept: application/json
Content-Type: application/json
```

Session cookie is also valid. Do **not** send `customerId`. The wallet is the logged-in customer.

All routes below use the prefix `/api/v1`.

Success envelope:

```json
{
  "success": true,
  "data": {},
  "message": "...",
  "timestamp": "2026-10-21T10:00:00.000Z"
}
```

Errors: use HTTP status. `message` may be a string or an array. Show it to the user. Do not treat the text as a stable error code.

| Kind | Example | Meaning |
|---|---|---|
| Rupee string | `"125.50"` | Wallet overview, ledger `amount` / `balanceAfter`, checkout `walletAmount` / `gatewayAmount` / `eligibleTotal` / `totalAmount` |
| Integer paise string | `"12550"` | Order fields `walletAmountPaise`, `gatewayAmountPaise` |
| SDK number | `75.5` | `paymentData.amount` — charge this with Razorpay/Cashfree |

Never add a rupee string to a paise string. Paise → rupees is `Number(paise) / 100`.

---

## 3. Wallet screen

Account → Wallet (`/account/wallet` on web).

### 3.1 Load

Call both in parallel on open. Page starts at 1. Limit 20 (max 100).

```http
GET /api/v1/wallet
GET /api/v1/wallet/transactions?page=1&limit=20
```

Overview `data`:

```json
{
  "balance": "125.50",
  "reserved": "25.00",
  "available": "100.50",
  "currency": "INR",
  "status": "ACTIVE"
}
```

| Field | UI |
|---|---|
| `available` | Large amount. Label **Available to spend**. This is what checkout can use. |
| `balance` | Smaller line: **Posted ₹125.50** |
| `reserved` | Same line, only when `reserved > 0`: **· Reserved ₹25.00**. Held for an unpaid checkout. Not spendable. |
| `status` | Show `ACTIVE`, `FROZEN`, or `DISABLED`. Only `ACTIVE` with `available > 0` can pay. |

Transactions `data`:

```json
{
  "items": [
    {
      "id": "<ledger-uuid>",
      "direction": "CREDIT",
      "type": "COD_REFUND",
      "amount": "125.50",
      "balanceAfter": "125.50",
      "currency": "INR",
      "orderId": "<order-uuid-or-null>",
      "orderNumber": "CK12345",
      "refundRequestId": "<uuid-or-null>",
      "returnRequestId": "<uuid-or-null>",
      "paymentRequestId": "<uuid-or-null>",
      "reservationId": "<uuid-or-null>",
      "createdAt": "2026-10-21T10:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1,
  "totalPages": 1
}
```

Newest first. `balanceAfter` is history only. Live spendable amount always comes from `GET /wallet`.

### 3.2 Transaction row (match web copy)

Group by calendar day: **Today**, **Yesterday**, otherwise `21 Oct 2026`.

| `type` | Title |
|---|---|
| `COD_REFUND`, `ORIGINAL_WALLET_REFUND`, `GATEWAY_REFUND_TO_WALLET` | Refund credited |
| `CHECKOUT_DEBIT` | Checkout payment |
| `RESERVATION_HOLD` | Amount reserved |
| `RESERVATION_RELEASE` | Reservation released |
| anything else | Humanize the enum (`CHECKOUT_DEBIT` style → words) |

| `direction` | Amount | Badge | Time line |
|---|---|---|---|
| `CREDIT` | `+ ₹125.50` | Completed | `Credited on 21 Oct 2026 \| 10:00 am` |
| `DEBIT` | `- ₹125.50` | Success | `Debited on 21 Oct 2026 \| 10:00 am` |

If `orderId` is set, show **Order {orderNumber}** and open that order (`GET /api/v1/orders/:orderId`). If only `orderNumber` is set, show the number with no navigation.

Also show the humanized `type` as a secondary method line (web does).

Empty list: **No transactions yet.**

### 3.3 Screen states

| State | UI |
|---|---|
| First load | “Loading wallet…” |
| Success | Balance card + transaction list |
| Next page | Button **Next page** while `page < totalPages`. Append items; do not replace the balance card. |
| Error and no wallet yet | Message + **Retry** (reload page 1 of both calls) |
| Refresh error while a wallet is already on screen | Keep the card; show the error |

There is no pull-to-add-money and no debit button.

---

## 4. Checkout UI

Payment section title: **Payment Method**.

Three rows, in this order:

1. **Prepaid (Online Payment)** — UPI, cards, net banking. If prepaid % &gt; 0, subtitle `{percent}% extra off on prepaid`.
2. **Cash on Delivery** — existing COD rules. Wallet does not apply.
3. **Cureka Wallet** (short label **Wallet**). This is a **toggle on top of Prepaid**, not a third payment method that replaces Prepaid or COD.

### 4.1 When the wallet row is enabled

All of these must be true:

1. Customer is signed in and verified.
2. `GET /api/v1/public/checkout/provider` returned `walletCheckoutEnabled: true`.
3. `checkoutProvider` is **not** `gokwik`.
4. User has selected **Prepaid**, not COD, and not “nothing selected”.
5. `GET /api/v1/wallet` succeeded, `status === "ACTIVE"`, and `Number(available) > 0`.

Enabled subtitle:

`Available ₹100.50. Applied with prepaid; remainder charged online.`

Tapping the row toggles it. It does not change the selected method away from Prepaid.

### 4.2 When the row stays visible but disabled

| Situation | Disabled reason |
|---|---|
| Prepaid not selected | Select Prepaid (Online Payment) to enable wallet |
| `walletCheckoutEnabled !== true` | Wallet checkout is unavailable |
| GoKwik provider, or no spendable balance, or wallet request failed | No wallet balance available |
| User switches to COD | Turn the toggle **off**. Do not keep `useWallet` for the COD request. |

If the provider call fails, treat wallet checkout as **off** (fail closed).

### 4.3 Bill preview while the toggle is on

This preview is **local**. The server recalculates at pay time.

Take the current prepaid bill total (`totalValue` after discounts, shipping, prepaid discount). Then:

```text
applied = min(available, totalValue)     # round to 2 decimals
payableOnline = totalValue - applied
```

Add lines:

| Line | Value |
|---|---|
| Cureka Wallet | `− applied` |
| Pay online | `payableOnline`, only when `payableOnline > 0` |

Footer:

| `payableOnline` | Label | Amount |
|---|---|---|
| &gt; 0 | Amount to pay online | `payableOnline` |
| 0 | Amount to be paid | `0` |

Do not change the cart on the server for this preview. Do not send `applied` in the pay request.

---

## 5. Pay API flow

Same checkout as web Pay Now. Wallet is one extra boolean.

```text
User taps Pay
  → Require address (legacy / Razorpay / Cashfree)
  → POST /orders/checkout          # pricing preview, no useWallet
  → POST /payment-requests/checkout/modal
       body includes useWallet: true only if the toggle is on AND method is prepaid AND provider is not gokwik
  → Branch:
       A. Response is a placed order (no paymentData) → full wallet, skip SDK
       B. Response has gateway + paymentData → open that gateway for paymentData.amount only
```

### 5.1 Provider

```http
GET /api/v1/public/checkout/provider
```

```json
{
  "checkoutProvider": "legacy",
  "nativeGateway": "razorpay",
  "walletCheckoutEnabled": true,
  "addressRequired": true
}
```

| `checkoutProvider` | Wallet |
|---|---|
| `gokwik` | Do not send `useWallet`. Open GoKwik as today. |
| `legacy` | Native Razorpay or Cashfree. Wallet allowed when the flag is true and the user opted in. |
| `shiprocket` | Same as web: do not invent a wallet SDK. Fall back to the checkout screen. |

### 5.2 Price check (no wallet flag)

```http
POST /api/v1/orders/checkout
Content-Type: application/json

{
  "addressId": "<address-uuid>",
  "paymentMethod": "RAZORPAY"
}
```

`RAZORPAY` here means **prepaid pricing** (prepaid % and fees). It does not choose the SDK. Admin config still picks Razorpay vs Cashfree vs GoKwik.

COD pricing uses `"paymentMethod": "COD"` and never `useWallet`.

### 5.3 Create the payment

```http
POST /api/v1/payment-requests/checkout/modal
Content-Type: application/json
Idempotency-Key: <new-uuid-per-attempt>

{
  "addressId": "<address-uuid>",
  "paymentMethod": "RAZORPAY",
  "useWallet": true
}
```

Omit `useWallet` when the toggle is off. Never send `useWallet: false` as a requirement; omitting it is the web behavior.

Retry the **same** attempt with the **same** `Idempotency-Key`. A new tap gets a new key.

### 5.4 Branch A — wallet covers the whole payable

The JSON `data` is an **order**, not a gateway session. Detect it the way web does:

- Has `id`, `grandTotal`, and `orderNumber` or `refId`
- Does **not** have `paymentData` or `razorpayOrderId`

```json
{
  "id": "<order-uuid>",
  "refId": "<order-ref>",
  "orderNumber": "CK12345",
  "grandTotal": "610.00"
}
```

App must:

1. Not open Razorpay, Cashfree, or GoKwik.
2. Clear the cart (`DELETE /api/v1/cart` or the app’s existing clear-cart call).
3. Open the order-success screen.
4. Payment method label: **Wallet**.
5. Bill: **Cureka Wallet −₹610.00** (the order total). Footer **Amount to be paid ₹0.00**. `grandTotal` on this response is the order total before you subtract wallet in the footer. The customer has nothing left to pay.

### 5.5 Branch B — wallet covers part, gateway charges the rest

```json
{
  "gateway": "razorpay",
  "checkoutProvider": "razorpay",
  "paymentData": {
    "paymentRequestId": "<uuid>",
    "refId": "<ref>",
    "razorpayOrderId": "<rzp-order>",
    "keyId": "<key>",
    "amount": 75.5,
    "currency": "INR",
    "totalAmount": "75.50",
    "walletAmount": "25.00",
    "gatewayAmount": "75.50",
    "eligibleTotal": "100.50",
    "prepaidDiscount": "0.00",
    "customer": { "name": "", "email": "", "contact": "" }
  }
}
```

Cashfree is the same idea: `gateway: "cashfree"`, `paymentSessionId`, `cfOrderId`, `environment`.

| Field | Use |
|---|---|
| `paymentData.amount` | **Only** amount to pass into the SDK |
| `gatewayAmount` / `totalAmount` | Same remainder, rupee string, for your bill UI |
| `walletAmount` | What the server reserved from the wallet |
| `eligibleTotal` | Payable before the split (`walletAmount + gatewayAmount`) |

Do not open a second payment for the wallet share. Do not charge `eligibleTotal` or the cart grand total.

Branch on `gateway`:

- `razorpay` → Razorpay Checkout with `keyId`, `razorpayOrderId`, `amount`, `currency`, `customer`
- `cashfree` → Cashfree with `paymentSessionId` and `environment`
- `gokwik` → existing GoKwik path. If you somehow sent `useWallet`, still follow `gateway` and do not also charge wallet yourself. The correct app behavior is to never send `useWallet` for GoKwik.

### 5.6 Verify, dismiss, success

Razorpay success:

```http
POST /api/v1/payment-requests/checkout/modal/verify
Idempotency-Key: <new-uuid>

{
  "razorpay_order_id": "...",
  "razorpay_payment_id": "...",
  "razorpay_signature": "..."
}
```

Cashfree success:

```http
POST /api/v1/payment-requests/checkout/modal/verify

{
  "cf_order_id": "...",
  "cf_payment_id": "..."
}
```

`cf_payment_id` is optional. Verify `data` includes `paymentRequestId`, `refId`, and `totalAmount` (the **gateway** part, not the wallet part).

Then: order-success screen, clear cart, reload wallet (`GET /wallet`) so reserved funds drop after settlement.

User closes the sheet:

```http
POST /api/v1/payment-requests/checkout/modal/cancel

{ "paymentRequestId": "<paymentData.paymentRequestId>" }
```

Cancel does **not** prove the payment failed. If verify times out, keep a pending state and re-check the order. Do not tell the user the wallet was released until overview `reserved` drops or the order is paid.

---

## 6. Order success and order detail

Read the order when you can:

```http
GET /api/v1/orders/:id
```

Use integer paise fields:

- `walletAmountPaise` — wallet tender
- `gatewayAmountPaise` — remainder paid (or still payable) on the gateway
- `grandTotal` — order total **before** subtracting wallet
- `paymentMethod` — `RAZORPAY`, `CASHFREE`, `WALLET`, `COD`, …

Footer the customer sees (same as web):

```text
walletRupees  = walletAmountPaise / 100
gatewayRupees = gatewayAmountPaise / 100
payable       = walletRupees > 0 ? gatewayRupees : grandTotal
```

| Case | Payment method label | Bill lines | Footer |
|---|---|---|---|
| Full wallet (`wallet > 0`, `gateway <= 0`) | Wallet | Cureka Wallet −₹wallet | Amount to be paid **₹0.00** |
| Split (`wallet > 0`, `gateway > 0`) | `Wallet + {gateway label}` | Cureka Wallet −₹wallet, then Pay online ₹gateway | Amount to pay online **₹gateway** |
| No wallet | Existing label (Razorpay, Cashfree, Cash on Delivery, …) | No wallet line | Amount to be paid = grand total |

Gateway labels: Razorpay, Cashfree, GoKwik Prepaid, GoKwik Partial COD, Cash on Delivery.

Example: order total ₹610, paid fully from wallet. Do **not** show Amount to be paid ₹610. Show wallet −₹610 and **₹0** still to pay.

---

## 7. Buy Now vs Checkout

| Entry | Wallet |
|---|---|
| PDP **Buy Now** while provider is GoKwik | No wallet. See the Buy Now guide. |
| PDP **Buy Now** while provider is legacy and the user never opened Checkout | Web does not silently turn wallet on. Do not send `useWallet` unless this user turned the toggle on. |
| Cart → Checkout → Prepaid → Cureka Wallet on → Pay | This guide. |

---

## 8. Errors to handle

| Situation | What to show |
|---|---|
| `Cureka Wallet checkout is not enabled` | Turn the toggle off. Row disabled: Wallet checkout is unavailable. |
| `useWallet` with COD | You should not send this. If it happens, stay on checkout and show the message. |
| Wallet not `ACTIVE` or `available` is 0 | Disabled row. Do not send `useWallet`. |
| Modal returns GoKwik | Open GoKwik only. Ignore any local wallet preview. |
| Full-wallet response | Success screen, no SDK. |
| Verify timeout | Pending. Do not mark the payment failed and do not add the reserved amount back in the UI. |

---

## 9. Checklist

- [ ] Wallet screen shows **available** as the main balance, plus posted and reserved.
- [ ] Ledger titles, +/− amounts, day groups, and order link match section 3.
- [ ] No add-money or manual debit.
- [ ] Checkout shows Cureka Wallet under Prepaid and COD.
- [ ] Toggle enables only for prepaid + flag on + not GoKwik + active spendable balance.
- [ ] Pay sends `useWallet: true` and no amount.
- [ ] SDK is charged `paymentData.amount` only.
- [ ] Full wallet skips the SDK and shows ₹0 to pay.
- [ ] Order detail footer uses gateway paise, not `grandTotal`, when wallet was used.
