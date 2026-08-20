# Cureka custom WhatsApp bot (BusinessOnBot)

This is the hierarchy we built. **Typing `hello` on WhatsApp is not a Cureka API.** That greeting is BOB’s own bot. Cureka only supplies catalog, checkout, order lookup, and event notify.

Official BOB commerce spec: [Commerce Flow API](https://resources.businessonbot.com/categories/api-documentation/commerce-flow).

---

## Who does what

```
You (WhatsApp)  →  Cureka WhatsApp number
                      │
                      ▼
              BusinessOnBot bot
              (hello / menus / catalog UI)
                      │
         x-guest-id   │   BOB calls us
                      ▼
              Cureka  /api/v1/bob/*
              catalog, create-order, place-order, cancel, lookup
                      │
         x-guest-id   │   we POST back
                      ▼
              BOB_NOTIFY_URL
              /orders-create  /orders-cancelled
              /fulfillments-create  /fulfillments-events-create
              /abandoned-cart
                      │
                      ▼
              BOB sends WhatsApp templates
              (order confirmation, cancel, shipped)
              Do NOT call /wabiz/send from Cureka
```

| Layer | Owner | What you see |
|---|---|---|
| 1. Chat | **BOB dashboard** | `hello` auto-reply, buttons, catalog carousel |
| 2. Shop data | **Cureka** `GET /api/v1/bob/...` | Categories, products, variants |
| 3. Checkout | **Cureka** `POST /bob/create-order` then `POST /bob/place-order` | Draft → real order |
| 4. Notify | **Cureka → BOB** `/orders-create` etc. | Triggers BOB WhatsApp |
| 5. Template send | **BOB only** | `/wabiz/send` must not come from our app |

---

## Credentials (once BOB support sends them)

Ask `support@businessonbot.com` for:

| They give you | Put in env as | Used for |
|---|---|---|
| Guest API key | `BOB_GUEST_ID` (same value in `BOB_API_KEY` is fine) | Header `x-guest-id` both directions |
| Bot / engine domain | `BOB_NOTIFY_URL` | Our outbound notify. Example: `https://customstore.bonb.io/cureka` |

Beta / production `.env`:

```bash
BOB_GUEST_ID=<guest key from BOB>
BOB_API_KEY=<same guest key>
BOB_AUTH_REQUIRED=true
BOB_NOTIFY_URL=https://customstore.bonb.io/cureka
BOB_TIMEOUT_MS=15000
```

**Delete from the server** (old Send-a-Template path — Cureka must not use these):

```bash
WHATSAPP_ENABLED
WHATSAPP_SEND_URL
WHATSAPP_API_KEY
WHATSAPP_TIMEOUT_MS
```

Also tell BOB support our inbound base:

| Env | URL they must call |
|---|---|
| Beta | `https://<beta-api-host>/api/v1/bob` |
| Prod | `https://<prod-api-host>/api/v1/bob` |

Header on every call: `x-guest-id: <same guest key>`.

Cureka has **no** `WHATSAPP_*` env and **no** `/wabiz/send` client. Order WhatsApp is only BOB after `/orders-create`.

Reload the API after env change (`pm2 reload` on beta).

---

## Hierarchy we built (`/api/v1/bob`)

Auth: `x-guest-id`. Responses are **raw** (no Cureka `{ success, data }` envelope) so BOB’s parser works.

### 1. Catalog (bot shop)

| Method | Path | What BOB uses it for |
|---|---|---|
| `GET` | `/bob/categories` | Category list |
| `GET` | `/bob/categories/:categoryId/products` | Products in a category (UUID or refId) |
| `GET` | `/bob/products` | All published products. `?ids=id1,id2` optional |
| `GET` | `/bob/products/:productId` | One product + variants/options (UUID or refId) |
| `GET` | `/bob/variants/:variantId` | One variant |
| `PUT` | `/bob/products/:productId` | Replace product tags `{ "tags": ["..."] }` |

### 2. Checkout (WhatsApp cart → Cureka order)

| Method | Path | What happens in Cureka |
|---|---|---|
| `POST` | `/bob/create-order` | **Draft only.** Status `pending`. Not a real order. No stock / Shipway / UniCommerce. Returns `{ "OrderId": "<uuid>", "status": "pending" }` |
| `POST` | `/bob/place-order` | Turns the draft into **PROCESSING**. COD: `{ "OrderId", "paymentPending": true }`. Prepaid: `{ "OrderId", "paymentId": "..." }`. Then fulfillment + `/orders-create`. |

### 3. Brand / “where is my order”

| Method | Path | What BOB uses it for |
|---|---|---|
| `GET` | `/bob/order/:orderId` | One order (UUID, refId, or order number) |
| `GET` | `/bob/personal-details?email=` | Customer by email |
| `GET` | `/bob/personal-details/:phone` | Customer by mobile |
| `GET` | `/bob/get-orders/:phone` | Last 3 placed orders |
| `POST` | `/bob/cancel-order` | `{ "id", "cancellationReason?" }` then we notify `/orders-cancelled` |

### 4. Outbound notify — BOB [Notifications API](https://resources.businessonbot.com/categories/api-documentation/notifications-api)

We POST to `{BOB_NOTIFY_URL}` + path with header `x-guest-id`. BOB should answer:

```json
{ "status": "success", "statusCode": 200 }
```

This is **not** [Send a Template `/wabiz/send`](https://resources.businessonbot.com/categories/api-documentation/api-documentation/send-a-template-api). Delete `WHATSAPP_*` from env. BOB sends the WhatsApp after these calls.

| When | Path | WhatsApp BOB should send |
|---|---|---|
| Website / GoKwik / BOB / subscription / payment-request order is placed | `POST /orders-create` | Order confirmation |
| Order cancelled (website, admin, or bot `/bob/cancel-order`) | `POST /orders-cancelled` | Cancel |
| Shipment has an AWB | `POST /fulfillments-create` | Shipped / tracking |
| Shipment becomes In-transit / Delivered / Returned | `POST /fulfillments-events-create` | Delivery status |
| GoKwik abandoned-cart webhook | `POST /abandoned-cart` | Cart recovery |

`/order/:id`, `/personal-details`, `/get-orders`, `/cancel-order` stay **inbound** (`{{brand_domain_name}}`). BOB calls us for those.

---

## How to test once credentials are in

Use the **same mobile** that is registered on the Cureka WhatsApp number (the one that already answers `hello`).

### A. Prove BOB can reach Cureka (curl)

Replace host, guest key, and a real published product UUID from admin.

```bash
HOST=https://<beta-api-host>
KEY=<BOB_GUEST_ID>

# 1. Categories (must return JSON array, HTTP 200)
curl -sS -H "x-guest-id: $KEY" "$HOST/api/v1/bob/categories"

# 2. Products
curl -sS -H "x-guest-id: $KEY" "$HOST/api/v1/bob/products"

# 3. Wrong key must be 401
curl -sS -o /dev/null -w "%{http_code}\n" -H "x-guest-id: wrong" "$HOST/api/v1/bob/categories"
```

If (1) is empty, publish categories/products in admin first — the bot has nothing to sell.

### B. WhatsApp `hello` (BOB bot, not us)

1. Open WhatsApp → Cureka business number.
2. Send `hello` (or `Hi`).
3. You should get BOB’s default welcome / menu.

If `hello` works **before** catalog APIs work, the **number is connected to BOB**. Catalog/checkout still need BOB to point their custom-store URLs at our `/api/v1/bob` base.

Ask BOB to set custom store API base = `https://<api-host>/api/v1/bob` and guest key = `BOB_GUEST_ID`.

### C. Full shop on WhatsApp

On the same chat:

1. Open catalog / pick a category (BOB calls `GET /bob/categories` then products).
2. Add a variant and checkout.
3. For **COD**, BOB calls `create-order` then `place-order` with `paymentPending: true`.
4. For **prepaid**, BOB calls `create-order`, you pay, then `place-order` with `paymentId`.

**Pass**

- Admin shows a new order, source **BOB**, status **PROCESSING**.
- Our logs: `[BOB notify] posted` path `/orders-create`.
- BOB New Relic / their logs: `/orders-create`, **not** `/wabiz/send` from Cureka.
- WhatsApp order-confirmation message arrives (BOB template, dashboard → Notifications → Order Confirmation).

**Fail**

- Draft only (`pending`) and no Shipway/UC → `place-order` never ran.
- `/wabiz/send` with `order_confirmation_v1` from our app → old build; this repo no longer has a send client. Deploy this code.

### D. Website order (same WhatsApp notify path)

Place a normal website/GoKwik order with a phone that can receive Cureka WhatsApp.

**Pass**

- Log: `[OrderNotify] Dispatching order-placed notifications (BOB /orders-create + MSG91 SMS)`.
- Log: `[BOB notify] posted` `/orders-create`.
- WhatsApp confirmation arrives.
- New Relic on BOB: `/orders-create`, not `/wabiz/send`.

### E. Tracking / cancel

1. After Shipway assigns AWB, we POST `/fulfillments-create` → shipped WhatsApp (if that notification is on in BOB).
2. In-transit / delivered / returned → `/fulfillments-events-create`.
3. Cancel from admin or WhatsApp → `/orders-cancelled`.

### F. Abandoned cart (optional)

GoKwik abandon webhook → we POST `/abandoned-cart`. Needs `STOREFRONT_URL` for recovery link.

---

## Logs to grep on our API

```text
[BOB notify] config on startup
[BOB notify] WHATSAPP_* env is ignored
[BOB inbound] request
[BOB inbound] create-order
[BOB inbound] place-order
[OrderNotify] Dispatching order-placed notifications
[BOB notify] ORDER_CREATED received
[BOB notify] posting Notifications API
[BOB notify] posted — BOB accepted
[BOB notify] BOB rejected
[BOB notify] skipped — BOB_NOTIFY_URL is not set
[BOB notify] skipped — BOB_GUEST_ID is not set
[BOB auth] rejected
```

On **BOB** New Relic, after a real order you want:

- `url`: `/orders-create` (good)
- `url`: `/wabiz/send` + `name`: `order_confirmation_v1` **from Cureka** (bad — old path)

BOB may still call `/wabiz/send` **internally** after `/orders-create`. That is their engine sending the template. Ours must not POST that URL.

---

## Checklist for BOB support

Send them this:

1. Custom store API base: `https://<api-host>/api/v1/bob`
2. Header: `x-guest-id: <guest key>`
3. Notify us at: they already host `/orders-create` on their domain; we will POST there using the same guest key
4. Enable notifications: Order Confirmation, Cancel, Fulfillment (custom store)
5. Do not ask Cureka to implement Send a Template API (`/wabiz/send`)
6. Welcome / `hello` flow stays in their bot builder

---

## What we did not build

- No Cureka handler for the text `hello` — that is BOB’s bot script.
- No `/wabiz/send` client at all. `WHATSAPP_*` env is ignored. BOB may still hit that path internally after `/orders-create`.
- Chat transcripts / shared inbox live in the BOB panel, not in Cureka admin.
