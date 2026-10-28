import { BadRequestException } from '@nestjs/common';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { ProductSubscriptionFrequency } from '../enums/product-subscription-frequency.enum';
import { SubscriptionDiscountType } from '../enums/subscription-discount-type.enum';
import { ProductSubscriptionsService } from './product-subscriptions.service';

describe('Product subscription create eligibility and pricing', () => {
  const productsRepository = { findPublishedById: jest.fn() };
  const variantsRepository = { findById: jest.fn() };
  const configService = {
    findEntityForProductVariant: jest.fn(),
    findForProductVariant: jest.fn(),
  };
  const pricingService = { calculate: jest.fn() };
  const membershipBenefits = { getMemberDiscount: jest.fn() };
  const mandateService = {
    willRegisterMandateOnFirstCharge: jest.fn(() => true),
    isAutopayFeatureEnabled: jest.fn(() => true),
  };
  const nestConfig = {
    get: jest.fn((key: string) => {
      if (key === 'subscriptions.testTenuresEnabled') return true;
      return undefined;
    }),
  };

  const service = new ProductSubscriptionsService(
    {} as never,
    configService as never,
    pricingService as never,
    {} as never,
    {} as never,
    {} as never,
    membershipBenefits as never,
    productsRepository as never,
    variantsRepository as never,
    {} as never,
    {} as never,
    {} as never,
    mandateService as never,
    {} as never,
    {} as never,
    {} as never,
    nestConfig as never,
    {} as never,
    {} as never,
    {
      findSent: jest.fn(async () => null),
      tryRecordSend: jest.fn(async () => true),
      findBySubscriptionId: jest.fn(async () => []),
    } as never,
  );

  const parentConfig = {
    id: 'cfg-1',
    productId: 'prod-1',
    productVariantId: null,
    enabled: true,
    frequencies: [ProductSubscriptionFrequency.MONTHLY],
    discountType: SubscriptionDiscountType.PERCENTAGE,
    discountValue: '10',
    mandateMaxAmount: '2500.00',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    productsRepository.findPublishedById.mockResolvedValue({
      id: 'prod-1',
      status: ProductStatus.PUBLISHED,
    });
    variantsRepository.findById.mockResolvedValue({
      id: 'var-a',
      productId: 'prod-1',
      status: VariantStatus.ACTIVE,
      sellingPrice: '500.00',
    });
    configService.findEntityForProductVariant.mockResolvedValue(parentConfig);
    membershipBenefits.getMemberDiscount.mockResolvedValue(null);
    pricingService.calculate.mockReturnValue({
      catalogUnitPrice: '500.00',
      subscriptionPrice: '450.00',
      finalAmount: '450.00',
      discountType: SubscriptionDiscountType.PERCENTAGE,
      discountValue: '10',
    });
  });

  it('quotes any eligible variant under a parent-level subscription config', async () => {
    variantsRepository.findById.mockResolvedValue({
      id: 'var-b',
      productId: 'prod-1',
      status: VariantStatus.ACTIVE,
      sellingPrice: '800.00',
    });
    pricingService.calculate.mockReturnValue({
      catalogUnitPrice: '800.00',
      subscriptionPrice: '720.00',
      finalAmount: '720.00',
      discountType: SubscriptionDiscountType.PERCENTAGE,
      discountValue: '10',
    });

    const quote = await service.quote('user-1', {
      productId: 'prod-1',
      productVariantId: 'var-b',
      quantity: 1,
      frequency: ProductSubscriptionFrequency.MONTHLY,
    });

    expect(configService.findEntityForProductVariant).toHaveBeenCalledWith('prod-1', 'var-b');
    expect(pricingService.calculate).toHaveBeenCalledWith(
      '800.00',
      1,
      SubscriptionDiscountType.PERCENTAGE,
      '10',
      null,
    );
    expect(quote.finalAmount).toBe('720.00');
    expect(quote.productVariantId).toBe('var-b');
  });

  it('rejects a variant that belongs to another product', async () => {
    variantsRepository.findById.mockResolvedValue({
      id: 'var-other',
      productId: 'prod-other',
      status: VariantStatus.ACTIVE,
      sellingPrice: '100.00',
    });

    await expect(
      service.quote('user-1', {
        productId: 'prod-1',
        productVariantId: 'var-other',
        quantity: 1,
        frequency: ProductSubscriptionFrequency.MONTHLY,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(pricingService.calculate).not.toHaveBeenCalled();
  });

  it('rejects a subscription-disabled product', async () => {
    configService.findEntityForProductVariant.mockResolvedValue({
      ...parentConfig,
      enabled: false,
    });

    await expect(
      service.quote('user-1', {
        productId: 'prod-1',
        productVariantId: 'var-a',
        quantity: 1,
        frequency: ProductSubscriptionFrequency.MONTHLY,
      }),
    ).rejects.toThrow(/not enabled/i);
  });

  it('uses backend variant selling price and config discount, ignoring any client price fields', async () => {
    await service.quote('user-1', {
      productId: 'prod-1',
      productVariantId: 'var-a',
      quantity: 2,
      frequency: ProductSubscriptionFrequency.MONTHLY,
      finalAmount: '1.00',
      subscriptionPrice: '1.00',
    } as never);

    expect(pricingService.calculate).toHaveBeenCalledWith(
      '500.00',
      2,
      parentConfig.discountType,
      parentConfig.discountValue,
      null,
    );
  });

  it('applies variant-specific selling price with the parent product discount rule', async () => {
    variantsRepository.findById.mockResolvedValue({
      id: 'var-premium',
      productId: 'prod-1',
      status: VariantStatus.ACTIVE,
      sellingPrice: '1200.00',
    });
    pricingService.calculate.mockReturnValue({
      finalAmount: '1080.00',
      subscriptionPrice: '1080.00',
      catalogUnitPrice: '1200.00',
      discountType: SubscriptionDiscountType.PERCENTAGE,
      discountValue: '10',
    });

    const quote = await service.quote(undefined, {
      productId: 'prod-1',
      productVariantId: 'var-premium',
      quantity: 1,
      frequency: ProductSubscriptionFrequency.MONTHLY,
    });

    expect(pricingService.calculate).toHaveBeenCalledWith(
      '1200.00',
      1,
      SubscriptionDiscountType.PERCENTAGE,
      '10',
      null,
    );
    expect(quote.finalAmount).toBe('1080.00');
  });
});
