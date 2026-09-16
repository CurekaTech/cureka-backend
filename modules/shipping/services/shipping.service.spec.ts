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
import { ShipwayShipmentReconciliationService } from './shipway-shipment-reconciliation.service';
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
    omsOrderId: null,
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
  let reconciliationService: jest.Mocked<
    Pick<
      ShipwayShipmentReconciliationService,
      'resolveWebhookShipment' | 'looksNumericId' | 'verifyUnsignedWebhookAgainstOms'
    >
  >;
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
    reconciliationService = {
      resolveWebhookShipment: jest.fn().mockResolvedValue({
        shipment: { ...shipment, events: [...(shipment.events ?? [])] },
        outcome: 'found',
      }),
      looksNumericId: jest.fn((value?: string | null) => Boolean(value && /^\d{5,}$/.test(value))),
      verifyUnsignedWebhookAgainstOms: jest.fn().mockResolvedValue({
        ok: true,
        payload: undefined,
      }),
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
      reconciliationService as unknown as ShipwayShipmentReconciliationService,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  it('skips duplicate event_id', async () => {
    reconciliationService.resolveWebhookShipment.mockResolvedValue({
      shipment: { ...shipment, lastWebhookEventId: 'eid:evt-99' },
      outcome: 'found',
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

  it('returns unresolved when shipment cannot be found or reconciled', async () => {
    reconciliationService.resolveWebhookShipment.mockResolvedValue({
      shipment: null,
      outcome: 'unresolved',
      reason: 'unknown_or_legacy_order',
    });

    const result = await service.handleShipwayWebhook({ order_id: 'MISSING', status: 'OOD' });
    expect(result.outcome).toBe('unresolved');
    expect(result.reason).toBe('unknown_or_legacy_order');
  });

  it('does not apply reverse pickup events to the forward shipment', async () => {
    eventEmitter.emitAsync.mockResolvedValue([true]);

    const result = await service.handleShipwayWebhook({
      order_id: 'RTN2026001',
      status: 'PKP',
      awb_number: 'REV-AWB',
    });

    expect(result.outcome).toBe('processed');
    expect(result.reason).toBe('reverse_pickup');
    expect(result.shipment).toBeNull();
    expect(reconciliationService.resolveWebhookShipment).not.toHaveBeenCalled();
    expect(shipmentsRepository.save).not.toHaveBeenCalled();
  });

  it('keeps an unmatched reverse order unresolved instead of pretending it applied', async () => {
    eventEmitter.emitAsync.mockResolvedValue([false]);

    const result = await service.handleShipwayWebhook({
      order_id: 'RTN-MISSING',
      status: 'PKP',
    });

    expect(result.outcome).toBe('unresolved');
    expect(result.reason).toBe('unknown_reverse_order');
    expect(reconciliationService.resolveWebhookShipment).not.toHaveBeenCalled();
  });

  it('processes a newer status update', async () => {
    const result = await service.handleShipwayWebhook({
      order_id: 'CUR1',
      status: 'OOD',
      status_date: '2026-08-11T12:00:00.000Z',
      awb_number: 'AWB1',
    });

    expect(result.outcome).toBe('processed');
    expect(result.shipment?.shipmentStatus).toBe(ShipmentStatus.OUT_FOR_DELIVERY);
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
    expect(result.shipment?.shipmentStatus).toBe(ShipmentStatus.DELIVERED);
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

  it('batch marks missing shipments as unresolved without failing the batch', async () => {
    reconciliationService.resolveWebhookShipment
      .mockResolvedValueOnce({
        shipment: null,
        outcome: 'unresolved',
        reason: 'unknown_or_legacy_order',
      })
      .mockResolvedValueOnce({
        shipment: { ...shipment, lastWebhookEventId: null },
        outcome: 'found',
      });

    const batch = await service.handleShipwayWebhookBatch([
      { order_id: 'MISSING', status: 'OOD' },
      { order_id: 'CUR1', status: 'OOD', status_date: '2026-08-11T12:00:00.000Z' },
    ]);

    expect(batch.unresolved).toBe(1);
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

  it('falls back to live GET when local data is stale without emitting customer notify', async () => {
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

    const result = await service.resolveShipmentForOrder('ord-1', 'CUR1');

    expect(shipwayService.getShipmentDetails).toHaveBeenCalled();
    expect(result.shipwayStatus).toBe(true);
    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
  });

  it('rejects unsigned webhook updates when OMS verification fails (existing shipment)', async () => {
    reconciliationService.verifyUnsignedWebhookAgainstOms.mockResolvedValue({
      ok: false,
      reason: 'oms_awb_mismatch',
    });

    const result = await service.handleShipwayWebhook(
      {
        order_id: '97102845',
        status: 'OOD',
        awb_number: 'AWB1',
        status_date: '2026-08-11T12:00:00.000Z',
      },
      'unsigned',
    );

    expect(result.outcome).toBe('skipped');
    expect(result.reason).toBe('oms_awb_mismatch');
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
  });
});
