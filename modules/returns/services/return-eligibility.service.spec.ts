import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderItemEntity } from '@modules/orders/entities/order-item.entity';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { IOrderItemReturnPolicySnapshot } from '@modules/orders/interfaces/order-item-return-policy.interface';
import { PolicyWindowUnit } from '@modules/product/enums/policy-window-unit.enum';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { Repository } from 'typeorm';
import { ReturnResolution } from '../enums/return-resolution.enum';
import { ReturnRequestsRepository } from '../repositories/return-requests.repository';
import { ReturnEligibilityService } from './return-eligibility.service';

const NOW = new Date('2026-01-15T00:00:00.000Z');
const DELIVERED_AT = new Date('2026-01-10T00:00:00.000Z');

const snapshot = (
  overrides: Partial<IOrderItemReturnPolicySnapshot> = {},
): IOrderItemReturnPolicySnapshot =>
  ({
    returnable: true,
    replaceable: false,
    refundable: true,
    returnWindow: 7,
    returnWindowUnit: PolicyWindowUnit.DAYS,
    replacementWindow: 7,
    replacementWindowUnit: PolicyWindowUnit.DAYS,
    returnPickupRequired: true,
    returnQcRequired: true,
    returnEvidenceRequired: false,
    noPickupRefundAllowed: false,
    capturedAt: DELIVERED_AT.toISOString(),
    source: 'variant',
    ...overrides,
  }) as IOrderItemReturnPolicySnapshot;

const orderItem = (overrides: Partial<OrderItemEntity> = {}): OrderItemEntity =>
  ({
    id: 'item-1',
    productId: 'product-1',
    variantId: 'variant-1',
    sku: 'SKU-1',
    productName: 'Vitamin C Serum',
    variantName: '30ml',
    quantity: 2,
    unitPrice: '500.00',
    totalPrice: '1000.00',
    returnPolicySnapshot: snapshot(),
    ...overrides,
  }) as OrderItemEntity;

const order = (overrides: Partial<OrderEntity> = {}): OrderEntity =>
  ({
    id: 'order-1',
    orderNumber: 'CUR2026000001',
    orderStatus: OrderStatus.DELIVERED,
    deliveredAt: DELIVERED_AT,
    items: [orderItem()],
    ...overrides,
  }) as OrderEntity;

describe('ReturnEligibilityService', () => {
  let service: ReturnEligibilityService;
  let returnRequestsRepository: jest.Mocked<Pick<ReturnRequestsRepository, 'sumCommittedQuantityByOrderItem'>>;
  let variantsRepository: jest.Mocked<Pick<Repository<ProductVariantEntity>, 'find'>>;

  beforeEach(() => {
    returnRequestsRepository = {
      sumCommittedQuantityByOrderItem: jest.fn().mockResolvedValue(new Map<string, number>()),
    };
    variantsRepository = { find: jest.fn().mockResolvedValue([]) };

    service = new ReturnEligibilityService(
      returnRequestsRepository as unknown as ReturnRequestsRepository,
      variantsRepository as unknown as Repository<ProductVariantEntity>,
    );
  });

  it('allows a refund return inside the window on a delivered order', async () => {
    const result = await service.evaluateOrder(order(), { now: NOW });

    expect(result.hasEligibleItems).toBe(true);
    expect(result.items[0].canReturn).toBe(true);
    expect(result.items[0].availableQuantity).toBe(2);
    expect(result.items[0].allowedResolutions).toEqual([ReturnResolution.REFUND]);
    expect(result.items[0].ineligibilityCode).toBeNull();
  });

  it('blocks returns until the order is delivered', async () => {
    const result = await service.evaluateOrder(
      order({ orderStatus: OrderStatus.SHIPPED, deliveredAt: null }),
      { now: NOW },
    );

    expect(result.items[0].canReturn).toBe(false);
    expect(result.items[0].ineligibilityCode).toBe('ITEM_NOT_DELIVERED');
  });

  it('blocks returns on RTO orders before any other check', async () => {
    const result = await service.evaluateOrder(order({ orderStatus: OrderStatus.RTO }), {
      now: NOW,
    });

    expect(result.items[0].ineligibilityCode).toBe('ORDER_IS_RTO');
  });

  it('blocks returns when the delivery date is unknown', async () => {
    const result = await service.evaluateOrder(order({ deliveredAt: null }), { now: NOW });

    expect(result.items[0].ineligibilityCode).toBe('DELIVERY_DATE_UNAVAILABLE');
  });

  it('blocks non-returnable products', async () => {
    const result = await service.evaluateOrder(
      order({
        items: [
          orderItem({ returnPolicySnapshot: snapshot({ returnable: false, replaceable: false }) }),
        ],
      }),
      { now: NOW },
    );

    expect(result.items[0].ineligibilityCode).toBe('RETURN_NOT_ALLOWED');
    expect(result.hasEligibleItems).toBe(false);
  });

  it('blocks a return once the window has closed', async () => {
    const result = await service.evaluateOrder(order(), {
      now: new Date('2026-01-20T00:00:00.000Z'),
    });

    expect(result.items[0].ineligibilityCode).toBe('RETURN_WINDOW_EXPIRED');
  });

  it('waives the window for an expired-product claim', async () => {
    const result = await service.evaluateOrder(order(), {
      now: new Date('2026-06-20T00:00:00.000Z'),
      isExpiredProductClaim: true,
    });

    expect(result.items[0].canReturn).toBe(true);
  });

  it('still refuses a non-returnable product on an expired-product claim', async () => {
    const result = await service.evaluateOrder(
      order({
        items: [
          orderItem({ returnPolicySnapshot: snapshot({ returnable: false, replaceable: false }) }),
        ],
      }),
      { now: NOW, isExpiredProductClaim: true },
    );

    expect(result.items[0].canReturn).toBe(false);
    expect(result.items[0].ineligibilityCode).toBe('RETURN_NOT_ALLOWED');
  });

  it('subtracts quantity already committed to other returns', async () => {
    returnRequestsRepository.sumCommittedQuantityByOrderItem.mockResolvedValue(
      new Map([['item-1', 1]]),
    );

    const result = await service.evaluateOrder(order(), { now: NOW });

    expect(result.items[0].committedQuantity).toBe(1);
    expect(result.items[0].availableQuantity).toBe(1);
    expect(result.items[0].canReturn).toBe(true);
  });

  it('blocks a second return once the whole line is committed', async () => {
    returnRequestsRepository.sumCommittedQuantityByOrderItem.mockResolvedValue(
      new Map([['item-1', 2]]),
    );

    const result = await service.evaluateOrder(order(), { now: NOW });

    expect(result.items[0].availableQuantity).toBe(0);
    expect(result.items[0].ineligibilityCode).toBe('ACTIVE_RETURN_ALREADY_EXISTS');
  });

  it('offers replacement only when the policy allows it', async () => {
    const result = await service.evaluateOrder(
      order({
        items: [
          orderItem({
            returnPolicySnapshot: snapshot({ returnable: false, replaceable: true }),
          }),
        ],
      }),
      { now: NOW },
    );

    expect(result.items[0].allowedResolutions).toEqual([ReturnResolution.REPLACEMENT]);
    expect(result.items[0].canRequestRefund).toBe(false);
  });

  it('does not offer a refund when the product is returnable but non-refundable', async () => {
    const result = await service.evaluateOrder(
      order({
        items: [
          orderItem({
            returnPolicySnapshot: snapshot({ refundable: false, replaceable: false }),
          }),
        ],
      }),
      { now: NOW },
    );

    expect(result.items[0].canRequestRefund).toBe(false);
    expect(result.items[0].ineligibilityCode).toBe('RETURN_NOT_ALLOWED');
  });

  it('falls back to the live catalogue for legacy items with no snapshot', async () => {
    await service.evaluateOrder(
      order({ items: [orderItem({ returnPolicySnapshot: null })] }),
      { now: NOW },
    );

    expect(variantsRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ relations: { product: true } }),
    );
  });

  it('does not query the catalogue when every item carries a snapshot', async () => {
    await service.evaluateOrder(order(), { now: NOW });

    expect(variantsRepository.find).not.toHaveBeenCalled();
  });
});
