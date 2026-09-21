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
  summarizeGokwikLineItemsForLog,
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
    stage = 'unspecified',
  ): Promise<GokwikComplimentarySyncResult> {
    const lineItemsSummary = summarizeGokwikLineItemsForLog(lineItems);
    const complimentaryItems = filterGokwikComplimentaryLineItems(lineItems);

    this.logger.log(
      {
        stage,
        orderId: order.id,
        orderNumber: order.orderNumber,
        lineItems: lineItemsSummary,
      },
      '[GoKwik] Inspecting complimentary line_items from GoKwik payload',
    );

    if (!complimentaryItems.length) {
      this.logger.warn(
        {
          stage,
          orderId: order.id,
          orderNumber: order.orderNumber,
          reason: lineItems == null
            ? 'line_items_missing'
            : lineItems.length === 0
              ? 'line_items_empty'
              : 'no_matching_complimentary_marker',
          expectedSource: lineItemsSummary.expectedComplimentarySource,
          expectedMarkers: ['is_freebie=true', `source=${lineItemsSummary.expectedComplimentarySource}`, 'price=0'],
          observedSources: lineItemsSummary.sources,
          totalLineItems: lineItemsSummary.totalCount,
        },
        '[GoKwik] No complimentary items synced — free product not detected on order',
      );
      return { order, addedItems: [] };
    }

    const addedItems: GokwikComplimentarySyncResult['addedItems'] = [];
    const skippedDuplicates: string[] = [];
    const repricedToZero: Array<{
      itemId: string;
      variantId: string;
      sku: string;
      previousUnitPrice: string;
      previousTotalPrice: string;
    }> = [];

    try {
      await this.dataSource.transaction(async (manager) => {
        const current = await this.ordersRepository.findByIdAndUserId(order.id, userId, manager);
        if (!current) {
          throw new BadRequestException('Order not found while syncing complimentary items');
        }

        const existingByVariantId = new Map(
          (current.items ?? []).map((item) => [item.variantId, item]),
        );

        for (const lineItem of complimentaryItems) {
          const metadata = resolveGokwikComplimentaryMeta(lineItem);
          const unitPrice = resolveGokwikComplimentaryUnitPrice(lineItem.price);
          const totalPrice = resolveGokwikComplimentaryLineTotal(
            lineItem.quantity,
            lineItem.price,
          );
          const existing = existingByVariantId.get(lineItem.variant_id);

          if (existing) {
            const previousUnitPrice = String(existing.unitPrice ?? '0.00');
            const previousTotalPrice = String(existing.totalPrice ?? '0.00');
            const alreadyZero =
              Number(previousUnitPrice) === 0 && Number(previousTotalPrice) === 0;

            if (!alreadyZero && existing.id) {
              await this.orderItemsRepository.updateById(
                existing.id,
                {
                  unitPrice: unitPrice.toFixed(2),
                  totalPrice: totalPrice.toFixed(2),
                  quantity: lineItem.quantity,
                  updatedBy: userId,
                },
                manager,
              );
              repricedToZero.push({
                itemId: existing.id,
                variantId: existing.variantId,
                sku: existing.sku,
                previousUnitPrice,
                previousTotalPrice,
              });
              this.logger.warn(
                {
                  stage,
                  orderId: current.id,
                  orderNumber: current.orderNumber,
                  variantId: lineItem.variant_id,
                  sku: existing.sku,
                  gokwikReportedPrice: lineItem.price ?? null,
                  previousUnitPrice,
                  previousTotalPrice,
                  forcedUnitPrice: unitPrice.toFixed(2),
                  forcedTotalPrice: totalPrice.toFixed(2),
                },
                '[GoKwik] Complimentary item existed with non-zero price — forced to 0.00 (no payment)',
              );
            } else {
              skippedDuplicates.push(lineItem.variant_id);
              this.logger.log(
                {
                  stage,
                  orderId: current.id,
                  orderNumber: current.orderNumber,
                  variantId: lineItem.variant_id,
                  sku: existing.sku,
                  source: lineItem.source,
                  gokwikReportedPrice: lineItem.price ?? null,
                  storedUnitPrice: previousUnitPrice,
                  storedTotalPrice: previousTotalPrice,
                },
                '[GoKwik] Complimentary line item already present on order at 0.00 — skipping duplicate',
              );
            }
            continue;
          }

          const variant = await this.resolveActiveVariant(lineItem, manager);
          if (variant.outOfStock) {
            throw new BadRequestException(`SKU ${variant.sku} is out of stock`);
          }
          if (STOCK_VALIDATION_ENABLED(variant) && variant.stock < lineItem.quantity) {
            throw new BadRequestException(`Insufficient stock for SKU ${variant.sku}`);
          }

          const variantName = variant.attributeValues?.length
            ? variant.attributeValues.map((value) => value.value).join(' / ')
            : null;

          const orderItemRefId = await generateUniqueRefId('order-item', (candidate) =>
            this.orderItemsRepository.existsByRefId(candidate),
          );

          this.logger.log(
            {
              stage,
              orderId: current.id,
              orderNumber: current.orderNumber,
              variantId: lineItem.variant_id,
              sku: variant.sku,
              gokwikReportedPrice: lineItem.price ?? null,
              gokwikReportedMrp: lineItem.mrp ?? null,
              gokwikReportedDiscount: lineItem.discount ?? null,
              forcedUnitPrice: unitPrice.toFixed(2),
              forcedTotalPrice: totalPrice.toFixed(2),
              note: 'GoKwik may send catalog price on freebies — we always store 0.00',
            },
            '[GoKwik] Adding complimentary order item at 0.00 (ignoring GoKwik line price)',
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

          existingByVariantId.set(lineItem.variant_id, {
            variantId: lineItem.variant_id,
            unitPrice: unitPrice.toFixed(2),
            totalPrice: totalPrice.toFixed(2),
          } as (typeof current.items)[number]);

          addedItems.push({
            productId: lineItem.product_id,
            variantId: lineItem.variant_id,
            quantity: lineItem.quantity,
            sku: variant.sku,
            metadata,
          });
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        {
          stage,
          orderId: order.id,
          orderNumber: order.orderNumber,
          complimentaryCount: complimentaryItems.length,
          candidates: complimentaryItems.map((item) => ({
            productId: item.product_id,
            variantId: item.variant_id,
            quantity: item.quantity,
            source: item.source,
            gokwikReportedPrice: item.price ?? null,
            title: item.title?.trim() || null,
          })),
          error: message,
        },
        '[GoKwik] Complimentary sync failed',
      );
      throw error;
    }

    const refreshed = await this.ordersRepository.findByIdAndUserId(order.id, userId);
    if (!refreshed) {
      throw new BadRequestException('Order not found after syncing complimentary items');
    }

    this.logger.log(
      {
        stage,
        orderId: refreshed.id,
        orderNumber: refreshed.orderNumber,
        complimentaryDetected: complimentaryItems.length,
        addedCount: addedItems.length,
        skippedDuplicates,
        repricedToZero,
        addedItems,
        orderItemCount: refreshed.items?.length ?? 0,
        orderItemSkus: (refreshed.items ?? []).map((item) => ({
          sku: item.sku,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          isZeroPrice: Number(item.unitPrice) === 0 && Number(item.totalPrice) === 0,
        })),
      },
      addedItems.length || repricedToZero.length
        ? '[GoKwik] Synced complimentary order items at 0.00'
        : '[GoKwik] Complimentary sync finished with no new items',
    );

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
