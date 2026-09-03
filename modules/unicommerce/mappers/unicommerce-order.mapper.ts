import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderItemEntity } from '@modules/orders/entities/order-item.entity';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import {
  IUnicommerceSaleOrderAddress,
  IUnicommerceSaleOrderItem,
  IUnicommerceSaleOrderPayload,
} from '../interfaces/unicommerce-order.interface';

export interface UnicommerceOrderMapperOptions {
  /** ISO currency code (default INR). */
  currency?: string;
  /** Channel code registered in Unicommerce (default CUSTOM). */
  channel?: string;
}

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toMoneyString(value: number): string {
  return value.toFixed(2);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildAddress(order: OrderEntity): IUnicommerceSaleOrderAddress {
  return {
    id: 'shipping',
    name: order.recipientName,
    addressLine1: order.addressLine1,
    addressLine2: order.addressLine2 ?? undefined,
    city: order.city,
    state: order.state,
    country: 'India',
    pincode: order.pincode,
    phone: order.phoneNumber,
    email: order.user?.email ?? undefined,
  };
}

/** COD / partial-COD collect cash on delivery in Uniware. */
function isCashOnDelivery(paymentMethod: OrderPaymentMethod): boolean {
  return (
    paymentMethod === OrderPaymentMethod.COD ||
    paymentMethod === OrderPaymentMethod.GOKWIK_PARTIAL_COD
  );
}

function mapPaymentInstrument(paymentMethod: OrderPaymentMethod, isCod: boolean): string {
  if (isCod) return 'CASH';
  if (paymentMethod === OrderPaymentMethod.WALLET) return 'WALLET';
  // Razorpay / Cashfree / GoKwik prepaid — NET_BANKING is an allowed UC instrument.
  return 'NET_BANKING';
}

type ExpandedLine = {
  sku: string;
  sellingPrice: number;
};

/**
 * Unicommerce createSaleOrder treats each `saleOrderItem` as ONE physical unit
 * (sellingPrice/totalPrice = price of a single item). There is no quantity field
 * in the official API — multi-qty lines must be expanded into N item rows.
 */
function expandLines(items: OrderItemEntity[]): ExpandedLine[] {
  const lines: ExpandedLine[] = [];
  for (const item of items) {
    const quantity = Math.max(1, Math.floor(toNumber(item.quantity)) || 1);
    const unitPrice = toNumber(item.unitPrice);
    const lineTotal = toNumber(item.totalPrice);
    const sellingPrice =
      unitPrice > 0 ? unitPrice : quantity > 0 ? lineTotal / quantity : lineTotal;
    for (let i = 0; i < quantity; i += 1) {
      lines.push({ sku: item.sku, sellingPrice: roundMoney(sellingPrice) });
    }
  }
  return lines;
}

/**
 * Build saleOrderItems.
 *
 * Unicommerce allows prepaid / discount / shipping at EITHER order level OR item
 * level — never both ("only one of order level/order item level Prepaid Amount
 * can be specified"). We use order-level totals (totalPrepaidAmount,
 * totalDiscount, totalShippingCharges) and keep item charge fields at 0.
 */
function buildSaleOrderItems(
  lines: ExpandedLine[],
  orderNumber: string,
): IUnicommerceSaleOrderItem[] {
  return lines.map((line, index) => ({
    code: `${orderNumber}-${index + 1}`,
    itemSku: line.sku,
    shippingMethodCode: 'STD',
    packetNumber: 1,
    giftWrap: false,
    totalPrice: toMoneyString(line.sellingPrice),
    sellingPrice: toMoneyString(line.sellingPrice),
    // Mandatory field, but must stay 0 when totalPrepaidAmount is set at order level.
    prepaidAmount: '0.00',
    discount: '0.00',
    shippingCharges: '0.00',
  }));
}

function buildAdditionalInfo(order: OrderEntity): string | undefined {
  const parts: string[] = [];

  if (order.orderSource) {
    parts.push(`Source: ${order.orderSource}`);
  }

  if (order.couponCode?.trim()) {
    parts.push(`Coupon: ${order.couponCode.trim()}`);
  }
  if (order.couponTitle?.trim() && order.couponTitle.trim() !== order.couponCode?.trim()) {
    parts.push(`Title: ${order.couponTitle.trim()}`);
  }

  const couponDiscount = toNumber(order.discountAmount);
  const prepaidDiscount = toNumber(order.prepaidDiscount);
  if (couponDiscount > 0) {
    parts.push(`Coupon discount: ${toMoneyString(couponDiscount)}`);
  }
  if (prepaidDiscount > 0) {
    parts.push(`Prepaid discount: ${toMoneyString(prepaidDiscount)}`);
  }

  if (order.notes?.trim()) {
    parts.push(`Notes: ${order.notes.trim()}`);
  }

  if (!parts.length) return undefined;
  return parts.join(' | ').slice(0, 500);
}

export function mapOrderToUnicommercePayload(
  order: OrderEntity,
  options: UnicommerceOrderMapperOptions = {},
): IUnicommerceSaleOrderPayload {
  const currency = options.currency ?? 'INR';
  const channel = options.channel ?? 'CUSTOM';

  const isCod = isCashOnDelivery(order.paymentMethod);
  const orderDate = order.placedAt ?? order.createdAt ?? new Date();

  const address = buildAddress(order);
  const lines = expandLines(order.items ?? []);

  // Unicommerce has no handling/platform fields — fold them into shipping so Order Amount matches Cureka.
  // UC Order Amount ≈ Σ item prices + totalShippingCharges + totalCashOnDeliveryCharges − totalDiscount
  const totalDiscount = roundMoney(
    toNumber(order.discountAmount) + toNumber(order.prepaidDiscount),
  );
  const totalShippingCharges = roundMoney(
    toNumber(order.shippingAmount) +
      toNumber(order.handlingAmount) +
      toNumber(order.platformFee),
  );
  const totalCashOnDeliveryCharges = isCod ? roundMoney(toNumber(order.codCharge)) : 0;

  const saleOrderItems = buildSaleOrderItems(lines, order.orderNumber);

  const itemsSubtotal = roundMoney(
    saleOrderItems.reduce((sum, item) => sum + toNumber(item.sellingPrice), 0),
  );
  const ucOrderAmount = roundMoney(
    itemsSubtotal + totalShippingCharges + totalCashOnDeliveryCharges - totalDiscount,
  );

  // Prepaid must match UC-calculated order amount — NOT raw grandTotal (can include COD
  // charge or drift). Mismatched prepaid is a common reason orders land in Failed Orders.
  const totalPrepaidAmount = isCod ? 0 : Math.max(0, ucOrderAmount);
  const additionalInfo = buildAdditionalInfo(order);

  return {
    saleOrder: {
      code: order.orderNumber,
      displayOrderCode: order.orderNumber,
      displayOrderDateTime: orderDate.toISOString(),
      channel,
      notificationEmail: order.user?.email ?? undefined,
      notificationMobile: order.phoneNumber ?? undefined,
      cashOnDelivery: isCod,
      paymentInstrument: mapPaymentInstrument(order.paymentMethod, isCod),
      // Custom / self-fulfilled (Shipway) — UC default true means marketplace shipping
      // and often blocks prepaid processing on custom channels.
      thirdPartyShipping: false,
      verificationRequired: false,
      ...(additionalInfo ? { additionalInfo } : {}),
      addresses: [address],
      billingAddress: { referenceId: 'shipping' },
      shippingAddress: { referenceId: 'shipping' },
      saleOrderItems,
      currencyCode: currency,
      totalDiscount,
      totalShippingCharges,
      totalCashOnDeliveryCharges,
      totalPrepaidAmount,
    },
  };
}
