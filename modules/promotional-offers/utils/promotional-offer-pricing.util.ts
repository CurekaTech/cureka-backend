import { roundMoney } from '@modules/orders/utils/money.util';
import { PromotionalOfferTargetRole } from '../enums/promotional-offer-target-role.enum';
import { PromotionalOfferType } from '../enums/promotional-offer-type.enum';
import { RewardPricing } from '../enums/reward-pricing.enum';

export type PromotionCustomerLine = {
  id: string;
  productId: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  sku: string;
  productName: string;
  variantLabel: string | null;
  isSubscription: boolean;
  productType: string | null;
};

export type PromotionCatalogTarget = {
  role: PromotionalOfferTargetRole;
  variantId: string;
  productId: string;
  quantity: number | null;
  sku: string;
  productName: string;
  variantLabel: string | null;
  sellingPrice: number;
  stock: number;
  outOfStock: boolean;
  purchasable: boolean;
  stockValidation: boolean;
  productType: string | null;
};

export type PromotionOfferInput = {
  id: string;
  refId: string;
  name: string;
  customerMessage: string;
  offerType: PromotionalOfferType;
  code?: string | null;
  createdAt: string;
  config: Record<string, unknown>;
  targets: PromotionCatalogTarget[];
  remainingGlobal: number | null;
  remainingUser: number | null;
};

export type PromotionRewardLine = {
  promotionOfferId: string;
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  variantLabel: string | null;
  quantity: number;
  catalogUnitPrice: number;
  chargedUnitPrice: number;
  totalPrice: number;
  promotionDiscount: number;
};

export type PromotionEvaluation = {
  promotionDiscount: number;
  bmsmDiscount: number;
  rewardCharged: number;
  rewardCatalogSavings: number;
  lineAllocations: Array<{ lineId: string; promotionOfferId: string; promotionDiscount: number }>;
  rewardLines: PromotionRewardLine[];
  promotions: Array<{
    id: string;
    name: string;
    offerType: PromotionalOfferType;
    customerMessage: string;
    discountAmount: number;
    code?: string | null;
  }>;
  warnings: Array<{ code: string; message: string }>;
  appliedOfferIds: string[];
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

const num = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const chargedUnit = (sellingPrice: number, pricing: string, value: number): number => {
  if (pricing === RewardPricing.FREE) return 0;
  if (pricing === RewardPricing.PERCENTAGE) {
    const rate = Math.min(Math.max(value, 0), 100);
    return roundMoney(sellingPrice * (1 - rate / 100));
  }
  return Math.max(0, roundMoney(sellingPrice - value));
};

const REWARD_STOCK_NOTE = 'The free item is out of stock, so this offer cannot be applied right now.';

const availableForReward = (target: PromotionCatalogTarget, customerQty: number): number => {
  if (!target.purchasable || target.outOfStock) return 0;
  // No stock figure and qty checks are off: the catalog is not tracking units.
  if (!target.stockValidation && target.stock <= 0) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, target.stock - customerQty);
};

const customerQty = (lines: PromotionCustomerLine[], variantId: string): number =>
  lines
    .filter((line) => line.variantId === variantId && !line.isSubscription && line.productType !== 'bundle')
    .reduce((sum, line) => sum + line.quantity, 0);

export const evaluatePromotionalOffers = (
  lines: PromotionCustomerLine[],
  offers: PromotionOfferInput[],
  customerSubtotal: number,
  onlyOfferId?: string,
): PromotionEvaluation => {
  const eligibleLines = lines.filter((line) => !line.isSubscription && line.productType !== 'bundle');
  const ordered = onlyOfferId
    ? offers.filter((offer) => offer.id === onlyOfferId).slice(0, 1)
    : offers.slice(0, 1);
  if (!eligibleLines.length || !ordered.length) return { ...EMPTY, warnings: [] };

  const claimed = new Set<string>();
  const result: PromotionEvaluation = {
    ...EMPTY,
    lineAllocations: [],
    rewardLines: [],
    promotions: [],
    warnings: [],
    appliedOfferIds: [],
  };

  for (const offer of ordered) {
    if (
      (offer.remainingGlobal !== null && offer.remainingGlobal <= 0) ||
      (offer.remainingUser !== null && offer.remainingUser <= 0)
    ) {
      result.warnings.push({
        code: 'OFFER_LIMIT_REACHED',
        message: `${offer.name} has reached its usage limit`,
      });
      continue;
    }

    if (offer.offerType === PromotionalOfferType.BOGO) {
      applyBogo(offer, eligibleLines, result, claimed);
    } else if (offer.offerType === PromotionalOfferType.BUY_X_GET_Y) {
      applyBuyXGetY(offer, eligibleLines, result, claimed);
    } else if (offer.offerType === PromotionalOfferType.GIFT_ON_CART_VALUE) {
      applyGift(offer, customerSubtotal, eligibleLines, result, claimed);
    } else if (offer.offerType === PromotionalOfferType.BUY_MORE_SAVE_MORE) {
      applyBuyMoreSaveMore(offer, eligibleLines, result, claimed);
    }
  }

  result.promotionDiscount = roundMoney(result.bmsmDiscount + result.rewardCatalogSavings);
  result.bmsmDiscount = roundMoney(result.bmsmDiscount);
  result.rewardCharged = roundMoney(result.rewardCharged);
  result.rewardCatalogSavings = roundMoney(result.rewardCatalogSavings);
  return result;
};

const pushReward = (
  offer: PromotionOfferInput,
  target: PromotionCatalogTarget,
  quantity: number,
  result: PromotionEvaluation,
): boolean => {
  const customerAlready = 0;
  const available = availableForReward(target, customerAlready);
  if (quantity > available) {
    result.warnings.push({
      code: target.role === PromotionalOfferTargetRole.GIFT ? 'GIFT_UNAVAILABLE' : 'REWARD_OUT_OF_STOCK',
      message: REWARD_STOCK_NOTE,
    });
    return false;
  }
  const pricing = String(offer.config['rewardPricing'] ?? RewardPricing.FREE);
  const value = num(offer.config['rewardDiscountValue']);
  const charged = target.role === PromotionalOfferTargetRole.GIFT
    ? 0
    : chargedUnit(target.sellingPrice, pricing, value);
  const catalogSavings = roundMoney((target.sellingPrice - charged) * quantity);
  result.rewardLines.push({
    promotionOfferId: offer.id,
    productId: target.productId,
    variantId: target.variantId,
    sku: target.sku,
    productName: target.productName,
    variantLabel: target.variantLabel,
    quantity,
    catalogUnitPrice: target.sellingPrice,
    chargedUnitPrice: charged,
    totalPrice: roundMoney(charged * quantity),
    promotionDiscount: catalogSavings,
  });
  result.rewardCharged += charged * quantity;
  result.rewardCatalogSavings += catalogSavings;
  return true;
};

const applyBogo = (
  offer: PromotionOfferInput,
  lines: PromotionCustomerLine[],
  result: PromotionEvaluation,
  claimed: Set<string>,
): void => {
  const target = offer.targets.find((row) => row.role === PromotionalOfferTargetRole.QUALIFYING);
  if (!target) return;
  const qualifyingQuantity = Math.max(1, Math.floor(num(offer.config['qualifyingQuantity'])));
  const rewardQuantity = Math.max(1, Math.floor(num(offer.config['rewardQuantity'])));
  const maxReward = offer.config['maxRewardQuantity'] == null ? null : Math.floor(num(offer.config['maxRewardQuantity']));
  const bought = customerQty(lines, target.variantId);
  let reward = Math.floor(bought / qualifyingQuantity) * rewardQuantity;
  if (maxReward !== null) reward = Math.min(reward, maxReward);
  if (reward <= 0) {
    if (bought > 0) {
      result.warnings.push({
        code: 'OFFER_INELIGIBLE',
        message: 'Add the required quantity of this product to use this offer.',
      });
    }
    return;
  }
  const held = customerQty(lines, target.variantId);
  const available = availableForReward(target, held);
  if (reward > available) {
    result.warnings.push({ code: 'REWARD_OUT_OF_STOCK', message: REWARD_STOCK_NOTE });
    return;
  }
  const pricing = String(offer.config['rewardPricing'] ?? RewardPricing.FREE);
  const value = num(offer.config['rewardDiscountValue']);
  const charged = chargedUnit(target.sellingPrice, pricing, value);
  const catalogSavings = roundMoney((target.sellingPrice - charged) * reward);
  result.rewardLines.push({
    promotionOfferId: offer.id,
    productId: target.productId,
    variantId: target.variantId,
    sku: target.sku,
    productName: target.productName,
    variantLabel: target.variantLabel,
    quantity: reward,
    catalogUnitPrice: target.sellingPrice,
    chargedUnitPrice: charged,
    totalPrice: roundMoney(charged * reward),
    promotionDiscount: catalogSavings,
  });
  result.rewardCharged += charged * reward;
  result.rewardCatalogSavings += catalogSavings;
  claimed.add(target.variantId);
  result.appliedOfferIds.push(offer.id);
  result.promotions.push({
    id: offer.id,
    name: offer.name,
    offerType: offer.offerType,
    customerMessage: offer.customerMessage,
    code: offer.code ?? null,
    discountAmount: catalogSavings,
  });
};

const applyBuyXGetY = (
  offer: PromotionOfferInput,
  lines: PromotionCustomerLine[],
  result: PromotionEvaluation,
  claimed: Set<string>,
): void => {
  const qualifying = offer.targets.filter((row) => row.role === PromotionalOfferTargetRole.QUALIFYING);
  const reward = offer.targets.find((row) => row.role === PromotionalOfferTargetRole.REWARD);
  if (!qualifying.length || !reward || !reward.quantity) return;
  const sets = qualifying.reduce((min, target) => {
    const needed = Math.max(1, target.quantity ?? 1);
    return Math.min(min, Math.floor(customerQty(lines, target.variantId) / needed));
  }, Number.MAX_SAFE_INTEGER);
  const maxReward = offer.config['maxRewardQuantity'] == null ? null : Math.floor(num(offer.config['maxRewardQuantity']));
  let quantity = sets * Math.max(1, reward.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return;
  if (maxReward !== null) quantity = Math.min(quantity, maxReward);
  const available = availableForReward(reward, customerQty(lines, reward.variantId));
  if (quantity > available) {
    result.warnings.push({ code: 'REWARD_OUT_OF_STOCK', message: REWARD_STOCK_NOTE });
    return;
  }
  if (!pushReward(offer, reward, quantity, result)) return;
  for (const target of qualifying) claimed.add(target.variantId);
  claimed.add(reward.variantId);
  result.appliedOfferIds.push(offer.id);
  const savings = result.rewardLines[result.rewardLines.length - 1]?.promotionDiscount ?? 0;
  result.promotions.push({
    id: offer.id,
    name: offer.name,
    offerType: offer.offerType,
    customerMessage: offer.customerMessage,
    code: offer.code ?? null,
    discountAmount: savings,
  });
};

const applyGift = (
  offer: PromotionOfferInput,
  customerSubtotal: number,
  lines: PromotionCustomerLine[],
  result: PromotionEvaluation,
  claimed: Set<string>,
): void => {
  const gift = offer.targets.find((row) => row.role === PromotionalOfferTargetRole.GIFT);
  const threshold = num(offer.config['threshold']);
  if (!gift || threshold <= 0) return;
  if (customerSubtotal < threshold) return;
  const available = availableForReward(gift, customerQty(lines, gift.variantId));
  if (available < 1) {
    result.warnings.push({ code: 'GIFT_UNAVAILABLE', message: REWARD_STOCK_NOTE });
    return;
  }
  if (!pushReward(offer, gift, 1, result)) return;
  claimed.add(gift.variantId);
  result.appliedOfferIds.push(offer.id);
  const savings = result.rewardLines[result.rewardLines.length - 1]?.promotionDiscount ?? 0;
  result.promotions.push({
    id: offer.id,
    name: offer.name,
    offerType: offer.offerType,
    customerMessage: offer.customerMessage,
    code: offer.code ?? null,
    discountAmount: savings,
  });
};

const applyBuyMoreSaveMore = (
  offer: PromotionOfferInput,
  lines: PromotionCustomerLine[],
  result: PromotionEvaluation,
  claimed: Set<string>,
): void => {
  const group = offer.targets.filter((row) => row.role === PromotionalOfferTargetRole.TIER_GROUP);
  if (!group.length) return;
  const groupIds = new Set(group.map((row) => row.variantId));
  const matched = lines.filter((line) => groupIds.has(line.variantId));
  const quantity = matched.reduce((sum, line) => sum + line.quantity, 0);
  const tiers = Array.isArray(offer.config['tiers']) ? offer.config['tiers'] : [];
  const eligibleTiers = tiers
    .map((tier) => tier as { minQuantity?: unknown; discountType?: unknown; discountValue?: unknown })
    .filter((tier) => quantity >= Math.floor(num(tier.minQuantity)))
    .sort((a, b) => num(b.minQuantity) - num(a.minQuantity));
  const tier = eligibleTiers[0];
  if (!tier) return;
  const eligibleValue = roundMoney(matched.reduce((sum, line) => sum + line.totalPrice, 0));
  if (eligibleValue <= 0) return;
  const raw = String(tier.discountType) === 'fixed'
    ? num(tier.discountValue)
    : (eligibleValue * num(tier.discountValue)) / 100;
  const discount = Math.min(eligibleValue, roundMoney(raw));
  if (discount <= 0) return;
  const allocations = matched.map((line) => ({
    lineId: line.id,
    promotionOfferId: offer.id,
    promotionDiscount: roundMoney((line.totalPrice / eligibleValue) * discount),
  }));
  const allocated = roundMoney(allocations.reduce((sum, row) => sum + row.promotionDiscount, 0));
  const drift = roundMoney(discount - allocated);
  if (allocations.length) {
    allocations[allocations.length - 1].promotionDiscount = roundMoney(
      allocations[allocations.length - 1].promotionDiscount + drift,
    );
  }
  result.lineAllocations.push(...allocations);
  result.bmsmDiscount += discount;
  for (const id of groupIds) claimed.add(id);
  result.appliedOfferIds.push(offer.id);
  result.promotions.push({
    id: offer.id,
    name: offer.name,
    offerType: offer.offerType,
    customerMessage: offer.customerMessage,
    code: offer.code ?? null,
    discountAmount: discount,
  });
};
