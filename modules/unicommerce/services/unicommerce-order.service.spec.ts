import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { OrdersRepository } from '@modules/orders/repositories/orders.repository';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { UnicommerceOrderService } from './unicommerce-order.service';
import { UnicommerceOrderApiService } from './unicommerce-order-api.service';

describe('UnicommerceOrderService', () => {
  const configValues: Record<string, unknown> = {
    'unicommerceOrder.enabled': true,
    'unicommerceOrder.facilityCode': 'WH-01',
    'unicommerceOrder.currency': 'INR',
    'unicommerceOrder.slaHours': 48,
  };

  const configService = {
    get: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;

  const ordersRepository = {
    findForUnicommercePush: jest.fn(),
  } as unknown as OrdersRepository;

  const apiService = {
    postOrder: jest.fn(),
  } as unknown as UnicommerceOrderApiService;

  const service = new UnicommerceOrderService(configService, ordersRepository, apiService);

  const order = {
    id: 'order-uuid-1',
    orderNumber: 'ORD123456780001',
    paymentMethod: OrderPaymentMethod.RAZORPAY,
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
  });

  it('skips push when disabled', async () => {
    configValues['unicommerceOrder.enabled'] = false;
    const result = await service.pushOrder('order-uuid-1');
    expect(result).toBeNull();
    expect(ordersRepository.findForUnicommercePush).not.toHaveBeenCalled();
  });

  it('throws when the order is missing', async () => {
    (ordersRepository.findForUnicommercePush as jest.Mock).mockResolvedValue(null);
    await expect(service.pushOrder('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('builds the payload and posts to UniCommerce', async () => {
    (ordersRepository.findForUnicommercePush as jest.Mock).mockResolvedValue(order);
    (apiService.postOrder as jest.Mock).mockResolvedValue({ status: 'success' });

    const result = await service.pushOrder('order-uuid-1');

    expect(apiService.postOrder).toHaveBeenCalledTimes(1);
    const sentPayload = (apiService.postOrder as jest.Mock).mock.calls[0][0];
    expect(sentPayload.id).toBe('ORD123456780001');
    expect(result).toEqual({ status: 'success' });
  });
});
