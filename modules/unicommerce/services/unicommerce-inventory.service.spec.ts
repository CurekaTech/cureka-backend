import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProductVariantsRepository } from '@modules/product/repositories/product-variants.repository';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { EVENTS } from '@packages/events';
import { UnicommerceInventoryService } from './unicommerce-inventory.service';

describe('UnicommerceInventoryService', () => {
  const productVariantsRepository = {
    findPublishedActiveBySku: jest.fn(),
    updateStockById: jest.fn(),
  } as unknown as ProductVariantsRepository;

  const configService = {
    get: jest.fn(),
  } as unknown as ConfigService;

  const eventEmitter = {
    emitAsync: jest.fn(),
  } as unknown as EventEmitter2;

  const service = new UnicommerceInventoryService(
    productVariantsRepository,
    configService,
    eventEmitter,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (configService.get as jest.Mock).mockReturnValue('WH-01');
  });

  it('updates stock and emits product updated event on success', async () => {
    const product = { refId: 'PRD-001' } as ProductEntity;
    const variant = { id: 'variant-1', product } as ProductVariantEntity;

    (productVariantsRepository.findPublishedActiveBySku as jest.Mock).mockResolvedValue(variant);

    const result = await service.updateInventory({
      inventoryList: [
        {
          productId: 'PRD-001',
          variantId: 'SKU-001',
          inventory: '12',
          facilityCode: 'WH-01',
        },
      ],
    });

    expect(result).toEqual({ status: 'SUCCESS' });
    expect(productVariantsRepository.updateStockById).toHaveBeenCalledWith('variant-1', 12);
    expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
      EVENTS.PRODUCT_UPDATED,
      expect.objectContaining({ refId: 'PRD-001', action: 'updated' }),
    );
  });

  it('returns partial success when some rows fail', async () => {
    (productVariantsRepository.findPublishedActiveBySku as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'variant-2',
        product: { refId: 'PRD-002' },
      });

    const result = await service.updateInventory({
      inventoryList: [
        {
          productId: 'PRD-001',
          variantId: 'MISSING',
          inventory: '5',
        },
        {
          productId: 'PRD-002',
          variantId: 'SKU-002',
          inventory: '8',
        },
      ],
    });

    expect(result.status).toBe('PARTIAL_SUCCESS');
    expect(result.failedProductList).toEqual([
      {
        productId: 'PRD-001',
        variantId: 'MISSING',
        message: 'Variant not found',
      },
    ]);
    expect(productVariantsRepository.updateStockById).toHaveBeenCalledTimes(1);
  });

  it('returns failed when all rows fail', async () => {
    (productVariantsRepository.findPublishedActiveBySku as jest.Mock).mockResolvedValue(null);

    const result = await service.updateInventory({
      inventoryList: [
        {
          productId: 'PRD-001',
          variantId: 'MISSING',
          inventory: '5',
        },
      ],
    });

    expect(result).toEqual({
      status: 'FAILED',
      failedProductList: [
        {
          productId: 'PRD-001',
          variantId: 'MISSING',
          message: 'Variant not found',
        },
      ],
    });
    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
  });
});
