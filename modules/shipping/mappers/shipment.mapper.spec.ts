import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { ShipmentEntity } from '../entities/shipment.entity';
import { ShipmentStatus } from '../enums/shipment-status.enum';
import { mapDefaultShipmentResponse, mapShipmentToResponse } from './shipment.mapper';

describe('ShipmentMapper', () => {
  const baseShipment: Partial<ShipmentEntity> = {
    id: 'shipment-123',
    refId: 'SHI12345',
    orderId: 'order-123',
    orderNumber: 'ORD12345',
    shipmentStatus: ShipmentStatus.CONFIRMED,
    shipwayRawStatus: 'Confirmed',
    awbNumber: null,
    courierName: null,
    trackingUrl: null,
    labelUrl: null,
    invoiceUrl: null,
    pushedAt: new Date('2026-07-17T06:00:00.000Z'),
    lastSyncedAt: new Date('2026-07-17T06:05:00.000Z'),
    events: [],
  };

  it('when shipwayStatus=false, uses order status for default 4-step flow', () => {
    const shipment = {
      ...baseShipment,
      shipmentStatus: ShipmentStatus.IN_TRANSIT,
    } as ShipmentEntity;

    const response = mapShipmentToResponse(shipment, {
      shipwayStatus: false,
      orderStatus: OrderStatus.SHIPPED,
    });

    expect(response.shipwayStatus).toBe(false);
    expect(response.currentStatusLabel).toBe('Dispatched');
    expect(response.statusFlow).toHaveLength(4);
    expect(response.statusFlow.map((s) => s.label)).toEqual([
      'Order Confirmed',
      'Dispatched',
      'Out for Delivery',
      'Delivered',
    ]);
    expect(response.statusFlow[0].status).toBe('completed');
    expect(response.statusFlow[1].status).toBe('current');
    expect(response.statusFlow[2].status).toBe('pending');
    expect(response.statusFlow[3].status).toBe('pending');
  });

  it('when shipwayStatus=true, uses Shipway shipment status', () => {
    const shipment = {
      ...baseShipment,
      shipmentStatus: ShipmentStatus.IN_TRANSIT,
      shipwayRawStatus: 'In Transit',
    } as ShipmentEntity;

    const response = mapShipmentToResponse(shipment, {
      shipwayStatus: true,
      orderStatus: OrderStatus.CONFIRMED,
    });

    expect(response.shipwayStatus).toBe(true);
    expect(response.currentStatusLabel).toBe('Dispatched');
    expect(response.statusFlow[1].status).toBe('current');
  });

  it('maps default response from order CONFIRMED status', () => {
    const response = mapDefaultShipmentResponse({
      id: 'order-123',
      orderNumber: 'ORD12345',
      orderStatus: OrderStatus.CONFIRMED,
      createdAt: new Date('2026-07-17T06:00:00.000Z'),
    });

    expect(response.shipwayStatus).toBe(false);
    expect(response.currentStatusLabel).toBe('Order Confirmed');
    expect(response.statusFlow).toHaveLength(4);
    expect(response.statusFlow[0].status).toBe('completed');
    expect(response.statusFlow[1].status).toBe('pending');
    expect(response.awbNumber).toBeNull();
  });

  it('maps default response from order DELIVERED status', () => {
    const response = mapDefaultShipmentResponse({
      id: 'order-123',
      orderNumber: 'ORD12345',
      orderStatus: OrderStatus.DELIVERED,
      createdAt: new Date('2026-07-17T06:00:00.000Z'),
    });

    expect(response.shipwayStatus).toBe(false);
    expect(response.currentStatusLabel).toBe('Delivered');
    expect(response.statusFlow.every((s) => s.status === 'completed')).toBe(true);
  });

  it('maps CANCELLED order into confirmed + cancelled steps', () => {
    const response = mapDefaultShipmentResponse({
      id: 'order-123',
      orderNumber: 'ORD12345',
      orderStatus: OrderStatus.CANCELLED,
      createdAt: new Date('2026-07-17T06:00:00.000Z'),
    });

    expect(response.shipwayStatus).toBe(false);
    expect(response.currentStatusLabel).toBe('Cancelled');
    expect(response.statusFlow.map((s) => s.key)).toEqual(['confirmed', 'cancelled']);
  });
});
