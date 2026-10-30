# PDP “Buy Now” — Mobile App Integration

Use this spec so the **mobile app PDP Buy Now** behaves the same as the Cureka website (web storefront).

Source of truth on web:

- PDP CTA: `ProductPurchasePanel` / `ProductStickyPurchaseBar` → add line → `useCartGoKwikCheckout`
- Checkout runner: `runCheckout("online")` in `checkoutSlice` (never COD from this entry)

---

## 1. Product rule (must match website)

**Buy Now is prepaid / online only.**

| Entry point | Allowed payment | COD |
|---|---|---|
| PDP **Buy Now** | Online (GoKwik / Razorpay / Cashfree / full wallet cover) | **Never** |
| Cart / Checkout screen (user picks COD) | COD only when user explicitly selects it | Yes |

Do **not**:

- Call `POST /orders` with `paymentMethod: "COD"` from Buy Now
- Default missing payment selection to COD
- Send `useWallet: true` when the active provider is GoKwik
- Send `paymentMethod: "GOKWIK_PREPAID"` when *opening* checkout (that value is written by GoKwik callbacks after order — not for modal open)

For modal / validate pricing on Buy Now, send prepaid method **`RAZORPAY`** (pricing only). Admin flags still decide which gateway SDK opens.

---

## 2. Auth gate (same as web)

```text
Tap Buy Now
  → Ensure selected PDP variant is in cart (add if missing)
  → If not logged in / no verified session
       → Open sign-in (intent: cart_checkout)
       → After success, resume Buy Now (do not place COD)
  → If purchase mode is Subscribe
       → Navigate to in-app Checkout screen (user completes there)
  → Else
       → Start express online checkout (section 4)
```

- Guest / unverified users must not open GoKwik or native PG from this CTA.
- After OTP / sign-in success, **resume the same Buy Now path** (add if needed → express online), same as web `intent: "cart_checkout"`.

---

## 3. Cart step before checkout

### 3.1 Ensure the **selected PDP variant** is in the cart

```http
POST /api/v1/cart/items
Content-Type: application/json
Authorization: Bearer <customer_session>   # or session cookie, same as rest of app

{
  "productId": "<product-uuid>",
  "variantId": "<selected-variant-uuid>",
  "quantity": 1
}
```

Subscription Buy Now (if app supports it on PDP):

```json
{
  "productId": "<product-uuid>",
  "variantId": "<selected-variant-uuid>",
  "quantity": 1,
  "isSubscription": true,
  "frequency": "<frequency-from-PDP>"
}
```

**Critical — wrong SKU bug:**

- Always pass the **currently selected** `variantId` from PDP state.
- Never resolve “any variant of this product” or fall back to `productId`-only cart matching.
- If the line already exists for that `variantId` (+ same one-time vs subscribe type), do not invent a different variant; proceed to checkout.

### 3.2 Out-of-stock guard

If cart contains out-of-stock lines, **stop** and show a friendly error (same as web). Do not open payment.

### 3.3 Address for non-GoKwik

```http
GET /api/v1/users/addresses
```

Resolve `addressId`:

1. User’s currently selected delivery address, else
2. Default address, else
3. First address

| Provider | Address before modal |
|---|---|
| `gokwik` | Preferred if present; can omit when backend allows address-less (GoKwik UI collects it). If public provider says `addressRequired: true`, require it. |
| `legacy` (Razorpay/Cashfree) / `shiprocket` | **Required**. If missing → open in-app Checkout with **online / prepaid** preselected (`pay=online` equivalent). Never open COD. |

---

## 4. Express online checkout (Buy Now / Pay Now)

This is the path web uses after a successful add + auth.

### 4.1 Resolve checkout mode

```http
GET /api/v1/public/checkout/provider
```

Example shapes:

```json
{
  "checkoutProvider": "gokwik",
  "gateway": "gokwik",
  "addressRequired": false,
  "walletCheckoutEnabled": false
}
```

```json
{
  "checkoutProvider": "legacy",
  "nativeGateway": "razorpay",
  "walletCheckoutEnabled": true
}
```

Map:

| `checkoutProvider` / `gateway` | App UX |
|---|---|
| `gokwik` | GoKwik SDK / WebView checkout |
| `shiprocket` | Fall back to full Checkout screen (online). Do not invent Shiprocket UX. |
| anything else (`legacy`) | Native Razorpay or Cashfree from modal `gateway` |

Retry once on transient failure of this public endpoint (web does).

### 4.2 Validate pricing (online / prepaid)

```http
POST /api/v1/orders/checkout
Content-Type: application/json

{
  "addressId": "<uuid-if-available>",
  "paymentMethod": "RAZORPAY"
}
```

- Always send `paymentMethod` so prepaid % / fees apply.
- For Buy Now this is always the **online** path → body uses `RAZORPAY` (or `CASHFREE` if you deliberately prefer that for pricing). **Not** `COD`.

### 4.3 Create modal / payment session

```http
POST /api/v1/payment-requests/checkout/modal
Content-Type: application/json
Idempotency-Key: <new-uuid-per-attempt>

{
  "addressId": "<uuid-if-available>",
  "paymentMethod": "RAZORPAY"
}
```

Optional native wallet (only when provider is **not** GoKwik and `walletCheckoutEnabled === true` and user opted in):

```json
{
  "addressId": "<uuid>",
  "paymentMethod": "RAZORPAY",
  "useWallet": true
}
```

**Never** send `useWallet` on GoKwik Buy Now.

Response branches (normalized):

#### A) Full wallet cover — order already placed

```json
{
  "kind": "wallet_order",
  "order": {
    "id": "<order-uuid>",
    "refId": "...",
    "orderNumber": "...",
    "grandTotal": "999.00"
  }
}
```

App must:

1. Show order success / confirmation (use `orderNumber` / `refId` / `id`)
2. Clear cart: `DELETE /api/v1/cart` (or your existing clear-cart API)
3. **Do not** open any payment SDK

#### B) Gateway session

```json
{
  "gateway": "gokwik" | "razorpay" | "cashfree",
  "checkoutProvider": "...",
  "paymentData": { ... }
}
```

Branch on **`gateway`** (authoritative). Do not assume Razorpay when provider said gokwik but modal returned something else — follow `gateway`.

---

## 5. Gateway handling

### 5.1 GoKwik (`gateway === "gokwik"`)

`paymentData` includes at least:

| Field | Use |
|---|---|
| `merchantCheckoutId` | Cureka **cart UUID** — pass unchanged to GoKwik |
| `appId` / `merchantId` | SDK init |
| `amount` / `currency` | Display / init |
| `customerToken` | **Required** — short-lived (~45 min) checkout-only token |
| `customer.contact` / `name` / `email` | Prefill when present |

**Security (P0):**

- Pass **only** `paymentData.customerToken` into GoKwik.
- Do **not** pass login Bearer / long-lived `user_session` as `customerToken`.
- If `customerToken` is missing → fail closed; show error; do not open SDK.

Phone: GoKwik expects 10-digit IN mobile when passed (strip `91` prefix if 12 digits).

On success: GoKwik / backend callbacks create the order. App should:

- Navigate to thank-you / order confirmation using allowlisted redirect or `order_id` from completion payload
- Refresh or clear local cart after confirmed success (backend may already empty cart via callbacks — reload `GET /cart` to sync)

On user cancel / close: stay on PDP or cart; do **not** place COD.

Reference: `docs/gokwik-frontend-backend-handoff.md`, `docs/gokwik-checkout-token-security.md`.

### 5.2 Razorpay (`gateway === "razorpay"`)

1. Open Razorpay Checkout with `paymentData` (`keyId`, `razorpayOrderId`, `amount`, `currency`, `customer`, …).
2. On success, verify:

```http
POST /api/v1/payment-requests/checkout/modal/verify
Idempotency-Key: <new-uuid>

{
  "razorpay_order_id": "...",
  "razorpay_payment_id": "...",
  "razorpay_signature": "..."
}
```

3. On verify success → confirmation UI → clear cart.
4. On dismiss → optional `POST /payment-requests/checkout/modal/cancel` with `{ "paymentRequestId": "..." }` (does not prove payment failed).

### 5.3 Cashfree (`gateway === "cashfree"`)

1. Open Cashfree with `paymentSessionId` / env from `paymentData`.
2. Verify:

```http
POST /api/v1/payment-requests/checkout/modal/verify
Idempotency-Key: <new-uuid>

{
  "cf_order_id": "...",
  "cf_payment_id": "..."
}
```

3. Same post-success: confirmation → clear cart.

### 5.4 Provider said gokwik but modal is not gokwik

If `GET /public/checkout/provider` returned gokwik but modal `gateway` is `razorpay` / `cashfree`, run the **native** path above (same as web fallback). Still **online only**.

---

## 6. End-to-end flowchart

```text
PDP Buy Now
    │
    ├─ Subscribe mode? ──yes──► In-app Checkout screen
    │
    ├─ Add selected variant to cart (POST /cart/items)
    │     └─ fail → toast, stop
    │
    ├─ Authenticated?
    │     └─ no → Sign-in → resume Buy Now
    │
    ├─ GET /public/checkout/provider
    │
    ├─ Load addresses; resolve addressId
    │
    ├─ provider !== gokwik && !addressId
    │     └─► Checkout screen with online preselected
    │
    ├─ POST /orders/checkout { paymentMethod: RAZORPAY, addressId? }
    │
    ├─ POST /payment-requests/checkout/modal
    │     { paymentMethod: RAZORPAY, addressId?, useWallet? (never on gokwik) }
    │     + Idempotency-Key
    │
    ├─ wallet_order? ──yes──► Confirm + clear cart
    │
    ├─ gateway = gokwik ──► GoKwik SDK (customerToken from paymentData only)
    ├─ gateway = razorpay ──► Razorpay → verify → clear cart
    └─ gateway = cashfree ──► Cashfree → verify → clear cart
```

---

## 7. API checklist (Buy Now)

| Step | Method | Path |
|---|---|---|
| Add SKU | `POST` | `/api/v1/cart/items` |
| Addresses | `GET` | `/api/v1/users/addresses` |
| Provider | `GET` | `/api/v1/public/checkout/provider` |
| Validate | `POST` | `/api/v1/orders/checkout` |
| Start pay | `POST` | `/api/v1/payment-requests/checkout/modal` |
| Verify native PG | `POST` | `/api/v1/payment-requests/checkout/modal/verify` |
| Cancel modal | `POST` | `/api/v1/payment-requests/checkout/modal/cancel` |
| Clear cart | existing cart clear / reload `GET /api/v1/cart` | |

Common envelope: `{ "success": true, "data": ... }` on success.

Send a **new** `Idempotency-Key` for each modal / verify attempt.

---

## 8. Hard rules (parity with website)

1. Buy Now / Pay Now → **`online` only**. No COD placement from this CTA.
2. Modal open pricing method → **`RAZORPAY`** (not `GOKWIK_PREPAID`).
3. Cart line = **exact PDP `variantId`**.
4. GoKwik `customerToken` = modal `paymentData.customerToken` only.
5. `useWallet` never with GoKwik or COD.
6. Full wallet response → treat as paid order; clear cart; no SDK.
7. Missing address on legacy PG → Checkout with online preselected, not COD.
8. Subscribe Buy Now → full Checkout screen (not express GoKwik path), matching web.

---

## 9. QA checklist

- [ ] Buy Now while logged out → sign-in → resumes online checkout (not COD)
- [ ] Buy Now with GoKwik on → SDK opens; order completes; cart empty / synced
- [ ] Buy Now with GoKwik off (Razorpay/Cashfree) → native PG → verify → cart cleared; **no COD order**
- [ ] Buy Now without address (legacy) → Checkout online, not COD order
- [ ] Selected variant A on PDP → cart / order contain variant A (not sibling SKU)
- [ ] OOS cart → blocked with error
- [ ] Wallet full cover (when enabled, non-GoKwik) → confirmation without PG
- [ ] User cancels PG → no order; cart still has items
- [ ] Subscribe Buy Now → Checkout screen, not silent COD

---

## 10. Related docs

- `docs/gokwik-frontend-backend-handoff.md` — `customerToken` security
- `docs/gokwik-checkout-token-security.md`
- `docs/wallet-frontend-integration-guide.md` — `useWallet` / native wallet
- `docs/customer-wallet-api-integration.md`
- `docs/payment-docs/gokwik-integration-audit-and-frontend-handoff.md`
