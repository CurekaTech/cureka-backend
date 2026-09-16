import { BadRequestException } from '@nestjs/common';
import { CheckoutService } from './checkout.service';

describe('CheckoutService COD eligibility', () => {
  const variantRepo = {
    find: jest.fn(),
  };
  const dataSource = {
    manager: {
      getRepository: jest.fn().mockReturnValue(variantRepo),
    },
  };

  const service = new CheckoutService(
    dataSource as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows COD when every cart variant is eligible', async () => {
    variantRepo.find.mockResolvedValue([
      {
        id: 'var-1',
        productId: 'prod-1',
        codAvailable: true,
        displayName: 'Product A 250ml',
        product: { name: 'Product A' },
        attributeValues: [],
      },
    ]);

    await expect(
      service.assertCodVariantsEligible([
        {
          productId: 'prod-1',
          variantId: 'var-1',
          productName: 'Product A',
          variantName: '250ml',
          sku: 'SKU-1',
        },
      ]),
    ).resolves.toBeUndefined();
  });

  it('rejects COD with a user-friendly list of restricted products', async () => {
    variantRepo.find.mockResolvedValue([
      {
        id: 'var-1',
        productId: 'prod-1',
        codAvailable: false,
        displayName: null,
        product: { name: 'Product B' },
        attributeValues: [{ value: '500ml' }],
      },
      {
        id: 'var-2',
        productId: 'prod-2',
        codAvailable: false,
        displayName: 'Product C Combo',
        product: { name: 'Product C' },
        attributeValues: [],
      },
    ]);

    await expect(
      service.assertCodVariantsEligible([
        {
          productId: 'prod-1',
          variantId: 'var-1',
          productName: 'Old Product B',
          variantName: 'Old label',
          sku: 'SKU-B',
        },
        {
          productId: 'prod-2',
          variantId: 'var-2',
          productName: 'Old Product C',
          variantName: null,
          sku: 'SKU-C',
        },
      ]),
    ).rejects.toThrow(
      new BadRequestException(
        'Cash on Delivery is not available for the following products:\n\n' +
          '- Product B - 500ml\n' +
          '- Product C Combo\n\n' +
          'You can place a prepaid order for all products, remove the above products and continue with COD, or place separate orders.',
      ),
    );
  });
});
