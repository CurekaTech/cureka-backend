# Admin — Order Management Integration

This document covers all APIs, filters, enums, and response shapes needed to build the **Order Management** section of the admin panel.

---

## Sidebar menu

The menu is already configured server-side. The routes and their pre-applied filters are:

| Menu item | Route | Pre-applied filter |
|---|---|---|
| All Orders | `/order-requests` | none |
| Active Orders | `/order-requests?status=PENDING` | `orderStatus=PENDING` |
| In Transit | `/order-requests?status=OUT_FOR_DELIVERY` | `orderStatus=OUT_FOR_DELIVERY` |
| Completed | `/order-requests?status=DELIVERED` | `orderStatus=DELIVERED` |
| Cancelled | `/order-requests?status=CANCELLED` | `orderStatus=CANCELLED` |

Required permission for all items: `orders.read`

---

## APIs

### 1. List orders

```
GET /admin/api/proxy/orders
Authorization: Bearer <admin-jwt>
```

> The proxy strips the `/admin/api/proxy/` prefix and forwards to the backend as `/api/v1/admin/orders`.
> Do NOT include `admin/api/` in the path after `/proxy/` — that causes a 404.

#### Query parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `page` | number | no | Default `1` |
| `limit` | number | no | Default `10` |
| `search` | string | no | Full-text search across: order refId, order number, customer name / email / phone, product name, grand total |
| `orderSource` | enum | no | Filter by source — see values below |
| `orderStatus` | enum | no | Filter by order status — see values below |
| `paymentStatus` | enum | no | Filter by payment status — see values below |
| `paymentMethod` | enum | no | Filter by payment method — see values below |
| `customerId` | UUID | no | Filter all orders of one customer |
| `fromDate` | ISO date string | no | e.g. `2026-07-01` — filters by `placedAt` |
| `toDate` | ISO date string | no | e.g. `2026-08-03` — filters by `placedAt` |
| `sortBy` | string | no | One of: `createdAt`, `placedAt`, `orderNumber`, `grandTotal`, `orderStatus`, `paymentStatus`, `recipientName` |
| `sortOrder` | `ASC` \| `DESC` | no | Default `DESC` |

#### `orderSource` values

| Value | Meaning |
|---|---|
| `Website` | Order placed on the website |
| `App` | Order placed via mobile app |
| `Admin` | Order created by telecaller / admin (via payment request) |
| `GoKwik` | Order placed through GoKwik checkout |

#### `orderStatus` values

| Value | Label |
|---|---|
| `PENDING` | Pending |
| `CONFIRMED` | Confirmed |
| `PROCESSING` | Processing |
| `SHIPPED` | Shipped |
| `OUT_FOR_DELIVERY` | Out for Delivery |
| `DELIVERED` | Delivered |
| `CANCELLED` | Cancelled |
| `FAILED_DELIVERY` | Delivery Failed |
| `RTO` | Returned to Origin |

#### `paymentStatus` values

| Value | Label |
|---|---|
| `PENDING` | Payment Pending |
| `PARTIALLY_PAID` | Partially Paid (GoKwik PP-COD) |
| `PAID` | Paid |
| `FAILED` | Failed |
| `REFUND_PENDING` | Refund Pending |
| `PARTIALLY_REFUNDED` | Partially Refunded |
| `REFUNDED` | Refunded |

#### `paymentMethod` values

| Value | Label |
|---|---|
| `COD` | Cash on Delivery |
| `WALLET` | Wallet |
| `RAZORPAY` | Razorpay |
| `CASHFREE` | Cashfree |
| `GOKWIK_PREPAID` | GoKwik Prepaid |
| `GOKWIK_PARTIAL_COD` | GoKwik Partial COD |

#### Example requests

```
# All orders, latest first
GET /admin/api/proxy/orders?page=1&limit=20&sortBy=placedAt&sortOrder=DESC

# Only GoKwik orders
GET /admin/api/proxy/orders?orderSource=GoKwik

# Only App orders that are confirmed
GET /admin/api/proxy/orders?orderSource=App&orderStatus=CONFIRMED

# Admin-created orders (telecaller)
GET /admin/api/proxy/orders?orderSource=Admin

# Search by customer name or order number
GET /admin/api/proxy/orders?search=John&fromDate=2026-07-01&toDate=2026-08-03

# Active orders (menu shortcut)
GET /admin/api/proxy/orders?orderStatus=PENDING
```

#### Response

```json
{
  "success": true,
  "data": {
    "items": [ /* AdminOrderResponse[] */ ],
    "total": 150,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}
```

---

### 2. Order detail

```
GET /admin/api/proxy/orders/:id
Authorization: Bearer <admin-jwt>
```

`:id` accepts either the order **UUID** or the business **refId** (e.g. `order20261234`).

---

## Response shapes

### Order list item (`AdminOrderResponse`)

```ts
{
  // --- Identifiers ---
  id: string;                      // UUID
  refId: string;                   // e.g. "order20261234"
  orderNumber: string;             // e.g. "ORD123456789"

  // --- Source & status ---
  orderSource: "Website" | "App" | "Admin" | "GoKwik";
  orderStatus: OrderStatus;        // see enum above
  paymentStatus: PaymentStatus;    // see enum above
  paymentMethod: PaymentMethod;    // see enum above

  // --- Money (all strings, 2 decimal places) ---
  subtotal: string;
  discountAmount: string;
  shippingAmount: string;
  handlingAmount: string;
  platformFee: string;
  codCharge: string;
  prepaidDiscount: string;
  grandTotal: string;

  // --- Coupon (nullable) ---
  couponId: string | null;
  couponCode: string | null;
  couponTitle: string | null;
  couponDiscountType: string | null;

  // --- Delivery address snapshot ---
  recipientName: string;
  phoneNumber: string;
  pincode: string;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  city: string;
  state: string;

  // --- Notes & timestamps ---
  notes: string | null;
  cancelReason: string | null;
  placedAt: string | null;         // ISO timestamp
  createdAt: string;
  updatedAt: string;

  // --- Counts ---
  itemCount: number;               // total quantity across all line items
  lineItemCount: number;           // number of distinct products

  // --- Line items ---
  items: OrderItemResponse[];

  // --- Customer (admin only) ---
  customer: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    mobileNumber: string | null;
  } | null;

  // --- Shipment / tracking ---
  shipment: ShipmentResponse;
}
```

### Order line item (`OrderItemResponse`)

```ts
{
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
  primaryImageUrl: { url: string; ... } | null;
  imageUrl: string | null;          // resolved CDN URL — use this for thumbnails
}
```

### Shipment / tracking (`ShipmentResponse`)

Always present on every order — driven by Shipway when available, otherwise derived from `orderStatus`.

```ts
{
  refId: string;
  orderId: string;
  orderNumber: string;
  shipmentStatus: string;           // see ShipmentStatus values below
  shipwayStatus: boolean;           // true = live Shipway data, false = derived from orderStatus
  shipwayRawStatus: string | null;
  awbNumber: string | null;         // courier tracking number
  courierName: string | null;
  trackingUrl: string | null;       // direct courier tracking link
  labelUrl: string | null;
  invoiceUrl: string | null;
  pushedAt: string | null;          // when order was pushed to Shipway
  lastSyncedAt: string | null;      // last Shipway status sync
  currentStatusLabel: string;       // human-readable status label for display
  statusFlow: ShipmentStatusFlowStep[];
  events: ShipmentEventResponse[];
}
```

#### `statusFlow` — progress stepper

Each step has:

```ts
{
  key: string;        // "confirmed" | "dispatched" | "out_for_delivery" | "delivered" | "cancelled" | "rto" | "failed_delivery"
  label: string;      // human-readable label
  status: "completed" | "current" | "pending";
  happenedAt: string | null;
}
```

Use this array to render a visual order progress stepper in the UI.

#### `events` — courier scan events (for detail page)

```ts
{
  status: string;
  description: string | null;
  location: string | null;
  happenedAt: string | null;
}
```

---

## Suggested UI layout

### List page (`/order-requests`)

- **Top filters bar**: Source tabs (`All` / `Website` / `App` / `Admin` / `GoKwik`) + Status dropdown + Payment method dropdown + Date range picker + Search input
- **Table columns**: Order # | Customer | Source badge | Grand total | Payment method | Order status | Payment status | Placed at | Actions
- **Source badge colours** (suggestion): Website = blue, App = purple, Admin = orange, GoKwik = green
- **Row click** → navigate to `/order-requests/:refId` (detail page)

### Detail page (`/order-requests/:id`)

- Order summary header (number, source, status, grand total, placed at)
- Pricing breakdown (subtotal, discount, shipping, platform fee, COD charge, prepaid discount, grand total)
- Delivery address block
- Customer info block (name, email, phone)
- Order progress stepper (`shipment.statusFlow`)
- Shipment info (AWB, courier, tracking URL)
- Courier scan events timeline (`shipment.events`)
- Line items table (thumbnail from `imageUrl`, product name, variant, SKU, qty, unit price, total)

---

## Notes

- The `status` query param used in sidebar menu hrefs maps to `orderStatus` in the API. The UI should translate sidebar URL params to the correct API param name.
- `shipment` is always present in the response — when no Shipway data exists `shipwayStatus: false` and the flow is built from `orderStatus`.
- `imageUrl` is the ready-to-use CDN URL for product thumbnails in list/detail.
- Money fields are strings — parse with `parseFloat` for any arithmetic.
