import { BadRequestException } from '@nestjs/common';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderItemsRepository } from '@modules/orders/repositories/order-items.repository';
import { OrdersRepository } from '@modules/orders/repositories/orders.repository';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { DataSource } from 'typeorm';
import { GOKWIK_COMPLIMENTARY_LINE_SOURCE } from '../constants/gokwik-line-item.constants';
import { GokwikLineItemDto } from '../dto/gokwik-line-item.dto';
import { GokwikComplimentaryOrderItemsService } from './gokwik-complimentary-order-items.service';

jest.mock('@packages/common', () => ({
  generateUniqueRefId: jest.fn(async () => 'order-item-ref-1'),
}));

describe('GokwikComplimentaryOrderItemsService', () => {
  const orderId = 'order-1';
  const userId = 'user-1';
  const productId = 'dc372bee-0a20-4166-9d1c-46e8055a2f4e';
  const variantId = '6ce5adad-264d-4f6c-8623-e9ee675d1492';

  const createMany = jest.fn();
  const updateById = jest.fn();
  const existsByRefId = jest.fn().mockResolvedValue(false);
  const findByIdAndUserId = jest.fn();
  const getOne = jest.fn();
  const transaction = jest.fn(async (work: (manager: unknown) => Promise<unknown>) =>
    work({
      getRepository: () => ({
        createQueryBuilder: () => ({
          innerJoinAndSelect: jest.fn().mockReturnThis(),
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getOne,
        }),
      }),
    }),
  );

  const dataSource = { transaction } as unknown as DataSource;
  const ordersRepository = { findByIdAndUserId } as unknown as OrdersRepository;
  const orderItemsRepository = {
    createMany,
    updateById,
    existsByRefId,
  } as unknown as OrderItemsRepository;

  const service = new GokwikComplimentaryOrderItemsService(
    dataSource,
    ordersRepository,
    orderItemsRepository,
  );

  const baseOrder = {
    id: orderId,
    orderNumber: 'ORD1001',
    items: [],
  } as unknown as OrderEntity;

  const complimentaryLine: GokwikLineItemDto = {
    product_id: productId,
    variant_id: variantId,
    quantity: 1,
    price: 89,
    mrp: 89,
    discount: 89,
    source: GOKWIK_COMPLIMENTARY_LINE_SOURCE,
    title: 'diclojat-pain-relief-gel',
    discounts: [{ amount: 89, code: 'CARE+3000', type: 'gkp-internal-coupon' }],
  };

  const normalLine: GokwikLineItemDto = {
    product_id: productId,
    variant_id: '11111111-1111-1111-1111-111111111111',
    quantity: 1,
    price: 499,
    source: 'cureka',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    findByIdAndUserId
      .mockResolvedValueOnce({ ...baseOrder, items: [] })
      .mockResolvedValueOnce({
        ...baseOrder,
        items: [
          {
            productId,
            variantId,
            sku: 'SKU-FREE',
            quantity: 1,
            unitPrice: '0.00',
            totalPrice: '0.00',
          },
        ],
      });
    getOne.mockResolvedValue({
      id: variantId,
      sku: 'SKU-FREE',
      stock: 10,
      product: { name: 'Diclojat Gel', status: ProductStatus.PUBLISHED },
      attributeValues: [],
      status: VariantStatus.ACTIVE,
    });
  });

  it('returns unchanged order when no complimentary line items are present', async () => {
    const result = await service.syncComplimentaryItems(userId, baseOrder, [normalLine]);
    expect(result.addedItems).toEqual([]);
    expect(result.order).toBe(baseOrder);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('adds complimentary items with zero effective price even when GoKwik sends catalog price', async () => {
    const result = await service.syncComplimentaryItems(userId, baseOrder, [normalLine, complimentaryLine]);

    expect(createMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          orderId,
          productId,
          variantId,
          quantity: 1,
          unitPrice: '0.00',
          totalPrice: '0.00',
          sku: 'SKU-FREE',
        }),
      ],
      expect.anything(),
    );
    expect(result.addedItems).toHaveLength(1);
    expect(result.addedItems[0].metadata.couponCode).toBe('CARE+3000');
    expect(result.addedItems[0].metadata.gokwikPrice).toBe(89);
    expect(result.order.items?.[0].unitPrice).toBe('0.00');
  });

  it('is idempotent when complimentary variant already exists on the order at zero', async () => {
    findByIdAndUserId.mockReset();
    findByIdAndUserId
      .mockResolvedValueOnce({
        ...baseOrder,
        items: [
          {
            id: 'oi-1',
            variantId,
            productId,
            sku: 'SKU-FREE',
            quantity: 1,
            unitPrice: '0.00',
            totalPrice: '0.00',
          },
        ],
      })
      .mockResolvedValueOnce({
        ...baseOrder,
        items: [
          {
            id: 'oi-1',
            variantId,
            productId,
            sku: 'SKU-FREE',
            quantity: 1,
            unitPrice: '0.00',
            totalPrice: '0.00',
          },
        ],
      });

    const result = await service.syncComplimentaryItems(userId, baseOrder, [complimentaryLine]);

    expect(createMany).not.toHaveBeenCalled();
    expect(updateById).not.toHaveBeenCalled();
    expect(result.addedItems).toEqual([]);
  });

  it('forces existing non-zero complimentary line back to 0.00', async () => {
    findByIdAndUserId.mockReset();
    findByIdAndUserId
      .mockResolvedValueOnce({
        ...baseOrder,
        items: [
          {
            id: 'oi-paid',
            variantId,
            productId,
            sku: 'SKU-FREE',
            quantity: 1,
            unitPrice: '89.00',
            totalPrice: '89.00',
          },
        ],
      })
      .mockResolvedValueOnce({
        ...baseOrder,
        items: [
          {
            id: 'oi-paid',
            variantId,
            productId,
            sku: 'SKU-FREE',
            quantity: 1,
            unitPrice: '0.00',
            totalPrice: '0.00',
          },
        ],
      });

    const result = await service.syncComplimentaryItems(userId, baseOrder, [complimentaryLine]);

    expect(createMany).not.toHaveBeenCalled();
    expect(updateById).toHaveBeenCalledWith(
      'oi-paid',
      expect.objectContaining({
        unitPrice: '0.00',
        totalPrice: '0.00',
        quantity: 1,
      }),
      expect.anything(),
    );
    expect(result.addedItems).toEqual([]);
    expect(result.order.items?.[0].unitPrice).toBe('0.00');
  });

  it('throws when complimentary product/variant cannot be resolved', async () => {
    getOne.mockResolvedValue(null);

    await expect(
      service.syncComplimentaryItems(userId, baseOrder, [complimentaryLine]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
