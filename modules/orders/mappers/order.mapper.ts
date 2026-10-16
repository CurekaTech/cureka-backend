import { UserEntity } from '@modules/users/entities/user.entity';
import { IUserAddress } from '@modules/users/interfaces/user-address.interface';
import { IStorageFileReferenceResponse } from '@packages/storage';
import {
  mapDefaultShipmentResponse,
  mapShipmentToResponse,
  ShipmentResponse,
} from '@modules/shipping/mappers/shipment.mapper';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { PaymentRequestEntity } from '@modules/payment-requests/entities/payment-request.entity';
import { PaymentRequestStatus } from '@modules/payment-requests/enums/payment-request-status.enum';
import { OrderEntity } from '../entities/order.entity';
import { OrderItemEntity } from '../entities/order-item.entity';
import { OrderPaymentMethod } from '../enums/order-payment-method.enum';
import { OrderPaymentStatus } from '../enums/order-payment-status.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { parseMoney } from '../utils/money.util';
import { ShipmentEntity } from '@modules/shipping/entities/shipment.entity';
import { PolicyWindowUnit } from '@modules/product/enums/policy-window-unit.enum';
import { IOrderItemReturnPolicySnapshot } from '../interfaces/order-item-return-policy.interface';
import {
  DEFAULT_REPLACE_WINDOW_DAYS,
  DEFAULT_RETURN_WINDOW_DAYS,
} from '@modules/returns/constants/return.constants';
import {
  isWithinWindow,
  resolveConfiguredWindow,
  resolveWindowExpiry,
} from '@modules/returns/utils/return-window.util';
import { IOrderItemBundleComponent } from '../interfaces/order-item-bundle-component.interface';
import { resolvePrimaryProductImageRef } from '../utils/resolve-primary-product-image.util';

export type OrderItemReturnReplaceResponse = {
  /** Ordered variant allowed returns when the order was placed. */
  returnAllowed: boolean;
  /** Ordered variant allowed replacement when the order was placed. */
  replaceAllowed: boolean;
  /** Day window stored for that variant. Null when the policy has no day window. */
  returnWindowDays: number | null;
  replaceWindowDays: number | null;
  /** True only for a delivered order, when return is allowed and the window is still open. */
  withinReturnWindow: boolean;
  /** True only for a delivered order, when replacement is allowed and the window is still open. */
  withinReplaceWindow: boolean;
};

export type OrderItemResponse = {
  id: string;
  refId: string;
  orderId: string;
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  isSubscription: boolean;
  frequency: string | null;
  subscriptionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  primaryImageUrl: IStorageFileReferenceResponse | null;
  /** Resolved browser URL for list/detail thumbnails. */
  imageUrl: string | null;
  returnReplace: OrderItemReturnReplaceResponse;
  /** Identity snapshot for a bundle line. Null for a non-bundle or an unresolved bundle. */
  bundleComponents: IOrderItemBundleComponent[] | null;
  /** COD frozen at placement. Null means the order predates the column. */
  codAvailable: boolean | null;
};

/** Per-status times on the order row (set once when that status is first reached). */
export type OrderStatusTimestampsResponse = {
  placedAt: Date | null;
  confirmedAt: Date | null;
  processingAt: Date | null;
  shippedAt: Date | null;
  outForDeliveryAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  failedDeliveryAt: Date | null;
  rtoAt: Date | null;
};

export type OrderPaymentSummaryResponse = {
  itemTotal: number;
  discount: number;
  shipping: number;
  tax: number;
  grandTotal: number;
  paidAmount: number;
  paymentMethod: string;
  paymentStatus: string;
};

export type OrderResponse = Omit<OrderEntity, 'items' | 'user'> &
  OrderStatusTimestampsResponse & {
    /** Sum of line-item quantities — matches "N Item(s)" in UI. */
    itemCount: number;
    /** Number of distinct line items in the order. */
    lineItemCount: number;
    items: OrderItemResponse[];
    /**
     * Show the order Return button only for a delivered order, when any ordered variant
     * allows return and is still inside its return window. Otherwise hide the button.
     */
    returnAllowed: boolean;
    /**
     * Show the order Replace button only for a delivered order, when any ordered variant
     * allows replacement and is still inside its replacement window. Otherwise hide the button.
     */
    replaceAllowed: boolean;
    /** Authoritative payment breakdown from stored order snapshots. */
    paymentSummary: OrderPaymentSummaryResponse;
    /**
     * Tracking block for FE status UI.
     * Always present: Shipway-driven when available, otherwise default 4-step from order status.
     * `shipment.statusFlow[].happenedAt` prefers these order timestamp columns.
     */
    shipment: ShipmentResponse;
    refund?: import('@modules/refund-requests/interfaces/refund-request.interface').ICustomerRefundView | null;
  };

export type AdminOrderCustomerResponse = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  mobileNumber: string | null;
};

export type AdminOrderResponse = OrderResponse & {
  customer: AdminOrderCustomerResponse | null;
  /** Present when admin order detail is resolved from a payment request (`PAY…`). */
  paymentRequestId?: string | null;
  paymentRequestRefId?: string;
  paymentRequestStatus?: PaymentRequestStatus;
  paymentLink?: string | null;
};

type OrderWithShipment = OrderEntity & {
  user?: UserEntity | null;
  shipment?: ShipmentEntity | null;
  /** Pre-mapped shipment (e.g. after live Shipway resolve). */
  shipmentResponse?: ShipmentResponse | null;
  /** Whether Shipway returned a usable status for shipmentResponse / shipment entity. */
  shipwayStatus?: boolean;
};

const windowDays = (
  window: number | null | undefined,
  unit: PolicyWindowUnit | null | undefined,
): number | null => (unit === PolicyWindowUnit.DAYS && window != null ? window : null);

/** Flags frozen on the ordered variant. Windows open only after the order is delivered. */
export function resolveOrderItemReturnReplace(
  snapshot: IOrderItemReturnPolicySnapshot | null | undefined,
  deliveredAt: Date | null,
  isDelivered: boolean,
  now: Date = new Date(),
): OrderItemReturnReplaceResponse {
  if (!snapshot) {
    return {
      returnAllowed: false,
      replaceAllowed: false,
      returnWindowDays: null,
      replaceWindowDays: null,
      withinReturnWindow: false,
      withinReplaceWindow: false,
    };
  }

  const returnAllowed = snapshot.returnable === true;
  const replaceAllowed = snapshot.replaceable === true;
  const returnWindow = effectivePolicyWindow(
    snapshot.returnWindow,
    snapshot.returnWindowUnit,
    DEFAULT_RETURN_WINDOW_DAYS,
  );
  const replaceWindow = effectivePolicyWindow(
    snapshot.replacementWindow,
    snapshot.replacementWindowUnit,
    DEFAULT_REPLACE_WINDOW_DAYS,
  );
  const returnWindowExpiresAt = resolveWindowExpiry(
    deliveredAt,
    returnWindow.window,
    returnWindow.unit,
  );
  const replaceWindowExpiresAt = resolveWindowExpiry(
    deliveredAt,
    replaceWindow.window,
    replaceWindow.unit,
  );

  return {
    returnAllowed,
    replaceAllowed,
    returnWindowDays: windowDays(returnWindow.window, returnWindow.unit),
    replaceWindowDays: windowDays(replaceWindow.window, replaceWindow.unit),
    withinReturnWindow:
      isDelivered && returnAllowed && isWithinWindow(returnWindowExpiresAt, now),
    withinReplaceWindow:
      isDelivered && replaceAllowed && isWithinWindow(replaceWindowExpiresAt, now),
  };
}

async function mapOrderItemToResponse(
  item: OrderItemEntity,
  enricher: StorageUrlEnricher,
  deliveredAt: Date | null,
  isDelivered: boolean,
): Promise<OrderItemResponse> {
  const imageRef = resolvePrimaryProductImageRef(item.product, item.variantId);
  const primaryImageUrl = await enricher.toReference(imageRef);

  return {
    id: item.id,
    refId: item.refId,
    orderId: item.orderId,
    productId: item.productId,
    variantId: item.variantId,
    sku: item.sku,
    productName: item.productName,
    variantName: item.variantName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice,
    isSubscription: !!item.isSubscription,
    frequency: item.frequency ?? null,
    subscriptionId: item.subscriptionId ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    primaryImageUrl,
    imageUrl: primaryImageUrl?.url ?? null,
    returnReplace: resolveOrderItemReturnReplace(
      item.returnPolicySnapshot,
      deliveredAt,
      isDelivered,
    ),
    bundleComponents: item.bundleComponents ?? null,
    codAvailable: item.codAvailable ?? null,
  };
}

function effectivePolicyWindow(
  window: number | null | undefined,
  unit: PolicyWindowUnit | null | undefined,
  fallbackDays: number,
): { window: number; unit: PolicyWindowUnit } {
  const missing = window === null || window === undefined || window <= 0;
  return {
    window: resolveConfiguredWindow(window, fallbackDays),
    unit: missing ? PolicyWindowUnit.DAYS : (unit ?? PolicyWindowUnit.DAYS),
  };
}

function resolveShipmentResponse(order: OrderWithShipment): ShipmentResponse {
  if (order.shipmentResponse) {
    return order.shipmentResponse;
  }

  if (order.shipment) {
    return mapShipmentToResponse(order.shipment, {
      shipwayStatus: order.shipwayStatus ?? false,
      orderStatus: order.orderStatus,
      orderTimestamps: order,
    });
  }

  return mapDefaultShipmentResponse(order);
}

function resolvePaidAmount(order: Pick<OrderEntity, 'paymentStatus' | 'grandTotal'>): number {
  const grandTotal = parseMoney(order.grandTotal);
  if (order.paymentStatus === OrderPaymentStatus.PAID) {
    return grandTotal;
  }
  return 0;
}

export function mapOrderPaymentSummary(
  order: Pick<
    OrderEntity,
    | 'subtotal'
    | 'discountAmount'
    | 'shippingAmount'
    | 'grandTotal'
    | 'paymentMethod'
    | 'paymentStatus'
  >,
): OrderPaymentSummaryResponse {
  return {
    itemTotal: parseMoney(order.subtotal),
    discount: parseMoney(order.discountAmount),
    shipping: parseMoney(order.shippingAmount),
    tax: 0,
    grandTotal: parseMoney(order.grandTotal),
    paidAmount: resolvePaidAmount(order),
    paymentMethod: String(order.paymentMethod),
    paymentStatus: String(order.paymentStatus),
  };
}

function pickOrderStatusTimestamps(
  order: Pick<
    OrderEntity,
    | 'placedAt'
    | 'confirmedAt'
    | 'processingAt'
    | 'shippedAt'
    | 'outForDeliveryAt'
    | 'deliveredAt'
    | 'cancelledAt'
    | 'failedDeliveryAt'
    | 'rtoAt'
  >,
): OrderStatusTimestampsResponse {
  return {
    placedAt: order.placedAt ?? null,
    confirmedAt: order.confirmedAt ?? null,
    processingAt: order.processingAt ?? null,
    shippedAt: order.shippedAt ?? null,
    outForDeliveryAt: order.outForDeliveryAt ?? null,
    deliveredAt: order.deliveredAt ?? null,
    cancelledAt: order.cancelledAt ?? null,
    failedDeliveryAt: order.failedDeliveryAt ?? null,
    rtoAt: order.rtoAt ?? null,
  };
}

export async function mapOrderToResponse(
  order: OrderWithShipment,
  enricher: StorageUrlEnricher,
): Promise<OrderResponse> {
  const isDelivered = order.orderStatus === OrderStatus.DELIVERED;
  const items = await Promise.all(
    (order.items ?? []).map((item) =>
      mapOrderItemToResponse(item, enricher, order.deliveredAt ?? null, isDelivered),
    ),
  );

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const lineItemCount = items.length;

  const {
    user: _user,
    items: _items,
    shipment: _shipmentEntity,
    shipmentResponse: _shipmentResponse,
    shipwayStatus: _shipwayStatus,
    ...orderFields
  } = order;

  return {
    ...orderFields,
    ...pickOrderStatusTimestamps(order),
    itemCount,
    lineItemCount,
    items,
    returnAllowed:
      isDelivered && items.some((item) => item.returnReplace.withinReturnWindow),
    replaceAllowed:
      isDelivered && items.some((item) => item.returnReplace.withinReplaceWindow),
    paymentSummary: mapOrderPaymentSummary(order),
    shipment: resolveShipmentResponse(order),
  };
}

function mapOrderCustomer(user?: UserEntity | null): AdminOrderCustomerResponse | null {
  if (!user) return null;
  return {
    id: user.id,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    email: user.email ?? null,
    mobileNumber: user.mobileNumber ?? null,
  };
}

export async function mapOrderToAdminResponse(
  order: OrderWithShipment,
  enricher: StorageUrlEnricher,
): Promise<AdminOrderResponse> {
  const base = await mapOrderToResponse(order, enricher);
  return {
    ...base,
    customer: mapOrderCustomer(order.user),
  };
}

export function mapPaymentRequestToOrderStatuses(status: PaymentRequestStatus): {
  orderStatus: OrderStatus;
  paymentStatus: OrderPaymentStatus;
} {
  switch (status) {
    case PaymentRequestStatus.PAID:
      return { orderStatus: OrderStatus.CONFIRMED, paymentStatus: OrderPaymentStatus.PAID };
    case PaymentRequestStatus.FAILED:
      return { orderStatus: OrderStatus.PENDING, paymentStatus: OrderPaymentStatus.FAILED };
    case PaymentRequestStatus.CANCELLED:
    case PaymentRequestStatus.EXPIRED:
      return { orderStatus: OrderStatus.CANCELLED, paymentStatus: OrderPaymentStatus.PENDING };
    default:
      return { orderStatus: OrderStatus.PENDING, paymentStatus: OrderPaymentStatus.PENDING };
  }
}

function mapPaymentProviderToOrderMethod(provider?: string | null): OrderPaymentMethod {
  const normalized = String(provider ?? '')
    .trim()
    .toUpperCase();
  if (normalized === 'CASHFREE') return OrderPaymentMethod.CASHFREE;
  if (normalized === 'COD') return OrderPaymentMethod.COD;
  if (normalized === 'WALLET') return OrderPaymentMethod.WALLET;
  if (normalized === 'GOKWIK_PREPAID') return OrderPaymentMethod.GOKWIK_PREPAID;
  return OrderPaymentMethod.RAZORPAY;
}

function buildSyntheticOrderFromPaymentRequest(
  request: PaymentRequestEntity,
  address: Pick<
    IUserAddress,
    | 'recipientName'
    | 'phoneNumber'
    | 'pincode'
    | 'addressLine1'
    | 'addressLine2'
    | 'landmark'
    | 'city'
    | 'state'
  > | null,
): OrderWithShipment {
  const { orderStatus, paymentStatus } = mapPaymentRequestToOrderStatuses(request.status);
  const cancelledAt =
    orderStatus === OrderStatus.CANCELLED ? (request.updatedAt ?? request.createdAt) : null;

  const items = (request.items ?? []).map((item) => {
    const variantName = item.variant?.attributeValues?.length
      ? item.variant.attributeValues.map((value) => value.value).join(' / ')
      : null;
    return {
      id: item.id,
      refId: item.refId,
      orderId: request.id,
      productId: item.productId,
      variantId: item.variantId,
      sku: item.variant?.sku ?? '',
      productName: item.product?.name ?? '',
      variantName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.total,
      isSubscription: !!item.isSubscription,
      frequency: item.frequency ?? null,
      subscriptionId: null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      product: item.product,
      variant: item.variant,
    } as OrderItemEntity;
  });

  return {
    id: request.id,
    refId: request.refId,
    orderNumber: request.refId,
    userId: request.customerId,
    subtotal: request.subtotal,
    discountAmount: request.discount,
    shippingAmount: request.shipping ?? '0.00',
    handlingAmount: request.handling ?? '0.00',
    platformFee: request.platformFee ?? '0.00',
    codCharge: request.codCharge ?? '0.00',
    prepaidDiscount: request.prepaidDiscount ?? '0.00',
    grandTotal: request.totalAmount,
    couponId: null,
    couponCode: request.couponCode,
    couponTitle: null,
    couponDiscountType: null,
    paymentMethod: mapPaymentProviderToOrderMethod(request.paymentProvider),
    paymentStatus,
    orderStatus,
    orderSource: request.orderSource,
    recipientName: address?.recipientName ?? request.customer?.firstName ?? 'Customer',
    phoneNumber: address?.phoneNumber ?? request.customer?.mobileNumber ?? '0000000000',
    pincode: address?.pincode ?? '000000',
    addressLine1: address?.addressLine1 ?? 'Address not yet confirmed',
    addressLine2: address?.addressLine2 ?? null,
    landmark: address?.landmark ?? null,
    city: address?.city ?? 'N/A',
    state: address?.state ?? 'N/A',
    notes: request.notes,
    cancelReason: null,
    placedAt: request.createdAt,
    confirmedAt: request.paidAt ?? null,
    processingAt: null,
    shippedAt: null,
    outForDeliveryAt: null,
    deliveredAt: null,
    cancelledAt,
    failedDeliveryAt: null,
    rtoAt: null,
    subscriptionId: null,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    createdBy: request.createdBy,
    updatedBy: request.updatedBy,
    deletedAt: request.deletedAt ?? null,
    user: request.customer ?? null,
    items,
  } as OrderWithShipment;
}

export async function mapPaymentRequestToAdminOrderResponse(
  request: PaymentRequestEntity,
  address: Pick<
    IUserAddress,
    | 'recipientName'
    | 'phoneNumber'
    | 'pincode'
    | 'addressLine1'
    | 'addressLine2'
    | 'landmark'
    | 'city'
    | 'state'
  > | null,
  enricher: StorageUrlEnricher,
): Promise<AdminOrderResponse> {
  const response = await mapOrderToAdminResponse(
    buildSyntheticOrderFromPaymentRequest(request, address),
    enricher,
  );
  return {
    ...response,
    paymentRequestId: request.id,
    paymentRequestRefId: request.refId,
    paymentRequestStatus: request.status,
    paymentLink: request.paymentLink,
  };
}

export function withPaymentRequestOnAdminOrder(
  response: AdminOrderResponse,
  request: PaymentRequestEntity,
): AdminOrderResponse {
  return {
    ...response,
    paymentRequestId: request.id,
    paymentRequestRefId: request.refId,
    paymentRequestStatus: request.status,
    paymentLink: request.paymentLink,
  };
}
