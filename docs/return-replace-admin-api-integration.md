# Return and Replace — Admin API integration

Contract for the admin panel. The backend is the source of truth.

```text
Admin
  -> call the API
  -> display the response
  -> do not duplicate the business rules
```

Admin must not calculate Return eligibility, Replace eligibility, expiry windows, bundle COD, replacement price difference, or settlement direction.

- Base path: `/api/v1`
- Auth: admin JWT. Role `SUPER_ADMIN`, `ADMIN`, or `MODERATOR`, plus the permission on each route.
- Success body: `{ success, data, message, timestamp }`. Fields below are inside `data`.
- Errors: `{ success: false, code, message, timestamp }`. Branch on `code`.

Fields and routes marked **New** are not live until the backend change ships. Routes marked **Existing** are live today. Business rules: [return-replace-configuration.md](./return-replace-configuration.md). The current admin return guide remains the reference for review, pickup, and QC screens that this document does not change.

Approving a return does not create a replacement order. Confirming a replacement product does not create one either. Fulfillment is still a link to an order that already exists.

## 1. Policy configuration

**Existing.** No new policy field.

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/admin/return-policies/products/:productId` | `return_policies.read` |
| PATCH | `/admin/return-policies/products/:productId` | `return_policies.update` |
| PATCH | `/admin/return-policies/variants/:variantId` | `return_policies.update` |

Editable fields stay: `returnAllowed`, `returnWindowDays`, `returnWindowUnit`, `returnPolicy`, `replaceAllowed`, `replaceWindowDays`, `replaceWindowUnit`, `refundAllowed`, plus the existing pickup, QC, and evidence flags.

Variant `codAvailable` stays on the variant admin APIs. There is no editable `bundleCodAvailable`. A bundle screen may show a read-only derived value: true only when every current component variant has `codAvailable` true. That display is the live catalogue for admin setup. It is not the COD flag of an order already placed. Placed orders use `order_items.cod_available`.

A window, when sent, is 1–365. Omit it or send null to leave it unset. Eligibility then uses 2 days. Do not add a tolerance or price-difference field to this form.

Policy edits apply to future orders only.

## 2. Review APIs that stay

**Existing** `/admin/returns`. Permissions are unchanged.

| Method | Path | Permission | Role in this flow |
| --- | --- | --- | --- |
| GET | `/admin/returns` | `returns.read` | List |
| GET | `/admin/returns/eligibility/:orderId` | `returns.read` | Same eligibility payload as the website, including **New** `isBundle` and `components` |
| POST | `/admin/returns` | `returns.create` | Admin-created request. Same item fields as the website, including optional `affectedComponentVariantId`. |
| GET | `/admin/returns/:id` | `returns.read` | Detail. Gains the display fields in section 7. |
| POST | `/admin/returns/:id/review` | `returns.update` | Move to review |
| POST | `/admin/returns/:id/approve` | `returns.approve` | Approve. Does not create a replacement order and does not change order status. Books whole-line reverse pickup when pickup is required. |
| POST | `/admin/returns/:id/reject` | `returns.reject` | Reject. Terminal. |
| POST | `/admin/returns/:id/request-information` | `returns.update` | Ask the customer for more information |
| POST | `/admin/returns/:id/assign` | `returns.update` | Assign |
| POST | `/admin/returns/:id/comments` | `returns.update` | Customer-visible comment |
| POST | `/admin/returns/:id/internal-notes` | `returns.update` | Internal note |
| POST | `/admin/returns/:id/pickup` | `returns.status` | Schedule pickup |
| POST | `/admin/returns/:id/pickup/status` | `returns.status` | Pickup status |
| POST | `/admin/returns/:id/no-pickup` | `returns.approve` | No-pickup path |
| POST | `/admin/returns/:id/receive` | `returns.status` | Warehouse receipt |
| POST | `/admin/returns/:id/qc` | `returns.status` | QC |
| POST | `/admin/returns/:id/refund` | `returns.approve` | Product-return refund only. Resolution must be `REFUND` and status `REFUND_PENDING`. Do not call this for a replacement price difference. |
| POST | `/admin/returns/:id/replacement` | `returns.status` | Link an existing fulfillment order. See section 6. |
| POST | `/admin/returns/:id/complete` | `returns.status` | Complete |

Pickup for a bundle uses the bundle order-item SKU. The affected component is not the pickup SKU. Shipway and Unicommerce payloads stay on that bundle SKU.

## 3. Replacement selection

**New** `POST /admin/returns/:id/replacement-selection`

Permission: `returns.status`.

Call this when admin confirms the replacement product or bundle. This is the only call that reads the replacement variant's current selling price. Later payment and refund calls use the amounts this call stores.

### Request

```json
{
  "replacementVariantId": "uuid",
  "comment": "optional"
}
```

For a bundle return, `replacementVariantId` is the replacement bundle's pricing variant, not a child variant.

### Response

```json
{
  "replacementOriginalAmount": "1000.00",
  "replacementQuoteAmount": "1200.00",
  "replacementDifferenceAmount": "200.00",
  "replacementSettlement": "COLLECT"
}
```

| Settlement | Meaning |
| --- | --- |
| `COLLECT` | Replacement total is higher. The customer pays `replacementDifferenceAmount`. |
| `REFUND` | Replacement total is lower. Refund that absolute amount to the customer's bank account. |
| `NONE` | Totals are equal. No payment and no refund. |

Original amount is the historical `order_items.unit_price` times quantity. For a bundle that is the bundle line price, not a child price. The response is the persisted quote. If admin confirms again before a payment or refund exists, the quote is replaced by a new read of the current price. After a payment link or a difference refund exists, confirmation is rejected so the stored amount cannot change underneath it.

### Errors

| Code | When |
| --- | --- |
| `RETURN_REPLACEMENT_NOT_CONFIGURED` | Resolution is not `REPLACEMENT`. |
| `RETURN_ITEM_NOT_FOUND` | Variant id does not exist. |
| `INVALID_STATUS_TRANSITION` | The return is not in a status that still allows confirmation. |

There is no error when the replacement costs more or less than the original.

## 4. Collect the difference

**New** `POST /admin/returns/:id/replacement-difference/payment-link`

Permission: `returns.approve`.

Allowed only when resolution is `REPLACEMENT` and the persisted settlement is `COLLECT`.

The payment request amount is `replacement_difference_amount`. The handler does not re-read the catalogue. The original order's payment status is unchanged. This is not `POST /admin/orders/:id/generate-link`.

The return stays `REPLACEMENT_PENDING` until that payment is paid. Admin must not link the fulfillment order before payment. If the link is never paid, the replacement is not fulfilled.

A second call returns the existing link instead of creating another one.

### Response

```json
{
  "replacementSettlement": "COLLECT",
  "replacementDifferenceAmount": "200.00",
  "paymentLink": "https://...",
  "paymentStatus": "PENDING"
}
```

After payment, `paymentStatus` becomes the payment request's paid status and linking is allowed.

### Errors

| Code | When |
| --- | --- |
| `RETURN_REPLACEMENT_NOT_CONFIGURED` | Resolution is not `REPLACEMENT`, or settlement is not `COLLECT`. |
| `INVALID_STATUS_TRANSITION` | Admin has not confirmed a quote yet. |

## 5. Refund the difference

**New** `POST /admin/returns/:id/replacement-difference/refund`

Permission: `returns.approve`.

Allowed only when resolution is `REPLACEMENT` and the persisted settlement is `REFUND`.

```json
{
  "comment": "optional"
}
```

Requirements:

- Bank account holder, account number, and IFSC are already stored on the return. If they are missing, the API returns `BANK_DETAILS_REQUIRED`. This applies to prepaid original orders as well. The difference is not sent back through the original payment instrument.
- Amount is `replacement_difference_amount`. It is not the original line amount and not a freshly calculated price.
- Refund reason is `REPLACEMENT_PRICE_DIFFERENCE`.
- Creating the refund does not move money. Finance approval and initiation stay on the existing refund workflow.
- A second call returns the existing refund and does not create another. Code on a conflicting create is `RETURN_REFUND_ALREADY_CREATED`.

Do not call `POST /admin/returns/:id/refund` for this case. That route refunds a product return and requires resolution `REFUND`.

## 6. Link the fulfillment order

**Existing** `POST /admin/returns/:id/replacement`

Permission: `returns.status`.

```json
{
  "replacementOrderId": "uuid",
  "comment": "optional"
}
```

Call this only after settlement is satisfied:

- `NONE`: quote is stored.
- `COLLECT`: the difference payment is paid.
- `REFUND`: the difference refund request has been created.

The body is an order that already exists. This route does not create that order, does not push it to Shipway, and does not push it to Unicommerce. Status becomes `REPLACEMENT_CREATED`.

Linking is rejected with `INVALID_STATUS_TRANSITION` when settlement is `COLLECT` and the difference is unpaid, or when settlement is `REFUND` and the difference refund has not been created. `RETURN_ALREADY_REPLACED` means a replacement order is already linked.

For a bundle, the linked order fulfills the whole bundle, not the affected component.

## 7. Admin order and return detail

**Existing** `GET /admin/orders/:id` and `GET /admin/returns/:id`.

**New** fields to display:

On the order item:

- `bundleComponents`: identity list (`productId`, `variantId`, `sku`, `productName`, `variantName`, `quantityPerBundle`), or null.
- `codAvailable`: snapshotted boolean, or null for orders placed before the column. Do not recompute null from the live catalogue.

On the return:

- Affected component id, SKU, and name. Null when the customer did not pick one. Show it as a note. Do not treat it as the returned SKU.
- `replacementOriginalAmount`
- `replacementQuoteAmount`
- `replacementDifferenceAmount`
- `replacementSettlement` (`NONE`, `COLLECT`, `REFUND`, or null before confirmation)
- Payment link and payment status when settlement is `COLLECT`
- Difference refund reference when settlement is `REFUND`

Show the bundle SKU as the pickup SKU. Do not show the child SKU as the Shipway or Unicommerce item.

## 8. Suggested admin sequence

1. Open the return. Read eligibility outcome, bundle components, and the affected component note.
2. Approve or reject. Approval can book pickup for the bundle or item SKU. It does not send a replacement.
3. For a replacement, after the return is in the replacement-pending stage, `POST .../replacement-selection`.
4. If `COLLECT`, create the payment link and wait until it is paid. If `REFUND`, create the bank refund. If `NONE`, do neither.
5. `POST .../replacement` with the existing fulfillment order id.
