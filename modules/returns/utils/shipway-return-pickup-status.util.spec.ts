import { mapShipwayStatusToReturnPickupStatus } from './shipway-return-pickup-status.util';
import { ReturnPickupStatus } from '../enums/return-pickup-status.enum';

describe('mapShipwayStatusToReturnPickupStatus', () => {
  it('maps reverse pickup codes', () => {
    expect(mapShipwayStatusToReturnPickupStatus(null, 'RSCH')).toBe(ReturnPickupStatus.SCHEDULED);
    expect(mapShipwayStatusToReturnPickupStatus(null, 'ROOP')).toBe(ReturnPickupStatus.ATTEMPTED);
    expect(mapShipwayStatusToReturnPickupStatus(null, 'RPKP')).toBe(ReturnPickupStatus.PICKED_UP);
    expect(mapShipwayStatusToReturnPickupStatus(null, 'RINT')).toBe(ReturnPickupStatus.IN_TRANSIT);
    expect(mapShipwayStatusToReturnPickupStatus(null, 'RDEL')).toBe(
      ReturnPickupStatus.DELIVERED_TO_WAREHOUSE,
    );
  });

  it('maps narrative labels when no code is present', () => {
    expect(mapShipwayStatusToReturnPickupStatus('Out for Pickup', null)).toBe(
      ReturnPickupStatus.ATTEMPTED,
    );
  });

  it('returns null for unknown statuses', () => {
    expect(mapShipwayStatusToReturnPickupStatus('Gibberish', 'XYZ')).toBeNull();
  });
});
