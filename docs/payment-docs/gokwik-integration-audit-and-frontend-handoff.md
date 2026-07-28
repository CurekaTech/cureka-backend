# GoKwik Integration: Backend Status and Frontend Handoff

Status: implemented on 17 July 2026; sandbox certification remains required.

## Backend delivery

The backend now provides:

- Retry-safe Get Cart, Remove Out-of-Stock Items, Create Order, Place Order, and Check Order callbacks.
- Mandatory callback authentication in production with timing-safe secret comparison.
- Structured GoKwik checkout, payment, Partial-COD, webhook, refund, abandoned-cart, and catalog-sync persistence.
- Unique provider identifiers and cart-level locking for retry/concurrency safety.
- Locked order confirmation and atomic stock decrements to prevent duplicate placement and overselling.
- Explicit `GOKWIK_PREPAID`, `GOKWIK_PARTIAL_COD`, and `GoKwik` order source values.
- Normalized Indian mobile validation, address deduplication, and amount reconciliation.
- Five Cureka shipping slabs, hybrid coupon revalidation, and product collection IDs in Get Cart.
- Durable BullMQ jobs for webhook processing, product/collection sync, and fulfillment updates.
- KwikPass JWE exchange into Cureka's normal cookie session, including guest-cart conversion/merge.
- Product and collection incremental listeners plus an authenticated backfill endpoint.
- Single-AWB Update Order and multi-AWB item-level Split Order delivery.
- Checkout-provider routing that returns GoKwik initialization data instead of silently creating a native payment request.

The migration is:

`apps/api/database/migrations/1780914000000-CompleteGokwikPersistence.ts`

## Routes

GoKwik merchant callbacks, under `/api/v1/gokwik`:

- `POST /get-cart`
- `POST /remove-out-of-stock-items`
- `POST /create-order`
- `POST /place-order`
- `POST /check-order-exists`

Additional integration routes:

- `POST /api/v1/gokwik/webhooks/transaction`
- `POST /api/v1/gokwik/webhooks/refund`
- `POST /api/v1/gokwik/webhooks/abandoned-carts`
- `POST /api/v1/gokwik/admin/catalog/backfill` (admin JWT)
- `POST /api/v1/auth/kwikpass/exchange`

The existing cart checkout/payment-request entry point returns this shape when the GoKwik setting is active:

```json
{
  "gateway": "gokwik",
  "checkoutProvider": "gokwik",
  "paymentData": {
    "merchantCheckoutId": "<active cart UUID>",
    "appId": "<public GoKwik app id>",
    "merchantId": "<public merchant id>",
    "amount": 999,
    "currency": "INR"
  }
}
```

`merchantCheckoutId` is the Cureka cart UUID and must be passed unchanged to the GoKwik SDK. Do not generate a browser-only checkout ID.

## Required deployment configuration

No secret values belong in source control.

```dotenv
GOKWIK_BASE_URL=
GOKWIK_APP_ID=
GOKWIK_APP_SECRET=
GOKWIK_MERCHANT_ID=
GOKWIK_TIMEOUT_MS=15000
GOKWIK_CALLBACK_SECRET=
GOKWIK_CALLBACK_AUTH_REQUIRED=true
GOKWIK_CATALOG_SYNC_ENABLED=false

GOKWIK_WEBHOOK_ENABLED=false
GOKWIK_WEBHOOK_SECRET=

KWIKPASS_ENVIRONMENT=sandbox
KWIKPASS_MERCHANT_ID=
KWIKPASS_JWE_SECRET=
KWIKPASS_JWE_ISSUER=
KWIKPASS_JWE_AUDIENCE=

STOREFRONT_URL=https://beta.cureka.com
```

Set the callback secret in both Cureka and the GoKwik merchant callback configuration.

Payment/refund webhooks intentionally return `503` while disabled. They must remain disabled until GoKwik supplies and Cureka validates all four signing details:

1. Signature header name.
2. Exact raw/canonical payload bytes.
3. Timestamp/replay-window rules.
4. HMAC algorithm and encoding.

The processing, deduplication, payment-state, and refund-ledger pipeline is implemented behind that fail-closed guard. Do not replace it with a guessed signature formula.

Enable catalog sync only after the Product and Collection payloads pass GoKwik sandbox certification. Run the backfill once, then leave incremental event listeners enabled.

## Frontend implementation

### 1. Load public GoKwik configuration

Use the checkout response's `paymentData.appId`, `merchantId`, and `merchantCheckoutId`. Never expose:

- `GOKWIK_APP_SECRET`
- `GOKWIK_CALLBACK_SECRET`
- `GOKWIK_WEBHOOK_SECRET`
- `KWIKPASS_JWE_SECRET`

Load the GoKwik checkout and KwikPass SDK URLs supplied for the selected environment. Do not hard-code production SDK URLs in sandbox builds.

### 2. Replace the cart checkout CTA

When `checkoutProvider === "gokwik"`:

1. Ensure the user has selected/saved a Cureka address.
2. Call the existing checkout entry point.
3. Initialize GoKwik with the returned public IDs.
4. Open checkout using `merchantCheckoutId`.
5. Disable duplicate CTA clicks until open succeeds or fails.

When the provider is not GoKwik, retain the existing native/Shiprocket flow.

Do not call Razorpay/Cashfree after receiving `checkoutProvider: "gokwik"`.

### 3. Handle checkout lifecycle events

- `open`: show the SDK and retain the cart page in the background.
- `close`: restore the checkout CTA; do not clear the cart.
- `failure`: display a retryable message and retain the cart.
- `complete`: accept only an allowlisted Cureka redirect or navigate to `/thankyou?order_id=<merchant order id>`.
- timeout/SDK-load failure: report telemetry and offer retry. Native fallback is allowed only if the backend feature flag is subsequently disabled; never create two simultaneous checkout attempts.

Treat SDK data as display/navigation input only. Backend callbacks are authoritative for order/payment state.

### 4. KwikPass login

When the KwikPass SDK returns `kpToken`, send the opaque token directly:

```http
POST /api/v1/auth/kwikpass/exchange
Content-Type: application/json
Credentials: include

{ "kpToken": "<opaque JWE>" }
```

Do not decode, trust, store, or log claims in the browser. The backend decrypts the JWE, validates expiry/issuer/audience/merchant/mobile, merges or converts the guest cart, and sets the standard `user_session` cookie.

After exchange, fetch `/api/v1/auth/me` and refresh cart state.

### 5. Logout

Logout is two coordinated actions:

1. Call `POST /api/v1/auth/logout` with credentials to revoke the Cureka session.
2. Invoke the KwikPass SDK logout method and clear its browser state.

Failure of one side must not suppress the other. Return the UI to signed-out state after Cureka logout succeeds.

### 6. Cart UI

The cart should render backend totals returned by Cureka. GoKwik may present coupon and shipping controls, but Create Order is accepted only when:

- the coupon code/discount revalidates against Cureka,
- the five-slab shipping result matches Cureka,
- the callback payment total matches the persisted draft total,
- Partial COD prepaid plus payable-on-delivery equals the order total.

On a mismatch, keep the cart intact and show the retry/error returned by GoKwik.

## Rollout order

1. Apply the database migration.
2. Deploy callback and KwikPass secrets to beta.
3. Configure beta callback URLs and callback header in GoKwik.
4. Leave payment/refund webhooks and catalog sync disabled.
5. Run callback contract tests in the GoKwik sandbox.
6. Validate Product/Collection and Split Order payloads, enable catalog sync, and run backfill.
7. Obtain and implement the exact webhook HMAC contract, then enable webhooks.
8. Enable `gokwikCheckoutEnabled` for internal users, then a percentage rollout.

## Acceptance matrix

- Get Cart: totals, collection IDs, metadata, stock, discount, and five shipping slabs.
- Create Order: first call, identical retry, mismatched customer, amount, coupon, and cart.
- Place Order: identical retry, wrong order/cart, concurrent callbacks, insufficient stock.
- Payments: COD, prepaid, Partial COD, success/failure, duplicate and out-of-order events.
- Refunds: partial/full, duplicate status events, over-refund rejection, auto-refund.
- KwikPass: valid, expired, wrong issuer/audience/merchant, malformed JWE, guest merge.
- Catalog: full backfill, incremental product/inventory/category updates, retry and replay.
- Fulfillment: one AWB, multiple item-level AWBs, duplicate events, provider failure retry.
- Frontend: close, retry, completion redirect allowlist, SDK load failure, logout.

Production enablement requires successful sandbox fixtures for every payload and GoKwik confirmation of the webhook signing contract.
