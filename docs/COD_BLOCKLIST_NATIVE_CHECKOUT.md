# Native checkout — COD Blocklist

Use this spec in the **website / app** Cursor chat. Do not add admin-only fields to customer screens.

Admins can block Cash on Delivery for a delivery pincode or a customer/mobile that has frequent COD returns. **Prepaid must keep working.** Login, cart, and address APIs are unchanged.

---

## When the rule applies

Apply this rule **only on native Cureka checkout**.

| Checkout mode | COD blocklist |
|---|---|
| GoKwik checkout **active** | **Do not apply.** Hide/show COD using existing GoKwik/min-order rules only |
| GoKwik checkout **inactive** (native / legacy / Shiprocket native cart) | **Apply.** Hide COD when `cod.available === false` and `cod.reasonCode` is a blocklist code |

How to know GoKwik is active (backend is the source of truth):

```http
GET /api/v1/public/checkout/provider
```

```ts
{ checkoutProvider: 'gokwik' | 'shiprocket' | 'legacy' }
```

Also returned on:

```http
POST /api/v1/orders/checkout
```

as `checkoutProvider`.

If `checkoutProvider === 'gokwik'`, **ignore** `COD_BLOCKED_FOR_PINCODE` / `COD_BLOCKED_FOR_CUSTOMER` (the backend will not emit them while GoKwik is on). Do **not** send a frontend flag such as `isGoKwikActive` or `codAllowed` and expect the backend to trust it.

---

## APIs that already carry COD eligibility

There is **no new storefront blocklist endpoint**. Use the existing `cod` object:

```ts
cod: {
  available: boolean;
  minimumOrderAmount: number;
  message: string;
  reasonCode?: string | null;
}
```

Returned by:

| Method | Path | When pincode is known |
|---|---|---|
| `GET` | `/api/v1/cart` | Usually **not** — customer blocks can still apply; pincode blocks apply after an address is chosen |
| `POST` | `/api/v1/orders/checkout` | **Yes**, when `addressId` is sent |

Optional cart preview:

```http
GET /api/v1/cart?paymentMethod=COD
```

Native COD placement:

```http
POST /api/v1/orders
```

Body includes `addressId` and `paymentMethod: "COD"`.

Prepaid (Razorpay/Cashfree) still uses `POST /api/v1/payment-requests/checkout`. **Do not** send COD there.

---

## Request requirements

On checkout / place order, send the **selected delivery address id**. The backend reads pincode and phone from that address. Do not send a separate `codAllowed` or blocklist evaluation.

```json
{
  "addressId": "uuid",
  "paymentMethod": "COD"
}
```

Guest/native sessions still have a backend user id. Mobile is taken from the session customer and/or the address phone. Formats `9876543210`, `+91…`, and `91…` are normalized on the server.

---

## Success — COD available

When native checkout is active, COD min/max is met, and the customer/pincode is not blocked:

```json
{
  "cod": {
    "available": true,
    "minimumOrderAmount": 599,
    "message": "Cash on Delivery is available for orders of ₹599 or more.",
    "reasonCode": null
  }
}
```

Show COD as usual.

Existing min/max unavailability is unchanged: `available: false` **without** a blocklist `reasonCode` (message still explains the ₹ minimum / maximum). Keep using that copy.

---

## Blocked pincode

```json
{
  "cod": {
    "available": false,
    "minimumOrderAmount": 599,
    "message": "Cash on Delivery is not available for this delivery location.",
    "reasonCode": "COD_BLOCKED_FOR_PINCODE"
  }
}
```

Hide or disable COD. Keep prepaid visible.

Customer-facing copy (use `cod.message` or this exact string):

```text
Cash on Delivery is not available for this delivery location.
```

---

## Blocked customer / mobile

```json
{
  "cod": {
    "available": false,
    "minimumOrderAmount": 599,
    "message": "Cash on Delivery is not available for this account. Please use an online payment method.",
    "reasonCode": "COD_BLOCKED_FOR_CUSTOMER"
  }
}
```

Hide or disable COD. Keep prepaid visible.

```text
Cash on Delivery is not available for this account. Please use an online payment method.
```

Never show the admin’s internal `reason` (that field is admin-only).

---

## Exact reason codes

```text
COD_BLOCKED_FOR_PINCODE
COD_BLOCKED_FOR_CUSTOMER
```

Place-order rejection (HTTP `400`) uses the same codes on the error envelope:

```json
{
  "success": false,
  "statusCode": 400,
  "code": "COD_BLOCKED_FOR_PINCODE",
  "message": "Cash on Delivery is not available for this delivery location."
}
```

or `code: "COD_BLOCKED_FOR_CUSTOMER"` with the account message.

Existing codes (unchanged):

```text
COD_MINIMUM_ORDER_NOT_MET
COD_MAXIMUM_ORDER_EXCEEDED
```

Precedence on native checkout:

1. GoKwik active → custom blocklist skipped
2. COD min / max
3. Customer block
4. Pincode block
5. COD allowed

---

## How to hide / disable COD

If `checkoutProvider !== 'gokwik'` **and** `cod.available === false`:

- Do not select COD as the default method
- Do not submit `paymentMethod: "COD"`
- Show `cod.message`
- If `reasonCode` is one of the two blocklist codes, do not imply a cart-value problem; it is a location/account restriction

If `checkoutProvider === 'gokwik'`, keep the current GoKwik COD UI.

---

## When to recheck eligibility

Recheck `POST /api/v1/orders/checkout` (or reload cart + checkout) when:

- The selected shipping address / pincode changes
- The logged-in user changes
- Cart payable changes (coupon, qty) — min-order can change
- Returning to checkout after leaving the page (an admin may have added a block)

Do not cache `cod.available` across sessions.

---

## Guest checkout

Native place-order still uses the session user. A mobile-only admin block matches the guest/customer mobile after normalization. Send the real delivery address so pincode blocks apply.

---

## Prepaid behavior

Prepaid must remain enabled for blocked customers and blocked pincodes. Do not disable the whole checkout.

---

## Backend also enforces the rule

Hiding COD in the UI is not enough. If the client still posts `POST /api/v1/orders` with `paymentMethod: "COD"`:

- The API returns `400` with `COD_BLOCKED_FOR_PINCODE` or `COD_BLOCKED_FOR_CUSTOMER`
- Show the error message and switch the user to prepaid

The backend uses the session user id, stored address pincode/phone, current GoKwik setting, and current active blocklist rows — not frontend claims.

---

## Suggested frontend acceptance cases

| Case | Expected |
|---|---|
| Native + blocked pincode on selected address | COD hidden; prepaid OK |
| Native + blocked logged-in customer | COD hidden; prepaid OK |
| Native guest + blocked mobile | COD hidden; prepaid OK |
| Native + inactive blocklist row | COD follows min/max only |
| Native + no matching row | Existing COD min/max only |
| GoKwik active + blocked customer/pincode | COD UI unchanged vs current GoKwik behaviour |
| User forges COD on `POST /orders` while blocked | `400` + reason code |
| Cart below COD minimum | Existing min-order message, not a blocklist code |
