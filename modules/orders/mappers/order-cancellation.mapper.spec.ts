import { CancellationStatus } from '../enums/cancellation-status.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { resolveOrderActions } from './order-cancellation.mapper';

describe('resolveOrderActions', () => {
  it('allows cancel only before shipping when no cancellation is in flight', () => {
    const actions = resolveOrderActions({
      order: { orderStatus: OrderStatus.CONFIRMED, cancellationStatus: CancellationStatus.NONE },
      hasEligibleReturnItems: null,
      hasWithdrawableReturn: false,
    });

    expect(actions.canCancel).toBe(true);
    expect(actions.cancelBlockedReason).toBeNull();
    expect(actions.canReturn).toBe(false);
    expect(actions.returnBlockedReason).toBe('Returns are available after the order is delivered');
  });

  it('does not let the frontend guess cancel while processing', () => {
    const actions = resolveOrderActions({
      order: {
        orderStatus: OrderStatus.CONFIRMED,
        cancellationStatus: CancellationStatus.PROCESSING,
      },
      hasEligibleReturnItems: null,
      hasWithdrawableReturn: false,
    });

    expect(actions.canCancel).toBe(false);
    expect(actions.cancelBlockedReason).toMatch(/already being processed/i);
  });

  it('blocks cancel after dispatch-equivalent order status', () => {
    const actions = resolveOrderActions({
      order: { orderStatus: OrderStatus.SHIPPED, cancellationStatus: CancellationStatus.NONE },
      hasEligibleReturnItems: null,
      hasWithdrawableReturn: false,
    });

    expect(actions.canCancel).toBe(false);
    expect(actions.cancelBlockedReason).toMatch(/before shipping/i);
  });

  it('exposes return eligibility from the server, not raw order status alone', () => {
    const deliveredNoItems = resolveOrderActions({
      order: { orderStatus: OrderStatus.DELIVERED, cancellationStatus: CancellationStatus.NONE },
      hasEligibleReturnItems: false,
      hasWithdrawableReturn: true,
    });

    expect(deliveredNoItems.canReturn).toBe(false);
    expect(deliveredNoItems.canWithdrawReturn).toBe(true);
  });
});
