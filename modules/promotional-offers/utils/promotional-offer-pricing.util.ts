import { roundMoney } from '@modules/orders/utils/money.util';
import { PromotionalOfferTargetRole } from '../enums/promotional-offer-target-role.enum';
import { PromotionalOfferType } from '../enums/promotional-offer-type.enum';
import { RewardPricing } from '../enums/reward-pricing.enum';
import { lineMatchesOfferScope, readOfferScope } from './offer-scope.util';

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
  brandId?: string | null;
  categoryId?: string | null;
  subCategoryId?: string | null;
  subSubCategoryId?: string | null;
  subSubSubCategoryId?: string | null;
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
  const targets = offer.targets.filter((row) => row.role === PromotionalOfferTargetRole.QUALIFYING);
  if (!targets.length) return;
  const qualifyingQuantity = Math.max(1, Math.floor(num(offer.config['qualifyingQuantity'])));
  const rewardQuantity = Math.max(1, Math.floor(num(offer.config['rewardQuantity'])));
  const maxReward = offer.config['maxRewardQuantity'] == null ? null : Math.floor(num(offer.config['maxRewardQuantity']));
  const pricing = String(offer.config['rewardPricing'] ?? RewardPricing.FREE);
  const value = num(offer.config['rewardDiscountValue']);
  const before = result.rewardLines.length;
  let sawShortQuantity = false;
  let sawStock = false;
  const granted = new Set<string>();
  for (const target of targets) {
    if (claimed.has(target.variantId) || granted.has(target.variantId)) continue;
    const bought = customerQty(lines, target.variantId);
    let reward = Math.floor(bought / qualifyingQuantity) * rewardQuantity;
    if (maxReward !== null) reward = Math.min(reward, maxReward);
    if (reward <= 0) {
      if (bought > 0) sawShortQuantity = true;
      continue;
    }
    const available = availableForReward(target, bought);
    if (reward > available) {
      sawStock = true;
      continue;
    }
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
    granted.add(target.variantId);
    claimed.add(target.variantId);
  }
  if (!granted.size) {
    if (sawStock) result.warnings.push({ code: 'REWARD_OUT_OF_STOCK', message: REWARD_STOCK_NOTE });
    else if (sawShortQuantity) {
      result.warnings.push({
        code: 'OFFER_INELIGIBLE',
        message: 'Add the required quantity of this product to use this offer.',
      });
    }
    return;
  }
  const savings = roundMoney(
    result.rewardLines.slice(before).reduce((sum, line) => sum + line.promotionDiscount, 0),
  );
  result.appliedOfferIds.push(offer.id);
  result.promotions.push({
    id: offer.id,
    name: offer.name,
    offerType: offer.offerType,
    customerMessage: offer.customerMessage,
    code: offer.code ?? null,
    discountAmount: savings,
  });
};

type BuyXCombination = {
  qualifying: PromotionCatalogTarget[];
  reward: PromotionCatalogTarget;
  rewardQuantity: number;
  poolQuantity: number | null;
};

const scopeQuantity = (lines: PromotionCustomerLine[], scope: ReturnType<typeof readOfferScope>): number => {
  if (!scope.brandIds.length && !scope.categoryIds.length) return 0;
  return lines.reduce((sum, line) => {
    if (line.isSubscription || line.productType === 'bundle') return sum;
    if (!lineMatchesOfferScope(line, scope)) return sum;
    return sum + line.quantity;
  }, 0);
};

const buyXCombinations = (offer: PromotionOfferInput): BuyXCombination[] => {
  const configured = Array.isArray(offer.config['combinations']) ? offer.config['combinations'] : null;
  if (configured?.length) {
    const combinations: BuyXCombination[] = [];
    for (const row of configured) {
      const combination = row as {
        qualifying?: Array<{ variantId?: string; quantity?: number }>;
        qualifyingQuantity?: number;
        rewardVariantId?: string;
        rewardQuantity?: number;
      };
      const qualifying: PromotionCatalogTarget[] = [];
      for (const item of combination.qualifying ?? []) {
        const target = offer.targets.find(
          (candidate) =>
            candidate.role === PromotionalOfferTargetRole.QUALIFYING &&
            candidate.variantId === item.variantId,
        );
        if (!target) continue;
        qualifying.push({ ...target, quantity: Math.max(1, Math.floor(num(item.quantity))) });
      }
      const reward = offer.targets.find(
        (candidate) =>
          candidate.role === PromotionalOfferTargetRole.REWARD &&
          candidate.variantId === combination.rewardVariantId,
      );
      if (!reward) continue;
      const rewardQuantity = Math.max(1, Math.floor(num(combination.rewardQuantity)));
      if (!qualifying.length) {
        const poolQuantity = Math.floor(num(combination.qualifyingQuantity));
        if (poolQuantity < 1) continue;
        combinations.push({ qualifying: [], reward, rewardQuantity, poolQuantity });
        continue;
      }
      combinations.push({ qualifying, reward, rewardQuantity, poolQuantity: null });
    }
    return combinations;
  }
  const qualifying = offer.targets.filter((row) => row.role === PromotionalOfferTargetRole.QUALIFYING);
  const reward = offer.targets.find((row) => row.role === PromotionalOfferTargetRole.REWARD);
  if (!qualifying.length || !reward || !reward.quantity) return [];
  return [{ qualifying, reward, rewardQuantity: Math.max(1, reward.quantity), poolQuantity: null }];
};

const applyBuyXGetY = (
  offer: PromotionOfferInput,
  lines: PromotionCustomerLine[],
  result: PromotionEvaluation,
  claimed: Set<string>,
): void => {
  const combinations = buyXCombinations(offer);
  if (!combinations.length) return;
  const maxReward = offer.config['maxRewardQuantity'] == null ? null : Math.floor(num(offer.config['maxRewardQuantity']));
  const scope = readOfferScope(offer.config);
  const planned = new Map<string, { reward: PromotionCatalogTarget; quantity: number; qualifying: PromotionCatalogTarget[] }>();
  let sawStock = false;
  for (const combination of combinations) {
    const sets = combination.qualifying.length
      ? combination.qualifying.reduce((min, target) => {
          const needed = Math.max(1, target.quantity ?? 1);
          return Math.min(min, Math.floor(customerQty(lines, target.variantId) / needed));
        }, Number.MAX_SAFE_INTEGER)
      : Math.floor(scopeQuantity(lines, scope) / Math.max(1, combination.poolQuantity ?? 1));
    let quantity = sets * combination.rewardQuantity;
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    if (maxReward !== null) quantity = Math.min(quantity, maxReward);
    if (quantity <= 0) continue;
    const available = availableForReward(combination.reward, customerQty(lines, combination.reward.variantId));
    if (quantity > available) {
      sawStock = true;
      continue;
    }
    const current = planned.get(combination.reward.variantId);
    if (!current || quantity > current.quantity) {
      planned.set(combination.reward.variantId, {
        reward: combination.reward,
        quantity,
        qualifying: combination.qualifying,
      });
    }
  }
  if (!planned.size) {
    if (sawStock) result.warnings.push({ code: 'REWARD_OUT_OF_STOCK', message: REWARD_STOCK_NOTE });
    return;
  }
  const before = result.rewardLines.length;
  for (const plan of planned.values()) {
    if (!pushReward(offer, plan.reward, plan.quantity, result)) continue;
    for (const target of plan.qualifying) claimed.add(target.variantId);
    claimed.add(plan.reward.variantId);
  }
  if (result.rewardLines.length === before) return;
  const savings = roundMoney(
    result.rewardLines.slice(before).reduce((sum, line) => sum + line.promotionDiscount, 0),
  );
  result.appliedOfferIds.push(offer.id);
  result.promotions.push({
    id: offer.id,
    name: offer.name,
    offerType: offer.offerType,
    customerMessage: offer.customerMessage,
    code: offer.code ?? null,
    discountAmount: savings,
  });
};

const giftCandidates = (
  offer: PromotionOfferInput,
): Array<{ threshold: number; target: PromotionCatalogTarget }> => {
  const configured = Array.isArray(offer.config['gifts']) ? offer.config['gifts'] : null;
  if (configured?.length) {
    return configured
      .map((row) => {
        const gift = row as { threshold?: unknown; variantId?: string };
        const target = offer.targets.find(
          (candidate) => candidate.role === PromotionalOfferTargetRole.GIFT && candidate.variantId === gift.variantId,
        );
        const threshold = num(gift.threshold);
        return target && threshold > 0 ? { threshold, target } : null;
      })
      .filter((item): item is { threshold: number; target: PromotionCatalogTarget } => item != null)
      .sort((left, right) => right.threshold - left.threshold);
  }
  const gift = offer.targets.find((row) => row.role === PromotionalOfferTargetRole.GIFT);
  const threshold = num(offer.config['threshold']);
  if (!gift || threshold <= 0) return [];
  return [{ threshold, target: gift }];
};

const giftThresholdSubtotal = (
  offer: PromotionOfferInput,
  lines: PromotionCustomerLine[],
  customerSubtotal: number,
): { amount: number; scoped: boolean; matched: boolean } => {
  const scope = readOfferScope(offer.config);
  const qualifyingIds = new Set(
    offer.targets
      .filter((row) => row.role === PromotionalOfferTargetRole.QUALIFYING)
      .map((row) => row.variantId),
  );
  const scoped = scope.brandIds.length > 0 || scope.categoryIds.length > 0 || qualifyingIds.size > 0;
  if (!scoped || String(offer.config['thresholdBasis'] ?? '') === 'cart') {
    return { amount: customerSubtotal, scoped, matched: !scoped || lines.some((line) => !line.isSubscription) };
  }
  let amount = 0;
  let matched = false;
  for (const line of lines) {
    if (line.isSubscription || line.productType === 'bundle') continue;
    if (qualifyingIds.has(line.variantId) || lineMatchesOfferScope(line, scope)) {
      matched = true;
      amount += line.totalPrice;
    }
  }
  return { amount, scoped, matched };
};

const applyGift = (
  offer: PromotionOfferInput,
  customerSubtotal: number,
  lines: PromotionCustomerLine[],
  result: PromotionEvaluation,
  claimed: Set<string>,
): void => {
  const thresholdBase = giftThresholdSubtotal(offer, lines, customerSubtotal);
  if (thresholdBase.scoped && !thresholdBase.matched) {
    result.warnings.push({
      code: 'OFFER_NOT_ELIGIBLE',
      message: 'This offer does not apply to the products in your cart.',
    });
    return;
  }
  const winner = giftCandidates(offer).find((candidate) => thresholdBase.amount >= candidate.threshold);
  if (!winner) return;
  const available = availableForReward(winner.target, customerQty(lines, winner.target.variantId));
  if (available < 1) {
    result.warnings.push({ code: 'GIFT_UNAVAILABLE', message: REWARD_STOCK_NOTE });
    return;
  }
  if (!pushReward(offer, winner.target, 1, result)) return;
  claimed.add(winner.target.variantId);
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
    .filter((tier) => {
      const minQuantity = Math.floor(num(tier.minQuantity));
      return minQuantity >= 2 && quantity >= minQuantity;
    })
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
