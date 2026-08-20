# Admin — Abandoned Carts (frontend Cursor brief)

Paste this file into the **admin panel** Cursor chat. Backend is already live. This is **read-only** — no create/update/delete.

**What this is:** show customers who added products to cart and **did not complete purchase**. After successful payment the cart is cleared on the backend, so that row **disappears from this list automatically**. Do not build a “mark purchased” action.

---

## Cursor prompt (paste this first)

```
Implement Abandoned Carts in the Cureka admin panel using this spec.

Follow existing Order Management list + detail patterns (same table, filters, pagination, permission gating, API proxy).

Do NOT invent extra APIs. Only:

- GET /admin/api/proxy/abandoned-carts
- GET /admin/api/proxy/abandoned-carts/:refId

Sidebar item already comes from login/me menu:
- name: Abandoned Carts
- key: orders-abandoned-carts
- href: /abandoned-carts
- icon: ShoppingCart (map this Lucide icon; fallback ShoppingBag)
- requiredPermissions: ['abandoned_carts.read']

Roles checkbox group already comes from grouped permissions:
- Orders → Abandoned Carts → View Abandoned Carts (code: abandoned_carts.read)

Pages:
1. List at /abandoned-carts
2. Detail at /abandoned-carts/[refId]  (cart refId e.g. CAR20268131 — not UUID)

List columns: customer name, mobile number, total amount.
List filters: search (name + mobile), fromDate, toDate, optional minAmount/maxAmount, sort.

Detail: customer, addresses, product lines, coupon, shipping, grand total.

If a cart was purchased it will 404 / vanish from the list — that is expected.
```

---

## Sidebar

Server-driven. Login / `me` already returns this under **Order Management**:

| Field | Value |
|---|---|
| name | Abandoned Carts |
| key | `orders-abandoned-carts` |
| href | `/abandoned-carts` |
| icon | `ShoppingCart` |
| requiredPermissions | `['abandoned_carts.read']` |

Frontend work:

1. Add route `/abandoned-carts` and `/abandoned-carts/[refId]` (or `/abandoned-carts/:refId`). Do **not** treat the param as a UUID.
2. Map icon `ShoppingCart` in the existing sidebar icon map (Lucide). If the map is a whitelist, add it; otherwise reuse `ShoppingBag`.
3. Hide the page if the admin lacks `abandoned_carts.read` (same pattern as other order screens). Super admin always has access.

---

## Roles / permission checkbox

Grouped permissions API already includes:

```
Orders
  └── Abandoned Carts   key: orders-abandoned-carts
        └── View Abandoned Carts
              code: abandoned_carts.read
              module: abandoned_carts
              action: read
```

No extra checkbox wiring if the Roles UI already renders `findGroupedByModule()`. Just show whatever the API returns.

Custom roles need this checkbox ticked. Super admin / admin get it from DB migration.

---

## Auth

- Admin JWT: `Authorization: Bearer <token>`
- Local proxy (same as orders): `/admin/api/proxy/abandoned-carts` → backend `/api/v1/admin/abandoned-carts`
- Do **not** put `admin/api/` after `/proxy/` — that 404s
- Allowed roles: `super_admin`, `admin`, `moderator` **plus** permission `abandoned_carts.read`

---

## APIs

### 1. List

```
GET /admin/api/proxy/abandoned-carts
```

#### Query params

| Param | Type | Default | Notes |
|---|---|---|---|
| `page` | number | `1` | 1-based |
| `limit` | number | `20` | max `100` |
| `search` | string | — | Matches **first name, last name, full name, mobile number only** |
| `fromDate` | date | — | Last cart activity. `YYYY-MM-DD` or ISO. Date-only is start of that day (UTC) |
| `toDate` | date | — | Last cart activity. Date-only is end of that day (UTC) |
| `minAmount` | number | — | Min merchandise total (`sellingPrice * qty`) |
| `maxAmount` | number | — | Max merchandise total |
| `sortBy` | enum | `lastActivityAt` | See below |
| `sortOrder` | `ASC` \| `DESC` | `DESC` | |

#### `sortBy` values

| Value | Use for column |
|---|---|
| `lastActivityAt` | Last activity (default) |
| `totalAmount` | Total amount |
| `customerName` | Name |
| `mobileNumber` | Mobile |
| `createdAt` | Cart created |

#### Example

```
GET /admin/api/proxy/abandoned-carts?page=1&limit=20&search=98765&fromDate=2026-08-01&toDate=2026-08-19&sortBy=totalAmount&sortOrder=DESC
```

#### Response envelope

Same as other admin lists (`data.data`, not `rows` / `items`):

```json
{
  "success": true,
  "message": "Abandoned carts fetched successfully",
  "data": {
    "data": [ /* list items */ ],
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

#### List row (show these three on the table)

```ts
{
  id: string;                 // cart UUID — internal only, do not put in the URL
  refId: string;              // cart refId e.g. CAR20268131 — use this for detail route
  customer: {
    id: string;
    refId: string;
    firstName?: string;
    lastName?: string;
    name: string;             // display name (fallback email / mobile / refId)
    mobileNumber?: string;
    email?: string;
    isGuest: boolean;
  };
  itemCount: number;
  totalAmount: number;        // merchandise subtotal, number not string
  lastActivityAt: string;     // ISO
  createdAt: string;
  updatedAt: string;
}
```

**Table columns (required):**

| Column | Field |
|---|---|
| Customer name | `customer.name` |
| Mobile | `customer.mobileNumber` |
| Total amount | `customer` + `totalAmount` (format as INR) |

Optional extra columns if you have space: `itemCount`, `lastActivityAt`, Guest badge (`customer.isGuest`).

Row click → `/abandoned-carts/{refId}` using **`refId`** (e.g. `CAR20268131`). Do **not** use UUID `id` in the path.

---

### 2. Detail

```
GET /admin/api/proxy/abandoned-carts/:refId
```

`:refId` = cart **refId** only (e.g. `CAR20268131`). Not the UUID.

404 if the cart was purchased / emptied — show “Cart is no longer abandoned” and send the user back to the list.

```json
{
  "success": true,
  "message": "Abandoned cart fetched successfully",
  "data": { /* detail */ }
}
```

```ts
{
  id: string;
  refId: string;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;

  customer: {
    id: string;
    refId: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    mobileNumber?: string;
    isGuest: boolean;
    isRegistered: boolean;
    status: string;
    profileImageUrl?: { key: string; name: string; url: string } | null;
    // plus other user profile fields — ignore extras
  };

  defaultAddress: Address | null;
  addresses: Address[];

  cart: {
    cartId: string;
    items: CartLine[];
    totalItems: number;
    subtotal: number;
    coupon: { id: string; code: string; title: string } | null;
    discountAmount: number;
    shippingAmount: number;
    handlingAmount: number;
    platformFee: number;
    codCharge: number;
    prepaidDiscount: number;
    grandTotal: number;
    checkoutRules: {
      prepaidDiscountPercent: number;
      codMinOrderAmount: number;
      codMaxOrderAmount: number;
    };
  };
}

type Address = {
  id: string;
  refId: string;
  recipientName: string;
  phoneNumber: string;
  pincode: string;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  addressType: "HOME" | "OFFICE" | "OTHER";
  isDefault: boolean;
};

type CartLine = {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  sku: string;
  variantLabel: string | null;
  quantity: number;
  unitPrice: number;
  mrp: number | null;
  totalPrice: number;
  stock: number;
  inStock: boolean;
  isAvailable: boolean;
  primaryImageUrl: { key: string; name: string; url: string } | null;
  productDetails: Array<{ label: string; value: string }>;
};
```

**Detail UI sections:**

1. **Customer** — name, mobile, email, guest vs registered.
2. **Address** — prefer `defaultAddress`; also list `addresses` if more than one. Format: recipient, phone, line1, line2, landmark, city, state, pincode, type.
3. **Products** — image (`primaryImageUrl.url`), name, SKU, variant, qty, MRP, unit price, line total, availability.
4. **Totals** — subtotal, coupon (`code` / `title` / `discountAmount`), shipping, handling, platform fee, COD charge, prepaid discount, **grand total**.

`totalAmount` on the **list** is product subtotal. **Detail** `cart.grandTotal` includes shipping / fees / coupon. Do not treat them as the same number.

---

## Filters UI (list)

Match other admin list toolbars:

- Search input (placeholder: “Search name or mobile”)
- Date range: From / To (`fromDate`, `toDate` as `YYYY-MM-DD`)
- Optional amount range: Min / Max
- Sort: last activity, amount, name, mobile — default last activity DESC
- Pagination: `page` + `limit`

---

## Do not build

- Create / edit / delete abandoned cart
- “Recover cart” or “place order from cart” unless a later API exists
- Call GoKwik abandoned-cart webhooks from admin
- Show carts after successful checkout (backend already excludes them)

---

## Checklist

- [ ] Icon map includes `ShoppingCart`
- [ ] Route `/abandoned-carts` + detail `/abandoned-carts/[refId]` (refId, not UUID)
- [ ] Gate with `abandoned_carts.read`
- [ ] List: name, mobile, total amount + search + date sort/filter
- [ ] Detail: address + product lines + money breakdown
- [ ] Handle 404 when cart was already purchased
- [ ] Roles page shows Abandoned Carts checkbox from grouped permissions (no hardcode needed)
