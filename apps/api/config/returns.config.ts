import { registerAs } from '@nestjs/config';

const asBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true';
};

/**
 * Charge-level refund rules for returns.
 *
 * The business had no pre-existing rule for shipping, COD fees or handling on a
 * customer return, so these are configuration rather than a hidden default. The
 * shipped defaults treat service charges as consumed and therefore non-refundable
 * on a customer-initiated return.
 */
export const returnsConfig = registerAs('returns', () => ({
  charges: {
    shippingRefundable: asBool(process.env['RETURN_SHIPPING_REFUNDABLE'], false),
    codFeeRefundable: asBool(process.env['RETURN_COD_FEE_REFUNDABLE'], false),
    handlingRefundable: asBool(process.env['RETURN_HANDLING_REFUNDABLE'], false),
  },
  pickup: {
    /**
     * Preferred provider for admin manual schedule. Approval still notifies
     * Unicommerce and Shipway when those integrations are configured.
     */
    provider: process.env['RETURN_PICKUP_PROVIDER'] ?? 'SHIPWAY',
    autoScheduleOnApprove: asBool(process.env['RETURN_AUTO_SCHEDULE_ON_APPROVE'], true),
    notifyUnicommerce: asBool(process.env['RETURN_NOTIFY_UNICOMMERCE'], true),
    notifyShipway: asBool(process.env['RETURN_NOTIFY_SHIPWAY'], true),
  },
  replacement: {
    /**
     * Replacement order creation is a documented integration boundary; when
     * disabled the admin can only link an externally created replacement order.
     */
    autoCreateEnabled: asBool(process.env['RETURN_REPLACEMENT_AUTO_CREATE_ENABLED'], false),
  },
  inventory: {
    /**
     * Unicommerce is the fulfilment system of record for warehouse stock. Leave
     * this false to avoid double-restocking through both Cureka and Unicommerce.
     */
    restockOnQcPass: asBool(process.env['RETURN_RESTOCK_ON_QC_PASS'], false),
  },
  wallet: {
    /** Customer may send a COD refund to the Cureka refund wallet. */
    refundEnabled: asBool(process.env['RETURN_WALLET_REFUND_ENABLED'], true),
  },
}));
