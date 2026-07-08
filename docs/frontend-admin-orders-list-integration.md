# Frontend Integration Guide: Admin Orders (`GET /admin/orders`)

This document describes how the admin UI should integrate with the **orders list and detail** APIs for super admins. Use it to build the order management table and order detail page.

---

## 1. Orders vs payment requests

| Screen | Endpoint | When to use |
|--------|----------|-------------|
| **Payment requests** (telecaller / admin order wizard) | `GET /api/v1/admin/payment-requests` | Orders **not yet paid** — link generation, pending payment |
| **Completed orders** (this guide) | `GET /api/v1/admin/orders` | **Final orders** in the `orders` table after checkout or successful payment |

See also: [admin-order-payment-flow.md](./admin-order-payment-flow.md) for the payment-request lifecycle.

---

## 2. Endpoint overview

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/admin/orders` | Paginated list with search, filters, sort |
| `GET` | `/api/v1/admin/orders/:id` | Single order detail (full items, customer) |

Shared properties:

| Property | Value |
|----------|-------|
| **Auth** | Admin JWT — `Authorization: Bearer <ADMIN_TOKEN>` |
| **Access** | **Super admin only** (`super_admin` role) |

---

## 3. List orders (`GET /admin/orders`)

### Headers

```http
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json
```

### Query parameters

All parameters are optional.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | `1` | Page number (1-based), min `1` |
| `limit` | number | `20` | Items per page, min `1`, max `100` |
| `search` | string | — | Max 100 chars. Matches order `refId`, `orderNumber`, recipient name/phone, customer first/last name, email, mobile, product name, or `grandTotal` |
| `orderStatus` | string | — | Filter by fulfillment status — see §7 |
| `paymentStatus` | string | — | Filter by payment status — see §7 |
| `paymentMethod` | string | — | `COD`, `WALLET`, `RAZORPAY`, `CASHFREE` |
| `customerId` | UUID | — | Filter orders for one customer (`users.id`) |
| `fromDate` | ISO date | — | Orders created on or after this date (e.g. `2026-07-01`) |
| `toDate` | ISO date | — | Orders created on or before this date |
| `sortBy` | string | `createdAt` | See §5 |
| `sortOrder` | string | `DESC` | `ASC` or `DESC` |

### Example requests

```http
GET /api/v1/admin/orders?page=1&limit=20
GET /api/v1/admin/orders?search=ORD12345678&page=1&limit=20
GET /api/v1/admin/orders?orderStatus=CONFIRMED&paymentStatus=PAID&page=1&limit=20
GET /api/v1/admin/orders?paymentMethod=COD&sortBy=placedAt&sortOrder=DESC
GET /api/v1/admin/orders?fromDate=2026-07-01&toDate=2026-07-31&page=1&limit=50
GET /api/v1/admin/orders?customerId=e45a0b7b-23f0-4566-a36b-95bb8e46927d
```

### cURL

```bash
curl -X GET "http://localhost:3005/api/v1/admin/orders?page=1&limit=20&orderStatus=CONFIRMED" \
  -H "Authorization: Bearer <SUPER_ADMIN_TOKEN>"
```

---

## 4. Order detail (`GET /admin/orders/:id`)

Returns a **single order** with line items (including product images) and customer profile. (Shipment tracking is not enabled yet — see note below.)

### Path parameter

| Param | Type | Description |
|-------|------|-------------|
| `id` | string | Order **UUID** (`id`) **or** business **`refId`** (e.g. `order20261234`) |

Prefer linking from the list using `refId` (stable display id) or `id` (UUID) — both work.

### Example requests

```http
GET /api/v1/admin/orders/b182cbdf-c93d-4c3e-8ff5-ee9f8352b2f6
GET /api/v1/admin/orders/order20261234
```

### cURL

```bash
curl -X GET "http://localhost:3005/api/v1/admin/orders/order20261234" \
  -H "Authorization: Bearer <SUPER_ADMIN_TOKEN>"
```

### Success response (200)

```json
{
  "success": true,
  "message": "Order fetched successfully",
  "data": {
    "id": "b182cbdf-c93d-4c3e-8ff5-ee9f8352b2f6",
    "refId": "order20261234",
    "orderNumber": "ORD123456789012",
    "grandTotal": "834.00",
    "orderStatus": "CONFIRMED",
    "paymentStatus": "PAID",
    "customer": {
      "id": "e45a0b7b-23f0-4566-a36b-95bb8e46927d",
      "firstName": "Jane",
      "lastName": "Smith",
      "email": "jane@example.com",
      "mobileNumber": "9876543210"
    },
    "items": [ /* AdminOrderItem[] with imageUrl */ ],
    "shipment": null
  },
  "timestamp": "2026-07-08T07:30:00.000Z"
}
```

> **Note:** Shipment tracking is **not yet enabled** in this environment. `shipment` is always **`null`** for now. The field is kept in the response for forward compatibility — do not build the shipment UI section until shipping is live.

### Detail page sections (suggested)

| Section | Fields |
|---------|--------|
| Header | `orderNumber`, `refId`, `orderStatus`, `paymentStatus`, `placedAt` |
| Customer | `customer.*` + shipping `recipientName`, `phoneNumber`, full address |
| Line items | `items[]` — name, variant, sku, qty, unit/total price, `imageUrl` |
| Pricing | `subtotal`, `discountAmount`, `shippingAmount`, `handlingAmount`, `platformFee`, `codCharge`, `prepaidDiscount`, `grandTotal`, coupon fields |
| Shipment | _Not yet available_ — `shipment` is always `null` for now |
| Notes | `notes` |

---

## 5. List sorting

Allowed `sortBy` values (invalid values return **400**):

| `sortBy` | Sorts by |
|----------|----------|
| `createdAt` | Order record created date **(default)** |
| `placedAt` | When the order was placed |
| `orderNumber` | Display order number (e.g. `ORD123456789012`) |
| `grandTotal` | Final payable amount |
| `orderStatus` | Fulfillment status |
| `paymentStatus` | Payment status |
| `recipientName` | Shipping recipient name |

---

## 6. List response shape

Standard API envelope:

```json
{
  "success": true,
  "message": "Orders fetched successfully",
  "data": {
    "data": [ /* AdminOrder[] */ ],
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "timestamp": "2026-07-08T07:30:00.000Z"
}
```

### Pagination fields (`data` root)

| Field | Type | Description |
|-------|------|-------------|
| `data` | array | Current page of orders |
| `total` | number | Total matching orders |
| `page` | number | Current page |
| `limit` | number | Page size |
| `totalPages` | number | `ceil(total / limit)` |
| `hasNextPage` | boolean | More pages available |
| `hasPreviousPage` | boolean | Previous page exists |

### Order object (`AdminOrder`)

Money fields are **strings** (decimal from DB). Use them as-is or parse with `parseFloat` for display.

```typescript
type AdminOrderCustomer = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  mobileNumber: string | null;
};

type AdminOrderItem = {
  id: string;
  refId: string;
  orderId: string;
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  createdAt: string;
  updatedAt: string;
  primaryImageUrl: { key: string; name: string; url: string } | null;
  imageUrl: string | null; // Use for table thumbnails
};

type AdminOrder = {
  id: string;
  refId: string;
  orderNumber: string;
  userId: string;
  subtotal: string;
  discountAmount: string;
  shippingAmount: string;
  handlingAmount: string;
  platformFee: string;
  codCharge: string;
  prepaidDiscount: string;
  grandTotal: string;
  couponId: string | null;
  couponCode: string | null;
  couponTitle: string | null;
  couponDiscountType: string | null;
  paymentMethod: 'COD' | 'WALLET' | 'RAZORPAY' | 'CASHFREE';
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  orderStatus: OrderStatus; // see §7
  recipientName: string;
  phoneNumber: string;
  pincode: string;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  notes: string | null;
  placedAt: string | null;
  itemCount: number;       // Total quantity across line items — "3 Item(s)"
  lineItemCount: number; // Number of distinct SKUs
  items: AdminOrderItem[];
  shipment: AdminOrderShipment | null; // Populated on detail; null on list (and when not shipped)
  customer: AdminOrderCustomer | null;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
};

type AdminOrderShipment = {
  refId: string;
  orderId: string;
  orderNumber: string;
  shipmentStatus: string;
  shipwayRawStatus: string | null;
  awbNumber: string | null;
  courierName: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  invoiceUrl: string | null;
  pushedAt: string | null;
  lastSyncedAt: string | null;
  events: Array<{
    status: string;
    description: string | null;
    location: string | null;
    happenedAt: string | null;
  }>;
};
```

---

## 7. Enums for filters & badges

### `orderStatus` (fulfillment)

| Value | Suggested UI label |
|-------|-------------------|
| `PENDING` | Pending |
| `CONFIRMED` | Confirmed |
| `PROCESSING` | Processing |
| `SHIPPED` | Shipped |
| `OUT_FOR_DELIVERY` | Out for delivery |
| `DELIVERED` | Delivered |
| `CANCELLED` | Cancelled |
| `FAILED_DELIVERY` | Failed delivery |
| `RTO` | RTO |

### `paymentStatus`

| Value | Suggested UI |
|-------|--------------|
| `PENDING` | Amber — Payment pending |
| `PAID` | Green — Paid |
| `FAILED` | Red — Failed |
| `REFUNDED` | Gray — Refunded |

### `paymentMethod`

| Value | Label |
|-------|-------|
| `COD` | Cash on delivery |
| `WALLET` | Wallet |
| `RAZORPAY` | Razorpay |
| `CASHFREE` | Cashfree |

---

## 8. Suggested table columns

| Column | Source field | Notes |
|--------|--------------|-------|
| Order # | `orderNumber` or `refId` | Link to `/admin/orders/:refId` detail page |
| Customer | `customer.firstName` + `customer.lastName` | Fallback: `recipientName` |
| Phone | `customer.mobileNumber` or `phoneNumber` | |
| Items | `itemCount` | e.g. `"3 Item(s)"` |
| Amount | `grandTotal` | Prefix `₹`, format decimal |
| Payment | `paymentStatus` + `paymentMethod` | Two badges or combined |
| Status | `orderStatus` | Fulfillment badge |
| Placed | `placedAt` or `createdAt` | Format locale datetime |
| Thumbnail | `items[0]?.imageUrl` | First line item image |

---

## 9. TypeScript fetch examples

```typescript
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3005/api/v1';

export type AdminOrderListParams = {
  page?: number;
  limit?: number;
  search?: string;
  orderStatus?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  customerId?: string;
  fromDate?: string;
  toDate?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
};

export async function fetchAdminOrders(
  token: string,
  params: AdminOrderListParams = {},
) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  });

  const res = await fetch(`${API_BASE}/admin/orders?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `Orders list failed (${res.status})`);
  }

  const json = await res.json();
  return json.data as {
    data: AdminOrder[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export async function fetchAdminOrderDetail(token: string, idOrRefId: string) {
  const res = await fetch(`${API_BASE}/admin/orders/${encodeURIComponent(idOrRefId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `Order detail failed (${res.status})`);
  }

  const json = await res.json();
  return json.data as AdminOrder;
}
```

---

## 10. UI state wiring

Keep query params in sync with the URL so filters are shareable:

```typescript
// Example: React — debounce search 300ms, reset page to 1 on filter change
const [filters, setFilters] = useState<AdminOrderListParams>({
  page: 1,
  limit: 20,
  sortBy: 'createdAt',
  sortOrder: 'DESC',
});

useEffect(() => {
  fetchAdminOrders(adminToken, filters).then(setOrdersPage);
}, [filters]);
```

**Recommended behaviour:**

- Changing `search`, `orderStatus`, `paymentStatus`, `paymentMethod`, or date range → reset `page` to `1`
- Use `hasNextPage` / `hasPreviousPage` for pagination controls
- Show empty state when `total === 0`
- Show **403** message if non–super-admin hits this route

---

## 11. Errors

| HTTP | Cause | UI action |
|------|-------|-----------|
| `401` | Missing / expired token | Redirect to admin login |
| `403` | Not `super_admin` | Hide menu item or show access denied |
| `404` | Order not found (detail) | Show not-found page |
| `400` | Invalid query (bad enum, invalid `sortBy`, invalid UUID) | Show validation message from `message` |
| `500` | Server error | Retry + generic error toast |

---

## 12. Related customer endpoints

These are **not** for the admin orders table — they require the **customer session** cookie, not admin JWT:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/orders` | Logged-in customer's own orders |
| `GET` | `/api/v1/orders/:id` | Customer order detail (UUID only, own orders) |

Use **`GET /api/v1/admin/orders/:id`** for the super-admin order detail screen — not the customer endpoint above.
