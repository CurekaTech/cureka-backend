import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { isPromotionalOffersEnabled } from '../utils/promotional-offers-enabled.util';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductType } from '@modules/product/enums/product-type.enum';
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
import { lineMatchesOfferScope, readOfferScope } from '../utils/offer-scope.util';

export type PublicOfferHighlight = {
  id: string;
  offerType: string;
  customerMessage: string;
};

function catalogTarget(variant: ProductVariantEntity, role: PromotionalOfferTargetRole, quantity: number | null) {
  return {
    role,
    variantId: variant.id,
    productId: variant.productId,
    quantity,
    sku: variant.sku,
    productName: rewardVariantName(variant),
    variantLabel: null as string | null,
    sellingPrice: Number(variant.sellingPrice),
    stock: variant.stock ?? 0,
    outOfStock: variant.outOfStock === true,
    purchasable:
      variant.status === VariantStatus.ACTIVE &&
      variant.product?.status === ProductStatus.PUBLISHED &&
      variant.deletedAt == null,
    stockValidation: isStockValidationEnabled(variant),
    productType: variant.product?.productType ?? null,
  };
}

/** Same title the cart uses, so a BOGO reward is not labeled as a sibling variant. */
function rewardVariantName(variant: ProductVariantEntity): string {
  const productName = variant.product?.name?.trim() ?? '';
  const displayName = variant.displayName?.trim() ?? '';
  if (variant.product?.productType === ProductType.VARIABLE) {
    return displayName || productName;
  }
  return productName || displayName;
}

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
      const targets: Array<ReturnType<typeof catalogTarget>> = [];
      for (const target of offer.targets ?? []) {
        const variant = await this.dataSource.getRepository(ProductVariantEntity).findOne({
          where: { id: target.variantId },
          relations: { product: true },
        });
        if (!variant) continue;
        targets.push(catalogTarget(variant, target.role, target.quantity));
      }
      await this.appendScopeTargets(offer, targets, params.lines);
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
    const variants = await this.dataSource.getRepository(ProductVariantEntity).find({
      where: { id: In([...wanted]) },
      relations: { product: true },
    });
    const productByVariant = new Map(variants.map((variant) => [variant.id, variant.product]));
    for (const offer of live) {
      if (!offer.code) continue;
      const customerMessage = offer.customerMessage?.trim();
      if (!customerMessage) continue;
      const highlight: PublicOfferHighlight = {
        id: offer.id,
        offerType: offer.offerType,
        customerMessage,
      };
      const scope = readOfferScope(offer.config);
      const seenOnOffer = new Set<string>();
      const attach = (variantId: string) => {
        if (!wanted.has(variantId) || seenOnOffer.has(variantId)) return;
        seenOnOffer.add(variantId);
        const list = result.get(variantId) ?? [];
        list.push(highlight);
        result.set(variantId, list);
      };
      for (const target of offer.targets ?? []) {
        if (
          target.role !== PromotionalOfferTargetRole.QUALIFYING &&
          target.role !== PromotionalOfferTargetRole.TIER_GROUP
        ) {
          continue;
        }
        attach(target.variantId);
      }
      if (!scope.brandIds.length && !scope.categoryIds.length) continue;
      for (const variantId of wanted) {
        const product = productByVariant.get(variantId);
        if (!product || !lineMatchesOfferScope(product, scope)) continue;
        attach(variantId);
      }
    }
    return result;
  }

  /** Adds each in-scope cart variant once as a BOGO qualifier or BMSM tier member. */
  private async appendScopeTargets(
    offer: PromotionalOfferEntity,
    targets: Array<ReturnType<typeof catalogTarget>>,
    lines: PromotionCustomerLine[],
  ): Promise<void> {
    const scope = readOfferScope(offer.config);
    if (!scope.brandIds.length && !scope.categoryIds.length) return;
    const role =
      offer.offerType === PromotionalOfferType.BOGO
        ? PromotionalOfferTargetRole.QUALIFYING
        : offer.offerType === PromotionalOfferType.BUY_MORE_SAVE_MORE
          ? PromotionalOfferTargetRole.TIER_GROUP
          : null;
    if (!role) return;
    const present = new Set(targets.filter((target) => target.role === role).map((target) => target.variantId));
    const ids = [
      ...new Set(
        lines
          .filter((line) => !line.isSubscription && line.productType !== 'bundle' && !present.has(line.variantId))
          .map((line) => line.variantId),
      ),
    ];
    if (!ids.length) return;
    const variants = await this.dataSource.getRepository(ProductVariantEntity).find({
      where: { id: In(ids) },
      relations: { product: true },
    });
    for (const variant of variants) {
      if (present.has(variant.id) || !lineMatchesOfferScope(variant.product ?? {}, scope)) continue;
      const row = catalogTarget(variant, role, null);
      if (!row.purchasable) continue;
      targets.push(row);
      present.add(variant.id);
    }
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
