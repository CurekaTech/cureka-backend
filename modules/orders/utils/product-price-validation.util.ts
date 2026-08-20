import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductSubscriptionFrequency } from '@modules/subscription/enums/product-subscription-frequency.enum';
import { ProductSubscriptionConfigService } from '@modules/subscription/services/product-subscription-config.service';
import { ProductSubscriptionPricingService } from '@modules/subscription/services/product-subscription-pricing.service';
import { MembershipBenefitsApplicationService } from '@modules/subscription/services/membership-benefits-application.service';

const PRICE_TOLERANCE = 0.01;

export type ProductPriceLine = {
  productId: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  totalPrice?: number;
  isSubscription?: boolean;
  frequency?: ProductSubscriptionFrequency | string | null;
  sku?: string;
};

/**
 * Ensures order/payment lines still match current catalog product prices.
 * Does not validate coupons, shipping, fees, or GoKwik commercial totals.
 */
export async function assertCurrentProductPrices(
  lines: ProductPriceLine[],
  manager: EntityManager,
  options?: {
    userId?: string;
    subscriptionConfigService?: ProductSubscriptionConfigService;
    subscriptionPricingService?: ProductSubscriptionPricingService;
    membershipBenefits?: MembershipBenefitsApplicationService;
  },
): Promise<void> {
  if (!lines.length) {
    return;
  }

  const memberDiscount =
    options?.userId && options.membershipBenefits
      ? await options.membershipBenefits.getMemberDiscount(options.userId)
      : null;

  for (const line of lines) {
    const variant = await manager.getRepository(ProductVariantEntity).findOne({
      where: { id: line.variantId },
    });
    if (!variant) {
      throw new BadRequestException(
        `Variant not found while validating price${line.sku ? ` for SKU ${line.sku}` : ''}`,
      );
    }

    const catalogPrice = Number(variant.sellingPrice);
    if (!Number.isFinite(catalogPrice) || catalogPrice < 0) {
      throw new BadRequestException(`Invalid catalog price for SKU ${variant.sku}`);
    }

    if (line.isSubscription) {
      if (!options?.subscriptionConfigService || !options?.subscriptionPricingService) {
        // Without subscription services, fall back to catalog unit check on unitPrice.
        if (Math.abs(line.unitPrice - catalogPrice) > PRICE_TOLERANCE) {
          throw new BadRequestException(
            `Product price changed for SKU ${variant.sku}. Please refresh cart and retry.`,
          );
        }
        continue;
      }

      const frequency = line.frequency as ProductSubscriptionFrequency | null;
      if (!frequency) {
        throw new BadRequestException(`Subscription line missing frequency for SKU ${variant.sku}`);
      }
      const config = await options.subscriptionConfigService.findEntityForProductVariant(
        line.productId,
        line.variantId,
      );
      if (!config?.enabled) {
        throw new BadRequestException(`Subscription is no longer enabled for SKU ${variant.sku}`);
      }
      const pricing = options.subscriptionPricingService.calculate(
        variant.sellingPrice,
        line.quantity,
        config.discountType,
        config.discountValue,
        memberDiscount,
      );
      const expectedTotal = Number(pricing.finalAmount);
      const actualTotal =
        line.totalPrice != null
          ? Number(line.totalPrice)
          : Number(line.unitPrice) * Math.max(1, line.quantity);
      if (Math.abs(expectedTotal - actualTotal) > PRICE_TOLERANCE) {
        throw new BadRequestException(
          `Product price changed for SKU ${variant.sku}. Please refresh cart and retry.`,
        );
      }
      continue;
    }

    if (Math.abs(line.unitPrice - catalogPrice) > PRICE_TOLERANCE) {
      throw new BadRequestException(
        `Product price changed for SKU ${variant.sku}. Please refresh cart and retry.`,
      );
    }
  }
}
