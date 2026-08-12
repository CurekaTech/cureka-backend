# Admin Reports APIs

Base path: `/api/v1/admin/reports`  
Auth: Admin JWT + permissions (`reports.read`, `reports.export`)

## Menu

The admin menu includes **Reports** above **Audit Logs** with icon `FileChartColumn`.

| Report | Route |
|---|---|
| Sales & Revenue | `/reports/sales-revenue` |
| Orders | `/reports/orders` |
| Product Performance | `/reports/product-performance` |
| Inventory & Stock | `/reports/inventory-stock` |
| Customers | `/reports/customers` |
| Payments | `/reports/payments` |
| Returns & Refunds | `/reports/returns-refunds` |
| Coupons & Promotions | `/reports/coupons` |

> **Hidden for now:** Vendor Performance and Consultations are removed from the admin menu (API routes still exist).

## Shared query params

| Param | Type | Notes |
|---|---|---|
| `startDate` | ISO date string | Optional, defaults to today |
| `endDate` | ISO date string | Optional, defaults to today |
| `categoryRefId` | string | Optional filter by category |
| `brandRefId` | string | Optional filter by brand |
| `paymentMethod` | enum | Optional filter by order payment method |
| `orderStatus` | enum | Optional filter by order status |
| `type` | `product \| consultation` | `consultation` returns empty where module is unavailable |
| `ranking` | `best \| low` | Product performance sort direction |
| `stockFilter` | `all \| low \| out_of_stock \| in_stock` | Inventory report filter |
| `vendorRefId` | string | Vendor performance filter |
| `lowStockThreshold` | number | Default `10` for inventory low-stock |
| `page` | number | Default `1` |
| `limit` | number | Default `20` |
| `sortBy` | string | Report-specific columns |
| `sortOrder` | `ASC \| DESC` | Default `DESC` |

---

## Phase 1

### 1) Sales & Revenue — `GET /sales-revenue`

Returns summary cards plus daily rows.

```json
{
  "range": { "startDate": "...", "endDate": "..." },
  "summary": {
    "totalOrders": { "value": 1245, "previousValue": 1106, "changePercent": 12.57 },
    "grossSales": { "value": 1245800, "previousValue": 1081230, "changePercent": 15.22 },
    "netSales": { "value": 1102300, "previousValue": 994830, "changePercent": 10.80 },
    "taxCollected": { "value": 0, "previousValue": 0, "changePercent": 0 },
    "discounts": { "value": 38200, "previousValue": 39210, "changePercent": -2.57 },
    "refunds": { "value": 25100, "previousValue": 26240, "changePercent": -4.34 },
    "aov": { "value": 885.38, "previousValue": 899.48, "changePercent": -1.57 }
  },
  "rows": { "data": [ { "date": "12-Aug-2026", "type": "product", "orders": 125, "grossSales": 125450, "discounts": 4250, "tax": 0, "shipping": 5200, "refunds": 1250, "netSales": 104700, "aov": 837.6 } ] }
}
```

**Tax:** no tax column on `orders` yet — `taxCollected` and `rows[].tax` are always `0`.

Export: `GET /sales-revenue/export`

### 2) Order Report — `GET /orders`

Summary buckets: `total`, `pending`, `confirmed`, `shipped`, `delivered`, `cancelled`, `returned`, `refunded`.

Rows: **per-order details** with user + order fields:
`orderId`, `orderNumber`, `date`, `placedAt`, `userId`, `userRefId`, `customerName`, `email`, `phone`, `isGuest`, `orderStatus`, `paymentStatus`, `paymentMethod`, `orderSource`, `itemsCount`, `subtotal`, `discountAmount`, `shippingAmount`, `grandTotal`, `city`, `state`.

Customer name/phone fall back to order recipient fields when profile fields are empty.

Export: `GET /orders/export`

---

## Phase 2

### 3) Product Performance — `GET /product-performance`

Summary: `totalProductsSold`, `totalUnitsSold`, `totalRevenue`, `outOfStockProducts`.

Rows: `productName`, `sku`, `unitsSold`, `ordersCount`, `revenue`, `stock`, `outOfStock`.

Use `ranking=best` (default) or `ranking=low`.

Export: `GET /product-performance/export`

### 4) Inventory & Stock — `GET /inventory-stock`

Summary: `totalSkus`, `inStockSkus`, `lowStockSkus`, `outOfStockSkus`, `inventoryValuation`.

Rows: variant-level stock with `stockStatus` (`in_stock` | `low_stock` | `out_of_stock`).

**Note:** stock movement ledger is not available — this is a current snapshot.

Export: `GET /inventory-stock/export`

### 5) Vendor Performance — `GET /vendor-performance` (hidden from menu)

Summary: `totalVendors`, `totalOrders`, `totalRevenue`, `avgFulfillmentRate`, `avgCancellationRate`, `avgReturnRate`.

Rows: vendor-wise orders, revenue, delivered/cancelled/returned counts, `activeProducts`, rates.

Filter: `vendorRefId`.

Export: `GET /vendor-performance/export`

### 6) Customer Report — `GET /customers`

Summary: `newCustomers`, `returningCustomers`, `totalRegistrations`, `activeCustomers`, `avgOrderFrequency`, `avgCustomerLifetimeValue`.

Rows: all customers who placed orders in the range (registered + guest). Name/phone fall back to order recipient fields when profile fields are empty. Fields: name, email, phone, `isGuest`, `totalOrders`, `totalSpend`, `avgOrderValue`, `customerLifetimeValue`, `lastOrderAt`.

Export: `GET /customers/export`

### 7) Consultations — `GET /consultations` (hidden from menu)

**Placeholder only** — consultation module not implemented. Returns zero summary and empty rows with:

```json
"meta": {
  "available": false,
  "note": "Doctor consultation module is not implemented yet. Endpoint returns empty data."
}
```

### 8) Payments — `GET /payments`

Summary: `successful`, `failed`, `pending`, `refunded`, `totalAmount`.

Rows: breakdown by `paymentMethod`.

**Skipped:** vendor settlements and commissions (no DB tables).

Export: `GET /payments/export`

### 9) Returns & Refunds — `GET /returns-refunds`

Summary: `returnRequests`, `refunds`, `refundAmount`, `replacementRequests` (always 0), `returnRate`.

Rows: return rows from RTO/cancelled orders; refund rows from `gokwik_refunds`.

**Skipped:** dedicated replacement request entity.

Export: `GET /returns-refunds/export`

### 10) Coupons & Promotions — `GET /coupons`

Summary: `totalCouponUsages`, `totalDiscountGiven`, `couponRevenue`, `activeCouponsUsed`, `avgRedemptionRate`.

Rows: `couponCode`, `couponTitle`, `usages`, `discountAmount`, `revenue`, `redemptionRate`.

Export: `GET /coupons/export`

---

## Frontend integration

1. Build each page using the JSON endpoint with pagination.
2. Keep selected filters in state.
3. On **Export Excel**, call the matching `/export` endpoint with the same query params.
4. Show empty states for consultation report and skipped sections noted above.

