# Cureka × GoKwik — Merchant Callback APIs (MVP)

Shareable reference for GoKwik sandbox / certification.

**Base URL (replace with your deployed API host):**

```text
https://<API_HOST>/api/v1/gokwik
```

**Auth headers (cart + order endpoints below):**

| Header | Value |
|--------|--------|
| `Content-Type` | `application/json` |
| `x-gokwik-callback-secret` | Shared secret configured as `GOKWIK_CALLBACK_SECRET` |
| `Authorization` | `Bearer <Cureka user session token>` from `verify-otp` / `complete-registration` |

The Bearer token must belong to the same Cureka user who owns `cart_id` / `session_key`.  
Webhooks under `/gokwik/webhooks/*` use provider/callback secret only (no user Bearer).

Responses use GoKwik’s raw shapes (`@RawResponse`). They are **not** wrapped in Cureka’s usual `{ success, message, data }` envelope.

**Identifiers**

| GoKwik field | Cureka meaning |
|--------------|----------------|
| `cart_id` / `session_key` / `merchantCheckoutId` | Active cart UUID (`carts.id`) |
| `order_id` | Merchant order number (`orders.order_number`) |

**Required env for Place Order thank-you URL:** `STOREFRONT_URL` (e.g. `https://beta.cureka.com`)

---

## Flow (MVP)

```text
1. Get Cart
2. Create Order          → draft PENDING
3. Place Order           → CONFIRMED + thankyou_redirect_url
4. Check Order Exists    → failsafe / retry / auto-refund guard
5. Remove Out Of Stock   → same cart shape as Get Cart
```

---

## 1. Get Cart

`POST /api/v1/gokwik/get-cart`

Fetches cart line items, pricing, discounts, shipping, and payable total.

### cURL

```bash
curl --request POST 'https://<API_HOST>/api/v1/gokwik/get-cart' \
  --header 'Content-Type: application/json' \
  --header 'x-gokwik-callback-secret: <GOKWIK_CALLBACK_SECRET>' \
  --header 'Authorization: Bearer <CUREKA_USER_SESSION_TOKEN>' \
  --data '{
    "cart_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }'
```

### Request

```json
{
  "cart_id": "<cart UUID / merchantCheckoutId>"
}
```

### Success `200`

```json
{
  "data": {
    "cart": {
      "subtotal": 2000,
      "discount_total": 100,
      "shipping_total": 49,
      "total": 1949,
      "currency": "INR",
      "wallet_credit_used": 0,
      "membership_discount": 0,
      "cashback_amount": 0,
      "total_tax": 0,
      "items": [
        {
          "product_id": "11111111-1111-1111-1111-111111111111",
          "variant_id": "22222222-2222-2222-2222-222222222222",
          "collection_ids": ["cat-uuid", "subcat-uuid"],
          "sku": "SKU-001",
          "price": 1000,
          "mrp": 1200,
          "total": 2000,
          "quantity": 2,
          "title": "Sample Product",
          "image_url": "https://cdn.example.com/product.jpg",
          "salable_qty": 8,
          "stock_status": "IN_STOCK",
          "metaData": [
            { "label": "Size", "value": "M" }
          ],
          "metadata": {
            "pre_checkout_location": {
              "city": "Chennai",
              "state": "Tamil Nadu",
              "pincode": "600001",
              "country": "India"
            },
            "product_details": [
              { "label": "Size", "value": "M" }
            ]
          }
        }
      ],
      "discounts": [
        {
          "amount": 100,
          "code": "SAVE100",
          "description": "Flat 100 off",
          "type": "CART_DISCOUNT",
          "tnc": ""
        }
      ],
      "available_payment_methods": [],
      "available_coupons": [],
      "available_shipping_methods": [],
      "order_summary_extra_fields": [
        { "name": "Platform Fee", "value": 0 },
        { "name": "COD Charge", "value": 0 }
      ]
    }
  }
}
```

### Error examples

```json
{ "data": { "error": "Invalid cart id" } }
```

```json
{ "data": { "error": "not authorized" } }
```

---

## 2. Create Order

`POST /api/v1/gokwik/create-order`

Creates a **draft** order (`PENDING`) before / around payment. Idempotent for the same `cart_id` (returns existing `order_id`).

### cURL

```bash
curl --request POST 'https://<API_HOST>/api/v1/gokwik/create-order' \
  --header 'Content-Type: application/json' \
  --header 'x-gokwik-callback-secret: <GOKWIK_CALLBACK_SECRET>' \
  --data '{
    "cart_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "customer_phone": "9876543210",
    "payment_details": {
      "payment_method": "prepaid",
      "payment_amount": 1949,
      "payment_id": "pay_GK_001",
      "payment_instrument": "upi",
      "pg_payment_trnx_id": "txn_GK_001"
    },
    "shipping_address": {
      "first_name": "Rahul",
      "last_name": "Sharma",
      "address": "12 MG Road",
      "pincode": "560001",
      "city": "Bengaluru",
      "state": "Karnataka",
      "email": "rahul@example.com",
      "phone": "9876543210"
    },
    "billing_address": {
      "first_name": "Rahul",
      "last_name": "Sharma",
      "address": "12 MG Road",
      "pincode": "560001",
      "city": "Bengaluru",
      "state": "Karnataka",
      "email": "rahul@example.com",
      "phone": "9876543210"
    },
    "meta_data": {
      "gokwik_order_id": "gk_ord_001",
      "rto_risk_flag": "low",
      "discounts": [
        {
          "amount": 100,
          "code": "SAVE100",
          "description": "Flat 100 off",
          "type": "Coupon Discount",
          "tnc": ""
        }
      ]
    }
  }'
```

### Request notes

| Field | Required | Notes |
|-------|----------|--------|
| `cart_id` | Yes | Active cart UUID |
| `customer_phone` | Yes | 10-digit Indian mobile (`^[6-9]\d{9}$`) — must match cart owner |
| `payment_details` | Yes | `payment_method`: `cod` \| `prepaid` \| `pp-cod` |
| `shipping_address` | Yes (Cureka) | `phone` must match `customer_phone` |
| `billing_address` | No | Same shape as shipping |
| `meta_data` | No | discounts, other_charges, ppcod, gokwik_order_id, etc. |
| `payment_details.payment_amount` | Yes | Must match Cureka cart / order grand total |

### Success `200`

```json
{
  "status": "success",
  "order_id": "ORD202607210001"
}
```

### Error examples

```json
{ "data": { "error": "Invalid cart id" } }
```

```json
{ "data": { "error": "not authorized" } }
```

```json
{
  "status": "failed",
  "order_id": "",
  "reason": "product is not available"
}
```

*(Business failures may also surface as HTTP 4xx with `{ "data": { "error": "..." } }` depending on the exception path.)*

---

## 3. Place Order

`POST /api/v1/gokwik/place-order`

Confirms the draft after successful payment: stock decrement, coupon usage, cart clear, order → `CONFIRMED`, fulfillment kickoff.

Requires `STOREFRONT_URL` so `thankyou_redirect_url` can be built.

### cURL

```bash
curl --request POST 'https://<API_HOST>/api/v1/gokwik/place-order' \
  --header 'Content-Type: application/json' \
  --header 'x-gokwik-callback-secret: <GOKWIK_CALLBACK_SECRET>' \
  --data '{
    "order_id": "ORD202607210001",
    "cart_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "customer_phone": "9876543210",
    "payment_details": {
      "payment_method": "prepaid",
      "payment_amount": 1949,
      "payment_id": "pay_GK_001",
      "payment_instrument": "upi",
      "pg_payment_trnx_id": "txn_GK_001"
    },
    "shipping_address": {
      "first_name": "Rahul",
      "last_name": "Sharma",
      "address": "12 MG Road",
      "pincode": "560001",
      "city": "Bengaluru",
      "state": "Karnataka",
      "email": "rahul@example.com",
      "phone": "9876543210"
    },
    "order_note": "Leave at reception",
    "user_details": {
      "email": "rahul@example.com",
      "phone": "9876543210",
      "first_name": "Rahul",
      "last_name": "Sharma"
    },
    "utm_details": {
      "utm_source": "google",
      "utm_medium": "cpc",
      "utm_campaign": "summer_sale"
    },
    "meta_data": {
      "gokwik_order_id": "gk_ord_001",
      "rto_risk_flag": "low"
    }
  }'
```

### Request notes

| Field | Required | Notes |
|-------|----------|--------|
| `order_id` | Yes (Cureka) | Must match draft created for this `cart_id` |
| `cart_id` | Yes | Same checkout session |
| `customer_phone` | Yes | Must match cart customer |
| `payment_details` | Yes | Amount must match order grand total |
| Addresses / user / utm / meta | Optional | Stored / validated as provided |

### Success `200`

```json
{
  "status": "success",
  "order_id": "ORD202607210001",
  "thankyou_redirect_url": "https://beta.cureka.com/thankyou?order_id=ORD202607210001"
}
```

### Error examples

```json
{ "data": { "error": "STOREFRONT_URL is required for GoKwik checkout" } }
```

```json
{ "data": { "error": "Invalid order id for this checkout session" } }
```

```json
{ "data": { "error": "not authorized" } }
```

---

## 4. Check Order Exists (Check Order Status)

`POST /api/v1/gokwik/check-order-exists`

Failsafe for GoKwik order-retry / auto-refund. Returns whether a **CONFIRMED** order already exists for this checkout session.

`session_key` = same value as `cart_id` / `merchantCheckoutId`.

### cURL

```bash
curl --request POST 'https://<API_HOST>/api/v1/gokwik/check-order-exists' \
  --header 'Content-Type: application/json' \
  --header 'x-gokwik-callback-secret: <GOKWIK_CALLBACK_SECRET>' \
  --data '{
    "session_key": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "customer_email": "rahul@example.com",
    "customer_phone": "9876543210"
  }'
```

### Request

```json
{
  "session_key": "<cart UUID / merchantCheckoutId>",
  "customer_email": "rahul@example.com",
  "customer_phone": "9876543210"
}
```

### Success `200` — order found

```json
{
  "order_id": "ORD202607210001",
  "message": "Order exists."
}
```

### Success `200` — no confirmed order

```json
{
  "message": "No order found."
}
```

### Auth error `401`

```json
{ "data": { "error": "not authorized" } }
```

---

## 5. Remove Out Of Stock Products

`POST /api/v1/gokwik/remove-out-of-stock-items`

Removes OOS line items from the cart and returns the **updated cart** in the same shape as Get Cart.

### cURL

```bash
curl --request POST 'https://<API_HOST>/api/v1/gokwik/remove-out-of-stock-items' \
  --header 'Content-Type: application/json' \
  --header 'x-gokwik-callback-secret: <GOKWIK_CALLBACK_SECRET>' \
  --data '{
    "cart_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }'
```

### Success `200`

Same structure as **Get Cart** — `data.cart` with remaining in-stock items and recalculated totals.

### Error examples

```json
{ "data": { "error": "Invalid cart id" } }
```

```json
{ "data": { "error": "not authorized" } }
```

---

## Payment method mapping (Cureka)

| GoKwik `payment_method` | Cureka payment method | Draft payment status |
|-------------------------|------------------------|----------------------|
| `cod` | COD | PENDING |
| `prepaid` | WALLET (prepaid path) | PAID |
| `pp-cod` | Partial COD path | PAID for prepaid portion rules |

`payment_amount` must equal Cureka `grandTotal` (and PP-COD prepaid + payable_on_delivery must reconcile when `pp-cod` is used).

---

## Suggested Postman / certification sequence

1. Create a real logged-in Cureka cart → copy `carts.id` as `cart_id`.
2. `get-cart` with that id.
3. `create-order` with matching phone + `payment_amount` = cart `total`.
4. `place-order` with returned `order_id` + same `cart_id` / payment amount (`STOREFRONT_URL` set).
5. `check-order-exists` with `session_key` = `cart_id` → expect `Order exists.`
6. Optionally seed an OOS item and call `remove-out-of-stock-items`.

---

## Contact / config checklist for GoKwik

Provide GoKwik:

| Item | Value |
|------|--------|
| Get Cart URL | `https://<API_HOST>/api/v1/gokwik/get-cart` |
| Create Order URL | `https://<API_HOST>/api/v1/gokwik/create-order` |
| Place Order URL | `https://<API_HOST>/api/v1/gokwik/place-order` |
| Check Order Exists URL | `https://<API_HOST>/api/v1/gokwik/check-order-exists` |
| Remove OOS URL | `https://<API_HOST>/api/v1/gokwik/remove-out-of-stock-items` |
| Auth header name | `x-gokwik-callback-secret` |
| Auth header value | Shared secret (same as `GOKWIK_CALLBACK_SECRET`) |
| User auth header | `Authorization: Bearer <Cureka session token>` |
| `merchantCheckoutId` | Cureka cart UUID |
| Thank-you pattern | `{STOREFRONT_URL}/thankyou?order_id={order_number}` |
