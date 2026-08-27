import { OrderStatus } from '../enums/order-status.enum';
import {
  applyOrderStatusTimestamps,
  resolveOccurredAt,
} from './order-status-timestamps.util';

describe('applyOrderStatusTimestamps', () => {
  const empty = {
    confirmedAt: null,
    processingAt: null,
    shippedAt: null,
    outForDeliveryAt: null,
    deliveredAt: null,
    cancelledAt: null,
    failedDeliveryAt: null,
    rtoAt: null,
  };

  it('sets shippedAt once for SHIPPED', () => {
    const at = new Date('2026-08-20T10:00:00.000Z');
    expect(applyOrderStatusTimestamps(empty, OrderStatus.SHIPPED, at)).toEqual({
      shippedAt: at,
    });
  });

  it('does not overwrite an existing timestamp', () => {
    const existing = new Date('2026-08-19T08:00:00.000Z');
    const next = new Date('2026-08-20T10:00:00.000Z');
    expect(
      applyOrderStatusTimestamps(
        { ...empty, shippedAt: existing },
        OrderStatus.SHIPPED,
        next,
      ),
    ).toEqual({});
  });

  it('sets outForDeliveryAt for OUT_FOR_DELIVERY', () => {
    const at = new Date('2026-08-21T12:00:00.000Z');
    expect(applyOrderStatusTimestamps(empty, OrderStatus.OUT_FOR_DELIVERY, at)).toEqual({
      outForDeliveryAt: at,
    });
  });

  it('returns empty patch for PENDING', () => {
    expect(applyOrderStatusTimestamps(empty, OrderStatus.PENDING, new Date())).toEqual({});
  });
});

describe('resolveOccurredAt', () => {
  it('parses ISO strings from Shipway', () => {
    const result = resolveOccurredAt('2026-08-20T10:15:00.000Z');
    expect(result.toISOString()).toBe('2026-08-20T10:15:00.000Z');
  });

  it('falls back to now for invalid input', () => {
    const before = Date.now();
    const result = resolveOccurredAt('not-a-date');
    expect(result.getTime()).toBeGreaterThanOrEqual(before);
  });
});
