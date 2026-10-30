# Promotional offers and blog home — Mobile App Integration

Use this spec so the **mobile app** matches the Cureka website for promotional offers and for the blog home heading.

Source of truth on web:

- Product highlight: `PromotionalOfferHighlight` (card ribbon and PDP banner)
- Checkout list: `CheckoutCouponsSection` → `GET /cart/offers`
- Apply / remove: `POST /cart/coupon` and `DELETE /cart/coupon` (the same resolver accepts a promotional code)
- Free line: `rewardLines` on the cart, then order items with `lineSource: "promotion"`
- Blog home H1: `BlogListingContent` + `BLOG_PAGE_COPY.listingSeoHeading`

All routes below use the prefix `/api/v1`.

Success envelope:

```json
{
  "success": true,
  "data": {},
  "message": "...",
  "timestamp": "2026-10-22T12:00:00.000Z"
}
```

Customer routes need the same verified session as the rest of the app:

```http
Authorization: Bearer <customer_session>
Accept: application/json
Content-Type: application/json
```

Do not send `customerId`. The cart is the logged-in customer.

---

## 1. Product rules (must match website)

A promotional offer is a **checkout code**, like a coupon. The customer picks one code. The server decides the price.

| Rule | Website behavior |
|---|---|
| One code | At most one coupon **or** one promotional offer. Applying a new code replaces the previous one. |
| Where the price changes | Native checkout only, when `checkoutProvider` is `legacy`. |
| GoKwik / Shiprocket | Show the product message if the API returns it. Do **not** invent a free line or a promotion discount in those checkouts. Those providers do not price this module. |
| Feature flag | `GET /public/checkout/provider` → `promotionalOffersEnabled`. When `false`, hide offer chips, the offer rows, and reward lines. |
| Highlight vs price | A green “Offer” message on a product is copy only. The payable amount changes only after the customer applies the code and the cart response includes `rewardLines` or `bmsmDiscount`. |
| Which product | The offer belongs to the variants selected on that offer, and also to products in any selected brand or category. A product that matches a brand and a category is still eligible once. Pack of 2 (`HER/ZER/18057`) is not the same line as 120 Nos / Pack of 1 (`HER/ZER/16542`) unless both were selected or both match the brand or category. |
| Free unit | For Buy 1 Get 1, each qualifying variant in the cart gets its own free line of that same variant. Stock for that variant must be greater than the quantity already in the cart. A variant that is short on stock is skipped; the others still apply. |
| Client math | Do not recompute BOGO, Buy X Get Y, cart-value gift, or Buy More Save More. Render `grandTotal`, `discountAmount`, `promotionDiscount`, and `rewardLines` from the cart. |
| Usage | Listing and Apply do not reserve a use. The server counts a use when the order is placed. |

Offer types the server may return in `offerType`:

| `offerType` | What the customer sees after a successful apply |
|---|---|
| `bogo` | One extra line per qualifying variant that is in the cart, usually at ₹0 |
| `buy_x_get_y` | One reward line per combination the cart satisfies. If two combinations reward the same variant, the app shows that variant once, at the larger quantity |
| `gift_on_cart_value` | One gift: the gift for the highest threshold reached. With brand, category, or eligible variants, the threshold uses that eligible cart total unless the offer sets `thresholdBasis: "cart"` |
| `buy_more_save_more` | One discount, from the highest quantity tier the cart reaches (`bmsmDiscount`). No extra product line |

---

## 2. When offers are allowed

```http
GET /api/v1/public/checkout/provider
```

```json
{
  "success": true,
  "data": {
    "checkoutProvider": "legacy",
    "gateway": "legacy",
    "walletCheckoutEnabled": true,
    "promotionalOffersEnabled": true
  }
}
```

| `promotionalOffersEnabled` | `checkoutProvider` | App behavior |
|---|---|---|
| `false` | any | No offer chips, no offer rows, no reward lines |
| `true` | `legacy` | Chips + checkout list + priced reward lines |
| `true` | `gokwik` or `shiprocket` | Chips only. Checkout pricing for this module stays off |

Read this on app start and again when opening checkout. Do not cache it for the whole session.

---

## 3. Product list, search, home, and PDP

Show the offer **message** on the variant that qualifies. Do not change the selling price on the card.

### 3.1 List and search

Variant search rows include:

```json
{
  "variantId": "8d8f2cde-f928-4a1b-9328-811a46cb0ea8",
  "sku": "HER/ZER/18057",
  "name": "Zeroharm Magnesium Glycinate 120 Capsules (Pack of 2)",
  "sellingPrice": 2189,
  "offers": [
    {
      "id": "41b38f5a-c359-4f7a-91cc-4fbb8d3bc39d",
      "offerType": "bogo",
      "customerMessage": "Buy 1 Get 1 free on this pack"
    }
  ]
}
```

- Render `offers[0].customerMessage` as a short ribbon on the image, or one line under the name.
- If `offers` is missing or empty, show nothing. Do not call another API per card unless that screen’s payload has no `offers` field.
- Bind the message to `variantId`. Switching variant on PDP must switch the message.

### 3.2 PDP

Product detail includes the same `offers` array for the **selected** variant (`selectedVariantId`, otherwise the first variant):

```http
GET /api/v1/public/products/{slug}
```

```json
{
  "selectedVariantId": "8d8f2cde-f928-4a1b-9328-811a46cb0ea8",
  "offers": [
    {
      "id": "41b38f5a-c359-4f7a-91cc-4fbb8d3bc39d",
      "offerType": "bogo",
      "customerMessage": "Buy 1 Get 1 free on this pack"
    }
  ]
}
```

PDP banner copy on web: a green “Offer” label plus `customerMessage`. The price on the page stays the variant selling price.

The message does **not** put a free item in the cart. The customer still has to apply the code at checkout.

---

## 4. Checkout list — Available Coupons & Offers

Logged-in checkout only. Guests see the sign-in gate first, same as web.

```http
GET /api/v1/cart/offers
Authorization: Bearer <customer_session>
```

```json
{
  "success": true,
  "data": {
    "offers": [
      {
        "code": "TESTBOGO1",
        "sourceType": "promotional_offer",
        "id": "41b38f5a-c359-4f7a-91cc-4fbb8d3bc39d",
        "title": "Pack BOGO",
        "description": "Buy 1 Get 1 free on this pack",
        "estimatedBenefit": 2189,
        "conditions": "Buy 1 Get 1 free on this pack",
        "expiresAt": "2026-12-31T18:29:59.000Z",
        "selected": false,
        "applicable": true
      },
      {
        "code": "WELCOME100",
        "sourceType": "coupon",
        "id": "…",
        "title": "Welcome Coupon",
        "description": "Welcome Coupon",
        "estimatedBenefit": 99,
        "conditions": "Minimum purchase 500.00",
        "expiresAt": null,
        "selected": false,
        "applicable": true
      }
    ]
  }
}
```

### 4.1 What to show

Section title: **Available Coupons & Offers**.

Sort, then render:

1. Promotional offers with `applicable !== false`
2. Promotional offers with `applicable === false`
3. Coupons

| UI | Rule |
|---|---|
| First screen | First **2** rows, plus **View all (N)** |
| View all | Title **Available Coupons & Offers**. **5** rows per page. Footer `Showing {start}–{end} of {total}`. Previous / Next only when there is more than one page |
| `sourceType: "coupon"` | Label **COUPON** |
| `sourceType: "promotional_offer"` | Label **OFFER** |
| `applicable === true` | Apply button. Optional “About ₹{estimatedBenefit} off” |
| `applicable === false` | Button **Unavailable**. Detail = `description`. Note = `conditions` (the reason). Do not show it as Applied |
| Empty `offers` | “No coupons or offers apply to this cart.” |
| `estimatedBenefit` | A hint only. Never use it as the amount to pay |

Reload this list after Apply, Remove, and any cart quantity change.

### 4.2 When a code is missing

`GET /cart/offers` is **not** the public coupon catalog. `GET /public/coupons` is a marketing list. Checkout must not use it.

A promotional code is included only when:

- the cart already contains a variant selected on that offer, or a product in one of its brands or categories, or
- that code is the one saved on the cart, or
- the server can fully apply it

Example: **TESTBOGO1** is for Pack of 2 `HER/ZER/18057`. A cart that only has 120 Nos `HER/ZER/16542` will not list **TESTBOGO1** unless that offer’s brand or category also includes the 120 Nos product. Adding stock on the other SKU does not change that.

If the qualifying variant is in the cart but the free unit cannot be granted, the row stays visible with `applicable: false`. `conditions` is the note to show, for example:

- `The free item is out of stock, so this offer cannot be applied right now.`
- `Add the required quantity of this product to use this offer.`

“Out of stock” here means there is no **extra** unit beyond the quantity already in the cart. Stock 5 with quantity 1 can still grant the free unit. Stock 1 with quantity 1 cannot.

---

## 5. Apply and remove

Web sends every code through the coupon endpoint. The server accepts both coupons and promotional codes there. Mobile should do the same.

### 5.1 Apply

```http
POST /api/v1/cart/coupon
Authorization: Bearer <customer_session>

{ "couponCode": "TESTBOGO1" }
```

Equivalent:

```http
POST /api/v1/cart/offers

{ "code": "TESTBOGO1" }
```

Normalize like the server: trim and uppercase before display. The server also normalizes.

Success returns the **full cart** (section 6), not a small “applied” object.

On failure, show `message`. Do not mark the code applied.

### 5.2 Remove

```http
DELETE /api/v1/cart/coupon
```

or

```http
DELETE /api/v1/cart/offers
```

Both clear the coupon and the promotional code. There is no separate “remove only the free line” action. Reward lines disappear because the code was removed.

### 5.3 Replace

If **WELCOME100** is applied and the customer applies **TESTBOGO1**, send only the new Apply. Do not call Remove first. The cart then has one code.

---

## 6. Cart and checkout summary

```http
GET /api/v1/cart
Authorization: Bearer <customer_session>
```

Optional preview of COD or prepaid fees:

```http
GET /api/v1/cart?paymentMethod=RAZORPAY
GET /api/v1/cart?paymentMethod=COD
```

`paymentMethod` changes fees only. It does not apply an offer.

### 6.1 Fields to render

| Field | Use |
|---|---|
| `items` | Paid cart lines. Quantity controls stay on these lines only |
| `rewardLines` | Extra lines created by the offer. Not stored as cart items |
| `totalItems` | Paid quantities **plus** reward quantities. Use this for the summary count |
| `appliedCode` | `{ code, sourceType, id, title }` when a code is on the cart. Show an Applied banner and Remove |
| `invalidatedCode` | Show `message` when a saved code no longer applies. Clear the Applied banner |
| `coupon` / `discountAmount` | Coupon rupees off |
| `promotionDiscount` | Display savings for the offer (reward catalog value and Buy More Save More). Show as “Promotional offer”. **Do not subtract it again** |
| `bmsmDiscount` | Part of that promotional savings |
| `rewardCharged` | What the customer pays for reward lines. `0` for a free BOGO unit |
| `grandTotal` | Amount to pay. Trust this number |

`items[].promotionalMessages` and `promotionNotices` are empty on cart read. Do not expect offer chips from the cart payload. Chips come from section 3.

### 6.2 Reward line

```json
{
  "promotionOfferId": "41b38f5a-c359-4f7a-91cc-4fbb8d3bc39d",
  "productId": "…",
  "variantId": "8d8f2cde-f928-4a1b-9328-811a46cb0ea8",
  "sku": "HER/ZER/18057",
  "productName": "Zeroharm Magnesium Glycinate 120 Capsules (Pack of 2)",
  "variantLabel": "Pack of 2",
  "quantity": 1,
  "catalogUnitPrice": 2189,
  "chargedUnitPrice": 0,
  "totalPrice": 0,
  "promotionDiscount": 2189,
  "primaryImageUrl": { "url": "https://…" }
}
```

On the cart and on the checkout order summary, append `rewardLines` after `items`:

- Title: `productName` (already the same name the cart uses for that variant)
- Subtitle: `variantLabel` when present
- Badge: **Included with offer**
- Price: **Free** when `chargedUnitPrice` is `0`, otherwise `chargedUnitPrice`
- Strike `catalogUnitPrice` when it is greater than the charged price
- Quantity text only. No plus, minus, or delete
- Image: `primaryImageUrl.url`

A BOGO summary can show two lines with the same SKU: one paid, one free. That is correct. Do not merge them. Do not replace the free line with a different variant because the parent product name looks similar.

### 6.3 Totals

Build the bill from the cart response:

1. Item total from paid lines (MRP strike can use `items[].mrp`)
2. Coupon row from `discountAmount` when a coupon is applied
3. Promotional offer row from `promotionDiscount` when it is greater than 0
4. Fees from `shippingAmount`, `handlingAmount`, `platformFee`, `codCharge`
5. Prepaid discount from `prepaidDiscount` when the customer chose online pay
6. **Amount to pay** = `grandTotal`

If a reward is free, the paid line stays at its selling price and the free line is ₹0. The promotional offer row explains the catalog value of that free unit. `grandTotal` already includes `rewardCharged` (0) and does not need `promotionDiscount` subtracted again.

---

## 7. Place order and order history

Place the order with the same checkout API the app already uses for native checkout. Do not add the reward as another `POST /cart/items`. The server copies `rewardLines` onto the order as items with `lineSource: "promotion"`.

Customer order detail items:

| `lineSource` | UI |
|---|---|
| `"customer"` or missing | Normal line. Show `unitPrice` and `totalPrice` |
| `"promotion"` | **Included with offer**. Price and total **Free** when the amount is 0 |

Keep both lines in the list sent to the customer. The same `variantId` / SKU may appear twice. Fulfillment uses those order lines, so dropping the ₹0 line drops the free product.

GoKwik complimentary items are a different path. Do not map native BOGO reward lines through that flow, and do not expect `rewardLines` while `checkoutProvider` is `gokwik`.

---

## 8. Screen flow

```text
Product card / PDP
  → If offers[0].customerMessage exists, show the Offer chip
  → Price stays the variant selling price

Cart
  → GET /cart
  → If checkoutProvider is legacy and rewardLines is not empty, show those lines as Free
  → Do not show an offer chip from items[].promotionalMessages

Checkout (legacy only for priced offers)
  → GET /cart/offers
  → Show Available Coupons & Offers
  → Apply: POST /cart/coupon { couponCode }
  → Refresh cart + offers
  → Order summary = items + rewardLines
  → Place order with the existing native checkout call

Order detail
  → lineSource "promotion" → Included with offer / Free
```

---

## 9. Blog home H1

The blog home heading is **not** returned by the blog API. The website hardcodes it. The app must show the same visible H1.

**Text:** `Your Guide to Better Health & Wellness`

### 9.1 Where it appears

On the blog **home** screen only. That is the `/blog` screen with no search query and no tag filter.

Place it at the top of the content, under the breadcrumb and above the featured carousel:

1. Breadcrumb: Home / Blog
2. **H1:** Your Guide to Better Health & Wellness
3. Featured carousel
4. Category strip
5. Trending
6. Latest articles

### 9.2 What is not the H1

| Text | Role on web | App |
|---|---|---|
| `Your Guide to Better Health & Wellness` | Visible H1 on blog home | Use this as the single H1 |
| `Blog` | Breadcrumb label, and the document title `Blog \| Cureka` | Breadcrumb / screen title only. Not the H1 |
| `Featured Reads` | Section heading | Section heading |
| `Trending Now` | Section heading | Section heading |
| `Latest Articles` | Section heading | Section heading |
| Category name | H1 on a **category** screen | H1 only on that category screen |
| Article title | H1 on an **article** screen | H1 only on that article |

One H1 per screen.

### 9.3 When to hide it

Hide `Your Guide to Better Health & Wellness` when the customer is:

- searching articles, or
- filtering by a tag

Category screens do not use this sentence. Their H1 is the category name. Article screens keep the article title as the H1.

Do not read this sentence from `metaTitle`, the listing payload, or the page `<title>`. Those stay `Blog | Cureka` on the home listing. The visible H1 is the sentence above.
