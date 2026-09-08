# Save for Later — storefront integration

Use this spec in the **website / app** Cursor chat. Backend APIs are live after migration `CreateSavedForLaterItems1785980400000`.

This is **not** the wishlist. Wishlist is product-level favorites (`/wishlist`). Save for Later keeps **cart-line identity**: variant, quantity, and subscription/frequency, so the item can move back into the cart.

Inventory is **not reserved**. Price and stock are always the **current** catalog values, not a snapshot from when the item was saved.

---

## 1. Feature overview

Amazon/Flipkart-style flow:

```text
Cart page: “Save for Later”
→ POST /api/v1/cart/items/:cartItemId/save-for-later
→ Item leaves the cart (totals/count update)
→ Item appears in Save for Later

Save for Later: “Move to Cart”
→ POST /api/v1/save-for-later/:id/move-to-cart
→ Existing add-to-cart rules run on the backend
→ Item leaves Save for Later
→ Cart updates

Save for Later: “Remove”
→ DELETE /api/v1/save-for-later/:id
→ Cart is unchanged
```

Do **not** implement Move to Cart as `POST /cart/items` plus `DELETE /save-for-later/:id`. Use the atomic move endpoint so a failed add does not drop the saved row.

---

## 2. Authentication / guests

Same session as cart:

- Cookie / Bearer session (`SessionCookieGuard`)
- `customerId` is **never** sent in the body; the backend uses `user.sub`

Guests **are supported**. Guest login already creates a real user id. Saved items persist on that guest user and merge into the registered account on login (`POST /cart/merge` / server-side login merge), same as the cart.

Unauthenticated (no session) → `401`. Create a guest session the same way you do for cart before calling these APIs.

There is no separate guest-token.

---

## 3. Endpoints

Base prefix: `/api/v1`

| Action | Method | Path |
|---|---|---|
| Cart → Save for Later | `POST` | `/cart/items/:itemId/save-for-later` |
| List | `GET` | `/save-for-later` |
| Count | `GET` | `/save-for-later/count` |
| Move to cart | `POST` | `/save-for-later/:id/move-to-cart` |
| Remove | `DELETE` | `/save-for-later/:id` |

Existing cart APIs are unchanged (`GET /cart`, `POST /cart/items`, `PATCH /cart/items/:itemId`, `DELETE /cart/items/:itemId`).

**Not implemented:** `POST /save-for-later` from a product page (direct save without a cart line). First version is cart-to-save only.

---

## 4. Headers

Same as cart:

```http
Authorization: Bearer <session token>
Cookie: <session cookie as used by cart>
Content-Type: application/json
```

---

## 5–7. Requests, success, errors

Success envelope (all of these except where noted):

```ts
{
  success: true;
  message: string;
  data: T;
  timestamp: string;
}
```

Error envelope:

```ts
{
  success: false;
  statusCode: number;
  error: string;
  message: string | string[];
  code?: string;
  timestamp: string;
  path: string;
}
```

### Cart → Save for Later

```http
POST /api/v1/cart/items/{cartItemId}/save-for-later
```

Body: none (or `{}`). Product/variant/qty come from the cart line.

`data`:

```ts
{
  savedItem: SavedForLaterListItem;
  cart: CartResponse; // same shape as GET /cart
}
```

Message: `Item moved to Save for Later successfully`

| HTTP | `code` | When |
|---|---|---|
| 401 | — | No session |
| 404 | `CART_ITEM_NOT_FOUND` | Missing item or another customer’s item |

Repeated click: first succeeds; second is `404` (item already left the cart). Do not treat that as a fatal UI error if the item is already in saved state.

### List

```http
GET /api/v1/save-for-later?page=1&limit=20&sortBy=createdAt&sortOrder=DESC
```

| Query | Default | Notes |
|---|---|---|
| `page` | `1` | |
| `limit` | `20` | Max 100 |
| `sortBy` | `createdAt` | `createdAt` \| `updatedAt` |
| `sortOrder` | `DESC` | `ASC` \| `DESC` |

`data` is the standard paginated object:

```ts
{
  data: SavedForLaterListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
```

Message: `Save for Later items retrieved successfully`

A single unavailable product does **not** fail the list. That row has `canMoveToCart: false`.

### Count

```http
GET /api/v1/save-for-later/count
```

```ts
{ count: number }
```

Use this for a header badge. List `total` is equivalent if you already loaded the first page.

### Move to cart

```http
POST /api/v1/save-for-later/{id}/move-to-cart
```

Body: none.

`data`:

```ts
{ cart: CartResponse }
```

Message: `Item moved to cart successfully`

| HTTP | `code` / message | When |
|---|---|---|
| 404 | `SAVE_FOR_LATER_ITEM_NOT_FOUND` | Missing / other customer |
| 400 | `Product/variant not found or inactive` | Same as add-to-cart |
| 400 | `Requested quantity exceeds available stock` | When stock validation is enabled |
| 400 | subscription frequency errors | Same as add-to-cart |

On **any** failure, the saved row **stays**. Show the error; keep the item in the saved list.

Repeated click: first succeeds; second is `404`. Cart quantity is not doubled.

### Remove

```http
DELETE /api/v1/save-for-later/{id}
```

`data`: `{ count: number }` remaining saved items.

Message: `Saved item removed successfully`

`404` `SAVE_FOR_LATER_ITEM_NOT_FOUND` if missing or not owned. Cart is unchanged.

---

## 8. List item shape

```ts
type SavedForLaterListItem = {
  id: string;
  productId: string;
  productVariantId: string;
  quantity: number;
  isSubscription: boolean;
  frequency: string | null; // MONTHLY | BI_MONTHLY | QUARTERLY
  product: {
    slug: string | null;
    title: string;
    image: StorageFileReference | null; // same image object as cart `primaryImageUrl`
    brand: string | null;
  };
  variant: {
    id: string | null;
    title: string | null;   // attribute label, e.g. "Size: 60 capsules"
    sku: string | null;
    currentPrice: number | null;
    originalPrice: number | null; // MRP
    discount: number | null;      // percent
    stockStatus: 'IN_STOCK' | 'OUT_OF_STOCK';
    availableQuantity: number;    // live stock
    isActive: boolean;
  };
  canMoveToCart: boolean;
  unavailableReason: UnavailableReason | null;
  savedAt: string; // ISO
};

type UnavailableReason =
  | 'PRODUCT_INACTIVE'
  | 'PRODUCT_DELETED'
  | 'VARIANT_INACTIVE'
  | 'OUT_OF_STOCK'
  | 'INSUFFICIENT_STOCK'
  | 'MAXIMUM_QUANTITY_EXCEEDED';
```

Display `variant.currentPrice` (not a cached old price).

`canMoveToCart` follows **the same eligibility as add-to-cart**. While global stock validation is off, `stockStatus` may be `OUT_OF_STOCK` and `canMoveToCart` can still be `true`. Prefer disabling Move to Cart only when `canMoveToCart === false`. You may still show a stock warning from `stockStatus`.

---

## 9. Pagination

Same as other Cureka lists (`page`, `limit`, `total`, `hasNextPage`, …). Default sort: newest saved first.

---

## 10. Cart → Save flow (UI)

1. Disable the “Save for Later” button on click (prevent double submit).
2. `POST /cart/items/{cartItem.id}/save-for-later`.
3. On success:
   - Replace cart state with `data.cart` (`totalItems`, line items, totals).
   - Insert/update `data.savedItem` in saved state (or refetch `GET /save-for-later`).
   - Refresh saved count (`data` from count endpoint, or `total` from list).
4. On `CART_ITEM_NOT_FOUND`: refetch cart; the line is probably already gone.
5. Re-enable the button when the request finishes.

Saved items **must not** be added into cart subtotal, coupons, shipping, COD, or checkout.

---

## 11. Save → Cart flow (UI)

1. If `canMoveToCart === false`, disable “Move to Cart” and show a short reason from `unavailableReason`.
2. Disable the button on click.
3. `POST /save-for-later/{id}/move-to-cart`.
4. On success:
   - Remove that id from saved state.
   - Replace cart state with `data.cart`.
   - Update header cart count from `cart.totalItems`.
   - Decrement saved count.
5. On 400: keep the saved item; show `message`.
6. On 404: remove it from local saved state (already moved).

---

## 12. Remove flow (UI)

1. Confirm if you want (optional).
2. `DELETE /save-for-later/{id}`.
3. On success: drop the row; set saved count to `data.count`.
4. Do not change cart state.

---

## 13–14. Loading and double-click

- Per-row `saving` / `moving` / `removing` flags.
- Disable Save for Later, Move to Cart, and Remove while that row’s request is in flight.
- Do not fire Move to Cart twice in parallel for the same id.

---

## 15–16. Unavailable / out of stock

| `unavailableReason` | Suggested copy |
|---|---|
| `PRODUCT_INACTIVE` / `PRODUCT_DELETED` | This product is no longer available |
| `VARIANT_INACTIVE` | This option is no longer available |
| `OUT_OF_STOCK` | Currently out of stock |
| `INSUFFICIENT_STOCK` | Only {availableQuantity} left |
| `MAXIMUM_QUANTITY_EXCEEDED` | Maximum quantity exceeded |

Keep the card visible. Only hide/disable **Move to Cart**. Remove remains allowed.

---

## 17. Quantity

- Save for Later stores the **cart line quantity**.
- Moving back adds that quantity through normal cart merge (if the variant is already in the cart, quantities add).
- Editing quantity is **not** a Save for Later API. User should move to cart and use `PATCH /cart/items/:itemId`.

---

## 18. Counts

| Count | Source |
|---|---|
| Cart badge | `GET /cart` → `totalItems` (or `data.cart.totalItems` after save/move) |
| Saved badge | `GET /save-for-later/count` → `count` |

These are independent. Saving decreases cart count and increases saved count.

---

## 19. Suggested state

```text
cart          ← GET /cart, and responses from save-for-later / move-to-cart
savedItems    ← GET /save-for-later (paginated)
savedCount    ← GET /save-for-later/count
pendingRowId  ← id currently mutating
```

On login, existing cart merge also merges saved items. Refetch both cart and saved list after login.

---

## 20. Acceptance cases

| Case | Expected |
|---|---|
| Save for Later from cart | Line gone from cart; present in saved list; cart totals drop |
| Save same variant twice (two cart lines cannot exist; merge if already saved) | One saved row; quantities added |
| Move to cart | Saved row gone; cart has qty; totals update |
| Move to cart when product inactive | 400; saved row remains |
| Remove saved | Row gone; cart unchanged |
| Other user’s id | 404 |
| Saved items at checkout | Not in checkout payload / totals |
| Guest with session | Same APIs as logged-in |
| Price change after save | List shows new `currentPrice` |
| Double-click Save | One saved row; second request 404 |
| Double-click Move | One cart increment; second 404 |

---

## Distinction vs wishlist

| | Save for Later | Wishlist |
|---|---|---|
| Route | `/save-for-later`, `/cart/items/:id/save-for-later` | `/wishlist` |
| Identity | variant + qty + subscription | product only |
| Purpose | Park a cart line | Favorite a product |
