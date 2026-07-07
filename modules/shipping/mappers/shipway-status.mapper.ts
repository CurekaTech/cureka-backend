import { ShipmentStatus } from '../enums/shipment-status.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import {
  SHIPWAY_TO_SHIPMENT_STATUS_MAP,
  SHIPMENT_TO_ORDER_STATUS_MAP,
} from '../constants/shipway-status.constants';

/**
 * Translates raw Shipway status strings into our internal representations.
 * All status-mapping logic lives here — never scattered across services or controllers.
 */
export class ShipwayStatusMapper {
  /**
   * Convert a raw Shipway status string to an internal ShipmentStatus.
   * Unknown values fall back to UNKNOWN rather than throwing.
   */
  static toShipmentStatus(shipwayStatus: string | undefined | null): ShipmentStatus {
    if (!shipwayStatus) return ShipmentStatus.UNKNOWN;
    return SHIPWAY_TO_SHIPMENT_STATUS_MAP[shipwayStatus] ?? ShipmentStatus.UNKNOWN;
  }

  /**
   * Convert an internal ShipmentStatus to the corresponding OrderStatus.
   * Returns null when the shipment status has no effect on the order (e.g. NDR).
   */
  static toOrderStatus(shipmentStatus: ShipmentStatus): OrderStatus | null {
    return SHIPMENT_TO_ORDER_STATUS_MAP[shipmentStatus] ?? null;
  }

  /**
   * Convenience: go directly from raw Shipway status → OrderStatus.
   * Returns null if there's no applicable order-level transition.
   */
  static shipwayStatusToOrderStatus(shipwayStatus: string | undefined | null): OrderStatus | null {
    const shipmentStatus = ShipwayStatusMapper.toShipmentStatus(shipwayStatus);
    return ShipwayStatusMapper.toOrderStatus(shipmentStatus);
  }

  /**
   * Returns true if the given Shipway status is a terminal state (no further updates expected).
   */
  static isTerminal(shipwayStatus: string | undefined | null): boolean {
    const terminalShipmentStatuses = new Set<ShipmentStatus>([
      ShipmentStatus.DELIVERED,
      ShipmentStatus.RTO,
      ShipmentStatus.CANCELLED,
    ]);
    const shipmentStatus = ShipwayStatusMapper.toShipmentStatus(shipwayStatus);
    return terminalShipmentStatuses.has(shipmentStatus);
  }
}
