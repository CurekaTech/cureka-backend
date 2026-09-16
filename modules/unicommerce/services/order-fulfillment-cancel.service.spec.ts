import { CancellationStatus } from '@modules/orders/enums/cancellation-status.enum';
import { CancellationSyncStatus } from '@modules/orders/enums/cancellation-sync-status.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { OrderFulfillmentEventsRepository } from '@modules/orders/repositories/order-fulfillment-events.repository';
import { OrdersRepository } from '@modules/orders/repositories/orders.repository';
import { OrderNotificationsService } from '@modules/notifications/services/order-notifications.service';
import { RefundRequestsService } from '@modules/refund-requests/services/refund-request.service';
import { ShipmentStatus } from '@modules/shipping/enums/shipment-status.enum';
import { ShipmentsRepository } from '@modules/shipping/repositories/shipments.repository';
import { ShipwayService } from '@modules/shipping/services/shipway.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { OrderFulfillmentCancelService } from './order-fulfillment-cancel.service';
import { UnicommerceOrderApiService } from './unicommerce-order-api.service';
import { UnicommerceOrderQueueService } from './unicommerce-order-queue.service';
import { UnicommerceOrderService } from './unicommerce-order.service';

const order = {
  id: 'order-1',
  orderNumber: 'ORD1',
  orderStatus: OrderStatus.CONFIRMED,
  cancelReason: 'Changed mind',
  cancellationStatus: CancellationStatus.PROCESSING,
  cancellationUnicommerceStatus: CancellationSyncStatus.PENDING,
  cancellationShipwayStatus: CancellationSyncStatus.PENDING,
  cancellationAttemptCount: 0,
  cancellationRequestedBy: 'user-1',
  cancellationRequestedByType: 'CUSTOMER',
  phoneNumber: '9999999999',
  recipientName: 'Ada',
  grandTotal: '100.00',
  paymentMethod: 'RAZORPAY',
};

describe('OrderFulfillmentCancelService', () => {
  const ordersRepository = {
    findByIdWithItems: jest.fn(),
    updateById: jest.fn().mockResolvedValue(undefined),
  };
  const eventsRepository = { create: jest.fn().mockResolvedValue({}) };
  const unicommerceApi = {
    isConfigured: jest.fn().mockReturnValue(true),
    getSaleOrder: jest.fn(),
    cancelSaleOrder: jest.fn(),
  };
  const unicommerceOrderService = {
    isEnabled: jest.fn().mockReturnValue(true),
  };
  const unicommerceQueue = {
    getPushJobState: jest.fn().mockResolvedValue('missing'),
    enqueueCancelOrder: jest.fn(),
  };
  const shipmentsRepository = {
    findByOrderId: jest.fn(),
    save: jest.fn(),
  };
  const shipwayService = {
    isConfigured: jest.fn().mockReturnValue(true),
    cancelShipment: jest.fn(),
  };
  const refundRequestsService = { createFromOrderCancellation: jest.fn() };
  const orderNotificationsService = { notifyOrderCancelledSafely: jest.fn() };
  const eventEmitter = { emitAsync: jest.fn().mockResolvedValue([]) };
  const dataSource = {
    transaction: jest.fn(async (run: (m: unknown) => Promise<unknown>) => {
      const repo = {
        createQueryBuilder: () => ({
          setLock: () => ({
            where: () => ({
              getOne: async () => ({ ...order, orderStatus: OrderStatus.CONFIRMED }),
            }),
          }),
          update: () => ({
            set: () => ({
              where: () => ({
                execute: async () => undefined,
              }),
            }),
          }),
        }),
        find: async () => [],
        delete: async () => undefined,
      };
      return run({ getRepository: () => repo });
    }),
  };

  const service = new OrderFulfillmentCancelService(
    dataSource as unknown as DataSource,
    ordersRepository as unknown as OrdersRepository,
    eventsRepository as unknown as OrderFulfillmentEventsRepository,
    unicommerceApi as unknown as UnicommerceOrderApiService,
    unicommerceOrderService as unknown as UnicommerceOrderService,
    unicommerceQueue as unknown as UnicommerceOrderQueueService,
    shipmentsRepository as unknown as ShipmentsRepository,
    shipwayService as unknown as ShipwayService,
    refundRequestsService as unknown as RefundRequestsService,
    orderNotificationsService as unknown as OrderNotificationsService,
    eventEmitter as unknown as EventEmitter2,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    ordersRepository.findByIdWithItems.mockResolvedValue({ ...order });
    ordersRepository.updateById.mockResolvedValue(undefined);
    eventsRepository.create.mockResolvedValue({});
    unicommerceOrderService.isEnabled.mockReturnValue(true);
    unicommerceApi.isConfigured.mockReturnValue(true);
    unicommerceQueue.getPushJobState.mockResolvedValue('missing');
    shipmentsRepository.findByOrderId.mockResolvedValue(null);
  });

  it('treats a never-exported order as Unicommerce not required', async () => {
    unicommerceApi.getSaleOrder.mockResolvedValue({ successful: false, message: 'Sale order not found' });

    const outcome = await service.processCancellation('order-1');

    expect(unicommerceApi.cancelSaleOrder).not.toHaveBeenCalled();
    expect(outcome.unicommerceStatus).toBe(CancellationSyncStatus.NOT_REQUIRED);
    expect(outcome.shipwayStatus).toBe(CancellationSyncStatus.NOT_REQUIRED);
    expect(outcome.cancellationStatus).toBe(CancellationStatus.CONFIRMED);
    expect(outcome.retriable).toBe(false);
  });

  it('does not treat a missing sale order as final while a push job is in flight', async () => {
    unicommerceQueue.getPushJobState.mockResolvedValue('active');
    unicommerceApi.getSaleOrder.mockResolvedValue({ successful: false, message: 'Sale order not found' });

    const outcome = await service.processCancellation('order-1');

    expect(outcome.unicommerceStatus).toBe(CancellationSyncStatus.UNCERTAIN);
    expect(outcome.retriable).toBe(true);
    expect(unicommerceApi.cancelSaleOrder).not.toHaveBeenCalled();
  });

  it('confirms Unicommerce cancellation when successful=true', async () => {
    unicommerceApi.getSaleOrder.mockResolvedValue({
      successful: true,
      saleOrderDTO: { code: 'ORD1', status: 'CREATED' },
    });
    unicommerceApi.cancelSaleOrder.mockResolvedValue({ successful: true, message: 'Cancelled' });

    const outcome = await service.processCancellation('order-1');

    expect(unicommerceApi.cancelSaleOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        saleOrderCode: 'ORD1',
        cancelPartially: false,
        cancelOnChannel: false,
        cancelledBySeller: true,
      }),
    );
    expect(outcome.unicommerceStatus).toBe(CancellationSyncStatus.CONFIRMED);
    expect(outcome.cancellationStatus).toBe(CancellationStatus.CONFIRMED);
  });

  it('does not treat HTTP-shaped business failure as success', async () => {
    unicommerceApi.getSaleOrder.mockResolvedValue({
      successful: true,
      saleOrderDTO: { code: 'ORD1', status: 'CREATED' },
    });
    unicommerceApi.cancelSaleOrder.mockResolvedValue({
      successful: false,
      message: 'Cannot cancel dispatched order',
    });

    const outcome = await service.processCancellation('order-1');

    expect(outcome.unicommerceStatus).toBe(CancellationSyncStatus.REJECTED);
    expect(outcome.cancellationStatus).toBe(CancellationStatus.REQUIRES_ATTENTION);
    expect(outcome.retriable).toBe(false);
  });

  it('keeps cancellation unresolved when Shipway fails after Unicommerce success', async () => {
    unicommerceApi.getSaleOrder.mockResolvedValue({
      successful: true,
      saleOrderDTO: { code: 'ORD1', status: 'CREATED' },
    });
    unicommerceApi.cancelSaleOrder.mockResolvedValue({ successful: true });
    shipmentsRepository.findByOrderId.mockResolvedValue({
      id: 'shp-1',
      awbNumber: 'AWB1',
      courierId: '12',
      shipmentStatus: ShipmentStatus.CONFIRMED,
    });
    shipwayService.cancelShipment.mockResolvedValue({ success: false, message: 'Carrier timeout' });

    const outcome = await service.processCancellation('order-1');

    expect(outcome.unicommerceStatus).toBe(CancellationSyncStatus.CONFIRMED);
    expect(outcome.shipwayStatus).toBe(CancellationSyncStatus.FAILED);
    expect(outcome.cancellationStatus).toBe(CancellationStatus.REQUIRES_ATTENTION);
    expect(outcome.retriable).toBe(true);
  });

  it('marks timeout after a possible provider success as uncertain', async () => {
    unicommerceApi.getSaleOrder.mockResolvedValue({
      successful: true,
      saleOrderDTO: { code: 'ORD1', status: 'CREATED' },
    });
    unicommerceApi.cancelSaleOrder.mockRejectedValue(new Error('Unicommerce request timed out after 15000ms'));

    const outcome = await service.processCancellation('order-1');

    expect(outcome.unicommerceStatus).toBe(CancellationSyncStatus.UNCERTAIN);
    expect(outcome.retriable).toBe(true);
  });

  it('does not re-run provider calls when cancellation is already confirmed', async () => {
    ordersRepository.findByIdWithItems.mockResolvedValue({
      ...order,
      cancellationStatus: CancellationStatus.CONFIRMED,
      cancellationUnicommerceStatus: CancellationSyncStatus.CONFIRMED,
      cancellationShipwayStatus: CancellationSyncStatus.NOT_REQUIRED,
    });

    const outcome = await service.processCancellation('order-1');

    expect(unicommerceApi.getSaleOrder).not.toHaveBeenCalled();
    expect(unicommerceApi.cancelSaleOrder).not.toHaveBeenCalled();
    expect(shipwayService.cancelShipment).not.toHaveBeenCalled();
    expect(outcome.cancellationStatus).toBe(CancellationStatus.CONFIRMED);
    expect(outcome.retriable).toBe(false);
  });

  it('treats a remote Unicommerce order that is already cancelled as confirmed', async () => {
    unicommerceApi.getSaleOrder.mockResolvedValue({
      successful: true,
      saleOrderDTO: { code: 'ORD1', status: 'CANCELLED' },
    });

    const outcome = await service.processCancellation('order-1');

    expect(unicommerceApi.cancelSaleOrder).not.toHaveBeenCalled();
    expect(outcome.unicommerceStatus).toBe(CancellationSyncStatus.CONFIRMED);
    expect(outcome.cancellationStatus).toBe(CancellationStatus.CONFIRMED);
  });

  it('rejects retry once cancellation is already confirmed', async () => {
    ordersRepository.findByIdWithItems.mockResolvedValue({
      ...order,
      cancellationStatus: CancellationStatus.CONFIRMED,
    });

    const outcome = await service.retryCancellation('order-1', { id: 'admin-1', type: 'ADMIN' });

    expect(unicommerceQueue.enqueueCancelOrder).not.toHaveBeenCalled();
    expect(outcome.retriable).toBe(false);
    expect(outcome.message).toContain('Retry is not allowed');
  });
});
