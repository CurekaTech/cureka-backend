import { ShipmentStatus } from '../enums/shipment-status.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { ShipwayStatusMapper } from './shipway-status.mapper';

describe('ShipwayStatusMapper (official Shipway codes)', () => {
  it('maps current_status_code OOD to Out for Delivery, ignoring courier narrative', () => {
    const resolved = ShipwayStatusMapper.resolveFromTracking({
      current_status: 'Out for delivery at Tirunelveli_BalabgyaNgr_D (Tamil Nadu)',
      current_status_code: 'OOD',
    });

    expect(resolved.shipmentStatus).toBe(ShipmentStatus.OUT_FOR_DELIVERY);
    expect(resolved.matchedFrom).toBe('current_status_code');
    expect(resolved.rawStatus).toBe('OOD');
  });

  it('maps RAD (OMS) to Out for Delivery', () => {
    const resolved = ShipwayStatusMapper.resolveFromTracking({
      current_status: 'RAD',
    });

    expect(resolved.shipmentStatus).toBe(ShipmentStatus.OUT_FOR_DELIVERY);
  });

  it('maps official DEL from long delivered narrative via code', () => {
    const resolved = ShipwayStatusMapper.resolveFromTracking({
      current_status: 'Shipment Delivered received By: Self at 1300',
      current_status_code: 'DEL',
    });

    expect(resolved.shipmentStatus).toBe(ShipmentStatus.DELIVERED);
    expect(ShipwayStatusMapper.toOrderStatus(resolved.shipmentStatus)).toBe(OrderStatus.DELIVERED);
  });

  it('maps numeric PDF codes 22-25 as failed delivery', () => {
    expect(ShipwayStatusMapper.toShipmentStatus('22')).toBe(ShipmentStatus.FAILED_DELIVERY);
    expect(ShipwayStatusMapper.toShipmentStatus('23')).toBe(ShipmentStatus.FAILED_DELIVERY);
    expect(ShipwayStatusMapper.toShipmentStatus('25')).toBe(ShipmentStatus.FAILED_DELIVERY);
  });

  it('maps latest scan Out For Delivery when code is missing', () => {
    const resolved = ShipwayStatusMapper.resolveFromTracking({
      current_status: 'Shipment Received at Facility at Tirunelveli',
      latest_scan_status: 'Out For Delivery',
    });

    expect(resolved.shipmentStatus).toBe(ShipmentStatus.OUT_FOR_DELIVERY);
  });

  it('maps INT / Picked Up to shipped order status (Dispatched step)', () => {
    expect(ShipwayStatusMapper.shipwayStatusToOrderStatus('INT')).toBe(OrderStatus.SHIPPED);
    expect(ShipwayStatusMapper.shipwayStatusToOrderStatus('Picked Up')).toBe(OrderStatus.SHIPPED);
    expect(ShipwayStatusMapper.shipwayStatusToOrderStatus('PKP')).toBe(OrderStatus.SHIPPED);
    expect(ShipwayStatusMapper.shipwayStatusToOrderStatus('OOD')).toBe(OrderStatus.OUT_FOR_DELIVERY);
    expect(ShipwayStatusMapper.shipwayStatusToOrderStatus('OFD')).toBe(OrderStatus.OUT_FOR_DELIVERY);
    expect(ShipwayStatusMapper.shipwayStatusToOrderStatus('Out for delivery')).toBe(
      OrderStatus.OUT_FOR_DELIVERY,
    );
    expect(ShipwayStatusMapper.shipwayStatusToOrderStatus('DEL')).toBe(OrderStatus.DELIVERED);
    expect(ShipwayStatusMapper.shipwayStatusToOrderStatus('Delivered to consignee')).toBe(
      OrderStatus.DELIVERED,
    );
    expect(ShipwayStatusMapper.shipwayStatusToOrderStatus('SCH')).toBe(OrderStatus.PROCESSING);
    expect(ShipwayStatusMapper.shipwayStatusToOrderStatus('Confirmed')).toBe(OrderStatus.CONFIRMED);
  });
});
