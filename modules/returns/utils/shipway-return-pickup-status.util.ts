import { ReturnPickupStatus } from '../enums/return-pickup-status.enum';

const CODE_MAP: Record<string, ReturnPickupStatus> = {
  RSCH: ReturnPickupStatus.SCHEDULED,
  SCH: ReturnPickupStatus.SCHEDULED,
  ROOP: ReturnPickupStatus.ATTEMPTED,
  RPKP: ReturnPickupStatus.PICKED_UP,
  PKP: ReturnPickupStatus.PICKED_UP,
  RINT: ReturnPickupStatus.IN_TRANSIT,
  INT: ReturnPickupStatus.IN_TRANSIT,
  RDEL: ReturnPickupStatus.DELIVERED_TO_WAREHOUSE,
  DEL: ReturnPickupStatus.DELIVERED_TO_WAREHOUSE,
  RPF: ReturnPickupStatus.ATTEMPTED,
  PKF: ReturnPickupStatus.ATTEMPTED,
  PCAN: ReturnPickupStatus.CANCELLED,
  CAN: ReturnPickupStatus.CANCELLED,
};

const LABEL_MAP: Record<string, ReturnPickupStatus> = {
  'pickup scheduled': ReturnPickupStatus.SCHEDULED,
  'shipment booked': ReturnPickupStatus.SCHEDULED,
  'out for pickup': ReturnPickupStatus.ATTEMPTED,
  'pickup failed': ReturnPickupStatus.ATTEMPTED,
  'picked up': ReturnPickupStatus.PICKED_UP,
  'shipment picked up': ReturnPickupStatus.PICKED_UP,
  'in transit': ReturnPickupStatus.IN_TRANSIT,
  'return in transit': ReturnPickupStatus.IN_TRANSIT,
  delivered: ReturnPickupStatus.DELIVERED_TO_WAREHOUSE,
  'return delivered': ReturnPickupStatus.DELIVERED_TO_WAREHOUSE,
  cancelled: ReturnPickupStatus.CANCELLED,
  'pickup cancelled': ReturnPickupStatus.CANCELLED,
};

export const mapShipwayStatusToReturnPickupStatus = (
  status?: string | null,
  statusCode?: string | null,
): ReturnPickupStatus | null => {
  const code = statusCode?.trim().toUpperCase();
  if (code && CODE_MAP[code]) return CODE_MAP[code];

  const label = status?.trim();
  if (!label) return null;
  const upper = label.toUpperCase();
  if (CODE_MAP[upper]) return CODE_MAP[upper];
  return LABEL_MAP[label.toLowerCase()] ?? null;
};
