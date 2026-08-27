import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { OrdersRepository } from '@modules/orders/repositories/orders.repository';
import { ShipmentStatus } from '../enums/shipment-status.enum';
import { ShipmentEntity } from '../entities/shipment.entity';
import { ShipmentsRepository } from '../repositories/shipments.repository';
import { ShipmentEventsRepository } from '../repositories/shipment-events.repository';
import { ShipwayService } from './shipway.service';
import { ShippingService } from './shipping.service';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';

describe('ShippingService webhook handling', () => {
  const shipment: ShipmentEntity = {
    id: 'ship-1',
    refId: 'SHI1',
    orderId: 'ord-1',
    orderNumber: 'CUR1',
    groupKey: 'default',
    shipwayOrderId: 'CUR1',
    shipmentId: null,
    awbNumber: 'AWB1',
    courierName: 'Test',
    courierId: null,
    trackingUrl: null,
    labelUrl: null,
    invoiceUrl: null,
    pickupId: null,
    warehouseId: null,
    returnWarehouseId: null,
    shipmentStatus: ShipmentStatus.IN_TRANSIT,
    shipwayRawStatus: 'INT',
    pushedAt: new Date('2026-08-01T00:00:00.000Z'),
    lastSyncedAt: new Date('2026-08-10T10:00:00.000Z'),
    lastWebhookEventId: null,
    events: [
      {
        id: 'evt-1',
        refId: 'SE1',
        shipmentId: 'ship-1',
        status: 'INT',
        description: null,
        location: null,
        happenedAt: new Date('2026-08-10T09:00:00.000Z'),
        source: 'webhook',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never,
    ],
    items: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test',
    updatedBy: 'shipway-webhook',
  };

  let shipmentsRepository: jest.Mocked<Pick<ShipmentsRepository, 'findByShipwayOrderId' | 'findByOrderId' | 'save'>>;
  let shipmentEventsRepository: jest.Mocked<
    Pick<
      ShipmentEventsRepository,
      'create' | 'existsByRefId' | 'existsDuplicateEvent' | 'findLatestHappenedAt' | 'findByShipmentId'
    >
  >;
  let ordersRepository: jest.Mocked<Pick<OrdersRepository, 'updateById' | 'findById'>>;
  let shipwayService: jest.Mocked<Pick<ShipwayService, 'getShipmentDetails'>>;
  let eventEmitter: jest.Mocked<Pick<EventEmitter2, 'emitAsync'>>;
  let dataSource: { transaction: jest.Mock };
  let configService: { get: jest.Mock };
  let service: ShippingService;

  beforeEach(() => {
    shipmentsRepository = {
      findByShipwayOrderId: jest.fn().mockResolvedValue({ ...shipment, events: [...(shipment.events ?? [])] }),
      findByOrderId: jest.fn().mockResolvedValue({ ...shipment }),
      save: jest.fn().mockImplementation(async (entity) => entity),
    };
    shipmentEventsRepository = {
      create: jest.fn().mockResolvedValue({}),
      existsByRefId: jest.fn().mockResolvedValue(false),
      existsDuplicateEvent: jest.fn().mockResolvedValue(false),
      findLatestHappenedAt: jest.fn().mockResolvedValue(new Date('2026-08-10T09:00:00.000Z')),
      findByShipmentId: jest.fn().mockResolvedValue([]),
    };
    ordersRepository = {
      updateById: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue({
        id: 'ord-1',
        orderNumber: 'CUR1',
        paymentMethod: OrderPaymentMethod.COD,
        paymentStatus: OrderPaymentStatus.PENDING,
      } as never),
    };
    shipwayService = {
      getShipmentDetails: jest.fn(),
    };
    eventEmitter = {
      emitAsync: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (manager: unknown) => unknown) => cb({})),
    };
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'shipway.webhookFreshMs') return 15 * 60 * 1000;
        return undefined;
      }),
    };

    service = new ShippingService(
      dataSource as unknown as DataSource,
      configService as unknown as ConfigService,
      ordersRepository as unknown as OrdersRepository,
      shipmentsRepository as unknown as ShipmentsRepository,
      shipmentEventsRepository as unknown as ShipmentEventsRepository,
      shipwayService as unknown as ShipwayService,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  it('skips duplicate event_id', async () => {
    shipmentsRepository.findByShipwayOrderId.mockResolvedValue({
      ...shipment,
      lastWebhookEventId: 'eid:evt-99',
    });

    const result = await service.handleShipwayWebhook({
      event_id: 'evt-99',
      order_id: 'CUR1',
      status: 'OOD',
    });

    expect(result.outcome).toBe('skipped');
    expect(result.reason).toBe('duplicate_event');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('skips out-of-order status_date', async () => {
    const result = await service.handleShipwayWebhook({
      order_id: 'CUR1',
      status: 'PKP',
      status_date: '2026-08-09T08:00:00.000Z',
    });

    expect(result.outcome).toBe('skipped');
    expect(result.reason).toBe('out_of_order');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('skips unknown status without overwriting shipmentStatus', async () => {
    const result = await service.handleShipwayWebhook({
      order_id: 'CUR1',
      status: 'TOTALLY_UNKNOWN_XYZ',
      status_date: '2026-08-11T12:00:00.000Z',
    });

    expect(result.outcome).toBe('skipped');
    expect(result.reason).toBe('unknown_status');
    expect(shipmentsRepository.save).toHaveBeenCalled();
    const saved = shipmentsRepository.save.mock.calls[0]?.[0] as ShipmentEntity;
    expect(saved.shipmentStatus).toBe(ShipmentStatus.IN_TRANSIT);
  });

  it('throws not found for unknown shipway order id', async () => {
    shipmentsRepository.findByShipwayOrderId.mockResolvedValue(null);
    await expect(
      service.handleShipwayWebhook({ order_id: 'MISSING', status: 'OOD' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('processes a newer status update', async () => {
    const result = await service.handleShipwayWebhook({
      order_id: 'CUR1',
      status: 'OOD',
      status_date: '2026-08-11T12:00:00.000Z',
      awb_number: 'AWB1',
    });

    expect(result.outcome).toBe('processed');
    expect(result.shipment.shipmentStatus).toBe(ShipmentStatus.OUT_FOR_DELIVERY);
    expect(shipmentEventsRepository.create).toHaveBeenCalled();
  });

  it('marks COD order payment as PAID on DELIVERED status', async () => {
    ordersRepository.findById.mockResolvedValue({
      id: 'ord-1',
      orderNumber: 'CUR1',
      paymentMethod: OrderPaymentMethod.COD,
      paymentStatus: OrderPaymentStatus.PENDING,
      confirmedAt: null,
      processingAt: null,
      shippedAt: null,
      outForDeliveryAt: null,
      deliveredAt: null,
      cancelledAt: null,
      failedDeliveryAt: null,
      rtoAt: null,
    } as never);

    const result = await service.handleShipwayWebhook({
      order_id: 'CUR1',
      status: 'DEL',
      status_date: '2026-08-11T12:00:00.000Z',
      awb_number: 'AWB1',
    });

    expect(result.outcome).toBe('processed');
    expect(result.shipment.shipmentStatus).toBe(ShipmentStatus.DELIVERED);
    expect(ordersRepository.updateById).toHaveBeenCalledWith(
      'ord-1',
      expect.objectContaining({
        orderStatus: expect.any(String),
        paymentStatus: OrderPaymentStatus.PAID,
        deliveredAt: new Date('2026-08-11T12:00:00.000Z'),
      }),
      expect.anything(),
    );
  });

  it('does not alter prepaid payment status on DELIVERED status', async () => {
    ordersRepository.findById.mockResolvedValue({
      id: 'ord-1',
      orderNumber: 'CUR1',
      paymentMethod: OrderPaymentMethod.RAZORPAY,
      paymentStatus: OrderPaymentStatus.PENDING,
      confirmedAt: null,
      processingAt: null,
      shippedAt: null,
      outForDeliveryAt: null,
      deliveredAt: null,
      cancelledAt: null,
      failedDeliveryAt: null,
      rtoAt: null,
    } as never);

    await service.handleShipwayWebhook({
      order_id: 'CUR1',
      status: 'DEL',
      status_date: '2026-08-11T12:00:00.000Z',
      awb_number: 'AWB1',
    });

    const call = ordersRepository.updateById.mock.calls.at(-1);
    expect(call?.[1]).toEqual(
      expect.objectContaining({
        orderStatus: expect.any(String),
      }),
    );
    expect(call?.[1]).not.toHaveProperty('paymentStatus');
  });

  it('batch marks missing shipments as not_found without failing the batch', async () => {
    shipmentsRepository.findByShipwayOrderId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...shipment, lastWebhookEventId: null });

    const batch = await service.handleShipwayWebhookBatch([
      { order_id: 'MISSING', status: 'OOD' },
      { order_id: 'CUR1', status: 'OOD', status_date: '2026-08-11T12:00:00.000Z' },
    ]);

    expect(batch.notFound).toBe(1);
    expect(batch.processed).toBe(1);
  });

  it('prefers fresh local DB and skips live Shipway GET', async () => {
    shipmentsRepository.findByOrderId.mockResolvedValue({
      ...shipment,
      lastSyncedAt: new Date(),
      updatedBy: 'shipway-webhook',
      shipwayRawStatus: 'OOD',
      shipmentStatus: ShipmentStatus.OUT_FOR_DELIVERY,
    });

    const result = await service.resolveShipmentForOrder('ord-1', 'CUR1');

    expect(result.shipwayStatus).toBe(true);
    expect(result.shipment?.shipmentStatus).toBe(ShipmentStatus.OUT_FOR_DELIVERY);
    expect(shipwayService.getShipmentDetails).not.toHaveBeenCalled();
  });

  it('falls back to live GET when local data is stale', async () => {
    shipmentsRepository.findByOrderId.mockResolvedValue({
      ...shipment,
      lastSyncedAt: new Date(Date.now() - 60 * 60 * 1000),
      updatedBy: 'shipway-webhook',
    });
    shipwayService.getShipmentDetails.mockResolvedValue({
      success: true,
      current_status: 'Delivered',
      current_status_code: 'DEL',
      awb_number: 'AWB1',
    });

    // persistTrackingUpdate uses transaction + save; keep mocks loose
    const result = await service.resolveShipmentForOrder('ord-1', 'CUR1');

    expect(shipwayService.getShipmentDetails).toHaveBeenCalled();
    expect(result.shipwayStatus).toBe(true);
  });
});
