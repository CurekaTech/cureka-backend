import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { assertCurrentProductPrices } from './product-price-validation.util';

describe('assertCurrentProductPrices', () => {
  const findOne = jest.fn();
  const manager = {
    getRepository: () => ({ findOne }),
  } as unknown as EntityManager;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes when unit price matches catalog sellingPrice', async () => {
    findOne.mockResolvedValue({ id: 'v1', sku: 'SKU-1', sellingPrice: '199.00' });

    await expect(
      assertCurrentProductPrices(
        [
          {
            productId: 'p1',
            variantId: 'v1',
            quantity: 2,
            unitPrice: 199,
            sku: 'SKU-1',
          },
        ],
        manager,
      ),
    ).resolves.toBeUndefined();
  });

  it('throws when catalog price changed (stale frontend/snapshot)', async () => {
    findOne.mockResolvedValue({ id: 'v1', sku: 'SKU-1', sellingPrice: '249.00' });

    await expect(
      assertCurrentProductPrices(
        [
          {
            productId: 'p1',
            variantId: 'v1',
            quantity: 1,
            unitPrice: 199,
            sku: 'SKU-1',
          },
        ],
        manager,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when variant is missing', async () => {
    findOne.mockResolvedValue(null);

    await expect(
      assertCurrentProductPrices(
        [{ productId: 'p1', variantId: 'missing', quantity: 1, unitPrice: 10 }],
        manager,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('skips catalog price validation for GoKwik complimentary lines', async () => {
    await expect(
      assertCurrentProductPrices(
        [
          {
            productId: 'p1',
            variantId: 'v1',
            quantity: 1,
            unitPrice: 0,
            totalPrice: 0,
            skipCatalogPriceCheck: true,
          },
        ],
        manager,
      ),
    ).resolves.toBeUndefined();

    expect(findOne).not.toHaveBeenCalled();
  });
});
