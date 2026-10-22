import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AdminSettingsService } from '@modules/admin-settings/services/admin-settings.service';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { isStockValidationEnabled } from '@packages/common';
import { PromotionalOfferTargetRole } from '../enums/promotional-offer-target-role.enum';
import { PromotionalOffersRepository } from '../repositories/promotional-offers.repository';
import { PromotionalOfferReservationsRepository } from '../repositories/promotional-offer-reservations.repository';
import {
  evaluatePromotionalOffers,
  PromotionCustomerLine,
  PromotionEvaluation,
  PromotionOfferInput,
} from '../utils/promotional-offer-pricing.util';

const EMPTY: PromotionEvaluation = {
  promotionDiscount: 0,
  bmsmDiscount: 0,
  rewardCharged: 0,
  rewardCatalogSavings: 0,
  lineAllocations: [],
  rewardLines: [],
  promotions: [],
  warnings: [],
  appliedOfferIds: [],
};

@Injectable()
export class PromotionalOfferEvaluationService {
  constructor(
    private readonly adminSettingsService: AdminSettingsService,
    private readonly offersRepository: PromotionalOffersRepository,
    private readonly reservationsRepository: PromotionalOfferReservationsRepository,
    private readonly dataSource: DataSource,
  ) {}

  async evaluateForCart(params: {
    userId: string;
    lines: PromotionCustomerLine[];
    customerSubtotal: number;
    excludeOfferIds?: string[];
  }): Promise<PromotionEvaluation> {
    const enabled = await this.adminSettingsService.isPromotionalOffersEnabled();
    if (!enabled) {
      return { ...EMPTY, warnings: [{ code: 'OFFERS_DISABLED', message: 'Promotional offers are disabled' }] };
    }
    const live = await this.offersRepository.findLive();
    const excluded = new Set(params.excludeOfferIds ?? []);
    const inputs: PromotionOfferInput[] = [];
    for (const offer of live) {
      if (offer.status !== MasterStatus.ACTIVE || excluded.has(offer.id)) continue;
      const targets = [];
      for (const target of offer.targets ?? []) {
        const variant = await this.dataSource.getRepository(ProductVariantEntity).findOne({
          where: { id: target.variantId },
          relations: { product: true },
        });
        if (!variant) continue;
        targets.push({
          role: target.role,
          variantId: variant.id,
          productId: variant.productId,
          quantity: target.quantity,
          sku: variant.sku,
          productName: variant.product?.name ?? '',
          variantLabel: null,
          sellingPrice: Number(variant.sellingPrice),
          stock: variant.stock ?? 0,
          outOfStock: variant.outOfStock === true,
          purchasable:
            variant.status === VariantStatus.ACTIVE &&
            variant.product?.status === ProductStatus.PUBLISHED &&
            variant.deletedAt == null,
          stockValidation: isStockValidationEnabled(variant),
          productType: variant.product?.productType ?? null,
        });
      }
      const [globalCount, userCount] = await Promise.all([
        this.reservationsRepository.countActive(offer.id),
        this.reservationsRepository.countActive(offer.id, params.userId),
      ]);
      inputs.push({
        id: offer.id,
        refId: offer.refId,
        name: offer.name,
        customerMessage: offer.customerMessage,
        offerType: offer.offerType,
        priority: offer.priority,
        createdAt: offer.createdAt.toISOString(),
        config: offer.config ?? {},
        targets,
        remainingGlobal: offer.usageLimit === null ? null : offer.usageLimit - globalCount,
        remainingUser: offer.sameUserLimit === null ? null : offer.sameUserLimit - userCount,
      });
    }
    return evaluatePromotionalOffers(params.lines, inputs, params.customerSubtotal);
  }

  async publicMessagesForVariant(variantId: string): Promise<Array<{ id: string; offerType: string; customerMessage: string }>> {
    const enabled = await this.adminSettingsService.isPromotionalOffersEnabled();
    if (!enabled || !variantId) return [];
    const live = await this.offersRepository.findLive();
    return live
      .filter((offer) =>
        (offer.targets ?? []).some(
          (target) =>
            target.variantId === variantId &&
            (target.role === PromotionalOfferTargetRole.QUALIFYING ||
              target.role === PromotionalOfferTargetRole.TIER_GROUP),
        ),
      )
      .map((offer) => ({
        id: offer.id,
        offerType: offer.offerType,
        customerMessage: offer.customerMessage,
      }));
  }
}
