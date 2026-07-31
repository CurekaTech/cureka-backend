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

  it('should use default 4-step flow when shipwayStatus is false', () => {
    const shipment = {
      ...baseShipment,
      shipmentStatus: ShipmentStatus.IN_TRANSIT,
    } as ShipmentEntity;

    const response = mapShipmentToResponse(shipment, { shipwayStatus: false });

    expect(response.shipwayStatus).toBe(false);
    expect(response.currentStatusLabel).toBe('Order Confirmed');
    expect(response.shipmentStatus).toBe(ShipmentStatus.CONFIRMED);
    expect(response.statusFlow).toHaveLength(4);
    expect(response.statusFlow.map((s) => s.label)).toEqual([
      'Order Confirmed',
      'Dispatched',
      'Out for Delivery',
      'Delivered',
    ]);
    expect(response.statusFlow[0].status).toBe('completed');
    expect(response.statusFlow[1].status).toBe('pending');
    expect(response.statusFlow[2].status).toBe('pending');
    expect(response.statusFlow[3].status).toBe('pending');
  });

  it('should map Shipway IN_TRANSIT when shipwayStatus is true', () => {
    const shipment = {
      ...baseShipment,
      shipmentStatus: ShipmentStatus.IN_TRANSIT,
      shipwayRawStatus: 'In Transit',
    } as ShipmentEntity;

    const response = mapShipmentToResponse(shipment, { shipwayStatus: true });

    expect(response.shipwayStatus).toBe(true);
    expect(response.currentStatusLabel).toBe('Dispatched');
    expect(response.statusFlow[0].status).toBe('completed');
    expect(response.statusFlow[1].status).toBe('current');
    expect(response.statusFlow[2].status).toBe('pending');
    expect(response.statusFlow[3].status).toBe('pending');
  });

  it('should map CANCELLED shipment correctly when shipwayStatus is true', () => {
    const shipment = {
      ...baseShipment,
      shipmentStatus: ShipmentStatus.CANCELLED,
    } as ShipmentEntity;

    const response = mapShipmentToResponse(shipment, { shipwayStatus: true });

    expect(response.shipwayStatus).toBe(true);
    expect(response.currentStatusLabel).toBe('Cancelled');
    expect(response.statusFlow).toHaveLength(2);
    expect(response.statusFlow[1].key).toBe('cancelled');
  });

  it('should map RTO shipment correctly when shipwayStatus is true', () => {
    const shipment = {
      ...baseShipment,
      shipmentStatus: ShipmentStatus.RTO,
    } as ShipmentEntity;

    const response = mapShipmentToResponse(shipment, { shipwayStatus: true });

    expect(response.shipwayStatus).toBe(true);
    expect(response.currentStatusLabel).toBe('Returned to Origin');
    expect(response.statusFlow.map((s) => s.key)).toEqual(['confirmed', 'dispatched', 'rto']);
  });

  it('should map default response when no local shipment exists', () => {
    const response = mapDefaultShipmentResponse({
      id: 'order-123',
      orderNumber: 'ORD12345',
      createdAt: new Date('2026-07-17T06:00:00.000Z'),
    });

    expect(response.shipwayStatus).toBe(false);
    expect(response.statusFlow).toHaveLength(4);
    expect(response.statusFlow[0].status).toBe('completed');
    expect(response.awbNumber).toBeNull();
  });
});
