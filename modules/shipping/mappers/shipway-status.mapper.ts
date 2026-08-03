import { Logger } from '@nestjs/common';
import { ShipmentStatus } from '../enums/shipment-status.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import {
  SHIPWAY_TO_SHIPMENT_STATUS_MAP,
  SHIPMENT_TO_ORDER_STATUS_MAP,
  normalizeShipwayStatusKey,
} from '../constants/shipway-status.constants';

/**
 * Translates raw Shipway status strings into our internal representations.
 * All status-mapping logic lives here — never scattered across services or controllers.
 */
export class ShipwayStatusMapper {
  private static readonly logger = new Logger(ShipwayStatusMapper.name);

  /**
   * Convert a raw Shipway status string/code to an internal ShipmentStatus.
   * Accepts labels ("In Transit") and codes ("INT", "NFI").
   * Unknown values fall back to UNKNOWN rather than throwing.
   */
  static toShipmentStatus(shipwayStatus: string | undefined | null): ShipmentStatus {
    if (!shipwayStatus?.trim()) {
      this.logger.warn(
        { raw: shipwayStatus ?? null },
        '[ShipwayStatusMapper] Empty Shipway status — mapped to UNKNOWN',
      );
      return ShipmentStatus.UNKNOWN;
    }

    const raw = shipwayStatus.trim();
    const direct = SHIPWAY_TO_SHIPMENT_STATUS_MAP[raw];
    if (direct) {
      this.logger.debug(
        { raw, match: 'direct', shipmentStatus: direct },
        '[ShipwayStatusMapper] Mapped Shipway status',
      );
      return direct;
    }

    const normalized = normalizeShipwayStatusKey(raw);
    const mapped = SHIPWAY_TO_SHIPMENT_STATUS_MAP[normalized];
    if (mapped) {
      this.logger.log(
        { raw, normalized, match: 'normalized', shipmentStatus: mapped },
        '[ShipwayStatusMapper] Mapped Shipway status via normalize',
      );
      return mapped;
    }

    // Last resort: case-insensitive scan of map keys
    const lower = raw.toLowerCase();
    for (const [key, value] of Object.entries(SHIPWAY_TO_SHIPMENT_STATUS_MAP)) {
      if (key.toLowerCase() === lower) {
        this.logger.log(
          { raw, matchKey: key, match: 'case-insensitive', shipmentStatus: value },
          '[ShipwayStatusMapper] Mapped Shipway status via case-insensitive scan',
        );
        return value;
      }
    }

    this.logger.warn(
      { raw, normalized, match: 'none', shipmentStatus: ShipmentStatus.UNKNOWN },
      '[ShipwayStatusMapper] Unmapped Shipway status — falling back to UNKNOWN (add code/label to SHIPWAY_TO_SHIPMENT_STATUS_MAP)',
    );
    return ShipmentStatus.UNKNOWN;
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
