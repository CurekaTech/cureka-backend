import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShipmentEntity } from '@modules/shipping/entities/shipment.entity';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { DataSource } from 'typeorm';
import { GokwikRepository } from '../repositories/gokwik.repository';
import { GokwikApiService } from './gokwik-api.service';

@Injectable()
export class GokwikFulfillmentService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly repository: GokwikRepository,
    private readonly apiService: GokwikApiService,
    private readonly configService: ConfigService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
  ) {}

  async pushOrderFulfillment(orderId: string): Promise<void> {
    const link = await this.repository.findOrderByOrderId(orderId);
    if (!link?.order) return;
    const order = link.order;

    const shipments = await this.dataSource.getRepository(ShipmentEntity).find({
      where: { orderId },
      relations: { items: { orderItem: { product: { media: true } } } },
      order: { createdAt: 'ASC' },
    });
    const assigned = shipments.filter((shipment) => Boolean(shipment.awbNumber));
    if (!assigned.length) return;

    if (assigned.length === 1 && assigned[0]?.groupKey === 'default') {
      const shipment = assigned[0];
      await this.apiService.updateOrder({
        merchant_order_id: order.orderNumber,
        awb_number: shipment.awbNumber ?? undefined,
        awb_status: shipment.shipmentStatus,
        shipping_provider: shipment.courierName ?? undefined,
      });
      return;
    }

    const edd = new Date();
    edd.setUTCDate(edd.getUTCDate() + 7);
    const storefront = this.configService.get<string>('STOREFRONT_URL')?.replace(/\/+$/, '') ?? '';
    const originPincode = this.configService.get<string>('gokwik.origin.pincode') ?? '';
    const originCity = this.configService.get<string>('gokwik.origin.city') ?? '';
    const lineItems = (
      await Promise.all(
        assigned.flatMap((shipment) => {
          if (!shipment.items.length) {
            throw new Error(`Shipment group ${shipment.groupKey} has no item allocation`);
          }
          return shipment.items.map(async (item) => {
            const orderItem = item.orderItem;
            if (!orderItem) throw new Error(`Shipment item ${item.id} is not linked to an order item`);
            const media = orderItem.product?.media?.[0];
            const thumbnail = media
              ? (await this.storageUrlEnricher.toReference(media.url))?.url ?? ''
              : '';
            const productUrl =
              orderItem.product?.singleProductUrl ||
              (storefront && orderItem.product?.slug
                ? `${storefront}/product/${encodeURIComponent(orderItem.product.slug)}`
                : thumbnail);
            return {
              variant_id: orderItem.variantId,
              awb_status: shipment.shipmentStatus,
              awb_number: shipment.awbNumber ?? '',
              shipping_provider: shipment.courierName ?? '',
              sku: orderItem.sku,
              product_id: orderItem.productId,
              product_url: productUrl,
              product_thumbnail_url: thumbnail || productUrl,
              name: orderItem.productName,
              price: Math.round(Number(orderItem.unitPrice)),
              quantity: item.quantity,
              total: (Number(orderItem.unitPrice) * item.quantity).toFixed(2),
              discount: '0',
              sub_category: orderItem.product?.subCategoryId ?? '',
              major_category: orderItem.product?.categoryId ?? '',
              item_discount: '0',
              item_shipping: '0',
              item_edd: edd.toISOString().slice(0, 10),
              item_cashback: '0',
              item_rating: '0',
              item_weight: '0',
              tax: '0',
              taxclass: '',
              taxstat: '',
              allmeta: [],
              somemeta: '',
              line_item_id: orderItem.id,
              type: 'product',
              seller_registration_date: order.createdAt.toISOString().slice(0, 10),
              seller_origin_pincode: originPincode,
              seller_origin_city: originCity,
              seller_code: 'cureka',
              seller_rating: '0',
              promo_code: '',
              source: 'cureka',
            };
          });
        }),
      )
    ).flat();

    await this.apiService.splitOrder({
      merchant_order_id: order.orderNumber,
      line_items: lineItems,
    });
  }
}
