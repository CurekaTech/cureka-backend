# Customer order list — Mobile App Integration

Use this spec so the **My Orders** screen in the mobile app shows the same orders, labels, and tabs as the Cureka website.

Source of truth on web:

- List: `OrdersPageContent` → `GET /orders` → `mapOrderDtoToCustomerOrder`
- Card status: `listOrderStatus` in `Cureka-frontend/src/modules/orders/utils/orderMapper.ts`
- Detail: `GET /orders/:id` → `mapOrderDtoToOrderSummary`

The app must **not** show `shipment.currentStatusLabel`, `shipment.shipmentStatus`, or `shipment.shipwayRawStatus` as the order-card status. That is why mobile statuses do not match the website today.

---

## 1. What the website shows

Account → My Orders.

Three tabs. The website loads orders **without** a status filter, then puts each order into a tab on the device.

| Tab | `orderStatus` values (after the list rule in section 4) |
|---|---|
| Upcoming (default) | `PENDING`, `CONFIRMED` |
| Active | `PROCESSING`, `SHIPPED`, `OUT_FOR_DELIVERY` |
| Past | `DELIVERED`, `CANCELLED`, `FAILED_DELIVERY`, `RTO` |

Each card shows:

| UI | Source |
|---|---|
| Order Created | `placedAt`, or `createdAt` if `placedAt` is null. Format `en-IN`: `21 Oct 2026` |
| Status text | Section 4 label. Delivered uses a delivered icon |
| Order ID | `orderNumber` (not the UUID) |
| Delivery date | Section 5 |
| `N Item(s)` | `itemCount` (sum of quantities). If missing, sum `items[].quantity` |
| Product rows | First **3** line items. Name is `productName`. Image is `imageUrl` or `primaryImageUrl.url` |
| `+N More` | When `lineItemCount` is greater than 3. `N` is the extra **lines**, not extra units |
| Order Details | Open detail with the order **UUID** (`id`) |
| Re-Order | Shown on every card. `POST /orders/:id/reorder` |

Search box placeholder: “Search by order ID, product, or amount…”. Debounce 300ms. Max 100 characters. Empty search shows “No orders in this tab yet.” A search with no hits shows “No orders match your search.”

The website does **not** show a Cancel button on the list or the detail screen right now.

---

## 2. Auth

Same verified customer session as the rest of the app.

```http
Authorization: Bearer <customer_session>
Accept: application/json
```

Do not send `customerId`. The list is the logged-in customer only.

All routes use the prefix `/api/v1`.

Success envelope:

```json
{
  "success": true,
  "data": {},
  "message": "Orders fetched successfully",
  "timestamp": "2026-10-21T10:00:00.000Z"
}
```

Money on the order is a **rupee string** (`"125.50"`), except `walletAmountPaise` and `gatewayAmountPaise`, which are **integer paise strings**. Paise → rupees is `Number(paise) / 100`.

---

## 3. Load the list

Match the website page size.

```http
GET /api/v1/orders?page=1&limit=10&sortOrder=DESC
```

Do **not** send `status` for the tabs. Tabs are a local filter of the loaded rows (section 4). Sending `status=CONFIRMED` will hide pending and shipped orders and the tabs will not match the website.

| Query | Use |
|---|---|
| `page` | Starts at 1 |
| `limit` | `10` on the website (API max 100, default 20) |
| `search` | Order number, ref id, recipient, phone, product name, or amount |
| `sortBy` | `createdAt` (default), `placedAt`, `orderNumber`, `grandTotal`, `orderStatus`, `paymentStatus` |
| `sortOrder` | `DESC` on the website |
| `fromDate` / `toDate` | ISO dates. The website screen does not send these |
| `paymentStatus` / `paymentMethod` | The website screen does not send these |

`data.hasNextPage` means load the next page and **append** it, then run the tab filter again on the full loaded list.

Response `data` (inside the envelope) is:

```json
{
  "data": [ { "id": "uuid", "orderNumber": "CU12345", "orderStatus": "PENDING", "paymentStatus": "FAILED" } ],
  "total": 24,
  "page": 1,
  "limit": 10,
  "totalPages": 3,
  "hasNextPage": true,
  "hasPreviousPage": false
}
```

Open a row with `id` (UUID):

```http
GET /api/v1/orders/{id}
```

`orderNumber` and `refId` are not accepted on this route.

---

## 4. Status the card must show

Start from `order.orderStatus`. Use the shipment only when it has moved the parcel **past** confirmation.

A shipment is live only when `shipment.awbNumber` or `shipment.shipwayRawStatus` is non-empty.

If it is not live, keep `order.orderStatus`.

If it is live, map `shipment.shipmentStatus` like this:

| `shipment.shipmentStatus` | Card status |
|---|---|
| `DELIVERED` | `DELIVERED` |
| `OUT_FOR_DELIVERY` | `OUT_FOR_DELIVERY` |
| `IN_TRANSIT`, `PICKUP_COMPLETE` | `SHIPPED` |
| `CANCELLED` | `CANCELLED` |
| `FAILED_DELIVERY`, `NDR` | `FAILED_DELIVERY` |
| `RTO`, `RTO_INITIATED` | `RTO` |
| anything else (`PENDING`, `CONFIRMED`, `PROCESSING`, `UNKNOWN`, missing) | keep `order.orderStatus` |

Then show this label:

| Status | Card text |
|---|---|
| `PENDING` | Order Pending |
| `CONFIRMED` | Order Confirmed |
| `PROCESSING` | Processing |
| `SHIPPED` | Shipped |
| `OUT_FOR_DELIVERY` | Out for Delivery |
| `DELIVERED` | Order Delivered |
| `CANCELLED` | Order Cancelled |
| `FAILED_DELIVERY` | Failed Delivery |
| `RTO` | Returned to Origin |

`shipment.currentStatusLabel` is a shipment badge. For a pending order it used to say **Order Confirmed** even when `orderStatus` was `PENDING`. Do not use it on the card.

### Failed payment (the bug)

A prepaid checkout that fails is saved as:

| Field | Value |
|---|---|
| `orderStatus` | `PENDING` |
| `paymentStatus` | `FAILED` |
| Shipway push | Not sent. Stock is not reduced |

The card must say **Order Pending** and sit in **Upcoming**.

It must not say Confirmed because:

- `shipment.currentStatusLabel` was “Order Confirmed” for every `PENDING` order
- `shipment.statusFlow[0]` was marked completed with the label “Order Confirmed”
- A stale shipment row could still carry `shipwayRawStatus: "Confirmed"`

The API now returns, for `orderStatus = PENDING`:

- `shipment.currentStatusLabel` = `Order Pending`
- `shipment.shipmentStatus` = `PENDING`
- `shipment.shipwayStatus` = `false`
- `shipment.shipwayRawStatus` = `null`
- every `shipment.statusFlow` step `pending`

Still ignore those shipment fields for the card. Trust `orderStatus` + the table above, and read `paymentStatus` if the app shows a payment line.

`paymentStatus = FAILED` with `orderStatus = PENDING` is “payment did not complete”, not “order confirmed” and not “out for delivery”.

Shipway and UniCommerce follow the same rule:

- The order is not pushed to Shipway and not created in UniCommerce.
- A Shipway status of Confirmed does not change `orderStatus`.
- If an AWB was already created, Shipway is asked to cancel it and the local Shipway status is cleared.
- If a UniCommerce sale order already exists, it is cancelled with the reason “Payment was not completed”.
- COD that is actually placed still goes to both systems. A failed prepaid payment does not.

---

## 5. Delivery-date column

Use the **card status from section 4**, not the raw `orderStatus`, when the two differ.

| Card status | Delivery date text |
|---|---|
| `DELIVERED` | `updatedAt`, format `21 Oct 2026, 1:06 pm` (`en-IN`, 12-hour) |
| `CANCELLED` | `Cancelled` |
| `SHIPPED`, `OUT_FOR_DELIVERY` | `Expected soon` |
| `CONFIRMED` | `Order Confirmed` |
| `PENDING` | `Order Pending` |
| `PROCESSING` | `Processing` |
| anything else | `Processing` |

---

## 6. Order detail

```http
GET /api/v1/orders/{uuid}
```

Header status uses **raw** `orderStatus` and the same label table as section 4. The detail header does not apply the shipment override. The list card does.

Status date on the header:

- `DELIVERED` → `updatedAt` as `21 Oct 2026`
- every other status → `placedAt` or `createdAt`, same date format

Line title: `productName`, and `productName (variantName)` when `variantName` is set.

Address lines, in order, skipping blanks: `addressLine1`, `addressLine2`, `landmark`, then `city, state, pincode`.

Payment lines (rupees). Hide a line when the amount is 0, except shipping, which is always shown.

| Line | Field | Sign on screen |
|---|---|---|
| Item total (MRP) | `subtotal` | plus |
| Product discount | `discountAmount` | minus, only if &gt; 0 |
| Handling Charges | `handlingAmount` | plus, only if &gt; 0 |
| Platform fee | `platformFee` | plus, only if &gt; 0 |
| Shipping Charges | `shippingAmount` | plus, including 0 |
| COD charge | `codCharge` | plus, only if &gt; 0 |
| Prepaid discount | `prepaidDiscount` | minus, only if &gt; 0 |
| Cureka Wallet | `walletAmountPaise / 100` | minus, only if &gt; 0 |

Footer total:

- No wallet: `grandTotal`
- Wallet used and `gatewayAmountPaise` is present: `gatewayAmountPaise / 100` (0 when the wallet covered the order)
- Wallet used and `gatewayAmountPaise` is missing: `grandTotal - wallet rupees`

If both wallet and a remainder are &gt; 0, add one more line: “Paid online”, or “Payable on delivery” when `paymentMethod` is `COD`.

Payment method labels:

| `paymentMethod` | Label |
|---|---|
| `COD` | Cash on Delivery |
| `WALLET` | Wallet |
| `RAZORPAY` | Razorpay |
| `CASHFREE` | Cashfree |
| `GOKWIK_PREPAID` | GoKwik Prepaid |
| `GOKWIK_PARTIAL_COD` | GoKwik Partial COD |

Shipment block:

- Badge text may use `shipment.currentStatusLabel` **on the detail shipment section only**
- Show “Shipway status” only when `shipment.shipwayRawStatus` is non-empty
- For a failed/pending order that field is null. Do not invent “Confirmed”
- Tracking events come from `shipment.events`. Do not draw the 4-step tracker; the website hides it

Return and Replace buttons do **not** use `returnAllowed` / `replaceAllowed` on this payload. Those flags are informational. Button visibility comes from `GET /api/v1/returns/eligibility/{orderId}`.

Re-Order on the detail screen calls the same reorder API as the card.

---

## 7. Re-order

```http
POST /api/v1/orders/{uuid}/reorder
```

No body. The server copies the lines into the active cart. Refresh the cart after success. Disable the button while the request is in flight. The website label is “Re-Order”, and “Adding…” while it runs.

---

## 8. Do not do this

- Do not label the card from `shipment.currentStatusLabel` or `shipment.statusFlow`
- Do not treat Shipway `Confirmed` as the order status when `orderStatus` is `PENDING` or `paymentStatus` is `FAILED`
- Do not call `GET /orders?status=CONFIRMED` to build the Upcoming tab
- Do not open detail with `orderNumber`
- Do not add `customerId` to the query
