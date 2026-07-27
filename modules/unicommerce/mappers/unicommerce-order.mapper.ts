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

function buildSaleOrderItem(
  item: OrderItemEntity,
  index: number,
  orderNumber: string,
  isCod: boolean,
): IUnicommerceSaleOrderItem {
  const itemCode = `${orderNumber}-${index + 1}`;
  const sellingPrice = toNumber(item.unitPrice);
  const totalPrice = toNumber(item.totalPrice);
  const prepaidAmount = isCod ? 0 : totalPrice;

  return {
    code: itemCode,
    itemSku: item.sku,
    shippingMethodCode: 'STD',
    packetNumber: 1,
    giftWrap: false,
    totalPrice: String(totalPrice),
    sellingPrice: String(sellingPrice),
    prepaidAmount: String(prepaidAmount),
    discount: '0',
    shippingCharges: '0',
  };
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

  const saleOrderItems: IUnicommerceSaleOrderItem[] = (order.items ?? []).map((item, idx) =>
    buildSaleOrderItem(item, idx, order.orderNumber, isCod),
  );

  const grandTotal = toNumber(order.grandTotal);
  const totalDiscount = toNumber(order.discountAmount);
  const totalShippingCharges = toNumber(order.shippingAmount);
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
