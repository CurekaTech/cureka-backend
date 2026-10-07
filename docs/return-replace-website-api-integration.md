# Return and Replace — Website API integration

Contract for the storefront. The backend is the source of truth.

```text
Website
  -> call the API
  -> display the response
  -> do not duplicate the business rules
```

The website must not calculate Return eligibility, Replace eligibility, expiry windows, bundle COD, replacement price difference, or settlement direction.

- Base path: `/api/v1`
- Auth: session cookie. Verified user (`SessionCookieGuard` + `VerifiedUserGuard`).
- Success body: `{ success, data, message, timestamp }`. Fields below are inside `data`.
- Errors: `{ success: false, code, message, timestamp }`. Branch on `code`.

Fields and endpoints marked **New** are part of this contract and are not live until the backend change ships. Endpoints marked **Existing** are live today. Where this document adds fields to an existing response, those fields are **New** and will be absent until that deploy. Do not treat [RETURN_MANAGEMENT_STOREFRONT_INTEGRATION.md](./RETURN_MANAGEMENT_STOREFRONT_INTEGRATION.md) as replaced for the endpoints it already documents. Use this document for configuration-based eligibility, bundles, COD display, and replacement settlement.

Business rules: [return-replace-configuration.md](./return-replace-configuration.md).

## What the website must not do

- Do not hardcode Return on, Replace on, or a 48-hour window.
- Do not read child `returnAllowed` or `replaceAllowed` to decide whether a bundle can be returned or replaced.
- Do not rebuild bundle COD from live children for an order that already exists.
- Do not compute `replacement price - original price` in the client.
- Do not hide a replacement because the prices differ.
- Do not send a child SKU as the item being returned. The request is the bundle order line.

Order detail may include `returnReplace` hints. Those hints are not a substitute for eligibility. Before showing Return or Replace, call the eligibility endpoint and use `canReturn` and `canReplace`.

## 1. Eligibility

**Existing** `GET /returns/eligibility/:orderId`

Optional query: `expiredProductClaim=true`. That flag can waive the window only. It does not turn on Return or Replace when the snapshot says they are off.

Call this when the customer opens Return or Replace, and again if submit is rejected.

### Item fields

Existing fields stay: `orderItemId`, `productId`, `variantId`, `sku`, `productName`, `variantName`, quantities, `unitPrice`, `deliveredAt`, `returnWindowExpiresAt`, `replacementWindowExpiresAt`, `canReturn`, `canReplace`, `canRequestRefund`, `allowedResolutions`, `ineligibilityCode`, `ineligibilityMessage`, and `policy`.

Use them as follows:

| Field | Website behavior |
| --- | --- |
| `canReturn` | Show Return only when true. |
| `canReplace` | Show Replace only when true. |
| Both true | Show both. |
| Both false | Show neither. Show `ineligibilityMessage` when present. |
| `returnWindowExpiresAt` | Display the return deadline. Do not add 48 hours yourself. |
| `replacementWindowExpiresAt` | Display the replace deadline. |
| `policy.policyText` | Return policy copy when Return is offered. |
| `allowedResolutions` | `REFUND` means a return for refund. `REPLACEMENT` means replace. Submit one of these values. |
| `availableQuantity` | Maximum quantity the customer may request for this line. For a bundle this is bundle units, not component units. |

**New** on each item:

| Field | Meaning |
| --- | --- |
| `isBundle` | True when the line is a bundle. |
| `components` | `null` for a simple line. For a bundle, identity only. |

Each component:

```json
{
  "productId": "uuid",
  "variantId": "uuid",
  "sku": "SKU-A",
  "productName": "Product A",
  "variantName": "50 ml",
  "quantityPerBundle": 1
}
```

Components do not include `canReturn`, `canReplace`, prices, or COD. Do not invent those from the component list.

### Bundle display

When `isBundle` is true:

1. Show Return and Replace from the parent item's `canReturn` and `canReplace` only.
2. If `components` is a non-empty array, the customer may optionally pick one damaged component before submit. That pick is a report. It does not change which actions are shown.
3. If `components` is null or empty, still allow the bundle request when the parent flags allow it. Do not call the catalogue to fill the list.
4. Submit one line for the bundle `orderItemId` and a bundle quantity. Do not submit one request per component.

### Example

```text
Bundle snapshot: Return ON, Replace ON
Child A: Return ON, Replace OFF
Child B: Return OFF, Replace ON
```

Eligibility returns `canReturn: true` and `canReplace: true` on the bundle line. The website shows both actions. The child flags are not in the payload and must not be read from a product API to override this.

### Ineligibility codes

Display `ineligibilityMessage`. Branch on `ineligibilityCode` only to decide whether to offer a retry.

| Code | Meaning |
| --- | --- |
| `ITEM_NOT_DELIVERED` | Order is not delivered. Hide both actions. |
| `DELIVERY_DATE_UNAVAILABLE` | Delivered flag without a delivery timestamp. Ask the customer to contact support. |
| `ORDER_IS_RTO` | Returned to origin. Do not offer a customer return. |
| `RETURN_NOT_ALLOWED` | Snapshot does not allow the action. |
| `RETURN_WINDOW_EXPIRED` | Window closed. |
| `RETURN_QUANTITY_EXCEEDED` | No units left. |
| `ACTIVE_RETURN_ALREADY_EXISTS` | The line quantity is already on a request. |
| `RETURN_POLICY_NOT_AVAILABLE` | Policy could not be resolved. |

## 2. Create a request

**Existing** `POST /returns`

**Existing** `POST /returns/with-evidence` when photos are required. The JSON body is the `data` field. Files are `evidenceFile0`, `evidenceFile1`, and so on.

The backend revalidates eligibility inside the order lock. A page that was loaded before an admin change, or after the window closed, is rejected. Refresh eligibility and show the error message. Do not keep the buttons from the stale page.

### Body

```json
{
  "orderId": "uuid",
  "reasonId": "reason-master-id-or-ref",
  "resolution": "REFUND",
  "items": [
    {
      "orderItemId": "uuid",
      "quantity": 1,
      "affectedComponentVariantId": "uuid",
      "replacementVariantId": "uuid"
    }
  ],
  "customerComments": "optional",
  "conditionDeclarations": { "unused": true },
  "pickupAddress": null,
  "refundMethod": "BANK_ACCOUNT"
}
```

`resolution` is `REFUND` for a return, or `REPLACEMENT` for a replace. One resolution applies to the whole request.

**New** `items[].affectedComponentVariantId` is optional.

- Send it only for a bundle line, and only when the customer picked a component from `components`.
- It must be one of that line's snapshotted `variantId` values.
- Omit it for a simple product, and omit it when the customer does not name a component.
- The request is still one request for the entire bundle line. Quantity is bundle quantity.

`replacementVariantId` remains an optional preference when `resolution` is `REPLACEMENT`. The website may send it. The backend does not reject it because the price is higher or lower. It is not the final quote. Admin confirmation sets the quote later. Do not show a price difference at submit time unless a later return-detail payload already contains a persisted settlement.

Bank details stay required when the existing COD refund rules require them for resolution `REFUND`. A replacement difference refund, if admin later chooses `REFUND`, uses bank details stored on the return. Collect those details when the API requires them. Do not assume a prepaid order refunds the difference to the original card.

### Success

`201`. The request status is `REQUESTED`. Show the backend customer message. Do not say the refund or the replacement has been completed.

**New** on each item in the detail: `affectedComponentVariantId`, `affectedComponentSku`, `affectedComponentName`. They are null when the customer did not pick a component.

### Errors

| Code | What to do |
| --- | --- |
| `RETURN_RESOLUTION_NOT_ALLOWED` | The chosen Return or Replace is not in `allowedResolutions`. Refresh eligibility. |
| `RETURN_NOT_ALLOWED` | Snapshot does not allow it. |
| `RETURN_WINDOW_EXPIRED` | Window closed after the page opened. |
| `ITEM_NOT_DELIVERED` | Order is no longer delivered. |
| `RETURN_ORDER_IS_RTO` | Order is RTO. |
| `BUNDLE_COMPONENT_NOT_FOUND` | **New.** The affected component is not on that line's snapshot. Clear the pick and reload eligibility. |
| `RETURN_QUANTITY_EXCEEDED` | Lower the quantity. |
| `ACTIVE_RETURN_ALREADY_EXISTS` | A request already holds the units. |
| `EVIDENCE_REQUIRED` | Use the with-evidence endpoint. |
| `RETURN_CONDITIONS_NOT_CONFIRMED` | Confirm the declarations. |
| `RETURN_COMMENTS_REQUIRED` | Comments are required for this reason. |

There is no error for "replacement price does not match". Do not handle one.

## 3. Order detail

**Existing** `GET /orders/:id`

**New** on each item, when the line is a bundle and the snapshot exists:

```json
{
  "bundleComponents": [
    {
      "productId": "uuid",
      "variantId": "uuid",
      "sku": "SKU-A",
      "productName": "Product A",
      "variantName": "50 ml",
      "quantityPerBundle": 1
    }
  ],
  "codAvailable": true
}
```

- `bundleComponents` is null or omitted for a non-bundle, and null when the backfill could not resolve that bundle. Do not fetch `product_bundles` to fill the gap.
- `codAvailable` is the value stored at placement. For a bundle it is true only when every component variant allowed COD at that moment. For a simple or variable line it is that line variant's COD flag at placement.
- If `codAvailable` is null, the order predates the snapshot. Do not recalculate it from the current catalogue. Do not change how that order is displayed as paid. For a new checkout, use the cart or checkout payload instead of this historical field.

This payload does not decide Return or Replace. Call eligibility for that.

### Checkout COD

For a cart that has not been placed, a bundle line's `codAvailable` comes from the cart or checkout API and is true only when every current component variant has `codAvailable` true. The website displays that boolean. It does not AND the children itself, and it does not read a bundle-level COD toggle.

Simple and variable lines keep the variant `codAvailable` the cart already returns.

## 4. Replacement settlement

**Existing** `GET /returns/:id` gains **New** fields after admin confirms a replacement. Until confirmation, settlement fields are null. Do not calculate a preview from the catalogue.

```json
{
  "replacementOriginalAmount": "1000.00",
  "replacementQuoteAmount": "1200.00",
  "replacementDifferenceAmount": "200.00",
  "replacementSettlement": "COLLECT",
  "replacementPaymentLink": "https://..."
}
```

| `replacementSettlement` | Display |
| --- | --- |
| `COLLECT` | The customer pays `replacementDifferenceAmount`. If `replacementPaymentLink` is present, show it as the way to pay. If it is null, say the payment link is not ready yet. |
| `REFUND` | `replacementDifferenceAmount` will be refunded to the bank account on the return. Do not say it goes back to the original card or wallet. |
| `NONE` | No extra payment and no refund. |
| `null` | Admin has not confirmed the replacement. Do not show a difference. |

Show `replacementOriginalAmount` as the historical order amount and `replacementQuoteAmount` as the confirmed replacement amount. Do not replace those numbers with a live product price.

`replacementPaymentLink` is present only when settlement is `COLLECT` and admin has created the link. The website does not create the link.

## 5. Other existing endpoints

These stay as documented in the current storefront guide:

- `GET /returns/reasons/:workflow` with `return` or `replacement`
- `GET /returns`
- `POST /returns/:id/cancel`
- `POST /returns/:id/additional-information`
- `POST /returns/:id/bank-details`

Cancelling a request is still allowed only in the statuses the backend already allows. A replacement settlement does not by itself cancel the request.
