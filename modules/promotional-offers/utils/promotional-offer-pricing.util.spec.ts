import { PromotionalOfferType } from '../enums/promotional-offer-type.enum';
import { RewardPricing } from '../enums/reward-pricing.enum';
import {
  evaluatePromotionalOffers,
  PromotionCustomerLine,
  PromotionOfferInput,
} from './promotional-offer-pricing.util';
import { PromotionalOfferTargetRole } from '../enums/promotional-offer-target-role.enum';

const line = (partial: Partial<PromotionCustomerLine> = {}): PromotionCustomerLine => ({
  id: 'line-1',
  productId: 'product-1',
  variantId: 'variant-1',
  quantity: 2,
  unitPrice: 100,
  totalPrice: 200,
  sku: 'SKU-1',
  productName: 'Serum',
  variantLabel: null,
  isSubscription: false,
  productType: 'simple',
  ...partial,
});

const target = (partial: PromotionOfferInput['targets'][number]): PromotionOfferInput['targets'][number] => partial;

const offer = (partial: Partial<PromotionOfferInput>): PromotionOfferInput => ({
  id: 'offer-1',
  refId: 'PO0001',
  name: 'Offer',
  customerMessage: 'Offer message',
  offerType: PromotionalOfferType.BOGO,
  createdAt: '2026-01-01T00:00:00.000Z',
  config: {},
  targets: [],
  remainingGlobal: null,
  remainingUser: null,
  ...partial,
});

const purchasable = {
  sellingPrice: 100,
  stock: 20,
  outOfStock: false,
  purchasable: true,
  stockValidation: true,
  productType: 'simple',
  sku: 'SKU-1',
  productName: 'Serum',
  variantLabel: null,
  quantity: null,
};

describe('evaluatePromotionalOffers', () => {
  it('grants a configured BOGO reward and does not assume 1:1', () => {
    const result = evaluatePromotionalOffers(
      [line({ quantity: 2, totalPrice: 200 })],
      [
        offer({
          config: {
            qualifyingQuantity: 2,
            rewardQuantity: 1,
            rewardPricing: RewardPricing.FREE,
            rewardDiscountValue: 100,
          },
          targets: [
            target({
              role: PromotionalOfferTargetRole.QUALIFYING,
              variantId: 'variant-1',
              productId: 'product-1',
              ...purchasable,
            }),
          ],
        }),
      ],
      200,
    );

    expect(result.rewardLines).toHaveLength(1);
    expect(result.rewardLines[0].quantity).toBe(1);
    expect(result.rewardLines[0].chargedUnitPrice).toBe(0);
    expect(result.bmsmDiscount).toBe(0);
  });

  it('does not grant a partial reward when stock is short', () => {
    const result = evaluatePromotionalOffers(
      [line({ quantity: 2, totalPrice: 200 })],
      [
        offer({
          config: { qualifyingQuantity: 2, rewardQuantity: 1, rewardPricing: RewardPricing.FREE },
          targets: [
            target({
              role: PromotionalOfferTargetRole.QUALIFYING,
              variantId: 'variant-1',
              productId: 'product-1',
              ...purchasable,
              stock: 2,
            }),
          ],
        }),
      ],
      200,
    );

    expect(result.rewardLines).toHaveLength(0);
    expect(result.warnings[0].code).toBe('REWARD_OUT_OF_STOCK');
  });

  it('does not grant a free unit when recorded stock is already in the cart', () => {
    const result = evaluatePromotionalOffers(
      [line({ quantity: 1, totalPrice: 100 })],
      [
        offer({
          config: { qualifyingQuantity: 1, rewardQuantity: 1, rewardPricing: RewardPricing.FREE },
          targets: [
            target({
              role: PromotionalOfferTargetRole.QUALIFYING,
              variantId: 'variant-1',
              productId: 'product-1',
              ...purchasable,
              stock: 1,
              stockValidation: false,
            }),
          ],
        }),
      ],
      100,
    );

    expect(result.rewardLines).toHaveLength(0);
    expect(result.promotions).toHaveLength(0);
    expect(result.warnings[0].message).toBe(
      'The free item is out of stock, so this offer cannot be applied right now.',
    );
  });

  it('adds one gift when customer subtotal reaches the single threshold', () => {
    const result = evaluatePromotionalOffers(
      [line()],
      [
        offer({
          offerType: PromotionalOfferType.GIFT_ON_CART_VALUE,
          config: { threshold: 150 },
          targets: [
            target({
              role: PromotionalOfferTargetRole.GIFT,
              variantId: 'gift-1',
              productId: 'gift-product',
              ...purchasable,
              sellingPrice: 40,
              sku: 'GIFT',
            }),
          ],
        }),
      ],
      200,
    );

    expect(result.rewardLines).toHaveLength(1);
    expect(result.rewardLines[0].quantity).toBe(1);
    expect(result.rewardLines[0].chargedUnitPrice).toBe(0);
  });

  it('applies only the highest Buy More Save More tier across the configured group', () => {
    const result = evaluatePromotionalOffers(
      [
        line({ id: 'a', variantId: 'v1', quantity: 1, totalPrice: 100 }),
        line({ id: 'b', variantId: 'v2', quantity: 2, unitPrice: 100, totalPrice: 200 }),
      ],
      [
        offer({
          offerType: PromotionalOfferType.BUY_MORE_SAVE_MORE,
          config: {
            tiers: [
              { minQuantity: 2, discountType: 'percentage', discountValue: 10 },
              { minQuantity: 3, discountType: 'percentage', discountValue: 15 },
            ],
          },
          targets: [
            target({ role: PromotionalOfferTargetRole.TIER_GROUP, variantId: 'v1', productId: 'p', ...purchasable }),
            target({ role: PromotionalOfferTargetRole.TIER_GROUP, variantId: 'v2', productId: 'p', ...purchasable }),
          ],
        }),
      ],
      300,
    );

    expect(result.bmsmDiscount).toBe(45);
    expect(result.lineAllocations.reduce((sum, row) => sum + row.promotionDiscount, 0)).toBe(45);
  });

  it('applies only the selected offer when several are supplied', () => {
    const shared = target({
      role: PromotionalOfferTargetRole.QUALIFYING,
      variantId: 'variant-1',
      productId: 'product-1',
      ...purchasable,
    });
    const result = evaluatePromotionalOffers(
      [line({ quantity: 2, totalPrice: 200 })],
      [
        offer({
          id: 'first',
          config: { qualifyingQuantity: 2, rewardQuantity: 1, rewardPricing: RewardPricing.FREE },
          targets: [shared],
        }),
        offer({
          id: 'selected',
          config: { qualifyingQuantity: 2, rewardQuantity: 1, rewardPricing: RewardPricing.PERCENTAGE, rewardDiscountValue: 50 },
          targets: [{ ...shared }],
        }),
      ],
      200,
      'selected',
    );

    expect(result.appliedOfferIds).toEqual(['selected']);
    expect(result.rewardLines[0].chargedUnitPrice).toBe(50);
  });
});
