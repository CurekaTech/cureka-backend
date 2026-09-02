import { UserEntity } from '@modules/users/entities/user.entity';
import { IStorageFileReferenceResponse } from '@packages/storage';
import {
  mapDefaultShipmentResponse,
  mapShipmentToResponse,
  ShipmentResponse,
} from '@modules/shipping/mappers/shipment.mapper';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { OrderEntity } from '../entities/order.entity';
import { OrderItemEntity } from '../entities/order-item.entity';
import { OrderPaymentStatus } from '../enums/order-payment-status.enum';
import { parseMoney } from '../utils/money.util';
import { ShipmentEntity } from '@modules/shipping/entities/shipment.entity';
import { resolvePrimaryProductImageRef } from '../utils/resolve-primary-product-image.util';

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
    /** Authoritative payment breakdown from stored order snapshots. */
    paymentSummary: OrderPaymentSummaryResponse;
    /**
     * Tracking block for FE status UI.
     * Always present: Shipway-driven when available, otherwise default 4-step from order status.
     * `shipment.statusFlow[].happenedAt` prefers these order timestamp columns.
     */
    shipment: ShipmentResponse;
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
};

type OrderWithShipment = OrderEntity & {
  user?: UserEntity | null;
  shipment?: ShipmentEntity | null;
  /** Pre-mapped shipment (e.g. after live Shipway resolve). */
  shipmentResponse?: ShipmentResponse | null;
  /** Whether Shipway returned a usable status for shipmentResponse / shipment entity. */
  shipwayStatus?: boolean;
};

async function mapOrderItemToResponse(
  item: OrderItemEntity,
  enricher: StorageUrlEnricher,
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
  const items = await Promise.all(
    (order.items ?? []).map((item) => mapOrderItemToResponse(item, enricher)),
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
