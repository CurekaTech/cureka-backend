# Return & Replace Configuration-Based Flow

This document is the agreed backend contract for Return, Replace, bundle handling, bundle COD, and replacement price difference. It does not change application code by itself.

Client contracts:

- Public API reference: [return-replace-website-api-integration.md](./return-replace-website-api-integration.md)
- Website screen changes: [return-replace-website-current-changes.md](./return-replace-website-current-changes.md)
- Order-page buttons: [return-replace-public-orders-integration.md](./return-replace-public-orders-integration.md)
- Customer replacement choice: [return-replace-customer-replacement-selection.md](./return-replace-customer-replacement-selection.md)
- Admin API: [return-replace-admin-api-integration.md](./return-replace-admin-api-integration.md)
- Admin screen changes: [return-replace-admin-current-changes.md](./return-replace-admin-current-changes.md)

The backend is the source of truth. Website and admin call the API and display the response. They do not calculate Return eligibility, Replace eligibility, window expiry, bundle COD, replacement price difference, or settlement direction.

## 1. Objective

Return and Replace are controlled by the admin configuration captured on the order line when the order is placed. The customer can return, replace, both, or neither, according to that snapshot. A missing window is 2 days from delivery. A bundle is one transaction. A replacement may cost more or less than the historical order price; the difference is collected or refunded after admin confirms the replacement, and that quote is then frozen.

## 2. Existing system

Return and replacement are already one request. `ReturnResolution` is `REFUND` or `REPLACEMENT`. Creating a request sets status `REQUESTED` and does not change `order_status`, issue a refund, or create a replacement order.

Policy columns already exist on the product and on the variant. Admin writes them with `PATCH /api/v1/admin/return-policies/products/:productId` and `PATCH /api/v1/admin/return-policies/variants/:variantId`. Changes apply to future orders only.

At placement, `buildReturnPolicySnapshot` stores the effective policy on `order_items.return_policy_snapshot`. A line is returnable only when the product `returnAllowed` is true and the variant `returnAllowed` is not false. The same AND applies to replace. Variant booleans default to false and are not nullable, so they do not inherit. Windows, policy text, and `refundAllowed` use the variant when it is not null, otherwise the product.

Eligibility is `ReturnEligibilityService.evaluateItem`. The clock is `orders.delivered_at`, set once when the order becomes `DELIVERED`. Shipway writes that timestamp from the delivery scan. Admin complete uses the current time. It is not `createdAt` and not a shipment column.

Today `canReturn` does not honor `returnable`, a null window closes the window, and a non-returnable product can still be requested. Those behaviors change as specified below. The storefront already calls `GET /api/v1/returns/eligibility/:orderId` and `POST /api/v1/returns`. Submit already re-runs eligibility.

Reverse pickup on approve already sends the order-item SKU to Shipway (`POST /api/v2orders`, order id `RTN…`) and to Unicommerce `reversePickup/create`. For a bundle that SKU is the bundle parent, which is also what the sale order used.

`linkReplacementOrder` links an existing order. It does not create one. `RETURN_REPLACEMENT_AUTO_CREATE_ENABLED` stays false.

A full product-return refund stays on `POST /api/v1/admin/returns/:id/refund`. That path requires resolution `REFUND` and status `REFUND_PENDING`. It is not used for a replacement price difference.

## 3. Admin configuration

Admin continues to edit, per product and per variant:

- Return Allowed
- Return Window Days
- Return Policy
- Replace Allowed
- Replace Window Days
- Refund Allowed
- COD Available

There is no new editable bundle COD flag and no replacement tolerance field. A bundle's COD availability is derived. Admin may show that derived value as read-only.

When a window is sent, it is 1–365 days. Null means not configured. Eligibility then uses 2 days. Do not treat 0 as "forever".

COD checkout amounts, the COD blocklist, and simple or variable `codAvailable` checks stay as they are.

## 4. Return rules

Eligibility reads `order_items.return_policy_snapshot`. The live catalogue is used only when that snapshot is null, through the existing legacy policy fallback. That fallback does not load bundle components.

```text
canReturn = returnable AND inside the return window
canRequestRefund = canReturn AND refundable
```

The non-returnable null-window bypass is removed. Return OFF does not offer a return.

| returnAllowed | replaceAllowed | Customer sees |
| --- | --- | --- |
| true | false | Return only |
| false | true | Replace only |
| true | true | Return and Replace |
| false | false | Neither |

A bundle uses the bundle product and its pricing variant for this table. Child `returnAllowed` and `replaceAllowed` are ignored.

### Simple product

```text
Return ON
Replace OFF
=> Return only
```

### Simple product

```text
Return OFF
Replace ON
=> Replace only
```

### Simple product

```text
Return ON
Replace ON
=> Return and Replace
```

## 5. Replacement rules

Replace is allowed only when the snapshot says the line is replaceable and the replacement window is open. The customer submits a request. Admin reviews it. Approval does not send a replacement. Admin confirms the replacement product or bundle, settlement is stored, and only then may admin link an already created fulfillment order.

Submitting a request does not reject a higher or lower price. There is no same-price rule and no tolerance configuration. A future tolerance would wrap `calculateReplacementPriceDifference` only. It is not part of this contract.

When admin confirms the replacement, the current selling price of the confirmed variant is read once:

```text
difference = replacementTotal - originalHistoricalTotal
difference > 0  -> COLLECT
difference < 0  -> REFUND of the absolute difference to the customer's bank account
difference = 0  -> NONE
```

Original total is `order_items.unit_price` times the returned quantity. That is the selling price charged on the order. It is not today's catalogue price of the original SKU, not MRP, and not shipping, COD fee, or handling.

Replacement total is the confirmed variant's current `sellingPrice` times the same quantity. For a bundle, that variant is the replacement bundle's pricing variant. Child prices are not used.

Example: original ₹1,000 and replacement ₹1,200 collects ₹200. Original ₹1,000 and replacement ₹800 refunds ₹200 to the bank. Equal prices settle nothing.

The confirm call persists `replacement_original_amount`, `replacement_quote_amount`, `replacement_difference_amount`, and `replacement_settlement`. Payment and refund after that use those stored amounts. They do not read the live price again. If the catalogue price changes after confirmation, the stored quote stays.

`COLLECT` creates a payment for the difference only. It does not use `POST /admin/orders/:id/generate-link` on the original order. `REFUND` creates a refund request for the difference only, reason `REPLACEMENT_PRICE_DIFFERENCE`, paid to the bank details on the return. Finance approval still applies. Creating the refund does not move money. `NONE` stores zero and skips both.

## 6. Default 48-hour window

Constants, not environment variables:

```text
DEFAULT_RETURN_WINDOW_DAYS = 2
DEFAULT_REPLACE_WINDOW_DAYS = 2
```

If the snapshotted window is null or less than or equal to 0, eligibility uses 2 days before calculating expiry. `resolveWindowExpiry` stays strict when `deliveredAt` is missing: no delivery timestamp means no expiry and the line is not eligible (`DELIVERY_DATE_UNAVAILABLE` when the order is delivered but the timestamp is null).

The clock starts at `orders.delivered_at`. One day is 24 hours. The exact expiry instant is still inside the window.

Expired-product claims may waive the window only. They do not waive `returnable` or `replaceable`.

## 7. Bundle rules

```text
Bundle order line
  -> bundle product/variant Return/Replace snapshot
  -> one Return or Replace request
  -> admin review
  -> whole-bundle pickup
  -> whole-bundle return or replacement fulfillment
```

Do not create a return or replacement per child. Do not explode one bundle line into several requests. Quantity stays on the order item. Returning a bundle consumes bundle units.

The customer may optionally name one damaged component. That value is audit only. It does not change eligibility, returned quantity, refund amount, replacement amount, pickup SKU, the Shipway payload, the Unicommerce reverse pickup, or replacement fulfillment.

`order_items.bundle_components` stores identity only:

- `productId`
- `variantId`
- `sku`
- `productName`
- `variantName`
- `quantityPerBundle`

It does not store child Return/Replace policy, child prices, or child `codAvailable`.

New bundle orders write this snapshot at placement. Existing bundle orders receive it once, by backfill, from `product_bundles` as it exists at backfill time. After the snapshot is written, the live catalogue is not read again for composition. A later edit to the bundle does not change the snapshot. The backfill never overwrites a snapshot that is already present.

If a bundle's configuration is missing or a child cannot be resolved, that order item is skipped and reported. No guessed snapshot is written. The damaged-component field stays optional, so a whole-bundle return can still be submitted. The picker is empty until that row is repaired from the report. Request time does not fill it from the live catalogue.

### Bundle

```text
Bundle
├── Product A → Return ON / Replace OFF
├── Product B → Return ON / Replace ON
└── Product C → Return OFF / Replace ON
```

If the bundle product/variant snapshot says Return ON and Replace ON, the customer can return or replace the whole bundle. The child flags in the tree do not hide or show those actions. The customer may record that Product A, B, or C was damaged. The pickup and the replacement are still the bundle.

## 8. Order and shipment eligibility

A request is allowed only when `order_status` is `DELIVERED` and `delivered_at` is set.

Blocked:

- Not delivered, including shipped and out for delivery (`ITEM_NOT_DELIVERED`)
- Cancelled
- RTO (`ORDER_IS_RTO`). RTO is a forward-shipment outcome. It does not open a return.
- Delivered with no `delivered_at` (`DELIVERY_DATE_UNAVAILABLE`)
- Quantity already committed (`ACTIVE_RETURN_ALREADY_EXISTS` or `RETURN_QUANTITY_EXCEEDED`)

`COMPLETED` still holds quantity. `REJECTED` and `CANCELLED_BY_CUSTOMER` release it. A pending return does not set the order status to returned.

## 9. Shipway integration

Do not add Shipway statuses. Forward maps stay as they are. Duplicate webhook handling stays as it is.

Reverse pickup keeps the order-item SKU, name, and the line's historical `unit_price`. For a bundle that is the bundle SKU and the bundle price. The affected component must not appear as `product_code`.

Shipway remains the source of truth for forward shipment status. A `RTN…` webhook updates the return pickup, not the original order's `delivered_at`.

## 10. Unicommerce integration

Do not add Unicommerce statuses. Do not explode bundles on `createSaleOrder`. Reverse pickup selects sale-order units by the order-item SKU. For a bundle that is the parent SKU already on the sale order. Do not send a child SKU.

Do not change `RETURN_RESTOCK_ON_QC_PASS`. QC restock, when it already runs, restocks the returned order-item variant. For a bundle that is the bundle variant.

## 11. Status mapping

These layers stay separate.

| Layer | Values | Who writes them |
| --- | --- | --- |
| Order | Existing `OrderStatus`, including `DELIVERED` and `RTO` | Shipway sync, admin complete, cancellation. A return request does not set the order to returned. |
| Shipment | Existing `ShipmentStatus` | Shipway webhook and poll |
| Return request | Existing `ReturnStatus` from `REQUESTED` through review, pickup, QC, then `REFUND_*` or `REPLACEMENT_*` | Return workflow |
| Pickup | Existing `ReturnPickupStatus` | Shipway reverse booking and `RTN…` webhooks |
| Product-return refund | Existing refund-request status | Only resolution `REFUND` at `REFUND_PENDING` |
| Replacement settlement | `NONE`, `COLLECT`, `REFUND` on the return | Admin confirmation. Not an order status and not a Shipway status. |

`DEL` on a forward shipment is customer delivery. `DEL` on an `RTN…` webhook is warehouse receipt.

## 12. Backend API changes

Customer contract: [return-replace-website-api-integration.md](./return-replace-website-api-integration.md).

Admin contract: [return-replace-admin-api-integration.md](./return-replace-admin-api-integration.md).

Eligibility gains `isBundle` and an identity-only `components` list. Components do not have their own `canReturn` or `canReplace`. Create accepts optional `affectedComponentVariantId`. New admin endpoints confirm the replacement, collect a difference, and refund a difference. Existing approve, pickup, QC, product-return refund, and link-replacement endpoints stay.

## 13. Admin integration

No new policy field. Variant `codAvailable` stays editable. Bundle COD is shown read-only when the admin UI displays it.

On a replacement, admin sees the historical amount, the confirmed quote, the difference, and `COLLECT`, `REFUND`, or `NONE`. Confirming the product does not create the replacement order.

## 14. Website integration

Show Return only when `canReturn` is true and Replace only when `canReplace` is true. Use the expiry timestamps from eligibility. Do not hardcode 48 hours or child flags.

For a new checkout, offer COD on a bundle only when the cart or checkout response says the derived value is true. For an order already placed, show `order_items.cod_available`. Do not rebuild it from live children. Null on an old order means the column did not exist yet. It is not a signal to recalculate.

Show settlement from the persisted return fields. Do not compute the difference in the client.

## 15. Database and entity changes

| Change | Purpose |
| --- | --- |
| `order_items.bundle_components` jsonb, nullable | Identity snapshot. Not policy, price, or COD. |
| `order_items.cod_available` boolean, nullable | Effective COD at placement for new orders. Not inside `return_policy_snapshot`. Not backfilled. |
| `return_request_items.affected_component_variant_id`, `affected_component_sku`, `affected_component_name`, all nullable | Optional audit. |
| `return_requests.replacement_original_amount`, `replacement_quote_amount`, `replacement_difference_amount`, `replacement_settlement` | Frozen quote. Settlement is `NONE`, `COLLECT`, or `REFUND`. |

`return_policy_snapshot` is unchanged in shape and does not gain `codAvailable`.

## 16. Request lifecycle

1. Order is delivered and `delivered_at` is set.
2. Website calls eligibility. Backend reads the order-line snapshot and the 2-day default.
3. Customer submits one request for the line. Backend revalidates. Status is `REQUESTED`.
4. Admin approves or rejects. Approval does not change order status and does not create a replacement order. If pickup is required, Shipway and Unicommerce are booked for the order-item SKU.
5. For a replacement, admin confirms the product. The quote is stored.
6. `COLLECT` waits for the difference payment. `REFUND` creates a bank refund request for the stored difference. `NONE` needs neither.
7. Admin links an existing fulfillment order. Status becomes `REPLACEMENT_CREATED`.

## 17. Edge cases

- Return disabled, replace disabled, both disabled, both enabled: follow the snapshot flags.
- Missing window: 2 days from `delivered_at`.
- Expired window: `RETURN_WINDOW_EXPIRED`.
- Not delivered, cancelled, or RTO: rejected. RTO is not a customer return.
- Duplicate or excess quantity: existing quantity ledger.
- Partial quantity: allowed up to the remaining bundle or item units, not per child.
- Several damaged components: the request still covers the whole bundle. One optional affected component is stored. It does not split the request.
- Child Return/Replace flags in any combination: ignored for bundle eligibility.
- Product deleted or deactivated after purchase: the snapshot still decides eligibility. Order-item foreign keys already restrict hard delete.
- Catalogue price changes after purchase: original amount stays `unit_price`.
- Catalogue price changes after admin confirmation: the stored quote stays.
- Replacement unavailable: admin cannot confirm a missing variant. A price difference is not a reason to reject.
- Shipway delivery delayed: no `delivered_at` means not eligible.
- Duplicate webhooks: existing idempotency stays.
- Concurrent admin policy edits: they do not rewrite a snapshot already stored.
- Historical requests: new columns are nullable. Old requests remain valid.
- Bundle backfill cannot resolve a child: skip and report. Do not invent components.
- GoKwik: native checkout enforces derived bundle COD. GoKwik already skips the variant COD gate. This contract does not remove that skip. See the open point in deployment notes.

## 18. Backward compatibility

Existing orders keep `return_policy_snapshot`. Later admin edits apply only to future orders. Existing orders do not recalculate COD. `cod_available` null means "not snapshotted", not "recompute".

Old clients that omit `affectedComponentVariantId` can still submit a bundle return. There is no same-price error for them to depend on.

The product-return refund path for resolution `REFUND` is unchanged. COD min/max, the blocklist, and simple or variable COD checks are unchanged.

## 19. Testing requirements

Eligibility:

- The four flag combinations.
- Null window equals 48 hours after `delivered_at`.
- Expired window, not delivered, RTO, cancelled, missing `delivered_at`.
- Duplicate and partial bundle quantity.
- A bundle stays returnable and replaceable from its own snapshot when children would have decided differently.

Price difference:

- ₹1,000 to ₹1,200 is `COLLECT` ₹200, using `unit_price`.
- ₹1,000 to ₹800 is `REFUND` ₹200 to the bank.
- Equal prices are `NONE`.
- A higher or lower price is accepted.
- A bundle uses the bundle `unit_price` and the replacement bundle `sellingPrice`, not child prices.
- After confirmation, a catalogue price change does not change the collected or refunded amount.
- Shipway and Unicommerce payloads still contain the bundle SKU when an affected component id is stored.

Bundle COD:

- Children true, true, true: derived COD true, and the new order item stores true.
- Children true, false, true: derived COD false, and native checkout rejects COD for that bundle.
- Children false, false, false: derived COD false.
- An order stored while all children were true stays true after a child is later set false. The next bundle order stores false.
- A simple product still uses its own variant `codAvailable`.

Backfill:

- A bundle order item with null `bundle_components` receives identity only.
- An existing snapshot is not overwritten.
- A bundle that cannot be resolved is skipped and listed in the report.
- `cod_available` is not written by the backfill.

## 20. Deployment and migration

1. Add nullable `order_items.bundle_components`.
2. Add nullable `order_items.cod_available`. Do not backfill this column.
3. Add the return settlement columns and the optional affected-component columns.
4. Run the bundle component identity backfill. Skip and report unresolved bundle order items. Do not overwrite a snapshot that already exists.
5. Review the unresolved report before go-live.
6. Deploy the backend.
7. Integrate the website and admin from the two API documents. They display API results and do not reimplement the rules.
8. Run the tests in section 19.
9. Enable the production flow only after those checks pass.

### Bundle COD

```text
Bundle
  -> every component variant
  -> codAvailable true on all of them
  -> all true allows COD; any false does not
  -> store that result on the order item at placement
```

`bundleCodAvailable` in that formula is a derived boolean. It is not a database column and not an admin field.

### Open point

GoKwik checkouts already skip Cureka's variant COD gate. Native checkout uses the all-children rule. Whether a GoKwik bundle order must also be blocked when a child has COD off is not decided here. It does not change Return/Replace, the COD snapshot on new orders, or replacement settlement.

## 21. Item-level actions and the customer's replacement choice

Return and Replace on the public order page are actions on one order item, keyed by `orderItemId`. Two lines in the same order can differ. The website uses `GET /api/v1/returns/eligibility/:orderId` and reads `items[].canReturn` and `items[].canReplace`. Order-level `returnAllowed` and `replaceAllowed` on the order payload stay as they are. They are not the button source.

A replacement request may include `items[].replacementVariantId`. That value is the customer's preferred replacement. Submitting it does not create a replacement order and does not calculate the price difference.

Admin confirms the final product or bundle with `POST /api/v1/admin/returns/:id/replacement-selection`. That call is the one that reads the current selling price and stores the settlement. Later payment, bank refund, and fulfillment use the stored amounts.

The customer cannot change the preferred replacement after submit. There is no public change-selection endpoint. A change before admin confirmation is a cancellation of the request, when the existing cancel rules allow it, and a new request. A change after confirmation is a support or admin workflow, not a storefront action.

A bundle replacement is the whole bundle. The customer and admin select a replacement bundle. A named child is supporting information only. Settlement compares the historical bundle line amount with the confirmed replacement bundle price.

### What is implemented

- Eligibility items include `orderItemId`, `canReturn`, `canReplace`, `isBundle`, and `components`.
- `POST /api/v1/returns` requires `items[].orderItemId` and accepts optional `items[].replacementVariantId`.
- That id is stored on `preferred_replacement_variant_id`, with the variant's SKU and names. An unknown id is rejected with `RETURN_REPLACEMENT_VARIANT_NOT_FOUND`. A variant from another product is accepted.
- Admin confirmation writes the confirmed variant onto `replacement_variant_id` and does not overwrite the preference columns. It stores the quote from the historical line amount and the confirmed variant's selling price at that moment.
- The confirm `comment` is stored on an internal history entry (`INTERNAL_NOTE_ADDED`, not customer-visible), with metadata that records whether the confirmed variant differs from the preference.
- `GET /api/v1/returns/:id` returns the preference fields always, and the confirmed variant fields only after `replacementSettlement` is set. Settlement amounts stay null until then. `replacementPaymentLink` is present only after admin creates a collect link.
- There is no public endpoint to change the selected replacement.
- Linking a replacement order still links an order that already exists. Auto-create stays off.
- The public website and admin UI are not in this repository. They still have to render item-level buttons and the two replacement values from these APIs.

### Not decided

Do not reject a replacement because it is a different product. The options are:

1. Current behavior: an unknown variant id is rejected. Any existing variant is accepted, including a variant of another product.
2. Allow only another variant of the same product, or only another bundle when the line is a bundle.

Option 2 is not implemented.

A change after a difference payment or refund exists is already rejected. A later change is a support process and is not specified here. A request confirmed before the preference columns existed cannot have its original choice reconstructed.
