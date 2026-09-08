import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { OrdersRepository } from '@modules/orders/repositories/orders.repository';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
import { ShipmentStatus } from '../enums/shipment-status.enum';
import { ShipmentsRepository } from '../repositories/shipments.repository';
import { ShipmentEventsRepository } from '../repositories/shipment-events.repository';
import { ShipwayWebhookUnresolvedRepository } from '../repositories/shipway-webhook-unresolved.repository';
import { ShipwayService } from './shipway.service';
import { ShipwayShipmentReconciliationService } from './shipway-shipment-reconciliation.service';

describe('ShipwayShipmentReconciliationService', () => {
  const order = {
    id: 'd56ed9a0-a717-476c-8dbb-2f5aa7a99614',
    refId: 'ORD2026504985',
    orderNumber: 'ORD015487605062',
    orderStatus: OrderStatus.CONFIRMED,
    paymentMethod: OrderPaymentMethod.COD,
    paymentStatus: OrderPaymentStatus.PENDING,
  };

  const omsTracking = {
    success: true,
    order_id: 'ORD015487605062',
    oms_order_id: '97102845',
    ezyslip_order_id: '97102845',
    awb_number: '11633336773305',
    current_status: 'OUT FOR DELIVERY',
    current_status_code: 'OOD',
    courier_id: '7442',
    courier_name: 'Delhivery',
    events: [
      {
        status: 'OOD',
        status_date: '2026-09-01T10:00:00+05:30',
        message: 'Out for delivery',
      },
    ],
  };

  let ordersRepository: jest.Mocked<
    Pick<OrdersRepository, 'findByOrderNumber' | 'findByIdOrRefId' | 'findById' | 'updateById'>
  >;
  let shipmentsRepository: jest.Mocked<
    Pick<
      ShipmentsRepository,
      | 'findByOrderId'
      | 'findByAwbNumber'
      | 'findByOmsOrderId'
      | 'findByShipwayOrderId'
      | 'findByOrderNumber'
      | 'existsByRefId'
      | 'create'
      | 'save'
    >
  >;
  let shipmentEventsRepository: jest.Mocked<
    Pick<ShipmentEventsRepository, 'existsDuplicateEvent' | 'existsByRefId' | 'create'>
  >;
  let unresolvedRepository: jest.Mocked<
    Pick<
      ShipwayWebhookUnresolvedRepository,
      'findByFingerprint' | 'create' | 'markOutcome' | 'existsByRefId'
    >
  >;
  let shipwayService: jest.Mocked<Pick<ShipwayService, 'getShipmentDetails'>>;
  let eventEmitter: jest.Mocked<Pick<EventEmitter2, 'emitAsync'>>;
  let dataSource: { transaction: jest.Mock };
  let service: ShipwayShipmentReconciliationService;

  beforeEach(() => {
    ordersRepository = {
      findByOrderNumber: jest.fn().mockResolvedValue(order),
      findByIdOrRefId: jest.fn().mockResolvedValue(order),
      findById: jest.fn().mockResolvedValue(order),
      updateById: jest.fn().mockResolvedValue(undefined),
    };
    shipmentsRepository = {
      findByOrderId: jest.fn().mockResolvedValue(null),
      findByAwbNumber: jest.fn().mockResolvedValue(null),
      findByOmsOrderId: jest.fn().mockResolvedValue(null),
      findByShipwayOrderId: jest.fn().mockResolvedValue(null),
      findByOrderNumber: jest.fn().mockResolvedValue(null),
      existsByRefId: jest.fn().mockResolvedValue(false),
      create: jest.fn().mockImplementation(async (data) => ({
        id: 'ship-new',
        ...data,
      })),
      save: jest.fn().mockImplementation(async (entity) => entity),
    };
    shipmentEventsRepository = {
      existsDuplicateEvent: jest.fn().mockResolvedValue(false),
      existsByRefId: jest.fn().mockResolvedValue(false),
      create: jest.fn().mockResolvedValue({}),
    };
    unresolvedRepository = {
      findByFingerprint: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      markOutcome: jest.fn().mockResolvedValue(undefined),
      existsByRefId: jest.fn().mockResolvedValue(false),
    };
    shipwayService = {
      getShipmentDetails: jest.fn().mockResolvedValue(omsTracking),
    };
    eventEmitter = { emitAsync: jest.fn().mockResolvedValue(undefined) };
    dataSource = {
      transaction: jest.fn().mockImplementation(async (fn) => fn({})),
    };

    service = new ShipwayShipmentReconciliationService(
      dataSource as unknown as DataSource,
      ordersRepository as unknown as OrdersRepository,
      shipmentsRepository as unknown as ShipmentsRepository,
      shipmentEventsRepository as unknown as ShipmentEventsRepository,
      unresolvedRepository as unknown as ShipwayWebhookUnresolvedRepository,
      shipwayService as unknown as ShipwayService,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  it('dry-run proposes insert without writing and without pushed_at', async () => {
    const result = await service.reconcileVerifiedExternalShipment({
      hints: {
        orderUuid: order.id,
        orderNumber: order.orderNumber,
        awbNumber: '11633336773305',
      },
      source: 'recovery',
      dryRun: true,
      trackingOverride: omsTracking,
    });

    expect(result.outcome).toBe('created');
    expect(result.proposed?.['pushedAt']).toBeNull();
    expect(result.proposed?.['awbNumber']).toBe('11633336773305');
    expect(result.proposed?.['omsOrderId']).toBe('97102845');
    expect(result.proposed?.['notificationWouldQueueIfNotifyEnabled']).toBe(true);
    expect(result.proposed?.['notificationOnApplyWithoutNotify']).toContain('suppressed');
    expect(shipmentsRepository.create).not.toHaveBeenCalled();
  });

  it('persists missing shipment from OMS and keeps identifiers distinct', async () => {
    const result = await service.reconcileVerifiedExternalShipment({
      hints: {
        orderNumber: order.orderNumber,
        awbNumber: '11633336773305',
        omsOrderId: '97102845',
      },
      source: 'recovery',
      dryRun: false,
      emitEvents: true,
      trackingOverride: omsTracking,
    });

    expect(result.outcome).toBe('created');
    expect(shipmentsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: order.id,
        orderNumber: order.orderNumber,
        shipwayOrderId: order.orderNumber,
        omsOrderId: '97102845',
        awbNumber: '11633336773305',
        pushedAt: null,
        shipmentStatus: ShipmentStatus.OUT_FOR_DELIVERY,
      }),
      expect.anything(),
    );
    expect(eventEmitter.emitAsync).toHaveBeenCalled();
  });

  it('rejects unknown legacy orders without creating customer orders', async () => {
    ordersRepository.findByOrderNumber.mockResolvedValue(null);
    ordersRepository.findByIdOrRefId.mockResolvedValue(null);

    const result = await service.reconcileVerifiedExternalShipment({
      hints: { payloadOrderId: 'legacy-999', awbNumber: 'AWB-X' },
      source: 'webhook-oms',
      dryRun: false,
      trackingOverride: {
        ...omsTracking,
        order_id: 'legacy-999',
      },
    });

    expect(result.outcome).toBe('rejected');
    expect(result.reason).toBe('unknown_or_legacy_order');
    expect(shipmentsRepository.create).not.toHaveBeenCalled();
  });

  it('rejects AWB already mapped to another order', async () => {
    shipmentsRepository.findByAwbNumber.mockResolvedValue({
      id: 'other-ship',
      orderId: 'other-order',
      awbNumber: '11633336773305',
    } as never);

    await expect(
      service.reconcileVerifiedExternalShipment({
        hints: { orderNumber: order.orderNumber, awbNumber: '11633336773305' },
        source: 'recovery',
        dryRun: false,
        trackingOverride: omsTracking,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resolves webhook missing row via OMS and records unresolved fingerprint when OMS fails', async () => {
    shipwayService.getShipmentDetails.mockResolvedValue({
      success: false,
      message: 'not found',
    });

    const result = await service.resolveWebhookShipment(
      {
        order_id: '97102845',
        status: 'OOD',
        awb_number: '11633336773305',
      },
      'unsigned',
    );

    expect(result.outcome).toBe('unresolved');
    expect(unresolvedRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payloadOrderId: '97102845',
        awbNumber: '11633336773305',
        authMode: 'unsigned',
        outcome: 'unresolved',
      }),
    );
  });

  it('rejects unsigned webhook updates when OMS AWB does not match local shipment', async () => {
    shipwayService.getShipmentDetails.mockResolvedValue({
      success: true,
      order_id: order.orderNumber,
      awb_number: 'OTHER-AWB',
      current_status_code: 'OOD',
    });

    shipmentsRepository.findByOrderId.mockResolvedValue({
      id: 'ship-1',
      orderId: order.id,
      orderNumber: order.orderNumber,
      awbNumber: '11633336773305',
      omsOrderId: '97102845',
    } as never);

    const result = await service.verifyUnsignedWebhookAgainstOms(
      {
        order_id: order.orderNumber,
        status: 'OOD',
        awb_number: '11633336773305',
      },
      {
        id: 'ship-1',
        orderId: order.id,
        orderNumber: order.orderNumber,
        awbNumber: '11633336773305',
        omsOrderId: '97102845',
      } as never,
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('oms_awb_mismatch');
  });

  it('accepts unsigned webhook updates when OMS confirms status/AWB/order', async () => {
    shipwayService.getShipmentDetails.mockResolvedValue(omsTracking);

    const result = await service.verifyUnsignedWebhookAgainstOms(
      {
        order_id: '97102845',
        status: 'OOD',
        awb_number: '11633336773305',
      },
      {
        id: 'ship-1',
        orderId: order.id,
        orderNumber: order.orderNumber,
        awbNumber: '11633336773305',
        omsOrderId: '97102845',
      } as never,
    );

    expect(result.ok).toBe(true);
    expect(result.payload?.status).toBe('OOD');
    expect(result.payload?.awb_number).toBe('11633336773305');
  });
});
