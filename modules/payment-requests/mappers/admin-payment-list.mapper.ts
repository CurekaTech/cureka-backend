import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { PaymentRequestEntity } from '../entities/payment-request.entity';
import { PaymentRequestStatus } from '../enums/payment-request-status.enum';

export type AdminPaymentListRecordType = 'PAYMENT_REQUEST' | 'COD_ORDER';

/** Admin list/detail row — payment request shape + COD order extras. */
export type AdminPaymentListItem = {
  id: string;
  refId: string;
  customerId: string;
  addressId: string | null;
  status: PaymentRequestStatus;
  subtotal: string;
  discount: string;
  tax: string;
  shipping: string;
  handling: string;
  platformFee: string;
  codCharge: string;
  totalAmount: string;
  couponCode: string | null;
  couponDiscount: string;
  currency: string;
  notes: string | null;
  orderSource: string;
  paymentProvider: string;
  paymentLink: string | null;
  providerReferenceId: string | null;
  paymentReference: string | null;
  expiresAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  recordType: AdminPaymentListRecordType;
  orderNumber?: string | null;
  orderStatus?: OrderStatus | null;
  paymentStatus?: OrderPaymentStatus | null;
  customer?: PaymentRequestEntity['customer'] | OrderEntity['user'] | null;
  items: Array<{
    id: string;
    productId: string;
    variantId: string;
    quantity: number;
    unitPrice: string;
    total: string;
    product?: { id: string; name: string } | null;
    variant?: { id: string; sku?: string } | null;
  }>;
};

export function mapPaymentRequestToAdminListItem(
  request: PaymentRequestEntity,
): AdminPaymentListItem {
  return {
    id: request.id,
    refId: request.refId,
    customerId: request.customerId,
    addressId: request.addressId,
    status: request.status,
    subtotal: request.subtotal,
    discount: request.discount,
    tax: request.tax,
    shipping: request.shipping,
    handling: request.handling,
    platformFee: request.platformFee,
    codCharge: request.codCharge,
    totalAmount: request.totalAmount,
    couponCode: request.couponCode,
    couponDiscount: request.couponDiscount,
    currency: request.currency,
    notes: request.notes,
    orderSource: request.orderSource,
    paymentProvider: request.paymentProvider,
    paymentLink: request.paymentLink,
    providerReferenceId: request.providerReferenceId,
    paymentReference: request.paymentReference,
    expiresAt: request.expiresAt,
    paidAt: request.paidAt,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    recordType: 'PAYMENT_REQUEST',
    orderNumber: null,
    orderStatus: null,
    paymentStatus: null,
    customer: request.customer ?? null,
    items: (request.items ?? []).map((item) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
      product: item.product
        ? { id: item.product.id, name: item.product.name }
        : null,
      variant: item.variant
        ? { id: item.variant.id, sku: item.variant.sku }
        : null,
    })),
  };
}

export function mapCodOrderStatus(order: OrderEntity): PaymentRequestStatus {
  if (order.orderStatus === OrderStatus.CANCELLED) {
    return PaymentRequestStatus.CANCELLED;
  }
  if (order.paymentStatus === OrderPaymentStatus.PAID) {
    return PaymentRequestStatus.PAID;
  }
  return PaymentRequestStatus.PAYMENT_PENDING;
}

export function mapCodOrderToAdminListItem(order: OrderEntity): AdminPaymentListItem {
  return {
    id: order.id,
    refId: order.refId,
    customerId: order.userId,
    addressId: null,
    status: mapCodOrderStatus(order),
    subtotal: order.subtotal,
    discount: order.discountAmount,
    tax: '0.00',
    shipping: order.shippingAmount,
    handling: order.handlingAmount,
    platformFee: order.platformFee,
    codCharge: order.codCharge,
    totalAmount: order.grandTotal,
    couponCode: order.couponCode,
    couponDiscount: order.discountAmount,
    currency: 'INR',
    notes: order.notes,
    orderSource: order.orderSource,
    paymentProvider: 'COD',
    paymentLink: null,
    providerReferenceId: order.orderNumber,
    paymentReference: order.orderNumber,
    expiresAt: null,
    paidAt: order.paymentStatus === OrderPaymentStatus.PAID ? order.placedAt : null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    recordType: 'COD_ORDER',
    orderNumber: order.orderNumber,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    customer: order.user ?? null,
    items: (order.items ?? []).map((item) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.totalPrice,
      product: item.product
        ? { id: item.product.id, name: item.product.name }
        : { id: item.productId, name: item.productName },
      variant: item.variant
        ? { id: item.variant.id, sku: item.variant.sku }
        : { id: item.variantId, sku: item.sku },
    })),
  };
}
