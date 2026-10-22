import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { isPromotionalOffersEnabled } from '../utils/promotional-offers-enabled.util';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { isStockValidationEnabled } from '@packages/common';
import { PromotionalOfferTargetRole } from '../enums/promotional-offer-target-role.enum';
import { PromotionalOfferType } from '../enums/promotional-offer-type.enum';
import { PromotionalOfferEntity } from '../entities/promotional-offer.entity';
import { PromotionalOffersRepository } from '../repositories/promotional-offers.repository';
import { PromotionalOfferReservationsRepository } from '../repositories/promotional-offer-reservations.repository';
import {
  evaluatePromotionalOffers,
  PromotionCustomerLine,
  PromotionEvaluation,
  PromotionOfferInput,
} from '../utils/promotional-offer-pricing.util';

export type PublicOfferHighlight = {
  id: string;
  offerType: string;
  customerMessage: string;
};

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
    private readonly configService: ConfigService,
    private readonly offersRepository: PromotionalOffersRepository,
    private readonly reservationsRepository: PromotionalOfferReservationsRepository,
    private readonly dataSource: DataSource,
  ) {}

  findOfferForPricing(id: string): Promise<PromotionalOfferEntity | null> {
    return this.offersRepository.findById(id);
  }

  findOfferByCode(code: string): Promise<PromotionalOfferEntity | null> {
    return this.offersRepository.findByNormalizedCode(code);
  }

  listLiveOffers(): Promise<PromotionalOfferEntity[]> {
    return this.offersRepository.findLive();
  }

  async evaluateForCart(params: {
    userId: string;
    lines: PromotionCustomerLine[];
    customerSubtotal: number;
    excludeOfferIds?: string[];
    offerId?: string | null;
  }): Promise<PromotionEvaluation> {
    if (!params.offerId) return { ...EMPTY, warnings: [] };
    const enabled = isPromotionalOffersEnabled(this.configService);
    if (!enabled) {
      return { ...EMPTY, warnings: [{ code: 'OFFERS_DISABLED', message: 'Promotional offers are disabled' }] };
    }
    const selected = await this.offersRepository.findById(params.offerId);
    if (!selected?.code) {
      return { ...EMPTY, warnings: [{ code: 'OFFER_UNAVAILABLE', message: 'Promotional offer is not available' }] };
    }
    const now = new Date();
    if (selected.status !== MasterStatus.ACTIVE) {
      return { ...EMPTY, warnings: [{ code: 'OFFER_DISABLED', message: 'Promotional offer is not active' }] };
    }
    if (now < selected.startDate || now > selected.expiryDate) {
      return { ...EMPTY, warnings: [{ code: 'OFFER_EXPIRED', message: 'Promotional offer is not valid right now' }] };
    }
    const live = [selected];
    const excluded = new Set(params.excludeOfferIds ?? []);
    const inputs: PromotionOfferInput[] = [];
    for (const offer of live) {
      if (offer.status !== MasterStatus.ACTIVE || excluded.has(offer.id) || !offer.code) continue;
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
        code: offer.code,
        createdAt: offer.createdAt.toISOString(),
        config: offer.config ?? {},
        targets,
        remainingGlobal: offer.usageLimit === null ? null : offer.usageLimit - globalCount,
        remainingUser: offer.sameUserLimit === null ? null : offer.sameUserLimit - userCount,
      });
    }
    return evaluatePromotionalOffers(params.lines, inputs, params.customerSubtotal, params.offerId);
  }

  async publicMessagesForVariant(variantId: string): Promise<PublicOfferHighlight[]> {
    const messages = await this.publicMessagesByVariantIds(variantId ? [variantId] : []);
    return messages.get(variantId) ?? [];
  }

  /** One live-offer load for every variant on a listing, homepage, or cart. */
  async publicMessagesByVariantIds(variantIds: string[]): Promise<Map<string, PublicOfferHighlight[]>> {
    const result = new Map<string, PublicOfferHighlight[]>();
    const wanted = new Set(variantIds.filter(Boolean));
    if (!isPromotionalOffersEnabled(this.configService) || wanted.size === 0) return result;

    const live = await this.offersRepository.findLive();
    for (const offer of live) {
      if (!offer.code) continue;
      const customerMessage = offer.customerMessage?.trim();
      if (!customerMessage) continue;
      const highlight: PublicOfferHighlight = {
        id: offer.id,
        offerType: offer.offerType,
        customerMessage,
      };
      const seenOnOffer = new Set<string>();
      for (const target of offer.targets ?? []) {
        if (!wanted.has(target.variantId) || seenOnOffer.has(target.variantId)) continue;
        if (
          target.role !== PromotionalOfferTargetRole.QUALIFYING &&
          target.role !== PromotionalOfferTargetRole.TIER_GROUP
        ) {
          continue;
        }
        seenOnOffer.add(target.variantId);
        const list = result.get(target.variantId) ?? [];
        list.push(highlight);
        result.set(target.variantId, list);
      }
    }
    return result;
  }

  /** Cart-value gifts have no product card. The cart shows their customer message. */
  async publicGiftMessages(): Promise<string[]> {
    if (!isPromotionalOffersEnabled(this.configService)) return [];
    const live = await this.offersRepository.findLive();
    const messages: string[] = [];
    const seen = new Set<string>();
    for (const offer of live) {
      if (!offer.code || offer.offerType !== PromotionalOfferType.GIFT_ON_CART_VALUE) continue;
      const message = offer.customerMessage?.trim();
      if (!message || seen.has(message)) continue;
      seen.add(message);
      messages.push(message);
    }
    return messages;
  }

  async assignPublicOffers<T extends { variantId?: string | null }>(
    rows: T[],
  ): Promise<Array<T & { offers: PublicOfferHighlight[] }>> {
    const messages = await this.publicMessagesByVariantIds(
      rows.map((row) => row.variantId).filter((id): id is string => Boolean(id)),
    );
    return rows.map((row) => ({
      ...row,
      offers: row.variantId ? messages.get(row.variantId) ?? [] : [],
    }));
  }

  /** Writes `offers` onto storefront cards nested in a homepage or landing payload. */
  async attachPublicOffersDeep(root: unknown): Promise<void> {
    const cards: Array<{ variantId?: string | null; offers?: PublicOfferHighlight[] }> = [];
    const seen = new WeakSet<object>();
    const visit = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      if (seen.has(value as object)) return;
      seen.add(value as object);
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (isStorefrontProductCard(value)) cards.push(value);
      Object.values(value as Record<string, unknown>).forEach(visit);
    };
    visit(root);
    if (!cards.length) return;
    const messages = await this.publicMessagesByVariantIds(
      cards.map((card) => card.variantId).filter((id): id is string => Boolean(id)),
    );
    for (const card of cards) {
      card.offers = card.variantId ? messages.get(card.variantId) ?? [] : [];
    }
  }
}

function isStorefrontProductCard(
  value: object,
): value is { variantId?: string | null; offers?: PublicOfferHighlight[] } {
  const record = value as Record<string, unknown>;
  const pricing = record.pricing;
  return (
    pricing != null &&
    typeof pricing === 'object' &&
    typeof (pricing as { sellingPrice?: unknown }).sellingPrice === 'number' &&
    ('variantId' in record || 'defaultVariantId' in record)
  );
}
