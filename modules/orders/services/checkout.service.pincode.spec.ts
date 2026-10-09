import { BadRequestException } from '@nestjs/common';
import { INDIAN_PINCODE_VALIDATION_MESSAGE } from '@modules/cod-blocklist/utils/pincode.util';
import { ProductBundleEntity } from '@modules/product/entities/product-bundle.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductType } from '@modules/product/enums/product-type.enum';
import { CheckoutService, PRODUCTS_NOT_DELIVERABLE_TO_PINCODE } from './checkout.service';

type ProductFixture = {
  id: string;
  productId: string;
  sku: string;
  name: string;
  productType?: ProductType;
  isPincodeManaged: boolean;
};

const cartLine = (productId: string, variantId: string) => ({ productId, variantId });

const variantFixture = (input: ProductFixture) => ({
  id: input.id,
  productId: input.productId,
  sku: input.sku,
  product: {
    id: input.productId,
    name: input.name,
    productType: input.productType ?? ProductType.SIMPLE,
    isPincodeManaged: input.isPincodeManaged,
  },
});

describe('CheckoutService pincode availability', () => {
  const variantRepo = { find: jest.fn() };
  const bundleRepo = { find: jest.fn() };
  const userAddressesService = { findOne: jest.fn() };
  const cartService = { getActiveCartEntity: jest.fn() };
  const pincodesService = { findMappedCodesByProductIds: jest.fn() };
  const dataSource = {
    manager: {
      getRepository: jest.fn((entity: { name?: string }) => {
        if (entity === ProductBundleEntity || entity?.name?.includes('Bundle')) {
          return bundleRepo;
        }
        if (entity === ProductVariantEntity || entity?.name?.includes('Variant')) {
          return variantRepo;
        }
        return variantRepo;
      }),
    },
  };

  const service = new CheckoutService(
    dataSource as never,
    cartService as never,
    userAddressesService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    pincodesService as never,
  );

  const address = (pincode: string) => ({ pincode });

  beforeEach(() => {
    jest.clearAllMocks();
    bundleRepo.find.mockResolvedValue([]);
    pincodesService.findMappedCodesByProductIds.mockResolvedValue(new Map());
  });

  it('allows every cart variant when each product is deliverable to the address pincode', async () => {
    userAddressesService.findOne.mockResolvedValue(address('380001'));
    cartService.getActiveCartEntity.mockResolvedValue({
      items: [cartLine('prod-1', 'var-1'), cartLine('prod-2', 'var-2')],
    });
    variantRepo.find.mockResolvedValue([
      variantFixture({
        id: 'var-1',
        productId: 'prod-1',
        sku: 'SKU-1',
        name: 'Unmanaged serum',
        isPincodeManaged: false,
      }),
      variantFixture({
        id: 'var-2',
        productId: 'prod-2',
        sku: 'SKU-2',
        name: 'Mapped cream',
        isPincodeManaged: true,
      }),
    ]);
    pincodesService.findMappedCodesByProductIds.mockResolvedValue(
      new Map([['prod-2', ['380001']]]),
    );

    await expect(
      service.assertCartDeliverableToAddress('user-1', 'address-1'),
    ).resolves.toBeUndefined();
  });

  it('rejects a managed variant that is not mapped to the selected pincode', async () => {
    userAddressesService.findOne.mockResolvedValue(address('380001'));
    cartService.getActiveCartEntity.mockResolvedValue({
      items: [cartLine('prod-1', 'var-1')],
    });
    variantRepo.find.mockResolvedValue([
      variantFixture({
        id: 'var-1',
        productId: 'prod-1',
        sku: 'SKU-1',
        name: 'City cream',
        isPincodeManaged: true,
      }),
    ]);
    pincodesService.findMappedCodesByProductIds.mockResolvedValue(
      new Map([['prod-1', ['560001']]]),
    );

    await expect(
      service.assertCartDeliverableToAddress('user-1', 'address-1'),
    ).rejects.toMatchObject({
      response: {
        code: PRODUCTS_NOT_DELIVERABLE_TO_PINCODE,
        pincode: '380001',
        message: 'Some products in your cart are not deliverable to pincode 380001.',
        unavailableProducts: [
          {
            productId: 'prod-1',
            variantId: 'var-1',
            productName: 'City cream',
            sku: 'SKU-1',
            pincode: '380001',
          },
        ],
      },
    });
  });

  it('returns every unavailable product in one response', async () => {
    userAddressesService.findOne.mockResolvedValue(address('380001'));
    cartService.getActiveCartEntity.mockResolvedValue({
      items: [cartLine('prod-1', 'var-1'), cartLine('prod-2', 'var-2')],
    });
    variantRepo.find.mockResolvedValue([
      variantFixture({
        id: 'var-1',
        productId: 'prod-1',
        sku: 'SKU-1',
        name: 'Cream A',
        isPincodeManaged: true,
      }),
      variantFixture({
        id: 'var-2',
        productId: 'prod-2',
        sku: 'SKU-2',
        name: 'Cream B',
        isPincodeManaged: true,
      }),
    ]);

    try {
      await service.assertCartDeliverableToAddress('user-1', 'address-1');
      throw new Error('expected checkout to reject undeliverable products');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse() as {
        unavailableProducts: Array<{ sku: string }>;
      };
      expect(body.unavailableProducts.map((item) => item.sku)).toEqual(['SKU-1', 'SKU-2']);
    }
  });

  it('lists only the variants that are not deliverable when the cart is mixed', async () => {
    userAddressesService.findOne.mockResolvedValue(address('380001'));
    cartService.getActiveCartEntity.mockResolvedValue({
      items: [
        cartLine('prod-open', 'var-open'),
        cartLine('prod-mapped', 'var-mapped'),
        cartLine('prod-blocked', 'var-blocked'),
      ],
    });
    variantRepo.find.mockResolvedValue([
      variantFixture({
        id: 'var-open',
        productId: 'prod-open',
        sku: 'SKU-OPEN',
        name: 'Open product',
        isPincodeManaged: false,
      }),
      variantFixture({
        id: 'var-mapped',
        productId: 'prod-mapped',
        sku: 'SKU-MAPPED',
        name: 'Mapped product',
        isPincodeManaged: true,
      }),
      variantFixture({
        id: 'var-blocked',
        productId: 'prod-blocked',
        sku: 'SKU-BLOCKED',
        name: 'Blocked product',
        isPincodeManaged: true,
      }),
    ]);
    pincodesService.findMappedCodesByProductIds.mockResolvedValue(
      new Map([
        ['prod-mapped', ['380001']],
        ['prod-blocked', ['560001']],
      ]),
    );

    await expect(
      service.assertCartDeliverableToAddress('user-1', 'address-1'),
    ).rejects.toMatchObject({
      response: {
        unavailableProducts: [
          expect.objectContaining({ productId: 'prod-blocked', sku: 'SKU-BLOCKED' }),
        ],
      },
    });
  });

  it('skips the product check when checkout has no address', async () => {
    await expect(service.assertCartDeliverableToAddress('user-1')).resolves.toBeUndefined();
    expect(userAddressesService.findOne).not.toHaveBeenCalled();
    expect(cartService.getActiveCartEntity).not.toHaveBeenCalled();
  });

  it('stops on an invalid address pincode before loading the cart', async () => {
    userAddressesService.findOne.mockResolvedValue(address('38'));

    await expect(
      service.assertCartDeliverableToAddress('user-1', 'address-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.assertCartDeliverableToAddress('user-1', 'address-1'),
    ).rejects.toThrow(INDIAN_PINCODE_VALIDATION_MESSAGE);
    expect(cartService.getActiveCartEntity).not.toHaveBeenCalled();
    expect(pincodesService.findMappedCodesByProductIds).not.toHaveBeenCalled();
  });

  it('reports a bundle line and the component that is not deliverable', async () => {
    userAddressesService.findOne.mockResolvedValue(address('380001'));
    cartService.getActiveCartEntity.mockResolvedValue({
      items: [cartLine('bundle-1', 'bundle-var')],
    });
    variantRepo.find.mockResolvedValue([
      variantFixture({
        id: 'bundle-var',
        productId: 'bundle-1',
        sku: 'BUNDLE-SKU',
        name: 'Care kit',
        productType: ProductType.BUNDLE,
        isPincodeManaged: false,
      }),
    ]);
    bundleRepo.find.mockResolvedValue([
      {
        parentProductId: 'bundle-1',
        childProductId: 'child-1',
        childVariantId: 'child-var',
        childProduct: {
          id: 'child-1',
          name: 'Restricted serum',
          isPincodeManaged: true,
        },
        childVariant: { id: 'child-var', sku: 'CHILD-SKU' },
      },
    ]);
    pincodesService.findMappedCodesByProductIds.mockResolvedValue(new Map([['child-1', ['560001']]]));

    await expect(
      service.assertCartDeliverableToAddress('user-1', 'address-1'),
    ).rejects.toMatchObject({
      response: {
        unavailableProducts: [
          {
            productId: 'bundle-1',
            variantId: 'bundle-var',
            productName: 'Care kit',
            sku: 'BUNDLE-SKU',
            pincode: '380001',
            unavailableComponents: [
              {
                productId: 'child-1',
                variantId: 'child-var',
                productName: 'Restricted serum',
                sku: 'CHILD-SKU',
              },
            ],
          },
        ],
      },
    });
  });

  it('allows a bundle when the bundle and every component are deliverable', async () => {
    userAddressesService.findOne.mockResolvedValue(address('380001'));
    cartService.getActiveCartEntity.mockResolvedValue({
      items: [cartLine('bundle-1', 'bundle-var')],
    });
    variantRepo.find.mockResolvedValue([
      variantFixture({
        id: 'bundle-var',
        productId: 'bundle-1',
        sku: 'BUNDLE-SKU',
        name: 'Care kit',
        productType: ProductType.BUNDLE,
        isPincodeManaged: true,
      }),
    ]);
    bundleRepo.find.mockResolvedValue([
      {
        parentProductId: 'bundle-1',
        childProductId: 'child-1',
        childVariantId: 'child-var',
        childProduct: {
          id: 'child-1',
          name: 'Mapped serum',
          isPincodeManaged: true,
        },
        childVariant: { id: 'child-var', sku: 'CHILD-SKU' },
      },
    ]);
    pincodesService.findMappedCodesByProductIds.mockResolvedValue(
      new Map([
        ['bundle-1', ['380001']],
        ['child-1', ['380001']],
      ]),
    );

    await expect(
      service.assertCartDeliverableToAddress('user-1', 'address-1'),
    ).resolves.toBeUndefined();
  });
});
