import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderItemEntity } from '@modules/orders/entities/order-item.entity';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { IOrderItemReturnPolicySnapshot } from '@modules/orders/interfaces/order-item-return-policy.interface';
import {
  buildLegacyFallbackSnapshot,
} from '@modules/orders/utils/return-policy-snapshot.util';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { ReturnResolution } from '../enums/return-resolution.enum';
import {
  IOrderReturnEligibility,
  IReturnItemEligibility,
  ReturnIneligibilityCode,
} from '../interfaces/return-eligibility.interface';
import { ReturnRequestsRepository } from '../repositories/return-requests.repository';
import { isWithinWindow, resolveWindowExpiry } from '../utils/return-window.util';

const MESSAGES: Record<ReturnIneligibilityCode, string> = {
  ITEM_NOT_DELIVERED: 'Returns can be requested only after the order is delivered.',
  DELIVERY_DATE_UNAVAILABLE:
    'We could not confirm the delivery date for this order. Please contact support.',
  RETURN_NOT_ALLOWED: 'This product is not eligible for return.',
  RETURN_WINDOW_EXPIRED: 'The return window for this item has closed.',
  RETURN_QUANTITY_EXCEEDED: 'A return has already been requested for this item.',
  ACTIVE_RETURN_ALREADY_EXISTS: 'A return request for this item is already in progress.',
  ORDER_IS_RTO: 'This order was returned to origin and is handled separately.',
  RETURN_POLICY_NOT_AVAILABLE: 'Return policy details are unavailable for this item.',
};

export interface IEligibilityOptions {
  /**
   * Expired-product claims bypass the window check but never bypass the
   * "product is not returnable" or quantity rules.
   */
  isExpiredProductClaim?: boolean;
  manager?: EntityManager;
  now?: Date;
}

/**
 * Single source of truth for "can this order item be returned right now".
 *
 * Both the customer eligibility endpoint and the return-creation path call this,
 * so the storefront can never be shown one answer and be validated against another.
 */
@Injectable()
export class ReturnEligibilityService {
  constructor(
    private readonly returnRequestsRepository: ReturnRequestsRepository,
    @InjectRepository(ProductVariantEntity)
    private readonly variantsRepository: Repository<ProductVariantEntity>,
  ) {}

  async evaluateOrder(
    order: OrderEntity,
    options: IEligibilityOptions = {},
  ): Promise<IOrderReturnEligibility> {
    const now = options.now ?? new Date();
    const items = order.items ?? [];
    const snapshots = await this.resolveSnapshots(items, now);
    const committed = await this.returnRequestsRepository.sumCommittedQuantityByOrderItem(
      items.map((item) => item.id),
      { manager: options.manager },
    );

    const isRto = order.orderStatus === OrderStatus.RTO;
    const deliveredAt = order.deliveredAt ?? null;
    const isDelivered = order.orderStatus === OrderStatus.DELIVERED;

    const evaluated = items.map((item) =>
      this.evaluateItem({
        item,
        policy: snapshots.get(item.id)!,
        committedQuantity: committed.get(item.id) ?? 0,
        deliveredAt,
        isDelivered,
        isRto,
        isExpiredProductClaim: options.isExpiredProductClaim ?? false,
        now,
      }),
    );

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      isRto,
      hasEligibleItems: evaluated.some((item) => item.canReturn || item.canReplace),
      items: evaluated,
    };
  }

  private evaluateItem(params: {
    item: OrderItemEntity;
    policy: IOrderItemReturnPolicySnapshot;
    committedQuantity: number;
    deliveredAt: Date | null;
    isDelivered: boolean;
    isRto: boolean;
    isExpiredProductClaim: boolean;
    now: Date;
  }): IReturnItemEligibility {
    const { item, policy, committedQuantity, deliveredAt, now } = params;
    const availableQuantity = Math.max(0, item.quantity - committedQuantity);

    const returnWindowExpiresAt = resolveWindowExpiry(
      deliveredAt,
      policy.returnWindow,
      policy.returnWindowUnit,
    );
    const replacementWindowExpiresAt = resolveWindowExpiry(
      deliveredAt,
      policy.replacementWindow,
      policy.replacementWindowUnit,
    );

    const base = {
      orderItemId: item.id,
      productId: item.productId,
      variantId: item.variantId,
      sku: item.sku,
      productName: item.productName,
      variantName: item.variantName,
      orderedQuantity: item.quantity,
      deliveredQuantity: params.isDelivered ? item.quantity : 0,
      committedQuantity,
      availableQuantity,
      unitPrice: item.unitPrice,
      deliveredAt,
      returnWindowExpiresAt,
      replacementWindowExpiresAt,
      policy,
    };

    const reject = (code: ReturnIneligibilityCode): IReturnItemEligibility => ({
      ...base,
      canReturn: false,
      canReplace: false,
      canRequestRefund: false,
      allowedResolutions: [],
      ineligibilityCode: code,
      ineligibilityMessage: MESSAGES[code],
    });

    if (params.isRto) {
      return reject('ORDER_IS_RTO');
    }
    if (!params.isDelivered) {
      return reject('ITEM_NOT_DELIVERED');
    }
    if (!deliveredAt) {
      return reject('DELIVERY_DATE_UNAVAILABLE');
    }
    if (!policy.returnable && !policy.replaceable) {
      return reject('RETURN_NOT_ALLOWED');
    }
    if (availableQuantity <= 0) {
      return reject(
        committedQuantity >= item.quantity
          ? 'ACTIVE_RETURN_ALREADY_EXISTS'
          : 'RETURN_QUANTITY_EXCEEDED',
      );
    }

    // The expired-product exception waives only the window, never the policy.
    const withinReturnWindow =
      params.isExpiredProductClaim || isWithinWindow(returnWindowExpiresAt, now);
    const withinReplacementWindow =
      params.isExpiredProductClaim || isWithinWindow(replacementWindowExpiresAt, now);

    const canReturn = policy.returnable && withinReturnWindow;
    const canReplace = policy.replaceable && withinReplacementWindow;

    if (!canReturn && !canReplace) {
      return reject('RETURN_WINDOW_EXPIRED');
    }

    const allowedResolutions: ReturnResolution[] = [];
    const canRequestRefund = canReturn && policy.refundable;
    if (canRequestRefund) {
      allowedResolutions.push(ReturnResolution.REFUND);
    }
    if (canReplace) {
      allowedResolutions.push(ReturnResolution.REPLACEMENT);
    }

    if (allowedResolutions.length === 0) {
      return reject('RETURN_NOT_ALLOWED');
    }

    return {
      ...base,
      canReturn,
      canReplace,
      canRequestRefund,
      allowedResolutions,
      ineligibilityCode: null,
      ineligibilityMessage: null,
    };
  }

  /**
   * Items placed before the snapshot column existed fall back to the live
   * catalogue under conservative rules rather than being treated as returnable.
   */
  private async resolveSnapshots(
    items: OrderItemEntity[],
    now: Date,
  ): Promise<Map<string, IOrderItemReturnPolicySnapshot>> {
    const result = new Map<string, IOrderItemReturnPolicySnapshot>();
    const legacyItems = items.filter((item) => !item.returnPolicySnapshot);

    for (const item of items) {
      if (item.returnPolicySnapshot) {
        result.set(item.id, item.returnPolicySnapshot);
      }
    }
    if (legacyItems.length === 0) {
      return result;
    }

    const variants = await this.variantsRepository.find({
      where: { id: In([...new Set(legacyItems.map((item) => item.variantId))]) },
      relations: { product: true },
    });
    const variantsById = new Map(variants.map((variant) => [variant.id, variant]));

    for (const item of legacyItems) {
      const variant = variantsById.get(item.variantId) ?? null;
      result.set(
        item.id,
        buildLegacyFallbackSnapshot(variant?.product ?? null, variant, now),
      );
    }
    return result;
  }
}
