import { Logger } from '@nestjs/common';
import { ShipmentStatus } from '../enums/shipment-status.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import {
  SHIPWAY_TO_SHIPMENT_STATUS_MAP,
  SHIPMENT_TO_ORDER_STATUS_MAP,
  normalizeShipwayStatusKey,
} from '../constants/shipway-status.constants';

/** Envelope / API-level strings that must never be treated as shipment status. */
const NON_SHIPMENT_STATUS_TOKENS = new Set([
  'success',
  'error',
  'failed',
  'fail',
  'ok',
  'true',
  'false',
]);

export type ShipwayStatusResolveInput = {
  current_status?: string | null;
  status?: string | null;
  current_status_code?: string | null;
  shipway_status?: string | null;
  /** Latest scan `status_detail` from response.scan[] */
  latest_scan_status?: string | null;
};

export type ShipwayStatusResolveResult = {
  rawStatus: string;
  shipmentStatus: ShipmentStatus;
  matchedFrom:
    | 'current_status_code'
    | 'shipway_status'
    | 'current_status'
    | 'status'
    | 'latest_scan_status'
    | 'none';
};

/**
 * Translates raw Shipway status strings into our internal representations.
 * All status-mapping logic lives here — never scattered across services or controllers.
 */
export class ShipwayStatusMapper {
  private static readonly logger = new Logger(ShipwayStatusMapper.name);

  /**
   * Docs: map `current_status_code` first. `current_status` is often a courier
   * sentence, not the official code.
   */
  static resolveFromTracking(tracking: ShipwayStatusResolveInput): ShipwayStatusResolveResult {
    const candidates: Array<{
      value: string;
      matchedFrom: ShipwayStatusResolveResult['matchedFrom'];
    }> = [];

    const pushCandidate = (
      value: string | null | undefined,
      matchedFrom: ShipwayStatusResolveResult['matchedFrom'],
      allowNarrative = false,
    ) => {
      const trimmed = value?.trim();
      if (!trimmed) return;
      if (NON_SHIPMENT_STATUS_TOKENS.has(trimmed.toLowerCase())) return;
      if (!allowNarrative && ShipwayStatusMapper.isCourierNarrative(trimmed)) return;
      candidates.push({ value: trimmed, matchedFrom });
    };

    pushCandidate(tracking.current_status_code, 'current_status_code');
    pushCandidate(tracking.shipway_status, 'shipway_status');
    pushCandidate(tracking.current_status, 'current_status');
    pushCandidate(tracking.status, 'status');
    pushCandidate(tracking.latest_scan_status, 'latest_scan_status', true);

    for (const candidate of candidates) {
      const shipmentStatus = ShipwayStatusMapper.toShipmentStatus(candidate.value);
      if (shipmentStatus !== ShipmentStatus.UNKNOWN) {
        this.logger.log(
          {
            rawStatus: candidate.value,
            shipmentStatus,
            matchedFrom: candidate.matchedFrom,
            candidates: candidates.map((c) => c.value),
          },
          '[ShipwayStatusMapper] Resolved tracking status',
        );
        return {
          rawStatus: candidate.value,
          shipmentStatus,
          matchedFrom: candidate.matchedFrom,
        };
      }
    }

    const fallback = candidates[0]?.value ?? tracking.current_status?.trim() ?? '';
    this.logger.warn(
      {
        rawStatus: fallback || null,
        current_status: tracking.current_status ?? null,
        current_status_code: tracking.current_status_code ?? null,
        shipway_status: tracking.shipway_status ?? null,
        latest_scan_status: tracking.latest_scan_status ?? null,
        candidates: candidates.map((c) => c.value),
        shipmentStatus: ShipmentStatus.UNKNOWN,
      },
      '[ShipwayStatusMapper] No mappable tracking status — UNKNOWN',
    );
    return {
      rawStatus: fallback,
      shipmentStatus: ShipmentStatus.UNKNOWN,
      matchedFrom: candidates[0]?.matchedFrom ?? 'none',
    };
  }

  /** Courier scan text is not a Shipway status code. */
  static isCourierNarrative(value: string): boolean {
    const trimmed = value.trim();
    if (trimmed.length > 48) return true;
    return /received by|arrived at|in transit from|handover to|bag received|shipment received/i.test(
      trimmed,
    );
  }

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
    if (NON_SHIPMENT_STATUS_TOKENS.has(raw.toLowerCase())) {
      this.logger.warn(
        { raw },
        '[ShipwayStatusMapper] Envelope status ignored — mapped to UNKNOWN',
      );
      return ShipmentStatus.UNKNOWN;
    }

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

    const fromPhrase = ShipwayStatusMapper.fromCourierPhrase(raw);
    if (fromPhrase) {
      this.logger.log(
        { raw, match: 'courier-phrase', shipmentStatus: fromPhrase },
        '[ShipwayStatusMapper] Mapped Shipway status from courier phrase',
      );
      return fromPhrase;
    }

    this.logger.warn(
      { raw, normalized, match: 'none', shipmentStatus: ShipmentStatus.UNKNOWN },
      '[ShipwayStatusMapper] Unmapped Shipway status — falling back to UNKNOWN (add code/label to SHIPWAY_TO_SHIPMENT_STATUS_MAP)',
    );
    return ShipmentStatus.UNKNOWN;
  }

  private static fromCourierPhrase(raw: string): ShipmentStatus | null {
    const lower = raw.toLowerCase();
    if (/out\s*for\s*delivery/.test(lower)) return ShipmentStatus.OUT_FOR_DELIVERY;
    if (/\bundelivered\b/.test(lower)) return ShipmentStatus.FAILED_DELIVERY;
    if (/\bdelivered\b/.test(lower)) return ShipmentStatus.DELIVERED;
    if (/in transit/.test(lower)) return ShipmentStatus.IN_TRANSIT;
    if (/\brto\b/.test(lower)) return ShipmentStatus.RTO;
    if (/cancel/.test(lower)) return ShipmentStatus.CANCELLED;
    return null;
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
