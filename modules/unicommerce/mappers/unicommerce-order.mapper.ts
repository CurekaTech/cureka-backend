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

/**
 * Unicommerce createSaleOrder treats each `saleOrderItem` as ONE physical unit
 * (sellingPrice/totalPrice = price of a single item). There is no quantity field
 * in the official API — multi-qty lines must be expanded into N item rows.
 */
function buildSaleOrderItemsForLine(
  item: OrderItemEntity,
  startingIndex: number,
  orderNumber: string,
  isCod: boolean,
): IUnicommerceSaleOrderItem[] {
  const quantity = Math.max(1, Math.floor(toNumber(item.quantity)) || 1);
  const unitPrice = toNumber(item.unitPrice);
  const lineTotal = toNumber(item.totalPrice);
  // Prefer explicit unit price; fall back to line total / qty when unitPrice is missing.
  const sellingPrice =
    unitPrice > 0 ? unitPrice : quantity > 0 ? lineTotal / quantity : lineTotal;
  const prepaidAmount = isCod ? 0 : sellingPrice;

  return Array.from({ length: quantity }, (_, offset) => {
    const itemIndex = startingIndex + offset;
    return {
      code: `${orderNumber}-${itemIndex}`,
      itemSku: item.sku,
      shippingMethodCode: 'STD',
      packetNumber: 1,
      giftWrap: false,
      totalPrice: toMoneyString(sellingPrice),
      sellingPrice: toMoneyString(sellingPrice),
      prepaidAmount: toMoneyString(prepaidAmount),
      discount: '0.00',
      shippingCharges: '0.00',
    };
  });
}

export function mapOrderToUnicommercePayload(
  order: OrderEntity,
  options: UnicommerceOrderMapperOptions = {},
): IUnicommerceSaleOrderPayload {
  const currency = options.currency ?? 'INR';
  const channel = options.channel ?? 'CUSTOM';

  const isCod = order.paymentMethod === OrderPaymentMethod.COD;
  const orderDate = order.placedAt ?? order.createdAt ?? new Date();

  const address = buildAddress(order);

  const saleOrderItems: IUnicommerceSaleOrderItem[] = [];
  let nextItemIndex = 1;
  for (const item of order.items ?? []) {
    const expanded = buildSaleOrderItemsForLine(item, nextItemIndex, order.orderNumber, isCod);
    saleOrderItems.push(...expanded);
    nextItemIndex += expanded.length;
  }

  const grandTotal = toNumber(order.grandTotal);
  // Unicommerce has no handling/platform fields — fold them into shipping so Order Amount matches Cureka grandTotal.
  // UC Order Amount ≈ Σ item prices + totalShippingCharges + totalCashOnDeliveryCharges − totalDiscount
  const totalDiscount =
    toNumber(order.discountAmount) + toNumber(order.prepaidDiscount);
  const totalShippingCharges =
    toNumber(order.shippingAmount) +
    toNumber(order.handlingAmount) +
    toNumber(order.platformFee);
  const totalCashOnDeliveryCharges = isCod ? toNumber(order.codCharge) : 0;
  const totalPrepaidAmount = isCod ? 0 : grandTotal;

  return {
    saleOrder: {
      code: order.orderNumber,
      displayOrderCode: order.orderNumber,
      displayOrderDateTime: orderDate.toISOString(),
      channel,
      notificationEmail: order.user?.email ?? undefined,
      notificationMobile: order.phoneNumber ?? undefined,
      cashOnDelivery: isCod,
      paymentInstrument: isCod ? 'CASH' : 'NET_BANKING',
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
