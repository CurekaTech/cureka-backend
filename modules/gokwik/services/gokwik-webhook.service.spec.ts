import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { DataSource } from 'typeorm';
import { GokwikWebhookService } from './gokwik-webhook.service';
import { GokwikRepository } from '../repositories/gokwik.repository';
import { GokwikQueueService } from './gokwik-queue.service';
import { GokwikApiService } from './gokwik-api.service';
import { UnicommerceOrderQueueService } from '@modules/unicommerce/services/unicommerce-order-queue.service';

describe('GokwikWebhookService', () => {
  const update = jest.fn();
  const repository = {
    findWebhookEvent: jest.fn(),
    createWebhookEvent: jest.fn(),
    findWebhookEventById: jest.fn(),
    markWebhookEvent: jest.fn(),
    findOrderByPaymentId: jest.fn(),
    sumSuccessfulOrPendingRefunds: jest.fn(),
    upsertRefund: jest.fn(),
  } as unknown as GokwikRepository;

  const queueService = {
    enqueueWebhook: jest.fn(),
    enqueueOrderStatus: jest.fn(),
  } as unknown as GokwikQueueService;

  const apiService = {} as GokwikApiService;

  const unicommerceOrderQueueService = {
    enqueuePushOrder: jest.fn(),
  } as unknown as UnicommerceOrderQueueService;

  const dataSource = {
    getRepository: jest.fn().mockReturnValue({ update }),
  } as unknown as DataSource;

  const service = new GokwikWebhookService(
    repository,
    queueService,
    apiService,
    dataSource,
    unicommerceOrderQueueService,
  );

  const successPayload = {
    event: 'transaction.successful',
    entity: 'transaction' as const,
    data: {
      hmac: 'x',
      paymentId: 'pay_1',
      merchantId: 'm1',
      merchantReferenceId: 'ref',
      currency: 'INR',
      method: 'UPI',
      provider: 'gokwik',
      amount: 100,
      rewardTransaction: false,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('receiveTransaction', () => {
    it('ignores duplicate webhook payloads', async () => {
      (repository.findWebhookEvent as jest.Mock).mockResolvedValue({ id: 'existing' });

      const result = await service.receiveTransaction(successPayload);

      expect(result).toEqual({ received: true, duplicate: true });
      expect(repository.createWebhookEvent).not.toHaveBeenCalled();
      expect(queueService.enqueueWebhook).not.toHaveBeenCalled();
    });

    it('persists and enqueues new events', async () => {
      (repository.findWebhookEvent as jest.Mock).mockResolvedValue(null);
      (repository.createWebhookEvent as jest.Mock).mockResolvedValue({ id: 'evt-1' });

      const result = await service.receiveTransaction(successPayload);

      expect(result).toEqual({ received: true, duplicate: false });
      expect(queueService.enqueueWebhook).toHaveBeenCalledWith('evt-1');
    });
  });

  describe('processEvent transaction', () => {
    it('marks event failed and rethrows when order link is missing', async () => {
      (repository.findWebhookEventById as jest.Mock).mockResolvedValue({
        id: 'evt-1',
        status: 'received',
        entity: 'transaction',
        event: 'transaction.successful',
        providerReferenceId: 'pay_1',
        payload: successPayload,
      });
      (repository.findOrderByPaymentId as jest.Mock).mockResolvedValue(null);

      await expect(service.processEvent('evt-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.markWebhookEvent).toHaveBeenCalledWith(
        'evt-1',
        'failed',
        expect.any(String),
      );
    });

    it('applies success and enqueues UniCommerce push', async () => {
      (repository.findWebhookEventById as jest.Mock).mockResolvedValue({
        id: 'evt-1',
        status: 'received',
        entity: 'transaction',
        event: 'transaction.successful',
        providerReferenceId: 'pay_1',
        payload: successPayload,
      });
      (repository.findOrderByPaymentId as jest.Mock).mockResolvedValue({
        orderId: 'order-1',
        paymentAmount: '100.00',
        payableOnDelivery: '0',
        order: {
          orderNumber: 'ORD1',
          paymentStatus: OrderPaymentStatus.PENDING,
          orderStatus: OrderStatus.PENDING,
          grandTotal: '100.00',
        },
      });

      await service.processEvent('evt-1');

      expect(update).toHaveBeenCalledWith(
        { id: 'order-1' },
        {
          paymentStatus: OrderPaymentStatus.PAID,
          orderStatus: OrderStatus.CONFIRMED,
        },
      );
      expect(queueService.enqueueOrderStatus).toHaveBeenCalledWith('order-1', 'Confirmed');
      expect(unicommerceOrderQueueService.enqueuePushOrder).toHaveBeenCalledWith('order-1');
      expect(repository.markWebhookEvent).toHaveBeenCalledWith('evt-1', 'processed');
    });

    it('ignores out-of-order failure after PAID', async () => {
      (repository.findWebhookEventById as jest.Mock).mockResolvedValue({
        id: 'evt-2',
        status: 'received',
        entity: 'transaction',
        event: 'transaction.failure',
        providerReferenceId: 'pay_1',
        payload: {
          ...successPayload,
          event: 'transaction.failure',
        },
      });
      (repository.findOrderByPaymentId as jest.Mock).mockResolvedValue({
        orderId: 'order-1',
        paymentAmount: '100.00',
        payableOnDelivery: '0',
        order: {
          orderNumber: 'ORD1',
          paymentStatus: OrderPaymentStatus.PAID,
          orderStatus: OrderStatus.CONFIRMED,
          grandTotal: '100.00',
        },
      });

      await service.processEvent('evt-2');

      expect(update).not.toHaveBeenCalled();
      expect(unicommerceOrderQueueService.enqueuePushOrder).not.toHaveBeenCalled();
      expect(repository.markWebhookEvent).toHaveBeenCalledWith('evt-2', 'processed');
    });

    it('rejects amount mismatch', async () => {
      (repository.findWebhookEventById as jest.Mock).mockResolvedValue({
        id: 'evt-3',
        status: 'received',
        entity: 'transaction',
        event: 'transaction.successful',
        providerReferenceId: 'pay_1',
        payload: successPayload,
      });
      (repository.findOrderByPaymentId as jest.Mock).mockResolvedValue({
        orderId: 'order-1',
        paymentAmount: '50.00',
        payableOnDelivery: '0',
        order: {
          orderNumber: 'ORD1',
          paymentStatus: OrderPaymentStatus.PENDING,
          orderStatus: OrderStatus.PENDING,
          grandTotal: '50.00',
        },
      });

      await expect(service.processEvent('evt-3')).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
