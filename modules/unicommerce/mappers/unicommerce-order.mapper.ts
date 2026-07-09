import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderItemEntity } from '@modules/orders/entities/order-item.entity';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import {
  IUnicommerceAddress,
  IUnicommerceOrderItem,
  IUnicommercePostOrderPayload,
  UnicommerceOrderItemStatus,
  UnicommerceOrderStatus,
  UnicommercePaymentType,
} from '../interfaces/unicommerce-order.interface';

export interface UnicommerceOrderMapperOptions {
  /** Default channel warehouse / facility code sent per order item. */
  facilityCode?: string;
  /** ISO currency code (default INR). */
  currency?: string;
  /** SLA window in hours added to order date (default 48). */
  slaHours?: number;
}

/** UniCommerce expects `yyyy-MM-dd HH:mm:ss` (UTC used for determinism). */
export function formatUnicommerceOrderDate(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapOrderStatus(status: OrderStatus): UnicommerceOrderStatus {
  if (status === OrderStatus.CANCELLED) return 'CANCELLED';
  return 'CREATED';
}

function mapItemStatus(orderStatus: UnicommerceOrderStatus): UnicommerceOrderItemStatus {
  return orderStatus === 'CANCELLED' ? 'CANCELLED' : 'CREATED';
}

function resolveItemTitle(item: OrderItemEntity): string {
  return item.variantName ? `${item.productName} (${item.variantName})` : item.productName;
}

/**
 * UniCommerce identifiers follow the same convention as the inbound catalog:
 *   productId = product.refId, variantId = variant SKU.
 */
function resolveProductId(item: OrderItemEntity): string {
  return item.product?.refId ?? item.productId;
}

function buildAddress(order: OrderEntity): IUnicommerceAddress {
  return {
    addressLine1: order.addressLine1,
    addressLine2: order.addressLine2 ?? undefined,
    city: order.city,
    country: 'India',
    email: order.user?.email ?? undefined,
    name: order.recipientName,
    phone: order.phoneNumber,
    pincode: order.pincode,
    state: order.state,
  };
}

export function mapOrderToUnicommercePayload(
  order: OrderEntity,
  options: UnicommerceOrderMapperOptions = {},
): IUnicommercePostOrderPayload {
  const currency = options.currency ?? 'INR';
  const slaHours = options.slaHours ?? 48;
  const facilityCode = options.facilityCode || undefined;

  const orderDate = order.placedAt ?? order.createdAt ?? new Date();
  const sla = new Date(orderDate.getTime() + slaHours * 60 * 60 * 1000);

  const orderStatus = mapOrderStatus(order.orderStatus);
  const itemStatus = mapItemStatus(orderStatus);
  const isCod = order.paymentMethod === OrderPaymentMethod.COD;
  const paymentType: UnicommercePaymentType = isCod ? 'COD' : 'PREPAID';

  const orderItems: IUnicommerceOrderItem[] = (order.items ?? []).map((item) => ({
    orderItemId: item.refId,
    status: itemStatus,
    productId: resolveProductId(item),
    variantId: item.sku,
    sku: item.sku,
    title: resolveItemTitle(item),
    shippingMethodCode: 'STD',
    orderItemPrice: {
      cashOnDeliveryCharges: 0,
      sellingPrice: toNumber(item.unitPrice),
      shippingCharges: 0,
      discount: 0,
      totalPrice: toNumber(item.totalPrice),
      transferPrice: 0,
      currency,
    },
    quantity: item.quantity,
    onHold: false,
    packetNumber: 1,
    facilityCode,
  }));

  const address = buildAddress(order);

  return {
    id: order.orderNumber,
    displayOrderNumber: order.orderNumber,
    orderDate: formatUnicommerceOrderDate(orderDate),
    orderStatus,
    sla: formatUnicommerceOrderDate(sla),
    priority: 0,
    paymentType,
    orderPrice: {
      currency,
      totalCashOnDeliveryCharges: isCod ? toNumber(order.codCharge) : 0,
      totalDiscount: toNumber(order.discountAmount),
      totalGiftCharges: 0,
      totalStoreCredit: 0,
      totalPrepaidAmount: isCod ? 0 : toNumber(order.grandTotal),
      totalShippingCharges: toNumber(order.shippingAmount),
    },
    orderItems,
    taxExempted: false,
    cFormProvided: false,
    thirdPartyShipping: false,
    shippingAddress: address,
    billingAddress: address,
    additionalInfo: order.notes ?? undefined,
  };
}
