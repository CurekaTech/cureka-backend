import { ShipmentEntity } from '../entities/shipment.entity';
import { ShipmentStatus } from '../enums/shipment-status.enum';
import { mapShipmentToResponse } from './shipment.mapper';
import { ShipmentEventEntity } from '../entities/shipment-event.entity';

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

  it('should map CONFIRMED shipment correctly', () => {
    const shipment = {
      ...baseShipment,
      shipmentStatus: ShipmentStatus.CONFIRMED,
    } as ShipmentEntity;

    const response = mapShipmentToResponse(shipment);

    expect(response.currentStatusLabel).toBe('Order Confirmed');
    expect(response.statusFlow).toHaveLength(5);
    expect(response.statusFlow[0]).toEqual({
      key: 'confirmed',
      label: 'Order Confirmed',
      status: 'completed',
      happenedAt: shipment.pushedAt,
    });
    expect(response.statusFlow[1].status).toBe('pending');
    expect(response.statusFlow[2].status).toBe('pending');
    expect(response.statusFlow[3].status).toBe('pending');
    expect(response.statusFlow[4].status).toBe('pending');
  });

  it('should map PROCESSING shipment correctly', () => {
    const shipment = {
      ...baseShipment,
      shipmentStatus: ShipmentStatus.PROCESSING,
    } as ShipmentEntity;

    const response = mapShipmentToResponse(shipment);

    expect(response.currentStatusLabel).toBe('Ready to Pack');
    expect(response.statusFlow[0].status).toBe('completed');
    expect(response.statusFlow[1].status).toBe('current');
    expect(response.statusFlow[2].status).toBe('pending');
  });

  it('should map IN_TRANSIT shipment correctly', () => {
    const event = {
      status: 'In Transit',
      happenedAt: new Date('2026-07-17T07:00:00.000Z'),
    } as ShipmentEventEntity;

    const shipment = {
      ...baseShipment,
      shipmentStatus: ShipmentStatus.IN_TRANSIT,
      events: [event],
    } as ShipmentEntity;

    const response = mapShipmentToResponse(shipment);

    expect(response.currentStatusLabel).toBe('Dispatched');
    expect(response.statusFlow[0].status).toBe('completed');
    expect(response.statusFlow[1].status).toBe('completed');
    expect(response.statusFlow[2].status).toBe('current');
    expect(response.statusFlow[2].happenedAt?.toISOString()).toBe(event.happenedAt!.toISOString());
    expect(response.statusFlow[3].status).toBe('pending');
  });

  it('should map CANCELLED shipment correctly', () => {
    const shipment = {
      ...baseShipment,
      shipmentStatus: ShipmentStatus.CANCELLED,
    } as ShipmentEntity;

    const response = mapShipmentToResponse(shipment);

    expect(response.currentStatusLabel).toBe('Cancelled');
    expect(response.statusFlow).toHaveLength(2); // Placed, Cancelled
    expect(response.statusFlow[1].key).toBe('cancelled');
    expect(response.statusFlow[1].status).toBe('completed');
  });

  it('should map RTO shipment correctly', () => {
    const shipment = {
      ...baseShipment,
      shipmentStatus: ShipmentStatus.RTO,
    } as ShipmentEntity;

    const response = mapShipmentToResponse(shipment);

    expect(response.currentStatusLabel).toBe('Returned to Origin');
    expect(response.statusFlow).toHaveLength(4); // Placed, Packed, Dispatched, RTO
    expect(response.statusFlow[3].key).toBe('rto');
    expect(response.statusFlow[3].status).toBe('completed');
  });
});
