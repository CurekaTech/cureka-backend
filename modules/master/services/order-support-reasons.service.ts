import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { ReasonMasterEntity } from '@modules/master/entities/reason-master.entity';
import { ReasonWorkflow } from '@modules/master/enums/reason-workflow.enum';
import { ReasonMastersRepository } from '@modules/master/repositories/reason-masters.repository';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { Repository } from 'typeorm';
import { mapStorefrontOrderSupportReason } from '../mappers/order-support-reason.mapper';

export interface OrderSupportContext {
  orderRefId: string;
  orderNumber: string;
  categoryRefIds: string[];
  skuRefs: string[];
}

@Injectable()
export class OrderSupportReasonsService {
  constructor(
    private readonly reasonMastersRepository: ReasonMastersRepository,
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
  ) {}

  async findActiveReasons(
    workflow: ReasonWorkflow,
    orderId?: string,
    userId?: string,
  ) {
    const orderContext = orderId
      ? await this.resolveOrderContext(orderId, userId)
      : null;

    if (orderId && !orderContext) {
      throw new NotFoundException('Order not found');
    }

    const reasons = await this.reasonMastersRepository.findActiveByWorkflow(workflow);
    const filtered = reasons.filter((reason) =>
      this.matchesOrderContext(reason, orderContext),
    );

    return filtered.map(mapStorefrontOrderSupportReason);
  }

  async resolveOrderContext(
    orderId: string,
    userId?: string,
  ): Promise<OrderSupportContext | null> {
    const trimmed = orderId.trim();
    if (!trimmed) return null;

    const order = await this.orderRepo.findOne({
      where: [
        { refId: trimmed },
        { orderNumber: trimmed },
        { id: trimmed },
      ],
      relations: {
        items: {
          product: {
            category: true,
            subCategory: true,
            subSubCategory: true,
            subSubSubCategory: true,
          },
        },
      },
      order: { items: { createdAt: 'ASC' } },
    });

    if (!order) return null;

    if (userId && order.userId !== userId) {
      throw new ForbiddenException('You do not have access to this order');
    }

    const categoryRefIds = new Set<string>();
    const skuRefs = new Set<string>();

    for (const item of order.items ?? []) {
      if (item.sku) skuRefs.add(item.sku);

      const product = item.product;
      if (!product) continue;

      for (const category of [
        product.category,
        product.subCategory,
        product.subSubCategory,
        product.subSubSubCategory,
      ]) {
        if (category?.refId) {
          categoryRefIds.add(category.refId);
        }
      }
    }

    return {
      orderRefId: order.refId,
      orderNumber: order.orderNumber,
      categoryRefIds: [...categoryRefIds],
      skuRefs: [...skuRefs],
    };
  }

  async findReasonByRefId(refId: string): Promise<ReasonMasterEntity | null> {
    return this.reasonMastersRepository.findByRefId(refId);
  }

  private matchesOrderContext(
    reason: ReasonMasterEntity,
    orderContext: OrderSupportContext | null,
  ): boolean {
    const categoryFilter = reason.categoryRefIds ?? [];
    const skuFilter = reason.skuRefs ?? [];

    if (!categoryFilter.length && !skuFilter.length) {
      return true;
    }

    if (!orderContext) {
      return false;
    }

    const categoryMatch =
      !categoryFilter.length ||
      categoryFilter.some((refId) => orderContext.categoryRefIds.includes(refId));

    const skuMatch =
      !skuFilter.length ||
      skuFilter.some((sku) => orderContext.skuRefs.includes(sku));

    return categoryMatch && skuMatch;
  }
}
