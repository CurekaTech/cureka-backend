# Shipway COD payment on delivery

Date: 2026-08-26  
Scope: COD payment status handling on Shipway delivered updates.

## Investigation first

### 1) Does Shipway provide explicit COD-collected confirmation in current integration?

No reliable field is currently captured in our Shipway webhook/tracking interfaces or mapper flow for “COD collected”.

Inspected sources:
- `modules/shipping/interfaces/shipway-api.interface.ts`
- `modules/shipping/dto/shipway-webhook.dto.ts`
- `modules/shipping/services/shipway.service.ts`
- `modules/shipping/services/shipping.service.ts`

Observed fields include shipment/tracking metadata (`order_id`, `awb_number`, `courier_id`, `current_status_code`, `shipment_id`, etc.), but no typed/normalized field like:
- `cod_collected`
- `collected_amount`
- `remittance_status`
- `payment_received`

Live payload logging in service currently does not expose a trustworthy normalized COD-collection signal either.

Conclusion:
- Shipway COD collection signal available in current backend integration: **NO**
- Fallback needed: **YES**

## Business rule implemented

Only for COD orders:
- If mapped shipment status becomes `DELIVERED`, update:
  - `orders.order_status = DELIVERED`
  - `orders.payment_status = PAID`

For non-COD orders:
- Delivery still updates `orders.order_status = DELIVERED`
- `orders.payment_status` remains unchanged.

For non-delivered statuses (`OFP`, `PKP`, `INT`, `OOD/OFD`, `RTO`, `NDR`, failed/cancelled):
- Never auto-mark COD as `PAID`.

## Where code was changed

1. `modules/shipping/services/shipping.service.ts`
   - `syncOrderStatus(...)` now:
     - loads current order row
     - applies COD + DELIVERED fallback to set `paymentStatus: PAID`
     - keeps prepaid payment status untouched
     - adds sanitized logs:
       - `paymentMethod`
       - `previousPaymentStatus`
       - `codCollectionSignalPresent`
       - `codCollectionConfirmed`
       - `paymentStatusUpdated`

2. `modules/orders/repositories/orders.repository.ts`
   - added `findById(id, manager?)` helper for transactional status sync decisions.

3. `modules/shipping/services/shipping.service.spec.ts`
   - added tests:
     - COD + DEL => marks payment as `PAID`
     - Prepaid + DEL => does not overwrite payment status

## Transaction behavior

Order updates are performed inside the same shipping transaction paths that already update:
- `shipments`
- `shipment_events`
- `orders`

This keeps status/payment changes consistent for webhook/polling flows.

## Test coverage summary

Validated in unit tests:
1. COD + DEL => DELIVERED + PAID
2. COD + INT/OOD existing behavior keeps payment unchanged (covered by existing processed-status tests)
3. Prepaid + DEL => payment unchanged
4. Duplicate/out-of-order handling remains intact

## Build/test status

- `npx tsc -p apps/api/tsconfig.app.json --noEmit` ✅
- `jest modules/shipping/services/shipping.service.spec.ts` ✅

## Final checkpoint

- Shipway provides COD collection signal: **NO**
- Field: **N/A**
- Reliable enough to use: **NO**
- Fallback required: **YES**
- COD Delivered behavior: `DELIVERED` + `PAID`
- Prepaid Delivered behavior: `DELIVERED`, payment unchanged
- RTO behavior: does not auto-mark paid
- Files changed:
  - `modules/shipping/services/shipping.service.ts`
  - `modules/orders/repositories/orders.repository.ts`
  - `modules/shipping/services/shipping.service.spec.ts`
  - `docs/shipway-cod-payment-on-delivery.md`
- Build/test status: **PASS**
- Ready for real Delivered webhook test: **YES**
