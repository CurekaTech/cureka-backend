import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrdersRepository } from '@modules/orders/repositories/orders.repository';
import { OrderItemsRepository } from '@modules/orders/repositories/order-items.repository';
import { generateUniqueRefId, STOCK_VALIDATION_ENABLED } from '@packages/common';
import { DataSource, EntityManager } from 'typeorm';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { GokwikLineItemDto } from '../dto/gokwik-line-item.dto';
import {
  filterGokwikComplimentaryLineItems,
  resolveGokwikComplimentaryLineTotal,
  resolveGokwikComplimentaryMeta,
  resolveGokwikComplimentaryUnitPrice,
} from '../utils/gokwik-line-item.util';

export type GokwikComplimentarySyncResult = {
  order: OrderEntity;
  addedItems: Array<{
    productId: string;
    variantId: string;
    quantity: number;
    sku: string;
    metadata: ReturnType<typeof resolveGokwikComplimentaryMeta>;
  }>;
};

@Injectable()
export class GokwikComplimentaryOrderItemsService {
  private readonly logger = new Logger(GokwikComplimentaryOrderItemsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly ordersRepository: OrdersRepository,
    private readonly orderItemsRepository: OrderItemsRepository,
  ) {}

  async syncComplimentaryItems(
    userId: string,
    order: OrderEntity,
    lineItems: GokwikLineItemDto[] | undefined | null,
  ): Promise<GokwikComplimentarySyncResult> {
    const complimentaryItems = filterGokwikComplimentaryLineItems(lineItems);
    if (!complimentaryItems.length) {
      return { order, addedItems: [] };
    }

    const addedItems: GokwikComplimentarySyncResult['addedItems'] = [];

    await this.dataSource.transaction(async (manager) => {
      const current = await this.ordersRepository.findByIdAndUserId(order.id, userId, manager);
      if (!current) {
        throw new BadRequestException('Order not found while syncing complimentary items');
      }

      const existingVariantIds = new Set((current.items ?? []).map((item) => item.variantId));

      for (const lineItem of complimentaryItems) {
        if (existingVariantIds.has(lineItem.variant_id)) {
          this.logger.log(
            {
              orderId: current.id,
              orderNumber: current.orderNumber,
              variantId: lineItem.variant_id,
            },
            '[GoKwik] Complimentary line item already present on order — skipping duplicate',
          );
          continue;
        }

        const variant = await this.resolveActiveVariant(lineItem, manager);
        if (STOCK_VALIDATION_ENABLED && variant.stock < lineItem.quantity) {
          throw new BadRequestException(`Insufficient stock for SKU ${variant.sku}`);
        }

        const unitPrice = resolveGokwikComplimentaryUnitPrice();
        const totalPrice = resolveGokwikComplimentaryLineTotal(lineItem.quantity);
        const metadata = resolveGokwikComplimentaryMeta(lineItem);
        const variantName = variant.attributeValues?.length
          ? variant.attributeValues.map((value) => value.value).join(' / ')
          : null;

        const orderItemRefId = await generateUniqueRefId('order-item', (candidate) =>
          this.orderItemsRepository.existsByRefId(candidate),
        );

        await this.orderItemsRepository.createMany(
          [
            {
              refId: orderItemRefId,
              orderId: current.id,
              productId: lineItem.product_id,
              variantId: lineItem.variant_id,
              sku: variant.sku,
              productName: variant.product?.name ?? lineItem.title?.trim() ?? 'Complimentary item',
              variantName,
              quantity: lineItem.quantity,
              unitPrice: unitPrice.toFixed(2),
              totalPrice: totalPrice.toFixed(2),
              isSubscription: false,
              frequency: null,
              createdBy: userId,
              updatedBy: userId,
            },
          ],
          manager,
        );

        existingVariantIds.add(lineItem.variant_id);
        addedItems.push({
          productId: lineItem.product_id,
          variantId: lineItem.variant_id,
          quantity: lineItem.quantity,
          sku: variant.sku,
          metadata,
        });
      }
    });

    const refreshed = await this.ordersRepository.findByIdAndUserId(order.id, userId);
    if (!refreshed) {
      throw new BadRequestException('Order not found after syncing complimentary items');
    }

    if (addedItems.length) {
      this.logger.log(
        {
          orderId: refreshed.id,
          orderNumber: refreshed.orderNumber,
          addedCount: addedItems.length,
          addedItems,
        },
        '[GoKwik] Synced complimentary order items',
      );
    }

    return { order: refreshed, addedItems };
  }

  private async resolveActiveVariant(
    lineItem: GokwikLineItemDto,
    manager: EntityManager,
  ): Promise<ProductVariantEntity> {
    const variant = await manager
      .getRepository(ProductVariantEntity)
      .createQueryBuilder('variant')
      .innerJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('variant.attributeValues', 'attributeValues')
      .where('variant.id = :variantId', { variantId: lineItem.variant_id })
      .andWhere('variant.productId = :productId', { productId: lineItem.product_id })
      .andWhere('variant.deletedAt IS NULL')
      .andWhere('variant.status = :variantStatus', { variantStatus: VariantStatus.ACTIVE })
      .andWhere('product.status = :productStatus', { productStatus: ProductStatus.PUBLISHED })
      .getOne();

    if (!variant) {
      throw new BadRequestException(
        `Invalid complimentary product/variant (${lineItem.product_id}/${lineItem.variant_id})`,
      );
    }

    return variant;
  }
}
