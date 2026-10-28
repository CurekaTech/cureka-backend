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

  it('grants a BOGO reward for each qualifying variant in the cart', () => {
    const result = evaluatePromotionalOffers(
      [
        line({ id: 'a', variantId: 'variant-1', quantity: 1, totalPrice: 100 }),
        line({ id: 'b', variantId: 'variant-2', quantity: 1, unitPrice: 80, totalPrice: 80, sku: 'SKU-2' }),
      ],
      [
        offer({
          config: { qualifyingQuantity: 1, rewardQuantity: 1, rewardPricing: RewardPricing.FREE },
          targets: [
            target({ role: PromotionalOfferTargetRole.QUALIFYING, variantId: 'variant-1', productId: 'product-1', ...purchasable }),
            target({
              role: PromotionalOfferTargetRole.QUALIFYING,
              variantId: 'variant-2',
              productId: 'product-2',
              ...purchasable,
              sellingPrice: 80,
              sku: 'SKU-2',
            }),
          ],
        }),
      ],
      180,
    );

    expect(result.rewardLines.map((row) => row.variantId).sort()).toEqual(['variant-1', 'variant-2']);
    expect(result.promotions).toHaveLength(1);
  });

  it('still grants the in-stock BOGO variant when another qualifying variant has no extra unit', () => {
    const result = evaluatePromotionalOffers(
      [
        line({ id: 'a', variantId: 'variant-1', quantity: 1, totalPrice: 100 }),
        line({ id: 'b', variantId: 'variant-2', quantity: 1, unitPrice: 80, totalPrice: 80 }),
      ],
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
            }),
            target({
              role: PromotionalOfferTargetRole.QUALIFYING,
              variantId: 'variant-2',
              productId: 'product-2',
              ...purchasable,
              sellingPrice: 80,
              stock: 4,
            }),
          ],
        }),
      ],
      180,
    );

    expect(result.rewardLines).toHaveLength(1);
    expect(result.rewardLines[0].variantId).toBe('variant-2');
  });

  it('grants only the highest cart-value gift the subtotal reaches', () => {
    const result = evaluatePromotionalOffers(
      [line({ totalPrice: 200 })],
      [
        offer({
          offerType: PromotionalOfferType.GIFT_ON_CART_VALUE,
          config: {
            gifts: [
              { threshold: 100, variantId: 'gift-low' },
              { threshold: 250, variantId: 'gift-high' },
              { threshold: 150, variantId: 'gift-mid' },
            ],
          },
          targets: [
            target({ role: PromotionalOfferTargetRole.GIFT, variantId: 'gift-low', productId: 'g1', ...purchasable, sku: 'LOW' }),
            target({ role: PromotionalOfferTargetRole.GIFT, variantId: 'gift-mid', productId: 'g2', ...purchasable, sku: 'MID' }),
            target({ role: PromotionalOfferTargetRole.GIFT, variantId: 'gift-high', productId: 'g3', ...purchasable, sku: 'HIGH' }),
          ],
        }),
      ],
      200,
    );

    expect(result.rewardLines).toHaveLength(1);
    expect(result.rewardLines[0].variantId).toBe('gift-mid');
  });

  it('grants each Buy X Get Y combination once and keeps the larger reward when they share a variant', () => {
    const result = evaluatePromotionalOffers(
      [
        line({ id: 'a', variantId: 'buy-a', quantity: 2, totalPrice: 200 }),
        line({ id: 'b', variantId: 'buy-b', quantity: 1, unitPrice: 50, totalPrice: 50 }),
      ],
      [
        offer({
          offerType: PromotionalOfferType.BUY_X_GET_Y,
          config: {
            rewardPricing: RewardPricing.FREE,
            combinations: [
              { qualifying: [{ variantId: 'buy-a', quantity: 2 }], rewardVariantId: 'reward-shared', rewardQuantity: 1 },
              { qualifying: [{ variantId: 'buy-b', quantity: 1 }], rewardVariantId: 'reward-shared', rewardQuantity: 2 },
              { qualifying: [{ variantId: 'buy-a', quantity: 2 }], rewardVariantId: 'reward-other', rewardQuantity: 1 },
            ],
          },
          targets: [
            target({ role: PromotionalOfferTargetRole.QUALIFYING, variantId: 'buy-a', productId: 'p', ...purchasable, quantity: 2 }),
            target({ role: PromotionalOfferTargetRole.QUALIFYING, variantId: 'buy-b', productId: 'p', ...purchasable, quantity: 1 }),
            target({ role: PromotionalOfferTargetRole.REWARD, variantId: 'reward-shared', productId: 'p', ...purchasable, quantity: 1, sku: 'R1' }),
            target({ role: PromotionalOfferTargetRole.REWARD, variantId: 'reward-other', productId: 'p', ...purchasable, quantity: 1, sku: 'R2' }),
          ],
        }),
      ],
      250,
    );

    const shared = result.rewardLines.find((row) => row.variantId === 'reward-shared');
    const other = result.rewardLines.find((row) => row.variantId === 'reward-other');
    expect(result.rewardLines).toHaveLength(2);
    expect(shared?.quantity).toBe(2);
    expect(other?.quantity).toBe(1);
    expect(result.promotions).toHaveLength(1);
  });

  const brand = '11111111-1111-4111-8111-111111111111';
  const otherBrand = '22222222-2222-4222-8222-222222222222';
  const category = '33333333-3333-4333-8333-333333333333';

  it('keeps a variant-only BOGO on that variant when brand scope is empty', () => {
    const result = evaluatePromotionalOffers(
      [
        line({ variantId: 'variant-1', quantity: 1, brandId: brand }),
        line({ id: 'other', variantId: 'variant-2', quantity: 1, brandId: brand, totalPrice: 80 }),
      ],
      [
        offer({
          config: { qualifyingQuantity: 1, rewardQuantity: 1, rewardPricing: RewardPricing.FREE },
          targets: [
            target({ role: PromotionalOfferTargetRole.QUALIFYING, variantId: 'variant-1', productId: 'product-1', ...purchasable, stock: 4 }),
          ],
        }),
      ],
      180,
    );
    expect(result.rewardLines.map((row) => row.variantId)).toEqual(['variant-1']);
  });

  it('grants a scoped cart-value gift from the full subtotal and only once', () => {
    const result = evaluatePromotionalOffers(
      [
        line({ id: 'match', variantId: 'variant-1', quantity: 1, unitPrice: 40, totalPrice: 40, brandId: brand, categoryId: category }),
        line({ id: 'other', variantId: 'variant-2', quantity: 1, unitPrice: 90, totalPrice: 90, brandId: otherBrand }),
      ],
      [
        offer({
          offerType: PromotionalOfferType.GIFT_ON_CART_VALUE,
          config: { brandIds: [brand], categoryIds: [category], threshold: 120, gifts: [{ threshold: 120, variantId: 'gift-1' }] },
          targets: [target({ role: PromotionalOfferTargetRole.GIFT, variantId: 'gift-1', productId: 'g', ...purchasable, sku: 'GIFT' })],
        }),
      ],
      130,
    );
    expect(result.rewardLines).toHaveLength(1);
    expect(result.rewardLines[0].variantId).toBe('gift-1');
  });

  it('does not grant a scoped gift when no cart line matches the brand or category', () => {
    const result = evaluatePromotionalOffers(
      [line({ totalPrice: 200, brandId: otherBrand })],
      [
        offer({
          offerType: PromotionalOfferType.GIFT_ON_CART_VALUE,
          config: { brandIds: [brand], threshold: 100 },
          targets: [target({ role: PromotionalOfferTargetRole.GIFT, variantId: 'gift-1', productId: 'g', ...purchasable, sku: 'GIFT' })],
        }),
      ],
      200,
    );
    expect(result.rewardLines).toHaveLength(0);
    expect(result.warnings[0]?.code).toBe('OFFER_NOT_ELIGIBLE');
  });

  it('counts a brand pool once for Buy X Get Y and ignores products outside the brand', () => {
    const result = evaluatePromotionalOffers(
      [
        line({ id: 'a', variantId: 'in-1', quantity: 1, brandId: brand, totalPrice: 100 }),
        line({ id: 'b', variantId: 'in-2', quantity: 1, brandId: brand, categoryId: category, totalPrice: 80 }),
        line({ id: 'c', variantId: 'out', quantity: 5, brandId: otherBrand, totalPrice: 500 }),
      ],
      [
        offer({
          offerType: PromotionalOfferType.BUY_X_GET_Y,
          config: {
            brandIds: [brand],
            categoryIds: [category],
            rewardPricing: RewardPricing.FREE,
            combinations: [{ qualifying: [], qualifyingQuantity: 2, rewardVariantId: 'reward-1', rewardQuantity: 1 }],
          },
          targets: [target({ role: PromotionalOfferTargetRole.REWARD, variantId: 'reward-1', productId: 'p', ...purchasable, quantity: 1, sku: 'R' })],
        }),
      ],
      680,
    );
    expect(result.rewardLines).toHaveLength(1);
    expect(result.rewardLines[0].quantity).toBe(1);
    expect(result.promotions).toHaveLength(1);
  });
});
