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
  createdAt: Date;
  updatedAt: Date;
  primaryImageUrl: IStorageFileReferenceResponse | null;
  /** Resolved browser URL for list/detail thumbnails. */
  imageUrl: string | null;
};

export type OrderResponse = Omit<OrderEntity, 'items' | 'user'> & {
  /** Sum of line-item quantities — matches "N Item(s)" in UI. */
  itemCount: number;
  /** Number of distinct line items in the order. */
  lineItemCount: number;
  items: OrderItemResponse[];
  /**
   * Tracking block for FE status UI.
   * Always present: Shipway-driven when available, otherwise default 4-step from order status.
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
    });
  }

  return mapDefaultShipmentResponse(order);
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
    itemCount,
    lineItemCount,
    items,
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
