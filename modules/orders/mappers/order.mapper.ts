import { IStorageFileReferenceResponse } from '@packages/storage';
import { ShipmentResponse } from '@modules/shipping/mappers/shipment.mapper';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { OrderEntity } from '../entities/order.entity';
import { OrderItemEntity } from '../entities/order-item.entity';
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
  /** Shipway shipment record when the order has been pushed to Shipway. */
  shipment: ShipmentResponse | null;
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

export async function mapOrderToResponse(
  order: OrderEntity,
  enricher: StorageUrlEnricher,
  shipment: ShipmentResponse | null = null,
): Promise<OrderResponse> {
  const items = await Promise.all(
    (order.items ?? []).map((item) => mapOrderItemToResponse(item, enricher)),
  );

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const lineItemCount = items.length;

  const { user: _user, items: _items, ...orderFields } = order;

  return {
    ...orderFields,
    itemCount,
    lineItemCount,
    items,
    shipment,
  };
}
