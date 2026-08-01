# Prepaid Discount & COD Order Limits — Frontend Integration

Cart/checkout pricing stays **admin-driven**. Two new rules:

1. **Prepaid:** extra **% discount** on every product line when the customer pays prepaid
2. **COD:** order payable must be between **min** and **max** (defaults ₹599 – ₹10,000)

**Base URL:** `/api/v1`  
**Auth:** session (same as cart / orders)

---

## Keys to pass from the frontend

| Where | Field / query | Values |
|-------|----------------|--------|
| `GET /cart` | query `paymentMethod` (optional) | See enum below |
| `POST /orders/checkout` | body `paymentMethod` (optional) | Same |
| `POST /orders` (place order) | body `paymentMethod` (required for COD / prepaid pricing) | Same |

### `paymentMethod` enum (exact strings)

| Value | Role |
|-------|------|
| `RAZORPAY` | Prepaid → applies prepaid discount |
| `CASHFREE` | Prepaid → applies prepaid discount |
| `WALLET` | Prepaid → applies prepaid discount |
| `GOKWIK_PREPAID` | Prepaid (GoKwik path) → applies prepaid discount when priced with this method |
| `COD` | COD → COD fee (if configured) + **min/max validation** |
| `GOKWIK_PARTIAL_COD` | Partial COD — **not** treated as full prepaid (no % prepaid discount) |

Without `paymentMethod`, `prepaidDiscount` and `codCharge` stay `0` (preview only).

---

## Admin setting keys (backend / admin panel)

Configure under **cart charges** (same admin settings APIs as shipping/handling):

| Admin key | Default | Meaning |
|-----------|---------|---------|
| `prepaid_discount_percent` | `2` | Extra % off **each product line total** when prepaid |
| `cod_min_order_amount` | `599` | Min payable for COD (₹) |
| `cod_max_order_amount` | `10000` | Max payable for COD (₹) |

Existing (unchanged):

| Admin key | Notes |
|-----------|--------|
| `prepaid_charge` + `prepaid_charge_threshold` | Optional **flat** prepaid discount (threshold-gated; `0` = off) |
| `cod_charge` + `cod_charge_threshold` | Optional COD fee (threshold-gated) |

Payable for COD limits = **`subtotal − discountAmount`** (coupon), before shipping/fees.

---

## Response fields (cart & checkout)

Every cart / checkout pricing payload now includes:

```json
{
  "subtotal": 2000,
  "discountAmount": 100,
  "shippingAmount": 0,
  "handlingAmount": 0,
  "platformFee": 0,
  "codCharge": 0,
  "prepaidDiscount": 38,
  "grandTotal": 1862,
  "checkoutRules": {
    "prepaidDiscountPercent": 2,
    "codMinOrderAmount": 599,
    "codMaxOrderAmount": 10000
  }
}
```

| Field | Use on FE |
|-------|-----------|
| `prepaidDiscount` | Amount already subtracted in `grandTotal` when prepaid method is selected |
| `checkoutRules.prepaidDiscountPercent` | Show “X% off on prepaid” badge (live from admin) |
| `checkoutRules.codMinOrderAmount` | Disable / hide COD when payable &lt; min |
| `checkoutRules.codMaxOrderAmount` | Disable / hide COD when payable &gt; max |

### Prepaid math

```
prepaidPercentDiscount = Σ round(line.totalPrice × prepaid_discount_percent / 100)
prepaidDiscount = prepaidPercentDiscount + (optional flat prepaid_charge if threshold allows)
grandTotal = subtotal − coupon − prepaidDiscount + shipping + handling + platformFee + codCharge
```

---

## Recommended FE flow

1. **Load cart** with selected method for live totals:

```http
GET /api/v1/cart?paymentMethod=RAZORPAY
```

or

```http
GET /api/v1/cart?paymentMethod=COD
```

2. Read `checkoutRules` and merchandise payable:

```ts
const payable = subtotal - discountAmount;
const codAllowed =
  payable >= checkoutRules.codMinOrderAmount &&
  payable <= checkoutRules.codMaxOrderAmount;
```

3. On method change, **re-fetch cart** (or checkout) with the new `paymentMethod` so `prepaidDiscount` / `codCharge` / `grandTotal` update.

4. **Place order / checkout** with the same `paymentMethod` the user selected.

### COD errors (backend)

If COD is used outside the range:

- Below min: `Cash on Delivery is available for orders of at least Rs. 599`
- Above max: `Cash on Delivery is available for orders up to Rs. 10000`

(Amounts follow current admin values.)

---

## Quick checklist

- [ ] Pass `paymentMethod` on cart preview and place-order
- [ ] Show prepaid % from `checkoutRules.prepaidDiscountPercent`
- [ ] Show/hide COD using `codMinOrderAmount` / `codMaxOrderAmount` vs `subtotal - discountAmount`
- [ ] Display `prepaidDiscount` as a line item when &gt; 0
- [ ] Do not hardcode `2` / `599` / `10000` — use `checkoutRules` (or admin) so panel changes apply without a FE deploy
