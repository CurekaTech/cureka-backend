import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { OrdersRepository } from '@modules/orders/repositories/orders.repository';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { UnicommerceOrderService } from './unicommerce-order.service';
import { UnicommerceOrderApiService } from './unicommerce-order-api.service';

describe('UnicommerceOrderService', () => {
  const configValues: Record<string, unknown> = {
    'unicommerceOrder.enabled': true,
    'unicommerceOrder.channel': 'CUSTOM',
    'unicommerceOrder.facilityCode': 'stgcureka',
    'unicommerceOrder.currency': 'INR',
  };

  const configService = {
    get: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;

  const ordersRepository = {
    findForUnicommercePush: jest.fn(),
  } as unknown as OrdersRepository;

  const apiService = {
    createSaleOrder: jest.fn(),
    getSaleOrder: jest.fn(),
    createReversePickup: jest.fn(),
    cancelSaleOrder: jest.fn(),
    isConfigured: jest.fn().mockReturnValue(true),
  } as unknown as UnicommerceOrderApiService;

  const service = new UnicommerceOrderService(configService, ordersRepository, apiService);

  const order = {
    id: 'order-uuid-1',
    orderNumber: 'ORD123456780001',
    paymentMethod: OrderPaymentMethod.RAZORPAY,
    paymentStatus: OrderPaymentStatus.PAID,
    orderStatus: OrderStatus.CONFIRMED,
    discountAmount: '0',
    shippingAmount: '0',
    codCharge: '0',
    grandTotal: '100.00',
    recipientName: 'Jane',
    phoneNumber: '9876543210',
    pincode: '600001',
    addressLine1: 'Addr',
    city: 'Chennai',
    state: 'TN',
    placedAt: new Date('2026-07-09T05:00:00.000Z'),
    createdAt: new Date('2026-07-09T05:00:00.000Z'),
    items: [],
  } as unknown as OrderEntity;

  beforeEach(() => {
    jest.clearAllMocks();
    configValues['unicommerceOrder.enabled'] = true;
    (apiService.isConfigured as jest.Mock).mockReturnValue(true);
  });

  it('skips push when disabled', async () => {
    configValues['unicommerceOrder.enabled'] = false;
    const result = await service.pushOrder('order-uuid-1');
    expect(result).toBeNull();
    expect(ordersRepository.findForUnicommercePush).not.toHaveBeenCalled();
  });

  it('skips push when credentials are missing', async () => {
    const missingCredsApi = {
      createSaleOrder: jest.fn(),
      isConfigured: jest.fn().mockReturnValue(false),
    } as unknown as UnicommerceOrderApiService;
    const serviceWithMissingCreds = new UnicommerceOrderService(
      configService,
      ordersRepository,
      missingCredsApi,
    );
    const result = await serviceWithMissingCreds.pushOrder('order-uuid-1');
    expect(result).toBeNull();
    expect(ordersRepository.findForUnicommercePush).not.toHaveBeenCalled();
  });

  it('throws when the order is missing', async () => {
    (ordersRepository.findForUnicommercePush as jest.Mock).mockResolvedValue(null);
    await expect(service.pushOrder('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('skips push for unpaid prepaid orders', async () => {
    (ordersRepository.findForUnicommercePush as jest.Mock).mockResolvedValue({
      ...order,
      paymentStatus: OrderPaymentStatus.PENDING,
      orderStatus: OrderStatus.PROCESSING,
    });

    const result = await service.pushOrder('order-uuid-1');

    expect(result).toBeNull();
    expect(apiService.createSaleOrder).not.toHaveBeenCalled();
  });

  it('skips push for pending COD draft orders', async () => {
    (ordersRepository.findForUnicommercePush as jest.Mock).mockResolvedValue({
      ...order,
      paymentMethod: OrderPaymentMethod.COD,
      paymentStatus: OrderPaymentStatus.PENDING,
      orderStatus: OrderStatus.PENDING,
    });

    const result = await service.pushOrder('order-uuid-1');

    expect(result).toBeNull();
    expect(apiService.createSaleOrder).not.toHaveBeenCalled();
  });

  it('skips push when a cancellation is already in progress', async () => {
    (ordersRepository.findForUnicommercePush as jest.Mock).mockResolvedValue({
      ...order,
      cancellationStatus: 'PROCESSING',
    });

    const result = await service.pushOrder('order-uuid-1');

    expect(result).toBeNull();
    expect(apiService.createSaleOrder).not.toHaveBeenCalled();
  });

  it('pushes COD orders once confirmed/processing', async () => {
    (ordersRepository.findForUnicommercePush as jest.Mock).mockResolvedValue({
      ...order,
      paymentMethod: OrderPaymentMethod.COD,
      paymentStatus: OrderPaymentStatus.PENDING,
      orderStatus: OrderStatus.PROCESSING,
    });
    (apiService.createSaleOrder as jest.Mock).mockResolvedValue({ successful: true });

    const result = await service.pushOrder('order-uuid-1');

    expect(apiService.createSaleOrder).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ successful: true });
  });

  it('builds the saleOrder payload and posts to Unicommerce', async () => {
    (ordersRepository.findForUnicommercePush as jest.Mock).mockResolvedValue(order);
    (apiService.createSaleOrder as jest.Mock).mockResolvedValue({ successful: true });

    const result = await service.pushOrder('order-uuid-1');

    expect(apiService.createSaleOrder).toHaveBeenCalledTimes(1);
    const sentPayload = (apiService.createSaleOrder as jest.Mock).mock.calls[0][0];
    expect(sentPayload.saleOrder.code).toBe('ORD123456780001');
    expect(sentPayload.saleOrder.channel).toBe('CUSTOM');
    expect(result).toEqual({ successful: true });
  });

  it('creates a reverse pickup using Uniware item codes from getSaleOrder', async () => {
    (apiService.getSaleOrder as jest.Mock).mockResolvedValue({
      successful: true,
      saleOrderDTO: {
        code: 'ORD123456780001',
        saleOrderItems: [
          { code: 'ORD123456780001-1', itemSku: 'SKU-A', statusCode: 'DELIVERED' },
          { code: 'ORD123456780001-2', itemSku: 'SKU-A', statusCode: 'DELIVERED' },
        ],
      },
    });
    (apiService.createReversePickup as jest.Mock).mockResolvedValue({
      successful: true,
      reversePickupCode: 'RET0000001',
    });

    const result = await service.createReversePickup({
      orderNumber: 'ORD123456780001',
      reversePickupCode: 'RET0000001',
      reason: 'Damaged on arrival',
      items: [{ sku: 'SKU-A', quantity: 1 }],
      originalOrderItems: [{ sku: 'SKU-A', quantity: 2 }],
      pickupAddress: {
        recipientName: 'Jane Doe',
        phoneNumber: '9876543210',
        addressLine1: 'Addr',
        addressLine2: null,
        city: 'Chennai',
        state: 'TN',
        pincode: '600001',
      },
    });

    expect(result.successful).toBe(true);
    const payload = (apiService.createReversePickup as jest.Mock).mock.calls[0][0];
    expect(payload.saleOrderCode).toBe('ORD123456780001');
    expect(payload.actionCode).toBe('WAC');
    expect(payload.reversePickItems).toEqual([
      { saleOrderItemCode: 'ORD123456780001-1', reason: 'Damaged on arrival' },
    ]);
  });

  it('cancels a full sale order on Unicommerce', async () => {
    (apiService.cancelSaleOrder as jest.Mock).mockResolvedValue({ successful: true });

    const result = await service.cancelSaleOrder({
      orderNumber: 'ORD123456780001',
      reason: 'Customer changed mind',
    });

    expect(result).toEqual({ successful: true });
    expect(apiService.cancelSaleOrder).toHaveBeenCalledWith({
      saleOrderCode: 'ORD123456780001',
      cancelPartially: false,
      cancelOnChannel: true,
      cancellationReason: 'Customer changed mind',
    });
  });

  it('skips cancel when Unicommerce is disabled', async () => {
    configValues['unicommerceOrder.enabled'] = false;
    const result = await service.cancelSaleOrder({
      orderNumber: 'ORD123456780001',
      reason: 'Customer changed mind',
    });
    expect(result).toBeNull();
    expect(apiService.cancelSaleOrder).not.toHaveBeenCalled();
  });
});
